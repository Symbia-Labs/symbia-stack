# MAP predictions — check-claims hardening (before measurement)

Registered in git rather than a live catalog: this work is deliberately
outside imagine, so there is no session ledger to hold it. A commit proves
less than a chain position and this file says so.

Findings under repair, all reproduced against the shipped code before any
change was written:
  - a quote of "the" passes, because the check asks only whether the string
    occurs in the cited source
  - "14 employees" passes against a corpus whose only digits are the phone
    number (202) 514-3435, because number matching is substring matching
  - all four embedded control vectors use quotes of 17-26 characters, so
    `controlStatus: passing` establishes nothing about either case above

- **H1** — A distinctiveness floor rejecting quotes that occur more than N
  times in the corpus refuses the bare "the" while still admitting every
  honest claim in the GAO t0 register. Discriminator: the t0 register's 14
  claims must still pass unchanged.
- **H2** — Token-boundary number matching refuses "14" against
  "(202) 514-3435" while still admitting "$186 billion" against
  "about $186 billion in improper payments". Discriminator: both, in one run.
- **H3** — Adding adversarial vectors to the embedded control set leaves
  `controlStatus: passing` — the fixed algorithm handles them. If it comes
  out FAILING, the fix is wrong and the component must refuse to mount,
  which is the behaviour that makes the control worth having.
- **H4 (expected to break — the join)** — The determinism anchor survives:
  the fixed algorithm still produces verdict digest 24ddba974668336b664e…
  for the walkthrough's fixed inline canon. I EXPECT THIS TO BREAK. The
  verdict digest covers per-claim problem strings, and changing how numbers
  are matched changes at least one problem message, which changes the digest.
  If it breaks, every published anchor — the walkthrough, the plugin review,
  the t0 results — is invalidated by a correctness fix, and the right
  response is to version the algorithm (check-v2) rather than quietly move
  the anchor. The seam is between "fix the checker" and "the checker's
  output is a published constant", and nothing in either component knows
  the other exists.
