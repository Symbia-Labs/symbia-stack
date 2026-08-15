# Operating modes: imagine, design, deploy

Status: PAPER. Proposed 15 Aug 2026 (Brian's frame, late session; names
toured the same night — canon, commission, cast, mint, certified each
kept one property of mode 3 while shedding another. Brian's final call:
**deploy**. The verification vocabulary — certify, certificate, revoke —
survives as the GATE language; deploy is the mode it guards.)
Nothing here is built. The gates map onto machinery that exists; the mode
field and its enforcement do not.

## The three modes

Behavior artifacts — assistants, routines, graphs, step configurations —
operate in exactly one of three modes:

- **imagine** — entirely in-memory. Unsigned, restart-lossy, free. The
  mode where sketching happens. Nothing wrong with it EXCEPT being
  consumed as if it were more than it is.
- **design** — grounded but mutable. The artifact lives in the catalog
  with an identity attached; behavior still resolves at call time, and
  every resolution is recorded. The collaborative middle.
- **deploy** — cast and checked. Composition signed, weights pinned by
  digest, resolution already frozen, and nothing unreceipted feeds its
  output. Only deploy-mode artifacts run on production nodes — including
  edge nodes, which is the federation story in one line: you cannot ship
  imagination. The certificate that admits an artifact into this mode
  recomputes from the records alone — certified does NOT mean "an
  authority said so", it means "you can check it without trusting
  anyone."

The modes also describe the human/AI collaboration at each stage, with no
stretching (Brian's observation, on review). In imagine, human and machine
riff, and nothing either one says is binding. In design, they build on
ground together: the human rules, the machine resolves, and every
resolution is recorded so each can check the other. In deploy, the
collaboration on that artifact is finished — humans certified it, the
machine executes it, and neither may quietly change it; further
collaboration reopens in design, through revocation or a copy. So the mode
label tells a reader not only how much to trust an artifact but what kind
of conversation produced it.

## The 2×2 they cut through

Two independent axes: persistence (in-mem vs grounded) and verification
(unsigned vs signed). The modes are the diagonal — imagine is
in-mem+unsigned, design is grounded+unsigned, deploy is
grounded+signed+compiled. The fourth cell (in-mem+signed) is not empty —
session tokens and delegation seals live there — but it holds signed
EPHEMERA, never behavior artifacts, and is out of scope here.

## Why this frame earns its keep

It names the platform's most recurring defect class: **mode confusion —
imagination consumed as ground.** Restart-lossy conversations treated as
records. The in-memory roster projected as if registered. DEBUG auto-login
inside a console that looks authenticated. Bootstrap JSON edited as if it
were a write path (§6.1, STATUS's most dangerous entry). Routine steps
edited in a display copy the executor never reads (measured 15 Aug —
docs/proposals/step-identity.md). None of these were sins of memory; all
were sins of UNLABELED memory.

Therefore the one hard requirement: **mode is a visible property of every
behavior artifact** — a field in the catalog, a badge in the console, a
line in every receipt. `mode: deploy` in a receipt is a checkable
claim; the absence of a mode label is how every defect above happened.

## Precision on "no-mem"

Taken literally, no-mem is unachievable — inference is memory-full and
context windows are state. The defensible invariant, and the one this
proposal means: **nothing may influence deploy-mode output whose provenance
cannot be named.** State is permitted in deploy mode when it derives
from signed inputs and is recorded; what is banned is unreceipted,
unreconstructible state feeding the canonical bus. This is the lane
discipline applied to the stack's own configuration — and the modes shadow
the lanes deliberately: imagine ≈ apocryphal, design ≈ conditional (the
declared boundary is the point), deploy ≈ canonical.

## The gates, mapped to what exists

- **ground** (imagine → design): catalog registration through the gated
  write path, identity attached. Resolves §6.1 by construction: a
  bootstrap JSON file is an imagine-mode artifact; grounding is the only
  door into design; editing the seed file is editing imagination.
- **cast** (the freeze inside design → deploy): resolution happens
  ONCE, at cast time — the models broker answers, the answer becomes a
  digest pin; the composition is fixed. After the cast, runtime does no
  selection: an unavailable pinned model is a refusal or an `onUnavailable`
  event per the standing ruling, never a silent substitute.
- **certify** (design → deploy): every check runs — signed composition
  (the component gate, 16/16 measured 14 Aug), manifest validation, digest
  verification — and the certificate is sealed: the receipt bundle that
  recomputes from records alone. Certification is the only door into
  deploy mode; placement on nodes follows from the mode rather than
  being a separate ceremony.
- **revoke** (deploy → design): a violated certificate — digest
  mismatch, broken pin, failed recheck — drops the artifact to design
  mode, loudly, with the violation recorded. PKI taught everyone this
  lifecycle already; we do not invent semantics.

## Consequences for work in flight

- **Per-step weights** (experiments/step-weights): imagine — unpinned,
  anything; design — constraints resolved at call time, resolution
  recorded beside the candidates; deploy — pins only, resolved at cast
  time. The spike's escalation ranking (computed verification, then
  cross-substrate panels, then self-consistency as prefilter) becomes
  graph shapes available in design, frozen choices in deploy mode.
- **Step identity** is prerequisite to pins in any mode — see
  step-identity.md, same date.
- **The models service** built deploy-mode primitives all day without
  the name: content-addressed weights, receipted acquisition, checkable
  derivation, disclose-then-refuse mismatch handling. The ratchet
  ("disclose now, refuse when…") is revealed as mode-aware behavior:
  disclosure is design-mode manners; refusal is deploy-mode manners.

## The strain, stated

Design mode is where drift lives, so it carries the most disclosure
machinery — and it is where artifacts will camp if the certify gate is
too heavy. A stack full of permanent design-mode artifacts is today with
better labels. The gate must be cheap enough to use: signed composition
already passes 16/16 on real components, so the cost is mostly the cast
step and the mode plumbing, not new cryptography.

## Open decisions (Brian's)

1. Where the mode field lives: a catalog column beside `status`, or
   resource metadata. (Column is honest — the write gate can enforce it —
   but it is a schema migration.)
2. Environment defaults: does a dev stack default new artifacts to
   imagine, and does production refuse to load them?
3. Does entering deploy mode require the catalog rebuild first (it
   needs the type/gate machinery from stage 5), or can assistants certify
   against the old catalog with mode in metadata?
