export declare const TRACE_HEADER = "x-trace-id";
export declare const CALLER_HEADER = "x-symbia-caller";
export declare const ORIGIN_HEADER = "x-symbia-origin";
/**
 * Why a request happened, and on whose behalf.
 *
 * A THIRD question, orthogonal to the two already recorded:
 *
 *   boundary  WHERE the call goes    (intra | inter | extra)
 *   caller    WHICH service made it
 *   origin    WHY it happened        <- this
 *
 * Measured 8 Aug 2026: of 499 `obs.http.response` events, 50.5% were
 * `GET /api/stats` and 41.3% were the `POST /api/auth/introspect` those polls
 * provoke. About 96% of observed traffic is the console watching itself, and
 * by every field recorded at the time it was indistinguishable from a person
 * pressing a button — both `intra`, both naming `control-center` as caller.
 *
 * `unknown` is a real value and is never folded into `user`. A count of human
 * activity that quietly absorbs everything unlabelled is the same defect as a
 * confident `0` that means "never asked".
 */
export type TrafficOrigin = 'internal' | 'user' | 'agent' | 'unknown';
export declare const TRAFFIC_ORIGINS: readonly TrafficOrigin[];
export declare function isTrafficOrigin(v: unknown): v is TrafficOrigin;
export interface TraceContext {
    traceId: string;
    /** The service this process is. Sent as the caller on outbound calls. */
    serviceId: string;
    /**
     * Inherited from the inbound request and stamped on everything this request
     * goes on to call.
     *
     * Propagation is the whole point. Labelling only the first hop would leave
     * the introspect storm — 41% of all traffic — unattributed, which is exactly
     * the amplification worth seeing.
     */
    origin?: TrafficOrigin;
}
/** The trace this async context belongs to, if any. */
export declare function currentTrace(): TraceContext | undefined;
/** Run `fn` with a trace context. Everything it awaits inherits it. */
export declare function withTrace<T>(ctx: TraceContext, fn: () => T): T;
export declare function mintTraceId(): string;
/**
 * Read a trace id from inbound headers.
 *
 * `traceparent` is checked as a fallback so a request from anything speaking
 * W3C trace context is not silently given a new identity. Its format is
 * `00-<32 hex trace>-<16 hex span>-<flags>`; only the trace part is taken.
 */
export declare function traceIdFromHeaders(headers: Record<string, unknown>): string | undefined;
export declare function callerFromHeaders(headers: Record<string, unknown>): string | undefined;
/**
 * Read the declared origin off an inbound request.
 *
 * DECLARED, never inferred. Nothing here looks at the path, the user-agent or
 * the port to make a guess. "GET /api/stats is always internal" would be a
 * conclusion written into a probe, and false the first time an operator opens
 * the stats endpoint themselves.
 *
 * An unrecognised value is `unknown` rather than being passed through, so the
 * vocabulary cannot be widened by a caller sending whatever it likes. Absent
 * is also `unknown`, and the two are deliberately the same: neither one says
 * a human did anything.
 */
export declare function originFromHeaders(headers: Record<string, unknown>): TrafficOrigin;
/**
 * Stamp outbound fetch calls with the current trace and this service's id.
 *
 * Idempotent — a second call is a no-op rather than a wrapper around a wrapper,
 * because double-wrapping would add the headers twice and, worse, would make
 * the number of wrappers depend on how many times startup ran.
 *
 * An EXPLICIT header on the call always wins. A caller that has set its own
 * x-trace-id is making a deliberate statement about what this request belongs
 * to, and it is not this function's place to overrule it.
 */
export declare function installFetchTracePropagation(serviceId: string): void;
//# sourceMappingURL=trace-context.d.ts.map