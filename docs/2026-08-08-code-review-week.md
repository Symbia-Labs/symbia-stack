# Code review — 2 Aug to 8 Aug 2026

Scope: `main...fix/2026-08-06-api-gaps` (77 commits past v1.2.0, 43 past `main`)
plus the dirty working tree. 97 files, +8740/-352.

This document is a set of **observations** and, where marked, **inferences**.
It contains no verdict about whether the week's work is good. It lists the
places where a shortcut, a duplicate, or a literal has entered the code and
should be argued about deliberately rather than discovered later.

Each item is graded by what it costs if left alone, not by how ugly it is.

---

## A. Findings that contradict a settled ruling

### A1 — `http://localhost:4001/symbia-namespace` in the console

`symbia-control-center/src/components/panels/ChatPanel.tsx:605`

```ts
fetch('http://localhost:4001/symbia-namespace')
  .then(res => res.json())
  .then(data => setCatalogData({ resources: data.resources || [] }))
  .catch((err) => console.error('Failed to load catalog:', err));
```

Three rulings at once:

- **Absolute origin from the console.** One origin, one build mode. Every other
  call in this file goes through `/svc/{id}`. This one does not.
- **Addressed by port, not by id.** 4001 is not in `@symbia/sys`. It is not in
  the system map. Nothing is registered on it.
- **Silent on failure.** The catch logs to the console and leaves
  `catalogData` null, so `@catalog` completions come back empty with no
  statement that a lookup was attempted and failed. A confident empty list.

The endpoint it wants — `/symbia-namespace` — does exist on catalog (5003);
`assistants/server/src/routes/webhooks.ts:748` fetches the same path. So the
correct call is `/svc/catalog/symbia-namespace`, with `basePath` empty, and the
failure surfaced.

*Observation:* `git log -S"localhost:4001"` on this file returns nothing, which
means the line arrived with the `symbia-control-center` subtree import
(`4acb476`, 6 Aug) rather than being typed this week. It is still shipped code
in the console on 8000 and it is still a live bypass.

**Architectural review:** none needed. This is a fix. What needs review is
**why `scripts/check-ports.ts` did not catch it** — see C1.

### A2 — the trace header is spelled two ways

The ruling in project instructions and in
`docs/2026-08-08-trace-propagation.md` §42 says the headers are
`x-symbia-trace` and `x-symbia-caller`.

The code says:

| location | value |
|---|---|
| `symbia-relay/src/trace-context.ts:41` | `x-trace-id` |
| `symbia-relay/src/middleware.ts:57` | `x-trace-id` |
| `symbia-control-center/server/src/proxy.ts:145,147` | `x-trace-id` |
| `symbia-http/src/telemetry.ts:17,21` | `x-trace-id` |
| `integrations/server/src/routes.ts:119` | `x-trace-id` |
| `docs/2026-08-08-catalog-review.md:422` | `x-symbia-trace` |

`x-symbia-caller` is consistent. Only the trace id disagrees, and only between
docs and code — the code agrees with itself, which is why it works.

*Observation, not inference:* the implementation reuses the pre-existing
`x-trace-id` that `symbia-http` and `integrations` had already been reading for
months. That is almost certainly the better choice — it means anything already
sending the old header is adopted rather than re-identified — but it was never
written down, so the ruling now describes a header that does not exist.

**Architectural review:** decide which name is canonical and make the other one
wrong. If `x-trace-id` wins, `docs/2026-08-08-trace-propagation.md`,
`docs/2026-08-08-catalog-review.md` and the project instructions are stale. If
`x-symbia-trace` wins, five files change and every already-tracing caller is
re-identified once at cutover.

### A3 — trace ids are minted in four places, three ways

```
symbia-relay/src/trace-context.ts:63   trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}
symbia-control-center/server/src/proxy.ts:150   (identical literal, inline)
symbia-relay/src/integration.ts:755   trace_${Date.now()}          <- no random suffix
symbia-relay/src/integration.ts:767   trace_${Date.now()}          <- no random suffix
```

Discipline 8, exactly: a shared concern with N independent implementations is
not shared. `mintTraceId()` exists and is exported; `proxy.ts` restates it
because it cannot import `@symbia/relay`'s node-only module cleanly — but that
is a packaging problem with a name, not a reason.

The two in `integration.ts` are worse than duplication: **`trace_${Date.now()}`
alone is not unique.** Two events in the same millisecond get the same trace id
and merge into one waterfall. On a topology graph fed by exactly these events,
that manufactures edges that were never observed — the failure mode this whole
subsystem was built to eliminate.

**Architectural review:** where does `mintTraceId` live so that the console
server, the relay, and `symbia-http` can all reach it? Today the answer is
"three copies."

### A4 — the proxy names itself with a string literal

`symbia-control-center/server/src/proxy.ts:155`

```ts
proxyReq.setHeader('x-symbia-caller', 'control-center');
```

`ServiceId.CONTROL_CENTER` is imported in the same file, four lines up, and
used for `PROXIED_SERVICES`. The literal happens to equal it today. Rename the
id and the topology graph silently keeps drawing edges from a node that no
longer exists — and it will look correct, because a string is a string.

**Architectural review:** none. Use the enum.

### A5 — the pixel vault issues a grant to a holder that is no longer the destination

`symbia-control-center/src/components/glass/spyglassNode.ts:260`

```ts
const grant = requestGrant('service:models', envelope.digest);
const bytes = withdraw(grant);
...
const viaGateway = await describeFrame(bytes, prompt);   // -> /svc/integrations
```

`pixelVault.ts` allowlists `service:models` and its header comment states the
honest limit as *"pixels are POSTed to the models service and never touch the
messaging service at all."* Since `c16dd3a` they are POSTed to the
**integrations** gateway. The grant record, which is the audit artifact, names
the wrong recipient.

This is the same defect class as `b8bef8e` — a label that asserts something the
code no longer does. It is more serious here because the vault's entire purpose
is to make the destination of the bytes checkable, and the check now passes
against a false name.

**Architectural review:** should a grant holder be a `ServiceId` rather than a
free string? A holder allowlist typed against the registry cannot drift.

---

## B. Deliberate trades that were made correctly but are now load-bearing

These are not defects. Each is documented in-code with its reasoning. They are
listed because they are the places where a future change will hurt, and because
nobody has yet decided whether they are permanent.

### B1 — `process.env.SERVICE_ID` as a channel between modules

`symbia-http/src/server.ts:270`

```ts
process.env.SERVICE_ID = process.env.SERVICE_ID || String(serviceId);
installFetchTracePropagation(String(serviceId));
```

The stated reason is honest: "the middleware reads it from env to avoid taking a
config argument it would then have to thread everywhere." That is the same
argument that justified the fetch wrapper, and it is the same trade — locality
for singularity.

The difference is that the fetch wrapper is one file with a comment explaining
itself. This is a **mutable process-global written at startup and read
somewhere else**, with no type, no single reader, and no failure if it is
absent. It is a second, weaker copy of the same mechanism the
`AsyncLocalStorage` store already provides.

**Architectural review:** who reads `process.env.SERVICE_ID`? If the answer is
"one module," pass it. If the answer is "several," it is a registry lookup
wearing an environment variable's clothes.

### B2 — `installFetchTracePropagation` binds the first service id, forever

`symbia-relay/src/trace-context.ts:107`

```ts
let installed = false;
export function installFetchTracePropagation(serviceId: string): void {
  if (installed) return;
  installed = true;
  ...
}
```

Idempotency is right and the reasoning ("would make the number of wrappers
depend on how many times startup ran") is right. The consequence is that in any
process hosting more than one `createSymbiaServer` — integration tests, a future
combined dev process — every outbound call is attributed to whichever service
booted first, with no error and no way to tell from the outside.

`tests/` currently does this. Worth measuring before it is worth fixing.

**Architectural review:** should the caller come from the `AsyncLocalStorage`
context (which already carries `serviceId`) rather than from closure capture at
install time? The context is per-request; the closure is per-process.

### B3 — `reconnectionAttempts: Infinity` with no ceiling on failures

`symbia-relay/src/client.ts:53`

The fix is correct and the measurement behind it is convincing: services that
exhausted 10 attempts stopped being observable for the life of the process, with
no error. But `Infinity` retries at a 30s cap means a stack with the network
service permanently removed generates one connection attempt per service per 30
seconds, forever, and the only signal is a log line at startup.

There is no metric for "this service has been unable to reach the mesh for N
minutes." The dashboard is still empty; it is now empty *and* retrying.

**Architectural review:** does "not connected to the mesh" belong in
`/health/ready`? Today a service is `healthy` while emitting nothing. That is
"blank beats green" inverted: the service reports green while its observability
is blank.

### B4 — the 11-listener `setMaxListeners` and the ten inert proxy handlers

`symbia-control-center/server/src/proxy.ts` `mountSocketUpgrades`

Documented as a library shape, measured, and logged rather than worked around,
which is the right handling. It is listed here only so it does not get
rediscovered as a leak.

### B5 — `bodyLimit ?? "12mb"` on every service

`symbia-http/src/server.ts:126`

Raised from Express's implicit 100kb because a HiDPI spyglass capture is ~400kb
of base64 and returned 413. The number is chosen and explained.

What it means: **every service on the stack now accepts a 12MB JSON body**,
because the limit is set in the shared server factory, not on the one route that
needs it. Identity accepts 12MB. Logging accepts 12MB.

**Architectural review:** should the large limit be per-route (integrations
`/execute`) rather than per-stack? A platform-wide memory ceiling raised to
solve one endpoint's problem is a hardwire with a very wide blast radius.

---

## C. Gaps in the checks themselves

### C1 — `scripts/check-ports.ts` does not look at source files

`RETIRED` correctly lists `3000` ("service-admin moved to 9000"), `5173` and
`5054`. `OPERATIONAL` lists compose files, start scripts, `.env.example` and one
Dockerfile. **No `.ts` or `.tsx` file is checked.**

Consequences, all currently in tree and all passing the check:

| location | literal |
|---|---|
| `symbia-control-center/src/components/panels/ChatPanel.tsx:605` | `localhost:4001` |
| `integrations/server/src/routes.ts:1091,1130` | `localhost:3000` — a **retired** port |
| `symbia-control-center/src/components/panels/IntegrationsPanel.tsx:385` | `localhost:3000` (placeholder text only) |
| `assistants/server/src/routes/webhooks.ts:748` | `localhost:5003` |
| `ops/functional-probe.mjs:52,54` | `localhost:5173` — probes a server that no longer exists |

The file's own docstring explains why docs are excluded ("a doc naming an old
port misleads a reader while a compose file naming one breaks a stack"). Source
code is on the breaking side of that line, and it was not included.

`ops/functional-probe.mjs` is the sharpest one: it probes `localhost:5173` and
labels it `control-center (vite dev)`. Vite is deleted. That probe can only ever
fail, and a probe that always fails teaches people to ignore the probe.

**Architectural review:** extend `OPERATIONAL` to `**/src/**/*.{ts,tsx}` with an
allowlist for genuine external-world defaults, or add a separate
`check:no-absolute-origins` rule for the console specifically.

### C2 — `npm run check` fails: 68 errors, all in `@symbia/control-center`

Measured 8 Aug 2026. F12 recorded 49; it is now 68.

Concentrations:

- `src/types/catalog.ts:158` — `Record<ResourceType, …>` missing `component` and
  `app`. This is the app-model work landing in the catalog type and not in the
  console's copy of it. It cascades into `ResourceEditor.tsx` (`"executor"` not
  comparable to `ResourceType`) and the type-section files.
- `src/components/panels/**` — 17 errors, mostly `TS7006`/`TS7031` implicit
  `any` on callback parameters in `ServiceObservationPanel.tsx`, which is the
  panel this week's trace work feeds.
- `src/stores/servicesStore.ts` — `TS7022`/`TS7023` circular inference on
  `useServicesStore` and `getProviderCapability`.
- `ComponentInterfaceSection.tsx` / `ExecutorRuntimeSection.tsx` import
  `ComponentResource` / `ExecutorResource` from `@/types/catalog`, which does
  not export them.

Note the shape: **the console's catalog types are a second implementation of
`catalog/shared/schema.ts`.** Adding `component` and `app` to the platform did
not reach the console, exactly as patching `authMiddleware` in one service
reached no other. The typechecker is currently the only thing saying so.

*Observation:* the console builds and runs anyway — esbuild does not typecheck.
So the errors are invisible unless `npm run check` is run.

### C3 — `symbia-mcp-server/dist` is gitignored, and it is the thing that runs

`symbia_stack_health`, called 8 Aug 2026, returns:

```
network   port 5054   unreachable   "fetch failed"   -> 8/9 healthy
```

`symbia-mcp-server/src/index.ts` records the move to 5009. `dist/index.js:29`
still carries a comment *about* 5054 outliving the move, and probes it.
`git ls-files` shows only `src`, `package.json`, `tsconfig.json`,
`package-lock.json` and `.gitignore` are tracked — `dist/` is ignored by
`symbia-mcp-server/.gitignore:2`.

*Observation:* the tool probes 5054 and gets a connection failure.
*Inference, not established here:* that network is healthy on 5009. Confirming
that requires `lsof -i :5009` on the host — discipline 5.

Commit `2d32aca` — "put the server under version control" — put the **source**
under version control. The artifact that `.mcp.json` actually launches is still
whatever was last built locally, and it is a full commit behind.

**Architectural review:** this is the platform's own read-side interface
reporting a false negative about the platform. Either `dist` is tracked, or the
MCP entry point builds on launch, or the tool derives ports from `@symbia/sys`
at runtime instead of baking them.

---

## D. Hardwires in the assistants path

### D1 — the `aliasToKey` table is a routing map in a source file

`assistants/server/src/routes/webhooks.ts:139–150`

```ts
const aliasToKey: Record<string, string> = {
  'logs': 'log-analyst',   'log': 'log-analyst',
  'catalog': 'catalog-search', 'search': 'catalog-search',
  'debug': 'run-debugger', 'debugger': 'run-debugger',
  'usage': 'usage-reporter',
  'welcome': 'onboarding', 'onboard': 'onboarding',
  'builder': 'assistants-assistant', 'build': 'assistants-assistant',
};
```

Eleven aliases for six assistants, declared inside a request handler, rebuilt on
every message. The assistants themselves are **catalog resources** with an
`alias` field — the resolver two lines below already reads
`l.alias?.toLowerCase()`.

So there are two alias systems: one the catalog owns and one this file owns.
Adding an assistant through the catalog gives it one alias; giving it a second
requires editing this file and redeploying the assistants service. That is a
capability entering without a catalog write, in the narrow sense that matters:
`@build` is a route the platform cannot see.

Note also `'catalog': 'catalog-search'` — `@catalog` is *also* the Symbia Script
namespace prefix that `ChatPanel.tsx:604` special-cases. Two different meanings
for the same token, resolved differently on the two sides of the wire.

**Architectural review:** aliases belong on the catalog resource. *Measured:*
`assistant-loader.ts:242` already reads `resource.metadata?.alias` — singular,
one per assistant — and `:486` filters to assistants that have one. So the
mechanism exists and holds exactly one of the eleven aliases this table holds.
Widening it to `metadata.aliases: string[]` and deriving the map at load
removes a redeploy from the loop.

### D2 — `CATALOG_BASE_URL || 'http://localhost:5003'`

`assistants/server/src/routes/webhooks.ts:748`, with the comment *"Use
symbia-sys service resolution (port 5003) or env override"* — which is what it
says, not what it does. `resolveServiceUrl` is never called. In a container
where `CATALOG_BASE_URL` is unset, `localhost` is the assistants container
itself. That is the identical defect `docker-compose.yml:56` was annotated for
(`NETWORK_SERVICE_URL`, "localhost:5009, which inside a container is the
container itself").

*Observation:* compose does set `CATALOG_SERVICE_URL`, not `CATALOG_BASE_URL`.
Grepping for `CATALOG_BASE_URL` in `docker-compose.yml` returns nothing.
*Inference, unverified:* `@catalog` completions in a containerised assistants
service resolve against the wrong host and fall into the `catch`, which
`console.warn`s and returns `undefined` — a silent empty namespace.

**Architectural review:** none needed. `resolveServiceUrl(ServiceId.CATALOG)`.
What is worth reviewing is that the comment asserted the correct behaviour while
the code did something else, and nothing caught it.

### D3 — `${service.toUpperCase()}_ENDPOINT` in `service.call`

`assistants/server/src/engine/actions/service-call.ts:47`

```ts
const envOverride = process.env[`${service.toUpperCase()}_ENDPOINT`];
if (envOverride) return envOverride;
```

A generated environment variable name that, if set, sends a rule's service call
to an arbitrary URL, bypassing the registry entirely. No allowlist, no logging
of the fact that an override applied, and the receipt for that call will name
the service id while the bytes went somewhere else.

Given that `service.call` forwards the caller's bearer token, this is an
env-var-shaped credential exfiltration path.

**Architectural review:** is a per-service endpoint override a capability the
platform intends to offer? If yes it belongs in the registry with a ledger
entry, not in `process.env`. If no, delete it.

### D4 — `basePath` and the resolver fallback are both correct and both widen a contract

`service-call.ts` `basePath ?? '/api'` and `template.ts`'s `walk(ctx)` then fall
back to `ctx.context` are both well-reasoned fixes to real, measured defects
(root-level `/openapi.json` 404s; every `{{resultKey}}` resolving blank).

Both widen a resolution surface, and neither says what happens on a collision
between the two lookups other than "direct wins." `toResolutionContext` spreads
`ctx.context` first so named fields win — that ordering is stated. The
`getContextValue` fallback has the opposite precedence (direct first, context
second) and does not say so.

**Architectural review:** are the two precedences meant to differ? They are in
the same file, fifty lines apart, and a rule author reading one will assume the
other.

---

## E. Stale text that will mislead the next reader

Not code, but each one has already caused a wrong belief.

- **`DEVELOPER.md` §8** still instructs `/svc/{service}` "which **Vite**
  proxies" and says to detect the dev server by
  `window.location.port === '5173'`. Vite is deleted. The section that describes
  the fix now describes the defect. (Already recorded as a 7 Aug observation;
  restated because it is still true on 8 Aug.)
- **`ops/functional-probe.mjs:52,54`** probes `localhost:5173`, labelled
  `control-center (vite dev)`.
- **`pixelVault.ts` header** — "pixels are POSTed to the models service." See A5.
- **`README.md`, `INTENT.md`, `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md`** carry
  `http://localhost:500x` examples throughout. Excluded from `check-ports` by
  design; noted so the exclusion stays a decision.

---

## F. Branch state

- `work/2026-08-05-energy-and-honesty-repairs` — **still stranded.** 25 commits,
  confirmed not an ancestor of HEAD on 8 Aug. Unchanged from the 7 Aug record.
- Working tree dirty: 21 modified tracked files including
  `assistants/server/src/engine/actions/service-call.ts`,
  `catalog/shared/schema.ts`, four `runtime/server/src/executor/components*.ts`,
  and `scripts/seed-stack-assistants.mts`. Two untracked docs and a screenshot.
  The `service-call.ts` `basePath` change (D4) is uncommitted.

---

## Ranked, if only some of this gets done

1. **A3** — `trace_${Date.now()}` with no random suffix manufactures false edges
   on the topology graph. It corrupts the instrument, silently.
2. **C3** — the MCP server reports a healthy service as unreachable. The
   platform's own read-side interface is lying about the platform.
3. **D3** — `${SERVICE}_ENDPOINT` redirects an authenticated call carrying a
   forwarded bearer token, with no record.
4. **A5** — the pixel grant names the wrong holder. The audit artifact is false.
5. **C1** — the port check does not read source. Four live literals prove it.
6. **A1 / D2** — two absolute-origin fetches; both are one-line fixes.
7. **C2** — 68 typecheck errors; the console's catalog types have drifted from
   the platform's.
8. **D1** — the alias table; a redeploy in the loop for a catalog-shaped fact.
9. **B5** — 12MB bodies stack-wide to solve one route's problem.
10. **B3** — mesh-disconnected is invisible in `/health/ready`.
11. **A2, A4, B1, B2, E** — naming, drift, and documented trades.

## Predictions, registered before anyone acts on this

- **R1.** Fixing A1 alone will not make `@catalog` completions work in the
  console, because D2 breaks the same lookup on the server side. *Expect to be
  wrong if the console path is the only one chat uses.*
- **R2.** `lsof -i :5009` will show the network service listening, and C3 is a
  stale build rather than a down service. *This is the one most likely to be
  wrong — network has been crash-looping per `spyglassNode.ts:118`.*
- **R3.** C2's 68 errors will drop below 20 by adding `component` and `app` to
  the console's `ResourceType`, because the type-section failures cascade from
  that one declaration.
- **R4.** Grepping `process.env.SERVICE_ID` will find exactly one reader, making
  B1 a pass-the-argument change rather than an architectural one.

### R4 — measured immediately, and BROKEN

Eight readers, not one:

```
assistants/server/src/config.ts:16      serviceId: process.env.SERVICE_ID || ServiceId.ASSISTANTS
catalog/server/src/config.ts:13         ... || ServiceId.CATALOG
runtime/server/src/config.ts:8          ... || ServiceId.RUNTIME
integrations/server/src/config.ts:13    ... || ServiceId.INTEGRATIONS
messaging/server/src/config.ts:9        ... || ServiceId.MESSAGING
logging/server/src/config.ts:13         ... || ServiceId.LOGGING
runtime/server/src/executor/metric-writer.ts
symbia-relay/src/middleware.ts:123      process.env.SERVICE_ID || process.env.SYMBIA_SERVICE_ID || ''
```

The prediction was wrong, and being wrong found something the right answer would
have hidden. Two things:

**The write at `symbia-http/src/server.ts:274` cannot reach six of its eight
readers.** Those six are module-level `const` initialisers in each service's
`config.ts`. They evaluate at import time — before `createSymbiaServer` is
called, and therefore before line 274 runs. Each has already fallen through to
its `ServiceId.X` default by the time the write happens. The write is a no-op
for them.

The reader it *can* reach is `symbia-relay/src/middleware.ts:123`, which reads
inside a request handler. That is the intended consumer, and it works. But the
mechanism is "write a process global at line 274 and hope every reader is lazy,"
and six of eight are not.

**There is a second spelling.** `middleware.ts:123` falls back to
`SYMBIA_SERVICE_ID`. Nothing writes it. It is a third name for a fact the
registry already owns.

So B1 is not a pass-the-argument change. It is: one write, eight readers, two
env names, and a load-order dependency that happens not to matter only because
the six readers that lose the race already default to the correct value from
`@symbia/sys`. Remove those defaults and the write becomes load-bearing and
wrong.

**Revised architectural review for B1:** `middleware.ts` needs the service id at
request time. It already has a per-request `AsyncLocalStorage` store carrying
`serviceId` (see B2). That is the value it should read. The env variable is a
fourth copy of a registry fact.
