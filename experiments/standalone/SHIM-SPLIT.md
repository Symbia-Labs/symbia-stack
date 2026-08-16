# Splitting the sidecar: a shim you never restart, a host you can

Measured 16 Aug. Predictions registered through the sidecar before the run
(`contexts/map-shim-split`). **5/5 held**, including the one I expected to be
wrong.

| | prediction | result |
|---|---|---|
| S1 | the shim survives a full host restart | HELD — the same shim, never restarted, reaches the new host |
| S2 | a call while the host is down names the address and the code | HELD — `ECONNREFUSED 127.0.0.1:7717`, endpoint named |
| S3 | the shim is usable in under a second | HELD — **207 ms** |
| S4 | state does not survive the restart | HELD — authored before, gone after |
| S5 | one host, two shims, one catalog | HELD — shim B sees what shim A wrote |

## The shape

- `host.mjs` runs the stack on a fixed port (7717) and publishes its address
  to `.session/host.json`.
- `shim.mjs` is what Claude Desktop spawns. It imports no services, reads the
  address, and hands stdout to `symbia-mcp-server`. One env var —
  `SYMBIA_BASE_URL` — is the entire coupling.
- Rebuild the stack, restart the host, keep the chat window.

S3 was the one I expected to miss. 207 ms, because the shim's only imports
are the MCP server and its dispatcher; ten services and a pg-mem are what
cost twenty seconds, and none of that is in this process any more.

## S5 answers D7

Two shims against one host see one catalog. The two-worlds problem was not
that Claude Desktop spawns two connectors — it was that each connector
carried its own stack. With the split, spawning ten changes nothing.

## S4 is the cost, and it is real

pg-mem and the session identity live in the host, so restarting it loses
every authored artifact and starts a new ledger chain. Nothing here makes
imagine durable, and it should not: the mode's claim is that nothing
persists.

What does change is the claim's basis. It was **ephemeral by construction** —
the stack could not outlive the client because it lived inside the client's
child process. It is now **ephemeral by instruction**: the host keeps running
until something stops it. That is weaker, and anyone relying on the old
guarantee should know it moved.

## The bug this spike produced, which is the more useful part

The first version put `ADDRESS_FILE` in `host.mjs` and had `sidecar.mjs`
import it back. `host.mjs` awaits `sidecar.mjs`; `sidecar.mjs` awaits
`host.mjs`. ESM top-level await deadlocks on that cycle — and it does not
throw. Execution stopped after `started assistants` with no error, no crash,
and no line in the log saying why. The stack was up, serving requests, and
had simply never reached the code that publishes its address.

Fixed by moving the constant into `host-address.mjs`, which imports nothing
and therefore cannot participate in a cycle.

Worth keeping because of how it presented: a silent stop looks exactly like a
slow boot, and the reflex is to wait longer.
