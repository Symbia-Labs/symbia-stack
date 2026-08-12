# Deterministic routing and typed replies — predictions

**Registered before measuring, 11 August 2026.** Nothing here has been run.

## What changed

1. **Routing is a tool, not a prompt.** `assistants.route` matches the message
   against what each assistant declares in `metadata.routing`. No model, no
   network — a function of the message and the registry.
2. **The coordinator holds no roster.** Specialists declare their own patterns,
   precedence and a one-line `handles`.
3. **No match refuses.** The tool throws with the live roster rather than
   guessing.
4. **Replies carry typed fields.** `message.send` takes `fields`; the seal
   commits to the fields and `sealedOver: 'fields'` says so, so rewording a
   template does not change the hash.
5. **The delegation records `method`.** `declaration` when recomputable,
   `model` when not.

## Predictions

| # | prompt | routed to | by | delegation `method` | arena |
|---|---|---|---|---|---|
| D1 | `2+2` | calculator | declared pattern | `declaration` | `COMPUTED` |
| D2 | `what is 2+2?` | calculator | declared pattern | `declaration` | `COMPUTED` |
| D3 | `sqrt(16)` | calculator | declared pattern | `declaration` | `COMPUTED` |
| D4 | `whats 15% tip on $47.50` | smart-calc | declared pattern | `declaration` | `COMPOSED` |
| D5 | `split $120 between 4 people` | smart-calc | declared pattern | `declaration` | `COMPOSED` |
| D6 | `who is on the team` | coordinator answers | — | none | `COMPUTED` |
| D7 | `tell me a joke about snails` | **nobody** | — | none | `REFUSED`, naming the roster |

**D1 is the one that matters.** It is three characters, it failed consistently
against the model classifier with an empty completion, and it is now a regex
match. If determinism is real, D1 cannot be flaky.

**D7 is the new behaviour.** The model classifier would have picked something.
Refusing is OEP's prescribed rewrite for a claim the system cannot support.

### Stability

| # | claim | predicted |
|---|---|---|
| D8 | three consecutive runs give identical routing for D1–D5 | **identical** |

The previous classifier disagreed with itself across four passes: `2+2` held,
broke twice, held; `15% tip` held, broke, held. That is what this change exists
to end, and one green run does not demonstrate it — only repetition does.

### The envelope

| # | claim | predicted |
|---|---|---|
| D9 | `sealedOver: 'fields'` on Calculator and Smart Calculator replies | present |
| D10 | `fields.result` equals the number in the rendered text | equal |
| D11 | seal verifies from the envelope alone | 8/8 |
| D12 | basis says the routing **is** reproducible | on all delegated replies |

D12 is the sentence that changes. It read *"is NOT reproducible"* on every
delegated reply this morning.

## Known risk, flagged not predicted

Calculator's first pattern is anchored to a whole-string expression and Smart
Calculator's are unanchored keyword matches. A prompt that is both — say
`what is 20% of 80` — could match Calculator's lead-in and Smart Calculator's
percent rule. Precedence resolves it to Calculator (100 vs 50), which would be
**wrong**: the strict parser cannot read `20% of 80`.

Not predicted because it is not in the case list, and it should not be quietly
fixed before being seen. If it appears, it is a declaration defect, and the
right response is to tighten Calculator's anchor — not to add a model.
