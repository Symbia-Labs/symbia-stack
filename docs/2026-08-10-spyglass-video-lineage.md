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

*(appended after measuring)*
