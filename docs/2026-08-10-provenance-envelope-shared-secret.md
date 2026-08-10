# Finding: the provenance envelope is sealed with a shared secret

*10 August 2026. A finding about shipped code, not a proposal. Recorded so it
is disputable and schedulable rather than remembered.*

---

## Observation

`assistants/server/src/engine/provenance.ts`:

```ts
const HASH_SECRET =
  process.env.NETWORK_HASH_SECRET || 'symbia-network-dev-only';

const hash = createHash('sha256')
  .update(JSON.stringify(body))
  .update(HASH_SECRET)
  .digest('hex');
```

`verify()` recomputes the same value and compares. The docstring states the
construction matches `network/server/src/services/policy.ts`, so an envelope
sealed in assistants is checkable by the same means as an event crossing the
mesh.

## What follows from it

Stated separately from the observation, because these are inferences:

1. **Any holder of the secret can forge an envelope.** Sealing and verifying
   use the same value, so the ability to check is the ability to fabricate.
2. **A third party cannot verify at all.** Not without being given the secret —
   at which point they can forge. So the envelope is an integrity check against
   accident and corruption, not evidence for anyone who does not already trust
   the process that produced it.
3. **It cannot attribute.** The secret is shared across services by design, so
   an envelope cannot answer "which service sealed this".
4. **The default is public.** `'symbia-network-dev-only'` is a literal in this
   repository. Any deployment where `NETWORK_HASH_SECRET` is unset seals
   envelopes with a value anyone reading the source already knows.
5. `sha256(data ‖ secret)` is a non-standard construction. HMAC is the
   primitive for this job. Suffix placement avoids the classic
   length-extension problem, so this is a preference for something
   well-analysed rather than a break.

## Why it matters now

The spyglass work of the same day produced the other kind of seal: ed25519 over
a canonical document, with the verifying key travelling in the record and the
attestation level reported by what a verifier can substantiate. An independent
implementation — `openssl`, given only the public key — confirmed a signature
and refused a tampered one.

So the codebase now contains two provenance mechanisms of materially different
strength, and the weaker one is on the path that users actually see: assistant
replies. Anything built on top of envelopes inherits the weaker property.

That matters most for the direction in
`2026-08-10-sole-ingress-and-derivation.md`, where an answer's receipt is meant
to reach back through a derivation chain to a signed observation. A chain is
worth its weakest link, and today the last link — the reply envelope — is the
weakest.

## Not proposed here

A fix. The obvious shape is service identities with asymmetric signatures via
`@symbia/crypto`, which now exists, and it would remove the shared secret
entirely. But that touches the mesh policy path as well as assistants, and it
should be scheduled deliberately rather than folded into unrelated work.

## Not checked

- Whether `NETWORK_HASH_SECRET` is set in any deployed environment. The
  `.mcp.json` and compose files were not inspected for this, and the answer
  changes how urgent item 4 is.
- Whether anything outside assistants and network relies on the current
  envelope format.
