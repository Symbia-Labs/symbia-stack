# R3 egress boundary — predictions (MAP)

*Registered before measuring, per the MAP discipline. Remediates R3 in
`docs/2026-08-13-adversarial-analysis-round-2.md`: component/webhook `fetch`
reaches arbitrary URLs with no allowlist and no internal/metadata block. The fix
is one vetted guard — `@symbia/egress` — that every component/action fetch routes
through. These are the predictions the guard and its wiring must satisfy. Broken
ones will be reported as broken.*

## Guard behavior — `assertEgressAllowed(url)` / `safeFetch(url)`

| # | input | prediction |
|---|---|---|
| P1  | `http://169.254.169.254/latest/meta-data/` (cloud metadata) | BLOCKED |
| P2  | `http://127.0.0.1:5001/` (loopback) | BLOCKED |
| P3  | `http://localhost/` (resolves to loopback) | BLOCKED |
| P4  | `http://10.0.0.5/` (RFC1918) | BLOCKED |
| P5  | `http://192.168.1.10/` (RFC1918) | BLOCKED |
| P6  | `http://172.16.5.5/` (RFC1918) | BLOCKED |
| P7  | `http://[::1]/` (IPv6 loopback) | BLOCKED |
| P8  | `http://[fd00::1]/` (IPv6 unique-local) | BLOCKED |
| P9  | `http://[fe80::1]/` (IPv6 link-local) | BLOCKED |
| P10 | `file:///etc/passwd` (non-http scheme) | BLOCKED |
| P11 | `ftp://example.com/` (non-http scheme) | BLOCKED |
| P12 | `http://8.8.8.8/` (public IPv4) | ALLOWED |
| P13 | `https://1.1.1.1/` (public IPv4, TLS) | ALLOWED |
| P14 | `http://2130706433/` (decimal-encoded 127.0.0.1 bypass) | BLOCKED |
| P15 | `http://0.0.0.0/` (unspecified) | BLOCKED |
| P16 | `http://[::ffff:127.0.0.1]/` (IPv4-mapped loopback) | BLOCKED |
| P17 | unresolvable host `http://nx.invalid/` | BLOCKED (fail-closed: cannot verify ⇒ deny) |
| P18 | with `EGRESS_ALLOWLIST=example.com`, `http://8.8.8.8/` | BLOCKED (allowlist, when set, restricts to listed hosts) |
| P19 | with `EGRESS_ALLOWLIST=example.com`, `https://example.com/` | ALLOWED |

## Wiring — the guard is actually in the path

| # | prediction |
|---|---|
| W1 | `runtime` `symbia.io.http-request` routes through the guard (no bare `fetch(config.url)` remains). |
| W2 | `assistants` `webhook.call` routes the interpolated URL through the guard. |
| W3 | `assistants` `notify` and `service.call` external fetches route through the guard. |
| W4 | Internal service-to-service URLs (from `@symbia/sys` `resolveServiceUrl`, e.g. identity/integrations) are NOT forced through the public-egress guard — they are allowed by design as internal calls, not blocked as private IPs. |

## Non-goals / honest caveats (stated up front)

- **DNS-rebinding TOCTOU:** the guard resolves the host and checks the address,
  then `fetch` resolves again. Full protection requires pinning the checked IP on
  the socket (custom dispatcher). v1 resolves-and-checks and documents this;
  socket pinning is a follow-up. A prediction for pinning is deliberately NOT
  registered here because v1 does not claim it.
- W4 is a real tension: internal calls legitimately target private/compose-network
  hosts. The guard is applied only to component/action egress that takes a URL
  from graph config or conversation context — not to `resolveServiceUrl` traffic.

---

## Measured (13 Aug 2026) — reported honestly, broken ones as broken

Guard behavior: **21/21** after one fix. Test: `npm run test:security:egress`.

- **P16 was BROKEN on first measurement** and is recorded as such: Node
  normalises `[::ffff:127.0.0.1]` to the hex tail `::ffff:7f00:1`, which the
  first implementation's dotted-decimal-only regex did not catch — the mapped
  loopback was **allowed**. Fixed by parsing both the dotted and two-hextet tail
  forms (`mappedV4`), then re-measured: P16 now BLOCKED. This is the MAP loop
  working — the prediction caught a real bypass the implementation missed.
- **P19 substitution (disclosed):** as registered, P19 uses `example.com`, which
  needs DNS and is non-deterministic offline. The measurement exercises the same
  allowlist-allow path deterministically with a literal public IP
  (`EGRESS_ALLOWLIST=8.8.8.8`, `https://8.8.8.8/` → ALLOWED). The
  `example.com` variant remains network-dependent and unmeasured here.
- P1–P15, P17, P18: all held as predicted on first measurement.

Wiring: **W1, W2 held. W3 was PARTLY WRONG and is revised by measurement.**

- W1 ✓ `runtime` `symbia.io.http-request` now calls `safeFetch`
  (`runtime/server/src/executor/components.ts`).
- W2 ✓ `assistants` `webhook.call` routes the interpolated URL through
  `safeFetch` (`webhook-call.ts`).
- **W3 revised:** `notify` (external `webhookUrl`) is now guarded, but
  `service.call` is **not** — measurement showed its host comes from
  `resolveServiceUrl` (`service-call.ts:51`), i.e. it targets internal services
  by design. Guarding it would block legitimate internal calls (private compose
  IPs). So the correct wiring guards `notify` and excludes `service.call`; the
  registered W3 ("notify and service.call routed through guard") was wrong about
  `service.call` and is reported as such. W4 (internal calls not guarded) holds
  and is the reason.

Consumers typecheck clean (`runtime`, `assistants`). Follow-up unchanged:
DNS-rebinding socket-pinning remains a documented non-goal for v1.
