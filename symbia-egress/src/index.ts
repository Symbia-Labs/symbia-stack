/**
 * @symbia/egress — outbound egress guard (SSRF defense)
 *
 * R3, docs/2026-08-13-adversarial-analysis-round-2.md: component/action `fetch`
 * reached arbitrary URLs with no allowlist and no internal/metadata block. This
 * is the one vetted path such fetches route through.
 *
 * Applies to egress whose URL comes from graph config or conversation context
 * (runtime `symbia.io.http-request`, assistants `webhook.call` / `notify`). It is
 * deliberately NOT applied to internal service-to-service calls that resolve via
 * `@symbia/sys` `resolveServiceUrl` — those legitimately target private compose
 * hosts (see W4 in the predictions ledger).
 *
 * Honest limit: this resolves the host and checks the address, then `fetch`
 * resolves again — a DNS-rebinding TOCTOU window remains. Closing it requires
 * pinning the checked IP on the socket (custom undici dispatcher); that is a
 * documented follow-up, not claimed here.
 */

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export class EgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressError";
  }
}

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** True if an IPv4/IPv6 literal is loopback, private, link-local, ULA, etc. */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  return true; // not a valid literal ⇒ fail closed
}

function isBlockedV4(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true; // loopback / unspecified
  // IPv4-mapped ::ffff:a.b.c.d — Node may normalise to hex (::ffff:7f00:1),
  // so accept both the dotted-decimal and the two-hextet tail forms.
  const v4 = mappedV4(x);
  if (v4) return isBlockedV4(v4);
  if (x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // unique-local fc00::/7
  if (x.startsWith("ff")) return true; // multicast
  return false;
}

/** Extract the embedded IPv4 of an ::ffff: mapped address, dotted or hex tail. */
function mappedV4(x: string): string | null {
  const m = x.match(/^::ffff:(.+)$/);
  if (!m) return null;
  const tail = m[1];
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tail)) return tail;
  const hm = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hm) {
    const hi = parseInt(hm[1], 16);
    const lo = parseInt(hm[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

/**
 * Validate a URL for outbound egress. Resolves the host and rejects if the
 * scheme is not http(s), the host is not in EGRESS_ALLOWLIST (when that is set),
 * or the host resolves to any blocked address. Fail-closed on resolution error.
 * Returns the parsed URL on success; throws EgressError otherwise.
 */
export async function assertEgressAllowed(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EgressError(`invalid URL: ${String(rawUrl)}`);
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new EgressError(`scheme not allowed: ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, ""); // unbracket IPv6

  const allow = (process.env.EGRESS_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length > 0 && !allow.includes(url.hostname) && !allow.includes(host)) {
    throw new EgressError(`host not in EGRESS_ALLOWLIST: ${host}`);
  }

  if (isIP(host)) {
    if (isBlockedIp(host)) throw new EgressError(`blocked address: ${host}`);
    return url;
  }

  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new EgressError(`cannot resolve host (fail-closed): ${host}`);
  }
  if (addrs.length === 0) throw new EgressError(`no addresses for host: ${host}`);
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new EgressError(`host resolves to blocked address: ${host} -> ${a.address}`);
    }
  }
  return url;
}

/** fetch(), gated by assertEgressAllowed. Throws EgressError before any request. */
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  await assertEgressAllowed(rawUrl);
  return fetch(rawUrl, init);
}
