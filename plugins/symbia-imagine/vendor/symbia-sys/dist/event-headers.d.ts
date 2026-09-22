/**
 * Event header promotion and validation.
 *
 * WHY THIS EXISTS
 * `network/server/src/services/router.ts` promotes two fields to headers on
 * delivery — `X-Symbia-Event-Id` and `X-Symbia-Run-Id`. Both are correlation
 * IDs: useful for tracing, useless for deciding anything.
 *
 * `wrapper.boundary` (`intra` | `inter` | `extra`) is a TRUST decision — it says
 * whether an event stays inside a sandbox, crosses between sandboxes, or leaves
 * for the outside world. It is currently readable only after deserializing the
 * whole event, which means no proxy, gateway or WAF can enforce a boundary
 * policy without parsing the body.
 *
 * MCP 2026-07-28 solved the same problem by mandating `Mcp-Method`/`Mcp-Name`
 * headers and an `x-mcp-header` mechanism for promoting declared parameters.
 * Critically, it pairs promotion with a MANDATORY consistency check:
 *
 *   "Servers that process the request body MUST reject requests where the
 *    values specified in the headers do not match the corresponding values in
 *    the request body. This prevents potential security vulnerabilities when
 *    different components in the network rely on different sources of truth
 *    (e.g., a load balancer routing on the header value while the MCP server
 *    executes based on the body value)."
 *      — Streamable HTTP, Server Validation
 *
 * That warning is the whole point. Promoting a security-relevant field to a
 * header WITHOUT validation is worse than not promoting it: it creates two
 * sources of truth and lets an attacker choose which one each hop believes.
 * So this module ships both halves together, and the validator is not optional.
 */
export declare const BOUNDARIES: readonly ["intra", "inter", "extra"];
export type Boundary = (typeof BOUNDARIES)[number];
export declare const HEADERS: {
    readonly eventId: "X-Symbia-Event-Id";
    readonly runId: "X-Symbia-Run-Id";
    readonly boundary: "X-Symbia-Boundary";
    readonly source: "X-Symbia-Source";
};
/** Mirrors MCP's `-32020 HeaderMismatch`. */
export declare class HeaderMismatchError extends Error {
    readonly field: string;
    readonly code = "HEADER_MISMATCH";
    readonly status = 400;
    constructor(message: string, field: string);
}
export declare function isBoundary(v: unknown): v is Boundary;
interface WrapperLike {
    id: string;
    runId: string;
    source: string;
    boundary: Boundary;
}
/**
 * Build delivery headers from an event wrapper.
 * Unsafe values are omitted rather than mangled — an omitted header is
 * detectable by the validator, whereas a silently truncated one is not.
 */
export declare function eventHeaders(wrapper: WrapperLike): Record<string, string>;
/**
 * Validate that promoted headers agree with the body.
 *
 * Rules, in the order they matter:
 *   - `X-Symbia-Boundary` MUST be present and MUST equal `wrapper.boundary`.
 *     A missing boundary header is a failure, not a default: defaulting to
 *     `intra` would let an attacker downgrade an `extra` event to internal
 *     trust simply by stripping a header.
 *   - `X-Symbia-Event-Id` and `X-Symbia-Run-Id`, when present, MUST match.
 *     Absent is tolerated for compatibility with senders predating this change;
 *     present-and-wrong never is.
 *
 * @throws HeaderMismatchError
 */
export declare function validateEventHeaders(headers: Record<string, string | string[] | undefined>, wrapper: WrapperLike, opts?: {
    requireBoundary?: boolean;
}): void;
/**
 * Express middleware. Rejects with 400 and a JSON-RPC-shaped error, matching how
 * MCP reports the same condition.
 *
 * Mounted on the event-ingest route only — it assumes `req.body` is a
 * SandboxEvent.
 */
export declare function eventHeaderValidator(opts?: {
    requireBoundary?: boolean;
}): (req: any, res: any, next: any) => void;
export {};
//# sourceMappingURL=event-headers.d.ts.map