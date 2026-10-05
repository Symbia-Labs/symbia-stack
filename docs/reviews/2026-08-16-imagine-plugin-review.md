# Symbia Imagine — Plugin Review

**Date:** 2026-08-16
**Session:** `imagine:session:74af65810ab01b8d` — sealed, 1530 of 1530 events, no gaps (`bundle-1786924940075.json`)
**Basis:** everything below was measured against the running host today, most of it against predictions registered in the signed ledger before the measurement. Nothing is claimed from documentation alone.

---

## 1. The line to draw

**Imagine is built solely of the stack, but it does not use all of it — and today the gap between those two statements was measured for the first time.**

Imagine is an ephemeral one-origin host (`http://127.0.0.1:7717/svc/<id>`) that mounts esbuild bundles of the stack's own services, fronted by a stdio MCP connector, with every mutation appended to a per-session ed25519 ledger whose key dies with the process. Its self-description is exact and honest: *"in-memory, ephemeral keys, restart-lossy — a sketch, not a record."* The sketch/record boundary held everywhere it was tested — the seal verified its chain before writing, the completeness report distinguished the cut from the session, and the diagnose tool correctly refused to pretend `/session/diagnostics` was a stack endpoint.

## 2. Coverage — stack vs. mounted vs. proven

Of the stack's 12 registered services, Imagine mounts **10**. Of those 10, today's work proved **6** end-to-end, touched 1 incidentally, and left 3 unexercised.

| Service | Mounted | State today |
|---|---|---|
| runtime | ✅ | **Proven.** 3 graphs authored and executed, 16 components, lane mechanics verified against predictions |
| catalog | ✅ | **Working, one defect.** Accepts writes, drops `content` on context resources (open) |
| models | ✅ | **Proven.** Local inference with zero external credentials; content-addressed weights (`sha256:9fecc3b3…`), measured availability |
| assistants | ✅ | **Proven end-to-end today.** Actor principal, assistant, and rule set authored from scratch; rules fire; replies carry signed provenance envelopes. LLM leg was dead — root-caused and fixed (see §5) |
| identity | ✅ | Working — orgs listed, token flow exercised all day |
| logging | ✅ | Working via runtime sinks; query/streams tools not exercised |
| messaging | ✅ | Health 200. Unexercised |
| network | ✅ | Mounted, mesh empty (0 nodes). Unexercised |
| directory | ✅ | Unexercised |
| integrations | ✅ | Mounted; no LLM provider configured — which made today's air-gap finding possible |
| control-center | ❌ | Not mounted — connector still counts it in "12 total" |
| api | ❌ | Not mounted — same |

Beyond services, the stack contains machinery Imagine doesn't surface at all: `symbia-egress`, `symbia-lineage`, `symbia-pathguard`, `symbia-redact`, `symbia-relay`, `spyglass-agent`, the control center. That's the honest meaning of "built solely of the stack but doesn't use all of it" — Imagine is a *view* of the stack, and the view has edges. The connector should say so: the health tool's denominator of 12 misdescribes a 10-service host.

## 3. What was proven on it today

Three working demonstrations, all live, all predicted-then-measured:

1. **Federal payment integrity** (`docs/demos/`): a rollup with a declared expected set refuses to let a partial total read as the total — $94.0B at 5-of-6 programs emitted `apocryphal` naming `hhs.tanf`, mirroring GAO-26-108694's own caveat about the real $186B figure. Out-of-set injection couldn't move a canonical total.
2. **Manufacturing lot release** (`docs/demos/`): the asymmetry finding — *completeness of membership is enforced; sufficiency of sample is not.* A Cpk proxy over 8 of 30 required samples emitted `canonical` with a clean recipe receipt. The certificate rollup caught its gap; the window didn't catch its underfill. A filter gate on `count` closes the hole, but only if wired.
3. **Assistant authoring**: the full loop — principal → assistant → rules → signed reply — works. The bootstrapped tutorial assistants 404 only because no actor principals are seeded for them; that's a bootstrap gap, not a capability gap.

Headline capability, found by a broken prediction: **air-gapped inference works.** A completion came back from local TinyLlama with all four external providers unconfigured. "No egress, and here's the sha256 of the weights that answered" is Imagine's strongest opening line for OT, defense, and regulated-data audiences — stronger than the lane system.

## 4. Three provenance vocabularies, no bridge

Today's work touched three separate provenance systems that do not reference each other:

1. **Runtime lanes** — `canonical` / `apocryphal` / `conditional` per port, with recipe and witness receipts. Travels with values through graphs.
2. **Assistant envelopes** — per-reply `arena` (COMPUTED / RETRIEVED / COMPOSED / GENERATED / REFUSED), ed25519 signature, step chain, and a plain-English `basis`. Richer than lanes, and the better auditor artifact.
3. **Session ledger** — signed sequence positions; what made prediction-before-measurement provable today.

A graph output consumed by an assistant loses its lane. An envelope doesn't cite the ledger seq of the work it describes. The strongest single roadmap item is unification: a lane-carrying value entering a rule should surface in the envelope's steps, and envelopes should be able to anchor to ledger positions. That would make one continuous chain from ingress to signed reply to sealed bundle.

## 5. Defects — fixed today

All four fixed in stack source (source of truth) and mirrored into the plugin bundle (`plugin/symbia-imagine/services/assistants.mjs`); `tsc` clean, bundle `node --check` clean. The running host predates the fixes — they take effect on next reload/rebundle.

1. **`llm.invoke` dead platform-wide** — `isIntegrationsAvailable()` probed `integrations/health`, which isn't mounted; every assistant LLM action failed while inference worked one door over. Now probes `/api/integrations/status` (unauthenticated by design). *assistants/server/src/integrations-client.ts*
2. **`service.call` couldn't address `models`** — absent from its service map, stranding the direct workaround. Added `models: ServiceId.MODELS`. *engine/actions/service-call.ts*
3. **The serious one: unknown action type laundered a false claim through the provenance layer.** The `!handler` branch `continue`d — skipping `onError`, the chain break, and the provenance record — so a later `message.send` sealed an empty string as `RETRIEVED`, "returned verbatim," `steps: []`, under a valid signature. A handler that *threw* took the failure path; only the handler that *never existed* skipped it. Unknown-type failures now join the same failure path and the refusal itself becomes a step in the record. *engine/rule-executor.ts*
4. **`symbia_stack_health` wrong-path probe** — reported 3/12 on a working stack. Now tries `/health` then `/api/health` before declaring a service unreachable. *symbia-mcp-server/src/index.ts*

## 6. Defects — open

1. **Catalog drops `content` on context creation.** Three prediction resources created 201 today; all read back contentless, `/versions` empty. MAP predictions are provable only via ledger request digests — the catalog should be able to return what it accepted.
2. **Connector `operationId` collisions ignore the `service` hint.** `get_graphs_id_` exists in catalog and runtime; `symbia_call` routed to catalog even with `service: "runtime"` explicit. Verification required raw HTTP.
3. **Runs are invisible.** `post_rules_execute` returns a `runId`, but `GET /api/runs` returns `[]`. The execution record exists in the response and nowhere retrievable.
4. **`post_actors` returns a bare 500** on a bad `orgId`; the FK violation is only visible in the host log. The error should name the constraint.
5. **Component state is graph-scoped, not execution-scoped.** Stopping an execution and starting another preserved rollup state (coverage stayed 1.0). Defensible as a design choice, but it silently breaks "run it again" as a clean-room assumption — it should be documented, and an execution-scoped option considered.
6. **Cowork artifact sandbox cannot reach the connector** — every call shape 400s, so live-calling artifacts fall back to recorded data. Likely a bridge limitation with local stdio servers rather than an Imagine bug; worth confirming ownership.

## 7. Gaps — capability present, never exercised

The assistant engine's action vocabulary is much larger than anything used today: `handoff.create/assign/resolve`, `assistant.route`, `tool.invoke`, `integration.invoke`, `state.transition`, `workspace.*`. Human escalation and multi-assistant delegation are first-class and undemonstrated — directly relevant to every demo built so far (an incomplete lot *should* hand off to a person). Models-side, the receipted pull/load/unload lifecycle went untouched, as did messaging, network, and directory entirely. And the `check-provenance` skill speaks lanes but not envelopes — the richer vocabulary is invisible to the skill that exists to explain provenance.

## 8. Roadmap

**Now (small, high leverage):**
- Land today's four fixes on a branch; rebundle the sidecar services from fixed source (`01-bundle-routes.sh`) so the next imagine host runs them
- Fix catalog `content` persistence and the `operationId` service-hint routing
- Seed actor principals for the bootstrap assistants so the tutorial works out of the box
- Correct the health tool's denominator: report against services the host actually mounts

**Next (the unification arc):**
- Bridge lanes into envelopes: a rule step consuming a lane-carrying value records that lane in the provenance chain
- Let envelopes cite ledger seq; a sealed bundle then anchors every signed reply it contains
- Add a sufficiency option to `symbia.state.window` (e.g. `requireFill`) so an unfilled window can demote to `conditional` instead of relying on caller discipline — today's manufacturing finding as a component fix
- Surface envelopes in `check-provenance`

**Demos (in order of fit):**
1. **Pharma GxP batch release** — ALCOA+ makes completeness a regulatory attribute; QP signature is a legal act; concept already drafted
2. **Wire the QA assistant into the lot-release graph** using `handoff.create` — first demo to use all three provenance layers plus escalation
3. **BCBS 239 risk aggregation** — the regulation that literally mandates what the rollup does
4. Energy/grid, ESG Scope 3

## 9. What today's method proved about the platform's thesis

The day's most instructive moment was the platform failing its own standard — a valid signature over a false claim (§5.3), found because a *wrongly-typed action* was sent by accident. No prediction anticipated it. That is the argument for Imagine existing at all: a sketch-mode host where an agent can author, break, and measure the stack cheaply is what surfaces the failure the record-mode stack must never produce. The sketch found the flaw the record would have sealed.
