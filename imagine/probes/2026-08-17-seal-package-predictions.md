# MAP predictions — seal package (registered before measurement)

- **R1** — A new symbia_seal tool (POST /session/seal with the shim's host
  token) returns a bundle path and seal on a live owned host. Discriminator:
  bundle file exists at the returned path with completeness declared.
- **R2** — Seal-on-takedown: SIGKILL the shim; the dying host writes a
  bundle BEFORE its closing event, without any client asking. Discriminator:
  a bundle-*.json newer than the kill, plus a closing event whose total
  exceeds the seal's. Risk named in advance: the seal fetches artifacts from
  catalog, so sealing must run BEFORE services stop, and pipe-close takedown
  must tolerate a catalog that answers slowly or not at all (5s cap; a
  takedown that hangs on its own seal is worse than an unsealed exit).
- **R3 (expected to break)** — host.log (written by the host itself, not
  teed through the shim) contains the takedown lines after the shim is
  SIGKILLed. I expect the LAST lines to be missing: the write stream may not
  flush before process.exit(). If the tail is truncated, the fix is flushing
  or sync appends on the takedown path specifically.
- **R4** — symbia_diagnose, currently tokenless (it 401'd against every
  gated host on 16 Aug), works once it sends Authorization.
