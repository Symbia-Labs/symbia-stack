/**
 * W3C Trace Context — parse, format, and propagate.
 *
 * WHY THIS EXISTS
 * The event wrapper carries a bespoke `runId`/`traceId` pair. Two problems
 * follow from that:
 *
 *   1. Nothing outside Symbia can read it. Traces stop at the service boundary.
 *   2. `runId` is sometimes a prefixed string (`run_msg_<uuid>`) and sometimes a
 *      bare UUID, so `messaging/server/src/index.ts` guards every write with a
 *      UUID regex and silently drops the value when it fails. A dropped trace ID
 *      is worse than no trace ID, because it looks like the trace simply ended.
 *
 * W3C Trace Context (https://www.w3.org/TR/trace-context/) is the standard
 * OpenTelemetry uses, and MCP 2026-07-28 reserves `traceparent`, `tracestate`
 * and `baggage` in `_meta` as an explicit exception to its own key-naming rules
 * for exactly this reason. Adopting it means Symbia traces stitch to any
 * OTel-aware tool — and to any MCP server or client — for free.
 *
 * COMPATIBILITY
 * Nothing here removes `runId`. `traceparent` is derived from it when it is a
 * UUID, and minted fresh otherwise, so existing callers keep working unchanged
 * and correlation improves rather than breaking.
 */

/** `version-traceId-spanId-flags`, e.g. 00-<32 hex>-<16 hex>-01 */
const TRACEPARENT_RE =
  /^(?<version>[0-9a-f]{2})-(?<traceId>[0-9a-f]{32})-(?<spanId>[0-9a-f]{16})-(?<flags>[0-9a-f]{2})$/;

const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

export interface TraceContext {
  /** 32 hex chars, never all-zero. */
  traceId: string;
  /** 16 hex chars, never all-zero. Identifies this span. */
  spanId: string;
  /** Sampled flag (bit 0 of trace-flags). */
  sampled: boolean;
  /** Vendor state, passed through opaquely. */
  tracestate?: string;
}

const randomHex = (bytes: number): string => {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Mint a brand-new trace. */
export function newTraceContext(sampled = true): TraceContext {
  return { traceId: randomHex(16), spanId: randomHex(8), sampled };
}

/**
 * Parse a `traceparent` header value.
 *
 * Returns null for anything malformed. Per the W3C spec, all-zero trace or span
 * IDs are invalid and MUST be rejected rather than propagated — accepting them
 * produces traces that silently merge unrelated requests.
 *
 * Forward compatibility: a version higher than `00` is parsed on a best-effort
 * basis (the spec requires future versions to keep the first four fields), so a
 * newer upstream does not break us.
 */
export function parseTraceparent(value: string | undefined | null): TraceContext | null {
  if (!value || typeof value !== 'string') return null;

  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m?.groups) return null;

  const { version, traceId, spanId, flags } = m.groups;
  if (version === 'ff') return null; // reserved as invalid by the spec
  if (traceId === INVALID_TRACE_ID) return null;
  if (spanId === INVALID_SPAN_ID) return null;

  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

/** Format a TraceContext as a `traceparent` header value. */
export function formatTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '01' : '00'}`;
}

/**
 * Derive a deterministic trace ID from an existing Symbia identifier.
 *
 * Used to migrate in place: a `runId` that is already a UUID becomes a trace ID
 * by stripping hyphens (a UUID is 32 hex chars — exactly a W3C trace ID). A
 * prefixed value like `run_msg_<uuid>` has its UUID extracted. Anything else
 * returns null and the caller mints a fresh trace.
 *
 * Determinism matters: the same runId must always map to the same trace ID, or
 * events from one run land in different traces.
 */
export function traceIdFromRunId(runId: string | undefined | null): string | null {
  if (!runId || typeof runId !== 'string') return null;

  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(runId);
  if (!uuid) return null;

  const hex = uuid[0].replace(/-/g, '').toLowerCase();
  return hex === INVALID_TRACE_ID ? null : hex;
}

/**
 * Build the trace context for an event.
 *
 * Precedence, highest first:
 *   1. An inbound `traceparent` — we are a child span of an existing trace.
 *   2. A `runId` containing a UUID — deterministic migration of existing data.
 *   3. A fresh trace.
 *
 * A new span ID is always minted: this event is its own span, and reusing the
 * parent's span ID would collapse the causal chain.
 */
export function contextForEvent(opts: {
  inboundTraceparent?: string | null;
  runId?: string | null;
  tracestate?: string | null;
  sampled?: boolean;
}): { context: TraceContext; parentSpanId?: string } {
  const inbound = parseTraceparent(opts.inboundTraceparent);
  if (inbound) {
    return {
      context: {
        traceId: inbound.traceId,
        spanId: randomHex(8),
        sampled: opts.sampled ?? inbound.sampled,
        tracestate: opts.tracestate ?? inbound.tracestate,
      },
      parentSpanId: inbound.spanId,
    };
  }

  const migrated = traceIdFromRunId(opts.runId);
  return {
    context: {
      traceId: migrated ?? randomHex(16),
      spanId: randomHex(8),
      sampled: opts.sampled ?? true,
      tracestate: opts.tracestate ?? undefined,
    },
  };
}

/**
 * Headers to attach when delivering an event over HTTP.
 * `tracestate` is only emitted when non-empty; an empty tracestate is invalid.
 */
export function traceHeaders(ctx: TraceContext): Record<string, string> {
  const headers: Record<string, string> = { traceparent: formatTraceparent(ctx) };
  if (ctx.tracestate && ctx.tracestate.trim()) {
    headers.tracestate = ctx.tracestate.trim();
  }
  return headers;
}

/**
 * Extract trace context from inbound HTTP headers.
 * Header names are case-insensitive per RFC 9110; Node lowercases them, but we
 * check both so this works with raw header bags too.
 */
export function traceFromHeaders(
  headers: Record<string, string | string[] | undefined>
): TraceContext | null {
  const pick = (name: string): string | undefined => {
    const v = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
    return Array.isArray(v) ? v[0] : v;
  };

  const ctx = parseTraceparent(pick('traceparent'));
  if (!ctx) return null;

  const state = pick('tracestate');
  return state ? { ...ctx, tracestate: state } : ctx;
}
