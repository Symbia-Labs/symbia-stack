# MAP predictions — owned-host isolation refactor (registered before measurement)

Committed to git before the test script runs. A commit proves less than a
chain position, and this file says so; the connector to a live catalog is
the thing under refactor, so git is the honest fallback.

Decision under test (Brian, 17 Aug): one conversation, one host. No
cross-conversation attachment by default. Federation later.

- **I1** — Two shims started concurrently produce two hosts on two distinct
  ports with two distinct session actors. Discriminator: the two private
  address files. Same port or same session falsifies.
- **I2** — SIGTERM'ing a shim ends its host within 5 seconds, and the host's
  ledger ends with a closing event (reason naming stdin). Discriminator:
  process gone + last ledger line event_type. A host that outlives its shim
  falsifies.
- **I3** — SIGKILL'ing a shim (no cleanup possible in the shim) STILL ends
  its host within 5 seconds, via the stdin pipe closing. This is the exact
  scenario that produced yesterday's 4.2M-event EPIPE storm on the detached
  design. Discriminator: process gone, ledger closed, ledger size in KB not GB.
- **I4** — With the storm guard in place, a synthetic repeated crash
  (>100 identical uncaught exceptions in 10s) triggers takedown rather than
  unbounded ledger growth. Discriminator: host exits; ledger contains a
  coalesced .repeated event and a close, not one row per scream.
- **I5 (expected to break)** — Owned-host boot to first successful selftest
  stays under 15 seconds. I expect this to FAIL: yesterday's catalog spec
  fetch took 30s+ on the installed tree even before the storm, and per-boot
  npm-cold caches make first boots slower. If it breaks, the "clone a warm
  host" idea from the design discussion is justified; if it holds, it is not.
