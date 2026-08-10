# Browser walk — results

*10 August 2026. Measured against the predictions committed in
`2026-08-10-browser-walk-predictions.md` (`b768f4f`), which were registered
before the console was opened and have not been edited since.*

*Partial. The walk was stopped after chat and the Electron agent; the catalog,
assistants, integrations and logs panels, and the in-console spyglass, are
**not checked**.*

---

## Console

| # | Prediction | Result |
|---|---|---|
| C1 | Loads and renders, no unhandled console error | **PASS** — renders; console clean after reload. Errors seen initially (`getaddrinfo ENOTFOUND assistants`, repeated `xhr poll error`) were timestamped 1:10–1:13 PM, before the compose fix, and did not recur. |
| C2 | A login screen appears; `dev@example.com` works | **BROKEN** — no login screen. The console opens already authenticated as Dev Admin. Not investigated: whether `DEV_NO_AUTH` is set or a session persisted. |
| C3 | 12 service tiles, all healthy | **BROKEN** — eleven tiles, all healthy, `directory` present. Eleven is not twelve; recorded as a miss rather than as near-enough. |
| C4 | Every nav destination renders | **PARTIAL** — Overview, Network and Chat rendered. Catalog, Assistants, Integrations and Logs **not checked**. |
| C5 | *(expected to break)* Some panel shows a confident zero that is a failed fetch | **NOT ESTABLISHED** — several zeros observed (Runtime `Loaded Graphs 0`, Models `Loaded Models 0`, Directory `Peers 0`) but none were traced to a failed fetch. The prediction was too vague to resolve; see §2.1 of the method document. |

Network topology renders correctly — 20 nodes, 13 contracts, observed calls
drawn solid and declared contracts dashed, with the legend stating that a call
with no caller draws no edge. The render-loop fix holds.

## Chat

| # | Prediction | Result |
|---|---|---|
| H1 | Conversation opens, message sends | **PASS** |
| H2 | Reply streams back | **PASS** — replies appeared without reload; no join storm. |
| H3 | Participant name and colour on group messages | **PASS** — "Coordinator" labelled and colour-keyed on every reply. |
| H4 | Calc returns the bare result, no provenance suffix | **BROKEN — regression, see below.** |
| H5 | Provenance receipt renders | **PASS**, and better than predicted. |
| H6 | *(expected to break)* Something in the assistant path fails | **BROKE, in the wrong place.** |

### H4 — a committed fix that is not in effect

`48271 * 1039` returns `50153569`, arena `Computed`, which is correct. The
message body also carries:

```
_computed by math.evaluate — no model call_
```

That suffix was removed this morning in `52f7aa2`. **Observation:** the repo
file `catalog/data/assistants-bootstrap.json` contains zero occurrences of the
string; the running system emits it. **Observation:** the catalog logs
`Failed to run bootstrap: error: duplicate key value violates unique constraint
"resources_pkey"`, after reporting success for earlier bootstrap files
("0 added, 5 updated").

**Inference:** bootstrap aborts on the first duplicate primary key rather than
upserting, so every bootstrap file ordered after the failure point is never
applied, and the database keeps serving pre-fix assistant definitions. The
service reports healthy throughout and the console shows 54 resources.

This is the day's recurring lesson in a new dimension — not stale code, stale
**data**. A committed fix, not in effect, on a system reporting green.

### H6 — broke, but not where predicted

Predicted failure was in the integrations or model path. Actual:

```
what is 48271 * 1039?  →  Invalid character: ?   [Refused]
48271 * 1039           →  50153569               [Computed]
```

The bare expression works. Natural-language wrapping does not: raw message text
reaches the evaluator instead of an extracted expression. The compacted record
of an earlier session shows the identical failure with `@`, so this is not
specific to `?`.

**Note on method:** the prediction pointed at the wrong subsystem. Had the
search been confined to where it pointed, this would have been recorded as a
pass.

### H5 — the honesty mechanism working

The refused reply's receipt expands to:

> The system declined rather than guess.
> Invalid character: ?
> **unsealed — no hash on this reply**

A refused reply carries no seal, and the UI says so in amber rather than
rendering a seal it does not have — the behaviour `Receipt.tsx` argues for in
its own comment.

## Spyglass in the console (browser)

**Not checked.** B1–B4 were not exercised.

## Spyglass as the native Electron agent

| # | Prediction | Result |
|---|---|---|
| E1 | Launches, overlay appears | **PASS** |
| E2 | Boots as `…a45045d89b53d8e6`, level `attested`, unaffected by the stack | **PASS** — identical identity and level after a full platform rebuild. |
| E3 | All four gestures work | **BROKEN — one of four produced an artifact.** |
| E4 | A new clip verifies, `attested` with `--genesis` | **PASS** — `clip-c154d4e3b3b6b75b`, 4 segments, verifies attested. |
| E5 | Clips from before the rebuild still verify | **PASS** — four earlier clips reverify with unchanged results, two `attested` and two `self-attested`. |
| E6 | *(expected to break)* Nothing | **PASS for coupling, FAIL for usability** — nothing broke because of the platform, which was the point of the prediction. The gesture defect below is not a coupling failure. |

### E3 — the gestures interfere with each other

In a run of all four gestures performed in sequence, exactly one artifact was
produced: a video-only clip. Zero stills, zero audio tracks.

**Observation, in the code I wrote:**

```js
if (recording) { stopRecording(); clearGesture(); return; }
if (counting)  { cancelCountdown(); clearGesture(); return; }
```

During the five-second still countdown the instrument accepts nothing except
cancellation. A tap starts a countdown; any subsequent press within five
seconds is consumed cancelling it, producing neither a still nor a recording.

**Two candidate causes, not distinguished:** this interference, or a
double-tap window (`DOUBLE_MS = 280`) too tight to hit reliably. Distinguishing
them needs an observation nobody recorded at the time — whether the ring went
red, and whether the violet halo ever appeared.

**Why this matters beyond the fix:** every gesture was verified working this
morning, individually, immediately after being built. They interfere only when
performed in sequence, which is the only way a person ever uses them. A
terminal could not have found this.

## Standing after the walk

Fixed today and verified: network topology renders, replies stream, participant
identity shows, the receipt is honest about unsealed replies, the Electron agent
is fully independent of the platform.

Open, in the order I would take them:

1. **Catalog bootstrap aborts on duplicate keys**, silently leaving later
   bootstrap files unapplied. This is the one that makes other fixes not real.
2. **Calc rule passes raw message text to the evaluator** — any punctuation
   refuses.
3. **Spyglass gesture interference** during the countdown.
4. **C2** — why no login screen.
5. The panels and the in-console spyglass, still **not checked**.
