# What "a cut, not an ending" means

Measured 16 Aug. Predictions in `08-two-cuts.mjs`, committed before the run.
5/5 held.

One session, two seals, nothing in between except ordinary work:

| | prediction | result |
|---|---|---|
| C1 | both bundles verify | 34 of 34, and 44 of 44 |
| C2 | the second holds strictly more | 34 → 44 events |
| C3 | they share a prefix | all 34 of A's events byte-identical in B |
| C4 | a revised artifact appears in both forms | `"first"` in A, `"second"` in B |
| C5 | neither bundle knows the other exists | A cannot reference the later cut |

## What each result means

**C3 is what makes "same session" checkable.** Event *n* in bundle B has the
same checksum as event *n* in bundle A, because a hash chain's prefix is
fixed once written. So given two bundles you can prove one continues the
other, order them, and detect a fork — two bundles claiming one session that
diverge at some position is either a forgery or two different sessions.
**Nothing currently does this.** The property exists; no code uses it.

**C4 is the one that changes how a bundle should be read.** The resource
`contexts/revised` reads `"first"` in A and `"second"` in B. Both bundles
are intact, both verify, both are correctly sealed. A bundle can be valid
and superseded at the same time, and verification cannot tell the
difference — it establishes that bytes have not moved since the cut, not
that the cut is the current state of anything.

**C5 says the gap cannot be closed from inside.** A cut cannot reference
work that came after it. So holding a bundle, there is no way to learn from
the bundle alone whether more followed.

## The distinction that matters

`imagine.session.closed` is the only state where "this is all of it" is
true. A sealed bundle supports a narrower claim: everything up to seq *n* is
here and unaltered. Whether the session then revised those artifacts,
deleted them, or ran for another hour is outside what the bundle can say.

Reporting `sealed` and `complete` as different states is the point. Calling
a cut "complete" would be the same class of error as the seal claiming to
cover artifacts it did not cover (D6/I3) — a sentence broader than its
mechanism.

## Open, from this

Two bundles from one session can be ordered and matched by their shared
prefix. That would give: which bundle is later, whether one supersedes the
other, and whether a claimed pair actually came from one session. It is
about twenty lines against `import-bundle.mjs`, and it is not written.
