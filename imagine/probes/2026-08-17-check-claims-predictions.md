# MAP predictions — symbia.canon.check-claims (before measurement)

- **K1** — Same claims + same canon → identical verdict sha256 across two
  executions. The component's whole reason to exist.
- **K2** — The load-time control (1 valid claim + 3 planted failures:
  fabricated number, paraphrase-as-quote, wrong-source citation) runs at
  registration and passes: valid PASSes, all three plants FAIL. Discriminator:
  the load log line and the component present in /api/components. If the
  control fails, the component mounts as a loud refusal (every invocation
  errors naming the control), not silently absent.
- **K3 (expected to break — seam: artifact retrieval path)** — check-claims
  reading its canon from catalog artifacts (list + download per item) hits a
  seam on the imagine packaging: the download route resolves storageUrl
  against filesystem paths and auth that have never been exercised through a
  bundle. I expect a 4xx/5xx or a path failure on first try.
- **K4** — End-to-end: a corpus certified by canon.certify, then checked by
  check-claims citing artifact names, reproduces the manual spike checker's
  verdicts on equivalent claims (valid passes, planted fails).
