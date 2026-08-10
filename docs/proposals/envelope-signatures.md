# Proposal: signed provenance envelopes

*10 August 2026. A proposal, not a decision. Responds to the finding in
`2026-08-10-provenance-envelope-shared-secret.md`. Staged deliberately: this
project is being reanimated after months away, so every stage below is
independently shippable, independently revertible, and leaves the system
working if the next stage never happens.*

---

## 0. The one-line fix, independent of everything else

**Observation.** `network/server/src/services/policy.ts` refuses to start in
production without `NETWORK_HASH_SECRET`. `assistants/server/src/engine/
provenance.ts` uses the same construction and the same variable with no such
guard, falling back to the literal `'symbia-network-dev-only'`.

Two files, one secret, one guard. Whatever is decided below, assistants should
not silently seal production replies with a value published in this repository.
This is a one-line change and needs no design.

## 1. What the fix has to achieve

The current envelope proves an accident did not happen. The target is evidence
for a party who does not trust the process that produced it — the same property
the spyglass now has:

1. **Verifiable by a third party** holding no secret.
2. **Attributable** — which service sealed this, answerable from the envelope.
3. **Unforgeable by a verifier.** Checking must not confer the ability to
   fabricate, which is exactly what a shared secret confers.
4. **Offline-verifiable.** A stored reply should verify years later without a
   running identity service.

## 2. Shape

Reuse what is already built and proven rather than inventing a second model.
`@symbia/crypto` exists, the instrument-key pattern works, and the
attestation vocabulary already distinguishes what a signature is worth.

**Service identity.** Each service holds an ed25519 keypair, generated once and
persisted, exactly as the spyglass instrument does. The id derives from the
public key, so it cannot be claimed by a non-holder.

**Role is a claim, not an identity.** `symbia:service:<fp16>` is what the key
proves. `"assistants"` is a *claimed role* recorded alongside it. A key cannot
prove what service it belongs to any more than the spyglass key can prove which
machine it sits on — role binding needs someone to vouch, which is the same
certificate pattern the genesis rotation already uses. Until a deployment
issues those certificates, role is reported as claimed and unverified. It
should never be printed as though it were established.

**Envelope gains a `seal` block:**

```jsonc
{
  "arena": "COMPOSED",
  "steps": [ /* … */ ],
  "seal": {
    "scheme": "ed25519-canonical-v2",
    "signer": "symbia:service:9f31c2a0b7d4e881",
    "role_claimed": "assistants",
    "public_key": "-----BEGIN PUBLIC KEY-----…",
    "level": "self-attested",
    "signature": "ed25519:…"
  },
  "hash": "…"          // v1, during transition only
}
```

The public key travels in the envelope so verification needs nothing else —
that is what makes a reply checkable years later. A registry lookup then
becomes an optional strengthening (does this key still belong to that role?)
rather than a prerequisite, and its absence degrades to "signature valid, role
unconfirmed" instead of to failure.

**The signature covers the canonical envelope** minus `seal.signature`, using
`@symbia/crypto`'s RFC 8785 serialization. Not the body alone: signing a
subset is precisely the defect found in the spyglass this morning, where the
attestation level sat outside the signed bytes and could be rewritten freely.

**`verify()` stops returning a boolean.**

```ts
{ ok: boolean; scheme: 'shared-secret-v1' | 'ed25519-canonical-v2';
  signer: string | null; level: AttestationLevel; why: string | null }
```

A boolean would collapse "verified with a secret everyone shares" and
"verified with a signature only one holder could produce" into the same answer.
That is the failure this project keeps catching in other forms.

## 3. Staging

Each stage ships alone and is safe to stop at.

**Stage 0 — identity, no behaviour change.**
Services generate and persist a keypair on boot and log the identity. Nothing
is signed yet, no envelope changes, no consumer affected. Purely additive, and
it surfaces the operational question early: keys need a mounted volume, or every
container restart is a new identity.

**Stage 1 — seal alongside, break nothing.**
Envelopes carry `hash` *and* `seal`. `verify()` accepts either and reports
which. Existing consumers reading `hash` are untouched. Attribution arrives
here for free.

**Stage 2 — prefer signatures, report the difference.**
Verifiers prefer `seal`; `hash`-only envelopes verify but report as the weaker
scheme, the way `verify-clip.mjs` already reports `chain-value-v1` as a NOTE
rather than a pass or a failure. `Receipt.tsx` shows the scheme. That file
already argues the point in its own comment — an unsealed and a sealed envelope
must not look the same — and the same reasoning extends to how it was sealed.

**Stage 3 — stop emitting v1 in assistants.**
Remove `HASH_SECRET` from the assistants path. Network is *not* included: its
hash is load-bearing for routing policy and is a separate migration with its own
risk. Doing both in one change is how a security change ships without anyone
deciding to ship it.

## 4. Risks, and what they cost

- **Key persistence.** An ephemeral container regenerates its key each boot and
  its identity churns. Because the public key travels inside the envelope, old
  replies still verify — only current attribution is lost. Graceful, but it
  wants a volume.
- **Envelope size.** A PEM public key and a signature add roughly 250 bytes per
  reply. Measured cost of signing is 30 µs.
- **Two schemes in flight during stages 1–2.** Mitigated by naming the scheme in
  the record, which is the pattern already in use for capture ledgers.
- **Role attribution could be over-read.** The largest risk here is social, not
  technical: `role_claimed: "assistants"` rendered in a UI as "assistants" with
  no qualifier invites a reader to treat it as proven. It is not, until
  certificates exist.

## 5. Predictions to register before building

| # | Prediction |
|---|---|
| E1 | Stage 1 changes no consumer. `Receipt.tsx` renders unchanged because `hash` is still present. |
| E2 | An envelope verifies from the envelope alone, with no identity service reachable and no secret configured. |
| E3 | Rewriting any field of a sealed envelope — arena, a step's `outputDigest`, `role_claimed` — breaks the signature. |
| E4 | **The one expected to break.** Envelopes already persisted in message history will fail v2 verification and must be reported as `shared-secret-v1`, not as failures. I expect the first implementation to report them as broken, because that is what the spyglass verifier did to pre-port clips until the scheme was named explicitly. |

## 6. Open decisions

- Whether service keys are generated per service or issued by identity. Issuing
  is tidier and adds a boot-time dependency on a service that may not be up.
- Whether role certificates are worth doing now, or whether `role_claimed`
  reported as unverified is sufficient for a while. It is sufficient for
  everything except attribution across an org boundary.
- Whether the mesh (`network`) migrates on the same design later, or keeps a
  symmetric construction because its hash is a routing-policy commitment rather
  than a provenance receipt. These are genuinely different jobs and may deserve
  different mechanisms.
