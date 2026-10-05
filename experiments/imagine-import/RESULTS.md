# Track 4 — results

Run 16 Aug against a sealed bundle from a live imagine session. Predictions
in `PREDICTIONS.md`, committed at `bd2730a` before any of this ran.

| | prediction | verdict |
|---|---|---|
| I1 | the ledger chain verifies | HELD — 40 events, head `ecb5c185…` |
| I2 | every signature verifies against the bundle's key | HELD |
| I3 | altering one byte breaks verification and the whole bundle is refused | **BROKEN, then fixed** |
| I4 | artifacts register through the public API only | HELD — 3 registered |
| I5 | each import records `artifact.registered` naming the bundle digest | HELD — 3 events |
| I6 | the import chain is new, from GENESIS, under the target identity | HELD — `parents=[null]`, `actor=import` |
| I7 | a repeat import is refused, not silently duplicated | HELD — 0 registered, 19 refused |

## I3 — the seal did not cover what its claim said it covered

Two alterations, measured separately (`tamper.mjs`):

- changing one **trace event** → REFUSED at that event
- changing one **artifact's metadata** → **ACCEPTED, chain still verified**

The chain covered the trace. The artifacts were a sibling array with nothing
binding them to it. The bundle's printed claim was "these artifacts and this
trace came from one imagine session, unaltered since sealing", so the
sentence was broader than the mechanism, and an importer trusting the
sentence would register content the session never authored.

Fixed at the seal rather than at the importer: `/session/seal` digests the
artifacts with canonical JSON and puts that digest in the sealed event's
payload, and the bundle's trace is re-read afterwards so the seal event is
inside the chain the importer walks. Without that re-read the digest is
present but unprotected, which would have looked identical from outside.

The importer refuses a bundle whose trace carries no artifacts digest at
all, and says why: the chain verifies, the trace is intact, and nothing
binds the artifacts to it. Bundles sealed before this change fall into that
case.

After the fix, both alterations are refused, and the artifact case names the
sealed and computed digests.

## I7 held, and my stated reason for doubting it was right

The second import registered nothing and refused all 19. The refusal reads:

```
assistants/incident-reader  400  {"error":"A resource with this key already exists"}
```

Which is an answer about keys, not about bundles. `PREDICTIONS.md` said this
was the likely shape and that it would be answering the wrong question. It
is: nothing in the catalog keys on provenance, so re-importing a bundle is
indistinguishable from a key collision with unrelated content. A caller
cannot tell "you already imported this" from "someone else took that name".

## The defect this run actually found

**Sealing counts seeded resources as session-authored.** The bundle carried
19 artifacts. Three were authored in the session; the other 16 came from the
sandbox seed. `/session/seal` separates them with `isBootstrap === false`,
and the seed writes resources with `isBootstrap` false, so the boundary does
not hold.

The consequence showed up immediately on import: 16 of 19 were refused by
the target because its own seed had already created the same keys. The
import worked. It just spent most of its effort re-registering the sandbox's
furniture.

This interacts with the Track 3 change. `isBootstrap` is server-owned now,
which was right — a client could set it and it persisted. But the server
sets it false for everything it writes, including the seed, so the flag no
longer marks what it was being read to mean. Seeding needs to set it, or
sealing needs a different boundary.

## What this run does not establish

The target was a second sidecar, not the deployed stack. Same one-origin
addressing, same catalog routes, but pg-mem with an ephemeral identity
rather than Postgres with a real one. Auth and row-level security are the
parts most likely to behave differently under import, and they are exactly
the parts this measurement cannot see. Import against a deployed stack is
unmeasured.
