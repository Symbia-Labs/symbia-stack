# Spyglass video: scan-and-append lineage

*10 August 2026. Predictions registered before any clip was recorded. Results
appended below after measuring; broken predictions reported as broken.*

---

## 1. What was built

The native spyglass agent records video from the aperture. The recording path
matters more than the recording:

- The desktop stream is pumped through a canvas **clipped to the aperture
  circle**, so the crop happens before encoding. What the encoder sees is only
  ever the circle. (This also fixed a defect in the still path — see §2.)
- `MediaRecorder` emits one segment per second. Each segment is handed to the
  main process **as it lands**, hashed, and chained:

      chain(0) = 0x00…00                      (genesis, 32 zero bytes)
      chain(n) = sha256( chain(n-1) ‖ sha256(segment n) )

- One **GKS Lineage** event per segment is appended to a JSONL sidecar next to
  the clip. The ledger is append-only, strictly ordered, identity-scoped,
  parent-linked, and verifiable by checksum. Its payload carries digests, byte
  counts, offsets and geometry — **never a frame, never a sample**. Reading the
  entire ledger tells you exactly what was captured and in what order, and
  shows you none of it. That is the Lineage primitive's non-epistemic rule, and
  it is also the pixel-gap: the ledger is safe to publish because it cannot
  leak what it describes.

The purpose is not reconstruction. The clip reconstructs itself; it is a video
file. The purpose is to **stamp reliably** — the head commits to every byte in
order, so altering, dropping or reordering any segment breaks the chain from
that point forward, and the break is local: the surviving prefix stays
verifiable.

Nothing is buffered waiting to be stamped. Every segment already in the file is
already committed, so the ledger stays truthful even if the app dies mid-clip.

## 2. A defect this uncovered

**Observation.** Corner pixels of a saved still (`frame-b17e11663cf6.png`)
read `rgb(5,4,9)`, `rgb(11,21,35)`, `rgb(5,4,9)`, `rgb(6,16,25)`. The
`shooting` veil is `rgba(3,4,10,0.86)`.

**Inference** (separable, and mine): the rectangular crop was capturing the
veil in the corners, because the veil darkens everything outside the *circle*
while the crop takes the *bounding square*. Every still taken before today has
four darkened corners.

Fixed by clipping to the inscribed circle, which is what the aperture always
claimed to be. Stills now have transparent corners; clips have a scope view.

## 3. Predictions (registered before measuring)

For a hand-recorded clip of roughly six seconds:

| # | Prediction |
|---|---|
| P1 | `clip.webm` is playable and shows the circular aperture against black. |
| P2 | `lineage.jsonl` line count = segments + 2 (one `capture.clip.open`, one `capture.clip.close`). |
| P3 | Segment count is within ±1 of the wall-clock seconds recorded. |
| P4 | Sum of `payload.bytes` across `capture.segment` events equals the byte size of `clip.webm` exactly. |
| P5 | Recomputing the chain from the segment digests alone reproduces `payload.chain_head` in the close event. |
| P6 | **The one I expect to get wrong.** `ffprobe` reports a real duration for the clip. `MediaRecorder` webm is written without a duration in the header, so I expect `N/A` or `0` — the bytes are all there and it plays, but the container cannot say how long it is until it is remuxed. |

## 4. Results

Three clips measured. The first run (`clip-cedbf308dc67fa63`, 10 segments)
exposed a defect and was re-measured after the fix; the two clips below are
post-fix, one long hold and one deliberately short one.

| # | Result | Evidence |
|---|---|---|
| P1 | **PASS** | Decodes at 340×350. Seeks to 6.748s and 0.936s respectively — the tail decodes, not just the header. |
| P2 | **PASS** | 9 lines / 7 segments, and 3 lines / 1 segment. |
| P3 | **PASS** | 7 segments vs 6.8s; 1 segment vs 1.0s. |
| P4 | **PASS** | 888381 = 888381 and 71402 = 71402. Exact, both clips. |
| P5 | **PASS** | Chain recomputed from segment digests alone reproduces the recorded head (`47d08b77…`, `ea323015…`). |
| P6 | **BROKEN, as registered** | `duration` is `null`. The clip seeks to its end, so the bytes are present and the index is usable; the container simply carries no duration in its header. Predicted to break, broke. |

Two checks beyond the predictions:

- **Tamper locality.** Flipping one bit of segment 4's digest makes the
  recomputed chain first diverge at exactly segment 4. The break is local: the
  prefix before it stays verifiable, so a damaged clip degrades to a shorter
  trustworthy clip rather than to nothing.
- **Non-epistemic.** No ledger event carries a data URL, base64 blob, or any
  long opaque run. Digests, byte counts, offsets and geometry only. The ledger
  is publishable precisely because it cannot leak what it describes.

### 4.1 Defect found: the dropped tail

**Observation.** Every clip in the first run logged
`Error: unknown clip: null` from `video-chunk` immediately before its close
event. Two short holds produced clips with 0 segments.

**Inference.** `recorder.stop()` fires `dataavailable` and then `onstop`. The
handler read `recClipId` *after* awaiting `e.data.arrayBuffer()`, by which point
`stopRecording` had already nulled it and closed the clip. The final segment
reached neither the file nor the ledger.

This is the interesting part: **P4 still passed.** The file and the ledger
stayed consistent with each other while both silently omitted the end. A
self-consistent record that is missing its tail is exactly the failure this
product exists to make impossible, and the internal check could not see it —
only the error line in the log could. Byte-sum agreement is not evidence of
completeness; it is evidence of agreement.

Fixed by snapshotting the clip id synchronously in the handler and awaiting
every queued segment write before appending the close event. Short holds now
produce a real one-segment clip.

### 4.2 The verification script measured its own assumptions

The tamper check reported `FAIL` on the one-segment clip. The clip is fine: the
probe tampers with the fourth segment of a clip that has one, finds nothing to
diverge, and records the absence as a failure. The check inherited the shape of
the long clip it was written against — an instrument agreeing with itself until
something outside it objected. Recorded here rather than quietly corrected.

### 4.3 Audio, and one chain per track

Added after the video work, same day. Decisions taken deliberately and recorded
so they are not relitigated by accident:

**Tier one is the system microphone**, because on this machine it is the only
thing macOS will give us. **Observation:** Electron 32.3.3's own typings say
`loopback` audio "is currently only supported on Windows"; the machine has
`audioinput` devices for the built-in and Continuity mics and no virtual audio
device installed. **Inference:** system-audio capture has no supported path in
the current runtime, and tier two — including left and right bound to
*different* sources, so channel separation itself carries provenance — is
deferred rather than attempted. The source model is declared in a shape that
can express it, so that tier is a config change and not a rewrite.

**Each track carries its own chain**, written to its own file, with the close
event binding the track heads:

    binding = sha256( "audio" ‖ head_audio ‖ "video" ‖ head_video )   (ids sorted)

The alternative — one chain over a muxed container — is simpler and gives up
the only property worth having here: with separate chains you can release the
video and *prove the audio belonged to the same capture without handing over
the audio*. That is the Observer boundary expressed in files rather than in
policy, and it is checkable by a party who holds only one of the tracks.

**The halo is driven by analyser RMS, not by a flag.** A steady "audio on"
light is a claim, and a muted input, a dead device, or a track that ended
silently all light it identically. Level is evidence: if it moves, sound is
arriving. When audio is not capturing there is no halo at all — absence means
no audio track, never "audio might be on". This is the blank-beats-green rule
applied to a consent signal, and consent is why it matters: a ring pointed at a
screen is aimed, but a microphone takes in everyone in the room who never saw
the instrument, and they should be able to tell it is live without trusting us.

**Gestures.** One key, four gestures: tap for a still, hold for video, tap-then-
hold for video with audio, tap-tap for audio only. Audio-only latches and any
press stops it — a voice note is not something you hold your hand down for, and
there should be no state you cannot leave with the key you entered it with.

### 4.4 Audio predictions and results

| # | Prediction | Result |
|---|---|---|
| P7 | macOS prompts for microphone access on first use | **No prompt** — `getMediaAccessStatus('microphone')` already read `granted`, so nothing was asked. Predicted as likely-not; correct. |
| P8 | Two independent chains; audio segment count within ±1 of video | **PASS** — audio 6 segments, video 6 segments. |
| P9 | The binding recomputes from the two track heads | **PASS** |
| P10 | **Expected to break.** With `audio.webm` deleted, the clip still verifies: video complete, binding confirmed from the audio head in the ledger, audio reported present-but-withheld | **PASS** — it did not break. Registered as the doubtful one because the two recorders start milliseconds apart and the withheld path had never been exercised; both concerns turned out not to bear on it. |

Five clips verified across all four gestures, including a 0.5s single-segment
video and an audio-only clip: every chain recomputes, every segment's bytes on
disk hash to the digest the ledger claims, and tampering diverges exactly where
it was introduced.

