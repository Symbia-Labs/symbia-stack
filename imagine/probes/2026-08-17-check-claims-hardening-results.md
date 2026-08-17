# check-claims hardening — results against 6334fa3

Validated entirely outside imagine: `npm test` in `runtime/`, no host, no
plugin, no docker. These are the first tests this package has ever had.

- **H1 HELD** — the t0 register behaves identically under check-v2: the two
  honest claims pass, the three planted failures fail, each for the same
  reason as before.
- **H2 HELD** — `14` is refused against `(202) 514-3435` while `$186 billion`
  and `82 percent` are still accepted. Both in one run.
- **H3 HELD** — `controlStatus: passing` with six vectors, now including the
  two the review showed v1's control could not see.
- **H4 BROKE, as predicted.** The anchor moved: `24ddba974668336b664e` →
  `a4741ca65621c0f52d2f`. Every published reference to the old digest — the
  t0 walkthrough, the plugin review, the t0 results table — pinned check-v1
  and remains true *about check-v1*. The algorithm name moved to check-v2 so
  the two verdicts cannot be confused, and the walkthrough's anchor is
  republished.

This is the first expected-wrong to break in five attempts, and it broke at
the seam it was aimed at: nothing connects "the checker was corrected" to
"the checker's output is a published constant". The components do not know
the documents exist. The lesson from the seal package holds — aim
expected-wrongs at joins, not at mechanisms.

## What the harness caught that review and reasoning had not

My first boundary fix was over-strict in the opposite direction: `(?![\d.,])`
refused `82 percent.` and `$153 billion,` because they were followed by
punctuation. Two tests failed on the first run. Nobody had reported that
defect, and it would have shipped — the embedded control vectors do not
contain a figure at the end of a sentence, so the control would have stayed
green while honest claims started failing.

The pattern is now three deep: v1's control passed on the cases v1 handled;
my fix passed the cases my fix was aimed at; only an independently written
adversarial suite caught the case neither was looking at. **A control written
by the same hand as the code inherits that hand's blind spots.** That is an
argument for external review and for tests written to attack rather than
confirm, not for a better control.

## Boundary asserted, not assumed

One test is written to PASS on a claim whose correctly-located quote argues
the opposite of the claim. That is not a defect to fix later: the checker
establishes that a citation exists and is correctly located, and a version
that read for support would trade an unarguable mechanical check for a
judgement call. The test exists so that anyone who later makes it fail has to
change it deliberately and say why.
