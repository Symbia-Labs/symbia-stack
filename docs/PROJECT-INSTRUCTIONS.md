# Symbia Stack — project instructions

*Paste into the project's custom instructions. Settled things only. Rewritten
7 August 2026, replacing the 5 August version. Ports, build model and current
state in that version are all false now.*

---

## What this project is

Symbia is a platform for **provable provenance**: every answer shows where it
came from — computed with a receipt, retrieved verbatim from a source, composed
over cited material with a claim-by-claim scorecard, or honestly refused.
Brian holds 14 patents (Splunk, incl. US10536351, distributed routing) and has
worked this problem set for 25 years across building automation, BI, and
industrial IoT.

The repo is `~/symbia-stack`. Related: `~/vscode/symbia-workbench`,
`~/vscode/symbia-chat-lab`, genesis at `~/symbia-genesis/alpha2/`.

## The rule that governs everything

> **If you cannot build a piece of this through the Symbia API alone, that is a
> platform defect to be logged, not a reason to reach outside.**

Reaching outside — standing up an unregistered service, hand-editing a route
map, hardcoding an ingress — produces a working demo and destroys the point.
The platform's central claim is that no capability enters without a recorded
gate. A shortcut that the platform does not resist is a finding about the
platform, and it gets written down, not worked around.

The 7 Aug spyglass work is this rule in its literal form: the panel needed a
vision model, and the answer was `POST /api/integrations/execute` with a
credential resolved from identity, not a HuggingFace call from the browser.

## Standing constraints (Brian's, verbatim — do not relitigate)

- "I am very much not interested in patents. I have them already."
- LinkedIn message analysis and the health timeline: **flagged, on hold**,
  until he says otherwise.
- Publishing `corpus-turns.db` (5,516 verbatim turns) requires a review pass
  first.
- Chapter 18 (illness) is Brian's decision to make, not to be assumed.
- **No human-time estimates.** "not an hour. stop with human time bs."
- Type ≥16px base. "only useable zoomed to 150 for me but I am old."
- **Dev/local persistence is JSONL and local logs only.** Connectors for
  GreptimeDB, InfluxDB, Elastic come later, behind an interface.
- **UX/UI validation uses a browser, never curl.** An API call that works while
  the button does nothing is the exact failure being hunted.
- Catalog is for **reusable items only**. Real-time point instances are
  primitives with a proxy representation on graphs — never catalog resources.
- Energy app: control actions stay **inside the facility**. No scheduler
  integration, no "shift the training job."
- `.mcp.json` holds a real bearer token and org id. Secret. Do not paste it
  into docs, issues or chat.

## Working discipline (earned, each from a specific failure)

1. **Predictions before results.** Register the number in git before measuring.
   Report broken predictions as broken. Every dated doc in `docs/` since 6 Aug
   follows this; P4 in the trace doc was registered as "the one I expect to get
   wrong" and was.
2. **Every instrument measures itself until something outside it objects.**
   Eleven named instances in one session: the fuzzer's severity taxonomy shared
   the optimism of the code it tested; hand labels validated the classifier
   corrected against those labels; the retrieval eval contained its own
   answers. Build the check so it cannot share the author's optimism.
3. **Partitions, not promises.** Test/train isolation by real temporal split or
   seeded partition. Ids that look like time usually aren't.
4. **Never trust a running process to be the code you just wrote.** Grep a
   unique source marker inside the running bundle first. Stale containers and
   stale local processes impersonated fixes four times on 5 Aug. Kill by
   **port**, not by path — `pkill -f` has missed repeatedly.
5. **"Not working" and "not running" produce identical evidence.** On 8 Aug the
   trace fix was about to be written up as ineffective; nothing was listening on
   8000 because the console had died during a rebuild. Only `lsof` told them
   apart. Confirm the port is listening before concluding anything about the
   code behind it.
6. **Blank beats green.** "Not checked" is a legitimate state. Never infer a
   pass from absence of evidence. A confident `0` that means "never asked" is
   the defect this product exists to prevent, and it has been written into new
   code within an hour of being fixed in old code.
7. **Separate observation from inference, always.** "Returned 404" is an
   observation. "The endpoint is missing" is an inference. Never write a
   conclusion into a probe — conclusions rot when the code changes underneath
   them. `b8bef8e` — "dropped was an inference, and the wrong one" — is this
   failing in shipped UI copy.
8. **A shared concern with N independent implementations is not shared.**
   `authMiddleware` has been forked into at least three services; patching one
   reached none of the others. This is also why trace context is propagated by
   wrapping `globalThis.fetch` once rather than editing call sites in nine
   services — a deliberate, stated trade of locality for singularity.
9. **Do not mark work complete because something equivalent exists.** Building
   a different thing that does the same job is not the task. This has already
   happened once and it is the same failure as a Save button reporting success
   without persisting.
10. **Commit messages are Conventional Commits** and describe what changed in
    the world, not what was edited.

## Architecture rulings (settled — do not reopen)

**One origin, one build mode.** The control center is a **service** on 8000. It
serves its own esbuild-built assets and proxies `/svc/{id}`. Vite is deleted —
`vite.config.ts`, PostCSS, `import.meta.env`, `VITE_*` env vars, and the
`5173` dev server are all gone.

```ts
export function getServiceUrl(id: string): string {
  return `/svc/${id}`;   // always. no environment detection anywhere.
}
```

The argument was never that Vite was unwanted: **a build with two modes kept
producing the same environment-detection defect** (`import.meta.env.DEV`
measured `false` under `npm run dev`; the fix landed in one config file and not
its twin), and a build with one mode cannot. Any reappearance of a dev/prod URL
branch in the console is a regression of a settled decision.

*The old rule — "detect by `window.location.port === '5173'`" — is dead. It
survives in `DEVELOPER.md` §8, which predates the rebuild.*

**Address services by id, never by port.** Both proxies derive their route
table from `@symbia/sys`. A port number in a caller's URL (`/proxy/:port/*` in
`service-admin`) is the defect class this exists to prevent.

**Registered ≠ running.** `ServiceId.SERVER` (5000) is registered with nothing
behind it, by ruling. `RunningServices` in `@symbia/sys` is the one place that
difference is expressed; a second copy of that filter anywhere is drift.

**Capability enters only through a gated, ledgered catalog write.** Nothing
becomes real by being in a directory. Sixteen builtin components publish
manifests to the catalog on runtime boot; under
`RUNTIME_MANIFEST_ENFORCEMENT=strict` a graph referencing an unregistered
component refuses to load. Graphs register with a declared
`metadata.ingress` `{node, port, capability}`; `POST /api/ingress/:graphName`
checks the capability, because authentication alone would let any logged-in
caller push into any graph.

**Component manifests are a public contract — keep domain vocabulary out.**
A 6 Aug audit found `symbia.state.join` documenting its config with data-centre
electrical point names and three state components defaulting `keyField` to
`"point"`. Fixed; the lesson stands.

**App vs. installation.** The **app** is the portable artifact (graphs,
manifests, ingress declarations, config *schema*). The **installation** is one
deployment into one org on one stack (executions, config *values*, secrets,
derived series). Bake an org id or metric namespace into the artifact and it
can only ever be installed once. Full definition in `docs/APP-MODEL.md`; status
there is *design agreed, not fully implemented* — read it as intent.

**`energy/` is a test case, not the product.** It is the load applied to the
platform; its defect ledger `energy/API-MEASUREMENTS.md` is the real output.
`examples/order-margin/` exists so the platform is never validated against a
single domain. Shaping a platform contract around energy's needs is the defect,
not the feature.

**Trace context propagates on two headers.** `x-symbia-trace` (adopted inbound
if present, `traceparent` read as fallback, minted otherwise) and
`x-symbia-caller`. Injected by a `globalThis.fetch` wrapper reading an
`AsyncLocalStorage` store, plus explicit `proxyReq` injection in the console
because `http-proxy-middleware` uses `node:http` and never touches `fetch`.
Calls from timers, intervals and socket handlers fall outside the request
context and legitimately have no caller — "no caller" means two different
things and UI must not collapse them.

## System map

| service | id | port | note |
|---|---|---|---|
| — | `server` | 5000 | registered, reserved, nothing listens |
| identity | `identity` | 5001 | auth, users, orgs. Has forked `authMiddleware`. |
| logging | `logging` | 5002 | logs, metrics, traces, objects |
| catalog | `catalog` | 5003 | reusable resources only — types, graphs, components, apps |
| assistants | `assistants` | 5004 | orchestration; provenance envelopes on replies |
| messaging | `messaging` | 5005 | WebSocket bus |
| runtime | `runtime` | 5006 | graph execution, 16 builtin components, durable executions |
| integrations | `integrations` | 5007 | LLM gateway + MCP (486 tools measured 5 Aug) |
| models | `models` | 5008 | local GGUF |
| network | `network` | 5009 | mesh, topology. **Moved from 5054 on 6 Aug.** |
| control center | `control-center` | 8000 | operator console, service #10; serves assets, proxies `/svc/*` |
| API front end | `api` | 9000 | was `service-admin` on 3000, unregistered |

Ports are derived from `@symbia/sys`. `scripts/check-ports.ts` fails the build
on a literal `5054`.

## Current state (measured 7 Aug 2026 — update as it changes)

- Working branch is **`fix/2026-08-06-api-gaps`**, 43 commits ahead of `main`
  and 77 past `v1.2.0`. One commit (`7cabc9a`) is unpushed. Working tree is
  dirty (`package-lock.json`, built CSS, an untracked screenshot).
- `main` = `5d94452`, which is now behind the work, not identical to February.
- **`work/2026-08-05-energy-and-honesty-repairs` is stranded** — 25 commits, not
  an ancestor of HEAD. Its content (deep-link routing, count honesty, proxy fix,
  credentials migration, `runFlow()` + 9 components, the energy prototype that
  does not use the platform API) has not been merged forward.
- The v1.2.0 detached checkout described in the previous instructions no longer
  applies. "Development stopped at v1.2.0" is no longer true either — the
  control-center rebuild, app model, Symbia Script, spyglass, provenance
  envelopes and trace propagation all post-date it.
- `symbia-control-center` is now inside the root repo's history (was a nested
  git repo, gitignored — F9, resolved).
- Shipped since 5 Aug: control center as a service on 8000; app resource type
  and the app model; Symbia Script + quickstart; provenance envelopes on
  assistant replies (payload + steps + hash); the spyglass (frame grab as a
  network node, over the bus, to a vision endpoint reached through the
  integrations gateway); trace propagation and a topology graph drawing
  observed rather than declared edges (18 observed vs 3 declared).
- **A Symbia MCP server is exposed** — `symbia_stack_health`,
  `symbia_list_components`, `symbia_list_resources`, `symbia_get_resource`,
  `symbia_list_assistants`, `symbia_list_models`, `symbia_list_log_streams`,
  `symbia_query_logs`, `symbia_list_network_nodes`,
  `symbia_list_organizations`, `symbia_integration_status`. Read-side access;
  prefer it over curl for inventory questions.
- **Observation, 7 Aug:** the *installed* MCP server build probes `network` on
  5054 and reports it `unreachable`, giving 8/9 healthy. `symbia-mcp-server/src`
  records the move to 5009; `symbia-mcp-server/dist` does not. Whether that is
  the service or the tool is an inference — check which port is listening
  before drawing it (discipline 5).
- **Observation, 7 Aug:** `DEVELOPER.md` §8 still instructs cross-origin rules
  in terms of Vite and `window.location.port === '5173'`. It predates the
  rebuild.

## What belongs in project knowledge, and what must not

**In:** settled decisions, standing constraints, the signed genesis rules, MVP
qualifications, architecture rulings, system maps.

**Out:** diagnoses, verdicts, confidence about what is fixed, in-flight
judgement. That material primes a reviewer into agreeing, which is the
echo-chamber failure this project keeps catching. Findings live in dated
documents that can be disputed — `docs/2026-08-06-control-center-rebuild.md`,
`docs/2026-08-07-spyglass-vision-via-integrations.md`,
`docs/2026-08-08-trace-propagation.md` — not in the always-on context.

**Adversarial roles stay outside the project entirely.** `symbia-ux-explorer`
and any future arbiter keep isolated context and browser-only tools. Their
value is channel isolation; putting them in a shared context destroys it.

## The immediate task

**Verify the rebuild in a browser.** Everything since 6 Aug was built to the
project's own standard for correctness of *code* and not to its standard for
anything user-facing. The record says so explicitly:

- `docs/2026-08-06-control-center-rebuild.md` §13 — steps 1–9 built,
  step 10 not done, "no part of this has been checked in a browser."
- `docs/2026-08-08-trace-propagation.md` "Not checked" — P5 (timer/socket-origin
  calls) not exercised; the control-center **container** never rebuilt with the
  proxy fix, only the local node process; nothing in the UI reads `caller`.
- F12 — `npm run check` was failing with 49 errors, including console types
  missing `component` and `app`.

Walk it screen by screen in the order a user meets them, in a browser, on 8000.
Record what it does. Register predictions before measuring. "Not checked" is a
legitimate result and beats a green one that was inferred.

Then read v1.0.0 → v1.2.0 → the rebuild forward as a statement of intent, and
attach theory only where the code demonstrably earns it.
