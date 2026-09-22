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
export declare class EgressError extends Error {
    constructor(message: string);
}
/** True if an IPv4/IPv6 literal is loopback, private, link-local, ULA, etc. */
export declare function isBlockedIp(ip: string): boolean;
/**
 * Validate a URL for outbound egress. Resolves the host and rejects if the
 * scheme is not http(s), the host is not in EGRESS_ALLOWLIST (when that is set),
 * or the host resolves to any blocked address. Fail-closed on resolution error.
 * Returns the parsed URL on success; throws EgressError otherwise.
 */
export declare function assertEgressAllowed(rawUrl: string): Promise<URL>;
/** fetch(), gated by assertEgressAllowed. Throws EgressError before any request. */
export declare function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response>;
//# sourceMappingURL=index.d.ts.map