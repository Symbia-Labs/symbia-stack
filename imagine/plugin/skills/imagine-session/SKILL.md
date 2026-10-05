---
name: imagine-session
description: Manage a Symbia imagine session — check which host you are attached to, inspect the signed record of what was done, and seal the session into a portable bundle. Use when the user asks to seal, close, or export a session, asks what has been recorded, asks which sidecar or host they are on, or when a working session is ending.
---

# The imagine session

A session is an ephemeral stack with a signed record. Everything written in it is a sketch; the record of what was written is not.

## Know which host you are on

Before reporting anything about a session, confirm which one. `symbia_stack_health` names the endpoint; the host's own root response names the mode, the build, and the session actor.

Two hosts can be running. They do not share a store, and a statement about "the catalog" is meaningless until you know which one answered.

## What the record holds

Every mutating request is appended to a per-session ledger, signed with a key generated at spawn and destroyed with the process. Each event carries a `seq` inside the signed payload, so a gap in the middle is detectable and a position cannot be forged.

The session writes an opening event carrying `t0` and a closing event declaring the total. Both are wall-clock readings and both are apocryphal — a clock cannot be recomputed. They are anchors, not measurements of anything inside them.

## Completeness

A record reports one of four states, and the difference matters:

- `sealed` — sealed mid-session, deliberately
- `complete` — every declared event is present
- `partial` — a declared total with events missing; say **how many of how many**
- `unterminated` — no closing event, so the session was killed or is still running

Never report a partial record as if it were whole. "23 of 87" is the useful sentence.

## Sealing

`POST /session/seal` digests the session's artifacts into a signed event and writes a bundle. Sealing verifies the chain first and refuses to seal a ledger that does not verify — a bundle that fails its own claim should never be written.

A seal is a cut, not an ending. The session continues afterward and can be sealed again.

## What a seal does not assert

The signing key is ephemeral and travels inside the bundle. A seal establishes that these artifacts existed in this session in this order. It establishes nothing about who ran the session, whether the artifacts are sound, or whether their declared lanes are true.

Say that when reporting a seal. A signed record of bad work is a faithful record of bad work.
