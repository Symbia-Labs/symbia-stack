# MAP predictions — extract-text + canon.certify (before measurement)

Lesson applied from the seal package: expected-wrongs aim at lifecycle/config
seams, not at mechanisms.

- **E1** — `symbia.transform.extract-text` (strip-v1) run twice over the same
  input bytes emits an identical output sha256 both times. Determinism is the
  component's whole claim. Discriminator: the two digests.
- **E2** — Fed the apocryphal output of http-request, extract-text's out port
  is TIGHTENED to apocryphal by normaliseEmission with a laneReason, and the
  recipe receipt survives the tightening. The derivation stays checkable even
  when the content cannot be canonical.
- **E3 (expected to break — seam: cwd-relative storage)** — canon.certify's
  artifact upload fails or lands somewhere surprising: ArtifactStorage
  defaults to basePath './artifacts', resolved against the HOST's cwd, which
  for an owned host spawned by a Claude Desktop shim is the conversation's
  outputs directory. I expect either a permissions/ENOENT failure or
  artifacts appearing in a directory nobody would look in.
- **E4 (seam: MIME allowlist)** — uploading canon HTML with type 'text/html'
  is REFUSED: text/html is absent from allowedMimeTypes (json, octet-stream,
  zip/gzip/tar, text/plain, yaml, js, png/jpeg/svg). certify must send
  text/plain to pass; the refusal of the honest MIME type is the measurement.
- **E5** — For an upload that succeeds, the catalog's independently computed
  checksum equals the component's locally computed sha256 — a second witness
  on every canonical byte.
