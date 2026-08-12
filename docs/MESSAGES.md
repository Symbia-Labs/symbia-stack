# Messages & Receipts — what a reply carries

Reference document, established 12 Aug 2026. This is the standing overview of
**what a reply is**: the provenance envelope, the arena taxonomy, the seal and
signature, delegation records, conversation memory, and refusals.

**Boundary.** How an assistant *decides* what to do — roster, rules, routing,
kinds — is `docs/ASSISTANTS.md`. This document starts where a reply is produced.
Model selection and parameters are `docs/MODELS.md`.

Dated evidence: `docs/2026-08-10-lanes-claims-and-lineage.md` (the conceptual
spine), `docs/2026-08-11-three-assistant-results.md`,
`docs/2026-08-12-assistant-normalization-results.md`. When a dated findings file
disagrees with this one, **the findings file wins and this one is stale**.

---

## 1. Strategy

### A reply is not a string

The platform's claim is that every answer shows where it came from. Before this
work a reply was a bare string: `"9"` and `"Symbia is a genus of land snails"`
were indistinguishable in structure, and the only difference was that one
happened to be true.

A markdown suffix saying *"computed by math.evaluate"* is a **description** of
provenance, not provenance. Nothing can verify it, nothing can refuse on it, and
it is wrong the moment someone edits the string.

So every reply carries a sealed envelope: what was consulted, whether each step
succeeded, what arena the answer belongs to, who decided, and a signature over
all of it.

### The arena taxonomy

How an answer was arrived at, ordered by how much trust each earns alone:

- **COMPUTED** — a deterministic function produced it. Reproducible. No model.
- **RETRIEVED** — returned verbatim from a named source. Quotable.
- **COMPOSED** — a model wrote it over material supplied to it.
- **REFUSED** — the system declined, and said why.
- **GENERATED** — a model answering from its own weights, nothing supplied,
  nothing checked. Deliberately *not* one of the four, because hiding it behind
  one of them would be the exact dishonesty this exists to prevent.

**The arena describes the value; the basis discloses the wording.** A reply
relayed in friendlier prose keeps its arena — if `math.evaluate` produced the
number, no rephrasing makes a model responsible for it — but the basis says who
chose the words, and the pre-humanised form is in `presentation.raw`, inside the
hashed body so it cannot be edited after the fact.

### What this is not

**A proof.** The hash commits to what was recorded, not to the truth of it. A
COMPOSED answer with three citations can still be wrong about what those
citations say.

This limit is not theoretical. Measured 12 Aug: `"actually make it 20%"`
returned `1.425` — 20% of the tip instead of 20% of the bill — with arena
COMPOSED and **every field in the envelope true**. A model composed it, the
arithmetic was exact, the steps were real. The answer was wrong because the
*referent* was wrong, and no receipt can catch that. Fixed at the reference
layer, not the receipt layer.

### Seals, not shared secrets

The seal was `sha256(JSON.stringify(body) ‖ HASH_SECRET)`. Two problems: key
order made it fragile, and anyone who could verify could also forge. It is now
**RFC 8785 canonical JSON signed with the service's ed25519 identity**, so a
receipt verifies from the envelope alone with no server-side state and no shared
secret.

### A refusal is an answer

REFUSED is the arena OEP prescribes when a claim cannot be supported, which
makes it the most load-bearing reply the platform produces. It is sealed and
signed like any other.

---

## 2. Status — measured, not asserted

### RUNS

**Every reply carries a verifiable envelope.** Measured on the standing walk:

```
P12  seal verifies from the envelope alone   11/11
P14  signature verifies with the public key  11/11
P13  OEP enforcement rules hold              11/11
P11  routing recorded on delegated replies    7/7
```

**Delegation is a signed GKS Lineage event** (`@symbia/lineage`'s first caller).
Chained per conversation with `advance()`, parent-linked to the causing message,
signed with the assistants service identity, and carrying `method`
(`mention` / `declaration` / `classifier` / `model`) so a receipt says *how* the
decision was made, not just that one was.

The chain digest commits to position, not only content: identical delegations in
unrelated conversations previously produced the same checksum.

**Refusals are sealed** (`f2838c7`). Until 12 Aug a refusal carried
`arena: REFUSED` and nothing else — no hash, no steps, no signature. `seal()`
takes an explicit `refusal` input because the arena there is *stated*, not
inferred: `classify()` returns REFUSED only when every step failed, so a refusal
following three good `service.call`s would classify as something else.

**Conversation memory distinguishes reference from revision** (`4bb72ff`):

```
"now multiply that by 10"   -> operates on the RESULT      continuation
"actually make it 20%"      -> revises the EXPRESSION      correction
```

Both use the same pronouns and mean opposite things. Corrections are matched
*before* back-references, because they contain them.

**OEP Layer 0** — four enforcement checks run on the reply a person actually
receives, using the platform's own implementation rather than a re-statement in
the test.

**The envelope names what actually ran**, not what was configured: the resolved
model, the rule, the assistant, the runId.

### Honest limits

- **Lineage chain heads are in memory.** After a restart a conversation's first
  delegation links to GENESIS again. Honest, but not continuity.
- **A receipt cannot catch a wrong referent** (see §1). This is a property of
  receipts, not a defect to fix here.
- **Explanations repeat verbatim.** `provenance.explain` answers from the sealed
  envelope with no model, which is right — but asking twice gives the identical
  sentence, while declines escalate.
- **`config.digest` is not in the envelope.** The invariant from
  `docs/proposals/assistant-data-model.md` §3 — *a receipt must always be able
  to name the exact configuration that produced the answer, even when that
  configuration no longer exists* — is specified and unbuilt. It was blocked
  until 12 Aug because three configuration layers disagreed; that is now
  resolved and this is unblocked.
- **Dropped parameters are logged, not sealed.** When the broker refuses to send
  `temperature` to a model that rejects it, that fact reaches the log and the
  HTTP response but does not yet ride in the reply's envelope.
- **The correction pattern list is hand-written and English-only.**

### Defects this work paid for

1. **`seal()` returned the live provenance array**, so `message.send`'s own step
   was appended after hashing — every non-delegated reply failed its own
   verification, in the direction that looks like tampering.
2. **Classification ran over the merged chain**, crediting the router's
   bookkeeping with writing the reply: `@calc help`, a static template,
   classified COMPUTED.
3. **Authored text classified as REFUSED** — every help reply this platform ever
   sent carried a refusal, because a fixed template produces no
   content-producing step.
4. **`assistantKey` and `runId` were sealed as absent**, so every envelope
   committed to *not knowing* which assistant wrote the reply. 0 of 8 → 8/8.
5. **A refusal dropped the delegation** that reached it — failure was the one
   path where attribution disappeared, which is where it matters most.
6. **Intermediate `llm.invoke` output was promoted to the reply**, sending a
   model's working to the user with no envelope at all.
7. **Refusals were never sealed**, and the walk could not see it because P12
   counted `sealValid !== null` and P14 counted `signed` — an unsealed reply
   dropped out of both denominators.

---

## 3. Next steps, in order

1. **`config.digest` in the envelope.** Unblocked. One field inside the hashed
   body, beside `assistant` and `delegation`, so a receipt answers *"which
   version of this assistant produced this?"* forever.
2. **Seal dropped parameters.** The broker already reports them; a reply
   produced under stripped parameters should say so in its receipt, not only in
   a log.
3. **Persist lineage chain heads.** Append-only and ordered is the entire reason
   Lineage was chosen; a chain that restarts at GENESIS on every deploy proves
   less than it appears to.
4. **Make explanations escalate**, as declines already do.
5. **`routing.claims`** — an assistant declares the arenas it expects to
   produce, and the platform checks the declaration against the sealed arena of
   every reply, continuously, from its own logs. Calculator declaring COMPUTED
   and emitting COMPOSED becomes a defect the platform finds by itself. It costs
   one array and is the single highest-leverage item here.
6. **Extend corrections beyond arithmetic**, once there is a second domain to
   correct in.

### Not planned, and why

- **Making the envelope a proof of truth.** It commits to what was recorded. The
  scorecard that would check claims against sources is separate work and its
  absence is stated rather than papered over.
- **Reinstating a shared secret.** Removed deliberately; anyone who could verify
  could also forge.
- **Describing provenance in prose appended to the reply.** That is what this
  replaced.
