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
export const BOUNDARIES = ['intra', 'inter', 'extra'];
export const HEADERS = {
    eventId: 'X-Symbia-Event-Id',
    runId: 'X-Symbia-Run-Id',
    boundary: 'X-Symbia-Boundary',
    source: 'X-Symbia-Source',
};
/** Mirrors MCP's `-32020 HeaderMismatch`. */
export class HeaderMismatchError extends Error {
    field;
    code = 'HEADER_MISMATCH';
    status = 400;
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = 'HeaderMismatchError';
    }
}
export function isBoundary(v) {
    return typeof v === 'string' && BOUNDARIES.includes(v);
}
/**
 * Header-safe check per RFC 9110 field-value rules: visible ASCII, space, tab.
 * Values that fail this must not be promoted — a newline in a header value is a
 * response-splitting vector.
 */
function isHeaderSafe(v) {
    return /^[\x20-\x7E\t]*$/.test(v) && v === v.trim();
}
/**
 * Build delivery headers from an event wrapper.
 * Unsafe values are omitted rather than mangled — an omitted header is
 * detectable by the validator, whereas a silently truncated one is not.
 */
export function eventHeaders(wrapper) {
    const out = {};
    const put = (name, value) => {
        if (typeof value === 'string' && value && isHeaderSafe(value))
            out[name] = value;
    };
    put(HEADERS.eventId, wrapper.id);
    put(HEADERS.runId, wrapper.runId);
    put(HEADERS.boundary, wrapper.boundary);
    put(HEADERS.source, wrapper.source);
    return out;
}
const headerValue = (headers, name) => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
};
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
export function validateEventHeaders(headers, wrapper, opts = {}) {
    const requireBoundary = opts.requireBoundary !== false;
    const boundary = headerValue(headers, HEADERS.boundary);
    if (boundary === undefined) {
        if (requireBoundary) {
            throw new HeaderMismatchError(`${HEADERS.boundary} header is required and was not present`, 'boundary');
        }
    }
    else {
        if (!isBoundary(boundary)) {
            throw new HeaderMismatchError(`${HEADERS.boundary} value "${boundary}" is not a valid boundary`, 'boundary');
        }
        if (boundary !== wrapper.boundary) {
            throw new HeaderMismatchError(`${HEADERS.boundary} header "${boundary}" does not match body value "${wrapper.boundary}"`, 'boundary');
        }
    }
    for (const [field, name, expected] of [
        ['id', HEADERS.eventId, wrapper.id],
        ['runId', HEADERS.runId, wrapper.runId],
    ]) {
        const got = headerValue(headers, name);
        if (got !== undefined && got !== expected) {
            throw new HeaderMismatchError(`${name} header "${got}" does not match body value "${expected}"`, field);
        }
    }
}
/**
 * Express middleware. Rejects with 400 and a JSON-RPC-shaped error, matching how
 * MCP reports the same condition.
 *
 * Mounted on the event-ingest route only — it assumes `req.body` is a
 * SandboxEvent.
 */
export function eventHeaderValidator(opts = {}) {
    return function validate(req, res, next) {
        const wrapper = req.body?.wrapper;
        if (!wrapper || typeof wrapper !== 'object')
            return next();
        try {
            validateEventHeaders(req.headers, wrapper, opts);
            next();
        }
        catch (err) {
            if (err instanceof HeaderMismatchError) {
                res.status(400).json({
                    error: {
                        code: -32020,
                        message: err.message,
                        data: { field: err.field, reason: 'HEADER_MISMATCH' },
                    },
                });
                return;
            }
            next(err);
        }
    };
}
//# sourceMappingURL=event-headers.js.map