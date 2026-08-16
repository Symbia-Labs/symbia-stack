# Track 4 — importing a sealed imagine bundle into design mode

Registered before the importer was run. Committed first, per CLAUDE.md.

## What the bundle claims, and what it does not

The seal asserts one thing: these artifacts and this trace came from one
imagine session, unaltered since sealing. It asserts nothing about who ran
the session, whether the artifacts are sound, or whether their declared
lanes are true — the signing key is ephemeral and travels inside the bundle,
so it authenticates continuity, not authorship. Import is where a real
identity takes responsibility for content that arrived unattributed.

## Predictions

| | prediction |
|---|---|
| I1 | the bundle's ledger chain verifies: every event's checksum is the advance of the previous head over its own digest |
| I2 | every event's signature verifies against the `publicKeyPem` carried in the bundle |
| I3 | altering one byte of one artifact's metadata breaks verification, and the importer refuses the whole bundle rather than importing the rest |
| I4 | the importer registers every artifact into the target catalog through the public API, with no direct store access |
| I5 | each import records an `artifact.registered` lineage event whose `source` names the bundle digest, so a reader can ask which bundle a resource came from |
| I6 | the imported chain is a NEW chain under the target identity, threaded from GENESIS — not a continuation of the session chain, because the session key does not speak for the target |
| I7 | importing the same bundle twice is refused or reconciled, not silently duplicated |

## Where I expect to be wrong

I7 is the weakest. Nothing in the catalog currently keys on provenance, so
a second import most likely writes a second set of resources under the same
keys, or 400s on a duplicate key with a message about keys rather than about
bundles. Either way the answer is about the wrong thing, and that is worth
recording as a defect rather than papering over in the importer.
