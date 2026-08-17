# Seal package — results against 77b9e70

- **R1 HELD** — POST /session/seal on a live owned host: bundle written,
  `trigger: "api"`, 22 trace entries, file verified on disk.
- **R2 HELD** — a host whose stdin ended sealed BEFORE stopping services,
  unprompted: `imagine.session.sealed {trigger: "takedown:stdin ended"}` at
  seq 22, `imagine.session.closed` at seq 23, bundle state "sealed, 22 of 22".
  Measured accidentally first (a broken test pipe gave the host instant EOF)
  and then deliberately. Every exit now tries to leave a bundle.
- **R3 HELD — expected-wrong, wrong (third time today)** — host.log written
  by the host itself with a sync fd; the final takedown lines are present
  after process exit. Note: boot writes ~350 KB of log; acceptable for a dev
  host, worth a level filter later.
- **R4 HELD** — symbia_diagnose's missing Authorization added; diagnostics
  answers 200 with the token. The 16 Aug 401s were the tool's, not the host's.

New connector tool: **symbia_seal** — POST /session/seal with the pair's own
token. Closes the gap found in smoke check 12: on an owned host nothing could
previously request a seal (outsiders locked out by design, the agent by
omission). The smoke doc's check 12 now uses the tool.

A pattern worth recording: three expected-wrong predictions today (I5 boot
time, R3 log tail, and Q1 local inference yesterday) all came out HELD — the
system keeps being sturdier than predicted while failing in places no
prediction covered (EPIPE storm, plugin re-sync unlink). The lesson is not
"predict more optimistically"; it is that the informative failures live in
lifecycle seams, not in the mechanisms themselves — aim the expected-wrongs
there.
