# Isolation refactor — results against b26c708

- **I1 HELD** — two shims produced two hosts: ports 58294/58295, sessions
  6843f790…/5693b71a…. No shared file, no race.
- **I2 HELD** — SIGTERM'd shim: host gone in 1s, ledger closed
  `reason: "SIGTERM", total: 22` (the shim's exit belt).
- **I3 HELD** — SIGKILL'd shim mid-boot, no handler ran anywhere in the shim:
  host gone within 12s check window, ledger closed `reason: "stdin ended",
  total: 22`. The pipe is the lifecycle. This is the scenario that produced
  yesterday's 2.1 GB storm; it now produces a 16 KB closed ledger.
- **I4 IMPLEMENTED, NOT MEASURED** — the crash-storm guard (coalesce at 10
  and every 1000th, takedown at 100-in-10s) is in the code but no synthetic storm
  was run against it. Saying so rather than counting it. The storm's root
  cause (dead-pipe screaming) is separately eliminated by I3's mechanism and
  the stream-error swallow.
- **I5 HELD — my expected-wrong was wrong again** — boot to attached ran
  ~9s on this machine (warm npm/OS caches; a cold partner machine is still
  unmeasured). Warm-host cloning is NOT yet justified by evidence.

## Probe defects, recorded as probe defects

The first two harness runs measured the wrong thing and nearly filed it as
the right thing: a silent-fifo stdin makes the MCP server exit early, the
shim's exit belt then SIGTERMs the host, and every ledger closes "SIGTERM" —
the belt masquerading as the pipe. Caught because the reason string didn't
match the mechanism. The decisive run SIGKILLed the shim BEFORE the MCP
import so no belt existed, and only then did "stdin ended" appear. A harness
that cannot distinguish belt from pipe reads identically to a working pipe.
