# Before the MCP write layer: fix what it would hide

*8 Aug 2026, evening. Predictions registered BEFORE building, per discipline 1.*

## Where this came from

A proposal arrived — "a curated write layer for the Symbia MCP server" —
written after building the microgrid-sentinel demo against the read-only MCP
tools plus raw REST. It is well evidenced and its transport argument is
correct: the MCP server today is read-only (verified: 11 tools, the only POST
is a log query), so every stateful step went through a shell on the host.

The objection is not to the layer. It is to the order.

Several proposed tools smooth over platform defects rather than fix them:

- `symbia_catalog_upsert` — "enforce the `metadata.definition` convention …
  today `POST /api/graphs` silently drops `content`."
- `symbia_unload_graph` — "stops running executions first (today that's two
  calls and an easy leak)."
- `symbia_ingest_logs` — "(+ stream create-if-missing)".

The proposal's own non-goal section rejects a 1:1 mirror because it "would
faithfully reproduce the platform's sharp edges instead of smoothing them",
and argues for curation to smooth them. But smoothing a sharp edge in one
client is what makes it invisible in every other client. The governing rule
says a shortcut the platform does not resist is a **finding**, not a
workaround — and a curated write layer is an efficient way to stop finding
them.

So: fix these first, then build the layer on a platform that does not need
covering for.

## A claim in the proposal that is half wrong

> "`sink.metric` / `sink.log` writes from user graphs have no org and vanish
> without an error port firing."

Checked in `runtime/server/src/executor/components-sinks.ts`:

- **`sink.metric` — false.** It declares `outputs: ['out', 'error']` and routes
  a failed write to `error` with `metric write path is failing; "<name>" was
  not persisted`. It does not vanish.
- **`sink.log` — true.** No error port. The handler returns `out`
  unconditionally, so a failed write reports success. The source already says
  so in a comment: *"this sink has no error port … Recorded here rather than
  left to be noticed."*

Recorded because a proposal that overstates one defect gets discounted on the
parts where it is right, and this one is right about a lot.

## The work, in order

1. **`sink.log` reports failed writes.** Silence that reports success is the
   defect this product exists to prevent, and it is currently written into a
   component whose whole job is persistence.
2. **`POST /api/graphs` dropping `content`.** Verify first — the claim is
   second-hand.
3. **Inject validation.** A wrong body shape returns an unrelated-looking
   `'slice'` error instead of naming the field.
4. **Org attribution on graph load.** Larger; verify the mechanism before
   touching it.
5. **`models` accepts unauthenticated inference.** Measured today: `POST
   /v1/chat/completions` with no auth returns 200. Real, and NOT being changed
   unattended tonight — an auth change could break the console's models panel
   before Monday. Logged with evidence, left for a waking decision.

## Predictions

**P1.** `sink.log`'s deps.log is fire-and-forget and returns `void`, so there
is currently nothing to await and no failure to observe. Predicting the fix is
not "add an error port" but "make the write awaitable first" — and that the
signature change reaches more callers than the sink.

**P2.** `POST /api/graphs` does drop `content`, and the cause is a field
allowlist rather than an explicit delete. Registered because if it turns out to
be an explicit delete there is a reason for it that I have not found yet, and I
should look for that reason instead of removing the line.

**P3, the one I most expect to be wrong.** The `'slice'` error on a bad inject
body comes from code calling `.slice()` on `port` or `nodeId` when it is
`undefined` — a missing guard, not a validation gap. If so the fix is a schema
check at the route, and the confusing error disappears as a side effect rather
than being caught and reworded.

**P4.** Fixing these changes nothing an operator can see in the console. They
are all failure-path and error-message behaviour. Any claim tomorrow that the
UI improved is a misreading.

## Measured

*8 Aug 2026, late. All twelve containers rebuilt and healthy.*

### P1 — HELD, and the silence went deeper than predicted

Predicted the fix would not be "add an error port" but "make the write
observable first". Correct, and it was two layers down rather than one:
`@symbia/logging-client`'s `request()` returned `null` once retries were
exhausted, under a comment reading **"Silent failure after retries
exhausted"**. Nothing above it could learn that telemetry was going nowhere.

Fixed in the shared package — `getLastError()` on `TelemetryClient`, a health
signal rather than a per-write result, because writes are batched and no
individual `log()` has an outcome when it returns. `MetricWriter` in the
runtime already drew that exact distinction; it was copied rather than
reinvented. `sink.log` now has an `error` port and routes to it.

### P2 — HELD, mechanism exactly as predicted

An allowlist, not an explicit delete — and in fact **two** stacked silent
drops: a plain `z.object` strips unknown keys during `.parse()`, and the
handler then rebuilds from a field allowlist that also omits `content`.

Fixed with `.strict()` rather than by accepting `content`, because what
`content` should mean is a real design question and guessing would replace a
silent drop with a silent reinterpretation. Verified live:

```
POST /api/graphs {"key":…,"name":…,"orgId":…,"content":{…}}
→ 400 "Unrecognised field(s): content. These are not stored."
  hint: "A graph definition belongs in metadata.definition…"
```

### P3 — HALF RIGHT, and wrong about the field

Predicted a missing guard rather than a validation gap: correct. Predicted it
was `.slice()` on `port` or `nodeId`: **wrong** — the route validates both and
returns a clean 400.

It is `JSON.stringify(value).slice(...)` where `value` is absent.
`JSON.stringify(undefined)` returns `undefined`, not a string, so `.slice`
throws. A caller sending `{nodeId, port, message}` supplies no `value` and gets
a bare `Cannot read properties of undefined (reading 'slice')` from deep in the
executor.

Three copies of that expression existed. **One already had `?.` on it** — in
`components-sinks.ts`. Someone hit this before and fixed the copy in front of
them. Now one `preview()` helper, used by all three.

### P4 — HELD

Nothing an operator can see changed. All four are failure-path behaviour.

### UNPREDICTED, and it took the stack down

The rebuild left `identity` dead: `syntax error at end of input` (Postgres
42601), and because everything depends on identity, nothing started.

Not caused by any change here. `ensureIdentitySchema()` applied the schema
with `schemaSql.split(";")`, and someone had added a comment to the schema
**today**:

```
-- declared these since the OAuth work landed; this CREATE TABLE, which is
-- what actually builds the table, stopped at created_at.
```

The semicolon inside that SQL comment cut the surrounding `CREATE TABLE` in
half. A comment written to document a past schema defect caused a far worse
one. Measured: naive split → 43 statements, 2 of them malformed;
comment-aware split → 42, all balanced.

`identity` and `logging` both had the same naive split. Fixed once, in
`@symbia/db` as `splitSqlStatements()` — comment-, quote- and dollar-quote
aware. **The offending semicolon was deliberately left in the schema**: the
comment is correct SQL and correct documentation, and leaving it is what
proves the splitter works. Identity boots; `/health` returns 200.

Also recorded: bringing the stack up with plain `docker-compose up` publishes
no host ports. `start.sh` sets
`COMPOSE_FILE="docker-compose.yml:docker-compose.dev.yml"` and the dev override
is what maps them. The stack was briefly healthy and unreachable. Restored the
way `start.sh` does it — all twelve up, ports published, `localhost:8000`
answering 200.

## Not checked

- The remaining paper cuts in the proposal: `logic.filter` strict typing,
  `state.rollup` surviving reload, the gateway's `models` proxy target,
  the catalog `POST /resources` vs `POST /api/graphs` split.
