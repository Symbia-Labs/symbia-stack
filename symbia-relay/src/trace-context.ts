/**
 * Trace context: carrying one id across a request's whole journey.
 *
 * THE PROBLEM, measured 8 Aug 2026. `obs.http.*` records the service that
 * HANDLED a request and nothing about who called it. 1011 distinct trace ids
 * appeared in 2000 events and NOT ONE was seen from two services, because each
 * service minted its own on arrival. The observability middleware has always
 * been willing to adopt an inbound `x-trace-id`; nothing has ever sent one.
 *
 * So the topology graph could only ever draw declared contracts — three of
 * them — while every real call between services was invisible.
 *
 * TWO HEADERS fix it:
 *
 *   x-trace-id       the trace, adopted inbound or minted at the edge.
 *   x-symbia-caller  the service making the call.
 *
 * `caller` is what makes an EDGE, directly, with no reconstruction: the
 * receiving service records who called it. The shared trace id is what makes a
 * WATERFALL: every hop of one request, ordered.
 *
 * WHY A GLOBAL FETCH WRAPPER, stated plainly because patching a global makes
 * behaviour non-local and harder to reason about: services make bare `fetch()`
 * calls from dozens of places each. Threading a context argument through all of
 * them is how a shared concern acquires N independent implementations, and this
 * codebase has four of those already on record. One wrapper, in one file, that
 * reads an AsyncLocalStorage store, is the smaller mistake.
 *
 * WHAT IT DOES NOT COVER, and this is not a defect to be surprised by later:
 *
 *   - Anything using Node's `http`/`https` module rather than fetch. The
 *     control center proxies with http-proxy-middleware, which does exactly
 *     that, and needs its own header injection.
 *   - Calls made from timers, intervals and socket handlers. Those run outside
 *     any request's async context, so they get no caller and a fresh trace.
 *     That is correct — they are not part of a request — but it means an
 *     absent caller has two meanings and a reader must not collapse them.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const TRACE_HEADER = 'x-trace-id';
export const CALLER_HEADER = 'x-symbia-caller';

export interface TraceContext {
  traceId: string;
  /** The service this process is. Sent as the caller on outbound calls. */
  serviceId: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

/** The trace this async context belongs to, if any. */
export function currentTrace(): TraceContext | undefined {
  return storage.getStore();
}

/** Run `fn` with a trace context. Everything it awaits inherits it. */
export function withTrace<T>(ctx: TraceContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function mintTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Read a trace id from inbound headers.
 *
 * `traceparent` is checked as a fallback so a request from anything speaking
 * W3C trace context is not silently given a new identity. Its format is
 * `00-<32 hex trace>-<16 hex span>-<flags>`; only the trace part is taken.
 */
export function traceIdFromHeaders(headers: Record<string, unknown>): string | undefined {
  const direct = headers[TRACE_HEADER];
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const traceparent = headers['traceparent'];
  if (typeof traceparent === 'string') {
    const parts = traceparent.split('-');
    if (parts.length >= 3 && parts[1] && /^[0-9a-f]{32}$/i.test(parts[1])) return parts[1];
  }
  return undefined;
}

export function callerFromHeaders(headers: Record<string, unknown>): string | undefined {
  const c = headers[CALLER_HEADER];
  return typeof c === 'string' && c.length > 0 ? c : undefined;
}

let installed = false;

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
export function installFetchTracePropagation(serviceId: string): void {
  if (installed) return;
  installed = true;

  const original = globalThis.fetch;
  if (typeof original !== 'function') return;

  globalThis.fetch = function tracedFetch(
    input: Parameters<typeof original>[0],
    init?: Parameters<typeof original>[1]
  ) {
    const ctx = currentTrace();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

    if (!headers.has(CALLER_HEADER)) headers.set(CALLER_HEADER, serviceId);
    if (!headers.has(TRACE_HEADER) && ctx?.traceId) headers.set(TRACE_HEADER, ctx.traceId);

    return original(input as Parameters<typeof original>[0], { ...(init ?? {}), headers });
  } as typeof original;
}
