# Symbia Imagine, used by Claude — scoped findings

Scope, deliberately narrow: **one agent (Claude, Opus 5), one sandbox
(imagine), through MCP.** Not the deployed stack, not design mode, not
capacity planning. The only question is what an agent can accomplish here
and what it can hand on afterwards.

Everything below was measured today through the connector.

## What works

**Author, hydrate, execute.** A graph written through `symbia_call` is
picked up by the runtime within one reconcile pass and stands up if its role
says so. An ingress POST returns an `executionId`, and that id is findable
in the logging service afterwards — the sink's own account, not the
runtime's.

**Real computation with a checkable result.**

```
{pages} / {hoursAvailable}  ->  26.666666666666668
expression "320 / 12"   exact true   lane canonical
```

The value carries its own recipe. Recomputable without trusting the runtime.

**Acquire and run a model.**

```
pull   668,788,096 bytes via integrations
       sha256 9fecc3b3cd76bba89d504f29b616eedf7da85b96540e490ca5824d3f7d2776a0
       artifact.registered, signed, service:models
run    "Verified"  /  22 tokens in 1.1s at temperature 0
```

**A session record that survives the client.** The trace is signed and
chained, every mutation is in it, and it counts itself — `40 of 40 events,
up to the seal`. The host outlives the client, so a restart of Claude
Desktop does not lose the work.

## What an agent cannot yet do here

**Carry an acquired model out of the session.** The pull is in the trace at
seq 18. The model is not in the sealed bundle. A recipient sees that a model
was fetched and cannot see which one.

Cause: the seal filtered on authorship, and the models service registers the
card under `service:internal`. Authorship is not causation — a client causes
a service to write, and that is still session work. Changed today to
distinguish the two and label each artifact `client` or `caused`.

**D19 — after a host restart, a model on disk has no catalog card.**

```
models service   1 model, usable, inference works
catalog          0 model resources
```

The weights survive, the card does not. So a model an agent acquired in an
earlier session is *runnable* and *unreferenceable*: it cannot be sealed,
addressed by catalog key, or discovered by anything reading the catalog.
Split-brain between what the service knows and what the platform records.

**D17 — the service reports zero for work it did.** After two completions
with 1.9 GB resident: `loadedModels: 0, memoryUsageMB: 0, totalRequests: 0`.
This is the instrument an agent would use to reason about its own footprint,
and it reads zero regardless.

**An inference result carries no provenance.** The weights have a signed
digest. The completion has none — no model digest, no lane, no claim. A
graph node using this model emits a value with nothing attached saying which
bytes produced it. This is the platform's own thesis, unapplied to the
artifact class it most concerns.

**D16 — a missing model returns 500 `server_error`.** The message says "not
found"; the status says the service is broken. An agent reading the status
draws the wrong conclusion.

## What was fixed today for agent users specifically

- **D14** a timeout reported as a failure. The pull "failed" after 15s while
  streaming, finished a minute later, and worked. Worst-class confident
  negative: the wrong conclusion is actionable, and a retry restarts a
  668 MB download. Timeouts now say they are not failures and warn against
  blind retry.
- **D15** `MODELS_PATH` set and never created.
- **D13** errors truncated at 300 characters, so a three-problem teaching
  error arrived as one problem and half a hint.
- **The write gate** — a graph is checked against component manifests at
  authoring, with the manifest's own words as the hint.
- **Self-describing refusals** — the arithmetic component now states what it
  accepts.
- **Ranked search** — `q="message invoke chat"` returned nothing while the
  operation existed.

## The pattern across all of it

Six times today a probe of mine was the broken thing rather than the
platform. Every one had the same cause: the correct shape was declared
somewhere and was not in my path at the moment of use. Manifests, schemas,
source — all one call away, none of them where I was looking.

The affordances built today move declarations into the path. They do not fix
the two failures that were measurements not testing their own claim, and
nothing built today would.

---

# Assistant routines — the round-trip saving, and the two fixes it took

The lever an agent actually needs is not concurrency. Measured today: this
client serializes tool calls, the host does not overlap store writes
(pg-mem is synchronous, 74ms serial against 73ms concurrent), and CPU work
serializes outright. **There is no parallelism available.** What remains is
round trips, and a routine collapses many into one.

The coordinator's `rule-platform-status` routine is exactly the pattern an
agent runs by hand: recall from catalog, runtime and network, then reason
over the results. It had never executed.

## Two fixes stood between "loaded" and "runnable"

**D11 — no actor principals.** The roster loads with routines intact, and
`POST /api/webhook/message` answered `404 Actor principal not found`.
Registering principals took the webhook to `200`.

**D22 — a loaded rule set was not an executable one.** The webhook is
async — *"Message received and queued"* — and `GET /api/runs` stayed empty,
because nothing ran. The synchronous path is `POST /api/rules/execute`,
which awaits `processEvent` and returns the run. It resolves rule sets **by
org**, and the loader calls `registerRuleSet(assistantKey, ruleSet)` —
against a parameter named `orgId`, under a comment saying it is "for Admin
UI visibility". So the map is written by assistant and read by org, and the
executor found nothing: `rulesEvaluated: 0` for a message matching the
coordinator's rule exactly.

`assistants/service.ts` now publishes the **union** of assistant rule sets
to the system org after loading. Union, because each rule's own conditions
decide which fires — merging is what makes it executable rather than
last-writer-wins. It warns loudly when no org is known, since the silent
version looks like a broken assistant rather than an unwired one.

## What one call now returns

```
rulesEvaluated 9, rulesMatched 1          11ms, one round trip
  catalog /stats          200   totalResources 54, totalAssistants 10
  runtime /stats          200   loadedGraphs 0, activeExecutions 0
  network /sdn/topology   503   "service 'network' did not mount,
                                NETWORK_HASH_SECRET is required in production"
```

Three services gathered, and the failing branch **named its cause verbatim
instead of aborting the run**. Partial success reported as partial success
is exactly what an agent needs from a delegated step.

## Not established

`R3` is unresolved and stays that way. Only the three `service.call` actions
appear in `actionsExecuted`. The routine declares recall ×3, then `think`,
then `say` — and neither `think` nor `say` is reported. Whether they ran and
were omitted from the result, or never ran at all, is not established. The
local model is loaded and the assistant is configured for openai/anthropic,
so both "no credential" and "a usable local model" are true at once.

## The DAG side, for contrast

`symbia.state.join` keys on a field in each message. Two arithmetic branches
both emit `method: "arithmetic"`, so they share a key and the join sits at
`{have: 0, need: 2}`. `symbia.transform.map` renames fields and cannot
inject a constant, so nothing in the component set can tag a branch.

**Fan-out works. Fan-in does not. The DAG is currently a tree** (D21).

And `symbia.state.join` declares its `pending` port `lane: "apocryphal"` in
a signed manifest — *"a statement about coverage, not a joined value, it
must never be mistaken for the join"* — while the runtime emitted it as
`lane: "canonical"` (D20). The wire contradicted the signature.
