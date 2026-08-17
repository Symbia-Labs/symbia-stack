# Symbia: Sealed Provenance for Multi-Agent Systems

*Technical whitepaper — draft, 13 August 2026.*

*Discipline note: every capability claim in this document carries one of three
states, taken from `/STATUS.md`: **RUNS** (built, deployed, observed working),
**BUILT, UNWIRED** (code exists, nothing calls it), or **PAPER** (a design, no
code). Where a claim is aspirational, it says so. A whitepaper about preventing
hallucinated context does not get to hallucinate its own feature list.*

---

## 1. The problem

Multi-agent systems fail in ways single-agent systems do not: race conditions
between concurrent actors, implicit service-to-service invocation that no one
authorized, over-privileged autonomous capabilities, and — most corrosive —
replies whose origin cannot be established after the fact. When an assistant
answers, there is usually no way to know which model was consulted, which data
it saw, what it computed versus what it generated, or which human's authority
it acted under.

Symbia's answer is not a smarter agent. It is a platform where **every reply
carries a receipt**, every delegation between agents is a signed, chained
event, and every value in a computation graph declares whether it can be
recomputed or must be taken on faith. The governing rule of the project: if
something cannot be built through the Symbia API alone, that is a platform
defect to log — never a reason to reach outside it.

## 2. Identity: two principal types, capability entitlements — RUNS

The Identity service maintains an entity directory in which humans, AI agents,
and services are distinct, first-class principals.

**Dual-principal model.** Users authenticate by email and password; agents
authenticate by an `agentId` (`service:name` format) and a long credential.
Both receive JWTs of the same structure with different claims (`type: "user"`
vs `type: "agent"`), so every downstream service can tell a human actor from a
machine actor by inspecting the token. The two codepaths are deliberate — the
trade-off accepted for semantic clarity. (This is separation of principal
types, not joint user+agent validation on a single request; binding a human
authorizer to each agent action is future work, not shipped behaviour.)

**Entitlements over roles.** Roles (admin / member / viewer) govern
organization membership. Actual capabilities are granted as fine-grained
entitlements with the key format `cap:<domain>.<action>` — `cap:registry.write`,
`cap:messaging.send`, `cap:assistants.execute` — grantable to users and agents
alike, with quotas and expiration. An agent gets the specific capabilities its
job requires, never a blanket role.

**Service identities.** Every service boots with a persisted ed25519 identity
derived via `@symbia/crypto` (canonical JSON per RFC 8785, SHA-256, document
signing). These identities are not decorative: the assistants service signs
every delegation event and reply envelope with its own key (§4), and a
recreated container keeps its identity because the key material lives on a
volume.

**Tenancy.** Cross-organization access is membership-checked (403 on
violation, verified by regression harness), and DB-backed services run
requests inside a fail-closed row-level-security scope. Honest caveat: the RLS
scoping is verified in code and harness, not yet exercised against a running
stack, and the in-memory dev database carries no RLS at all — it warns loudly
about this at startup.

## 3. Network: contract routing and verifiable envelopes — RUNS, with named gaps

Services address each other **by service id, never by host or port**. Route
tables derive from a single system manifest (`@symbia/sys`); the console
reaches every service through one origin via `/svc/<id>` proxying. A literal
port number in code fails the build gate. This is not cosmetic: it means the
topology is a compiled artifact rather than a set of conventions, and
"registered" versus "running" is an explicit, queryable distinction rather
than an assumption.

**Signed envelopes.** Reply envelopes are canonical JSON signed with the
originating service's ed25519 identity and **verify from the envelope alone**
— no server-side state, no shared secret. (The shared-secret construction this
replaced was retired after a startup guard revealed two services had been
sealing with *different* secrets while documentation promised mutual
checkability. The guard found the defect; the signature design removed the
class.)

**Auditing.** Delegations and routing decisions are recorded as signed,
per-conversation-chained lineage events (§4). Extending this to every
service-to-service exchange is roadmap (the envelope-signatures proposal,
stages 1–3), not shipped.

**Named gap.** One known defect cuts against the zero-trust story and is
logged rather than hidden: a routed specialist can answer a conversation it
failed to join, because the network forward does not currently require
participation. It is defect №5 in the public ledger. A zero-trust claim that
concealed it would be worth less than the honest one.

## 4. Orchestration: deterministic routing with sealed receipts — RUNS

The draft mechanisms of multi-agent coordination are not locks and mutexes;
they are determinism and provenance.

**Three-tier deterministic routing.** When a message arrives, the coordinator
resolves a specialist in tiers, cheapest first: an explicit `@mention`, then
declared patterns, then a naive-Bayes intent classifier with an out-of-domain
class. A model is consulted **only when all three decline**. The classifier is
reproducible — the same message routes the same way every time — which is the
design point: reproducible inaccuracies are bugs, and bugs can be fixed.
Stochastic routing cannot make that promise.

**Every delegation is sealed.** Each routing decision is emitted as a GKS
Lineage event: chained per conversation, parent-linked to the message that
caused it, carrying the resolution method (`mention` / `declaration` /
`classifier` / `model`), and signed with the assistants service identity.
Measured on a live reply:

```
actor=assistant:coordinator  type=assistant.delegation
checksum=sha256:45b4fdb…  parent=["7b442e90-…"]  signature=ed25519:jQuTAyY…
```

**Every reply carries a receipt.** The receipt names an arena — `COMPUTED`,
`RETRIEVED`, `COMPOSED`, `GENERATED`, or `REFUSED` — the steps that produced
the reply, and the routing decision itself. Refusals are sealed too: a
`REFUSED` verdict without a hash and signature is a label, not a receipt, and
the platform treats the reply class where it declines to make a claim as the
one that most needs verifying.

**Rule control flow.** Rules support `onError`, `isDefault`, and
`fallThrough`, with one semantic settled the hard way: ceding a turn means
"let someone better answer," never "let no one answer."

Standing evidence, re-run after every change: the behavioural verification
script currently holds 11/11 predictions, including delegation recording
(7/7), seal-verifies-from-envelope-alone (10/10), signature verification
(10/10), and epistemic-protocol enforcement (11/11).

*Not shipped, and previously misdescribed:* a "claim-and-justify /
defer-and-observe turn-taking protocol" and live stream-control mechanics
(hot-swap, preemption, mid-stream human handoff) appeared in an earlier draft
of this paper. Neither exists. Real-time messaging is WebSocket-based and
replies stream; everything beyond that is unwritten.

## 5. Epistemics: lanes, claims, and lineage — RUNS

This is the platform's conceptual spine, and it descends from two open
specifications: the **Genesis Key Specification (GKS)** — identity, lineage,
and continuity primitives for machine cognition — and the **Open Epistemic
Protocol (OEP)** — a framework requiring systems to classify and disclose the
epistemic status of what they emit.

**Port lanes.** Every output port in a component manifest declares a lane:
`canonical` (recomputable from the graph and its inputs), `apocryphal`
(cannot be verified by recomputation), `inherit` (carries whatever lane
arrived), or `conditional` (decided by the data, with a required note saying
by what). An HTTP fetch is apocryphal by declaration — a remote body cannot
be recomputed. A rollup with any expected key missing emits apocryphal,
because **a partial total must not pass as the total**. Lanes only tighten:
an apocryphal input cannot become a canonical output by passing through a
component that would prefer otherwise. This is a monotonicity constraint
enforced structurally, not by policy.

**The claims vocabulary.** Every observer record states both what it asserts
and what it does **not** assert — as a field in the artifact, not commentary.
A capture asserts that an instrument framed a display and captured these
bytes; it does not assert the screen was truthful. A retrieval asserts an
endpoint returned these bytes over a recorded transport; a page can lie, and
the record records the lie exactly. A single "verified" badge across these
would be false while every hash in the system was sound.

**A concrete GKS Lineage profile.** GKS specifies what a lineage
serialization must guarantee and declines to pick one. Symbia supplies a
profile: RFC 8785 canonical JSON, ISO-8601 timestamps, ids unique by
construction, ed25519 over the whole canonical event. The ledger is
**non-epistemic** — it carries digests, counts, and geometry, never content —
so it can be handed to a regulator or counterparty not permitted to see the
material it describes.

The one-sentence version: **the logbook is canonical about material that is
apocryphal.** You cannot recompute what a server chose to return; you can
recompute every digest and signature from the record alone. That is why the
record is worth something and why it claims so little.

**Enforced, not aspirational.** OEP enforcement is part of the standing
behavioural verification (11/11), and the arena classification on every reply
is the protocol in production.

## 6. Infrastructure and developer experience

**Dual-mode database layer** (`@symbia/db`) — RUNS. Identical schema code
routes to an in-memory Postgres-compatible engine (`pg-mem`) for zero-Docker
local development, or to real PostgreSQL. Disclosed limit: the in-memory mode
enforces no row-level security and says so loudly at startup.

**Self-documenting services** — RUNS. Every service generates
machine-readable documentation (`llms.txt` and OpenAPI) from its own source,
validated against the code by script. An agent encountering a service can read
its contract without a human in the loop. An MCP server exposes stack health,
logs, the catalog, and the network graph to LLM tooling directly.

**Verification as regression.** Security posture is pinned by a 38-check
harness (execution-tool gating, tenancy, vault encryption, HMAC) runnable
without a stack; assistant behaviour by the 11-prediction browser-verified
suite. The project's measurement discipline — register predictions in git
before measuring, report broken ones as broken — applies to this document as
much as to the code.

## 7. What is not built — stated plainly

- **Execution isolation.** Agent code tools are off by default, double-gated,
  and path-guarded — and still not a sandbox. Real isolation is open work.
- **Envelope signing beyond delegations and replies.** Stages 1–3 of the
  signature proposal are PAPER.
- **Sole-ingress retrieval** (the observer as the only path to the web, with
  chained derivations) is PAPER.
- **Joint user+agent authorization per request** — the strong form of dual
  principal — is a design goal, not shipped.
- **No CI.** Every green number above is a local run, and the file that
  tracks them says so.
- Conversation rule state is in-memory by explicit ruling; persistence is a
  production prerequisite, not a defect.

This list is the pitch, not a concession. A provenance platform that
misstated its own provenance would refute itself. The platform's first proof
is that its three working assistants demonstrate the claim end to end — and
that making three assistants work surfaced twelve platform defects, most in
code that had never had a caller. That ratio is why the verification is
behavioural, and why this paper reports states instead of adjectives.

---

*Specifications: Genesis Key Specification and Open Epistemic Protocol are
open source (Apache 2.0). [TODO: confirm canonical org URL before
publication — do not cite an unverified GitHub link.]*
