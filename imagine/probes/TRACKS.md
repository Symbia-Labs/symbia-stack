# Track 1 and Track 3 — exit measurements

Run 16 Aug against the imagine sidecar. Predictions are registered at the
top of `02-tracks.mjs`, which was committed before the run.

| | prediction | verdict | measurement |
|---|---|---|---|
| T1 | a client-supplied `isBootstrap` is ignored | HELD | asked for `true`, stored `false` |
| T2 | an 11 MB body is refused and the process survives | HELD | refused at 11,534,431 bytes, process alive |
| T3 | a large listing returns valid JSON | HELD | full catalog listing parsed, 2,406 chars |
| T4 | a graph authored through MCP hydrates | HELD | `loadedGraphs: 1` one reconcile pass after the write |
| T5 | it executes, and the execution is identified | HELD | `executionId=690d4fa1-72b8-4c45-8fc9-235fd275a7c4` |
| T6 | an assistant authored through MCP appears in the roster | HELD | calculator, smart-calc, coordinator |

Four of these were BROKEN on the first run. What each turned out to be:

## T2 — the wedge, not the crash

The first fix was an express body limit, and it did nothing, because the
payload never reaches express. The second fix was a guard inside
`symbia_call`, and it also did nothing, because the handler never ran. The
process was not dying: `ReadBuffer` in the MCP SDK defaults to 10 MB, and
`StdioServerTransport._ondata` catches the overflow and calls `close()`,
which removes the stdin listener. The process stayed up, answered nothing
further, and reported nothing anywhere. A later `symbia_selftest` in the
same session timed out, which is what made the earlier run record "process
DEAD" — the process was alive and unreachable, which is worse, because a
crash restarts and a wedge does not.

Two changes, in this order: raise the transport buffer to 64 MB so the line
arrives, and refuse at 1 MB inside `symbia_call` so the refusal is a message
naming the size and the limit. `transport.onerror` now writes to stderr,
which is the only channel left once stdin is detached.

## T4 — three separate causes, found one at a time

1. The runtime reconciles every 30 s by default. Imagine authors everything
   after boot, so a graph written at second 3 was invisible until second 30.
   Set to 3 s for imagine.
2. Component implementations were registered in `runtime/index.ts` only.
   With routes mounted and the sync loop running, hydration failed with
   `Graph references components with no registered implementation: log ->
   symbia.sink.log`. Moved to `service.ts` as `wireComponents()`, together
   with the state store; `index.ts` now calls it rather than keeping a
   second copy.
3. The bundle was stale. The bundling step had been backgrounded in the same
   shell chain as the probe and had not finished; the measurement was of
   code from 22:20 while the source said 22:39. Checked by grepping a marker
   in the bundle before believing the run, per CLAUDE.md.

## T5 — two confident negatives, both correct

`POST /api/ingress/t4-hello` returned "No such operation. Use
symbia_list_operations first." The dispatcher resolves against the spec, so
the template is the path and the value is a param. Reads as "no such
endpoint"; means "not the way to address it".

Then `409: Graph "t4-hello" has no running execution`. The graph was loaded
but not standing. `STANDING_ROLES` is `pipeline` and `service`; the probe
had declared `role: "probe"`. The 409 named the condition exactly and was
right to refuse.

## What is still open

`BOOT` reports `started runtime: {"graphsLoaded":0}`. That is correct, not a
failure — the seed publishes no graphs, so there is nothing to hydrate at
boot. Every graph in an imagine session arrives later, through the polling
loop. Whether imagine should seed a graph at all is a separate decision.
