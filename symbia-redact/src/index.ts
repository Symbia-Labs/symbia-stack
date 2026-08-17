/**
 * @symbia/redact — one log-redaction implementation.
 *
 * There were two, of unequal strength, and the weaker one was in the path every
 * service uses:
 *
 *   - `symbia-http/src/logging.ts` redacted four TOP-LEVEL keys by exact name
 *     (`password`, `token`, `apiKey`, `secret`). A credential one level down —
 *     `{ auth: { token } }`, `{ items: [{ apiKey }] }` — was logged verbatim by
 *     all ten services. It never looked at the query string, which is where
 *     tokens most often leak.
 *   - `integrations/server/src/security.ts` did recursive, pattern-matched
 *     redaction with a bearer-token regex, and only integrations had it.
 *
 * This is the `@symbia/pathguard` shape, for the same reason: two copies of a
 * security-relevant concern is the forked-concern defect this project already
 * names, and it is what let `@symbia/auth` ship without RLS awareness while a
 * forked copy in `assistants` had it (R1). There is exactly one redactor now.
 * Do not add another copy — extend `SENSITIVE_KEY_PATTERNS`.
 *
 * What this is NOT: a privacy control. It keeps credentials out of logs. It
 * does not classify or minimise personal data, and there is no retention or
 * erasure mechanism anywhere in the platform (`messaging/INTENT.md:691` —
 * "archival/retention is a future concern"). Redaction is not retention.
 */

/**
 * Key names whose VALUE is replaced wholesale, at any depth.
 *
 * Deliberately NOT here: a bare `auth`. It was, until the regression test
 * caught what it did — `{ auth: { method: "oauth", token } }` collapsed to
 * `auth: "[REDACTED]"`, losing the diagnostic half to protect a leaf that
 * `/token/i` already protects one line down. A container name is not a secret;
 * match the leaf, not its parent. `authorization` stays, because that key holds
 * the credential itself.
 */
export const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /pass(word|phrase)?/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
  /api[_-]?key/i,
  /session[_-]?id/i,
  /cookie/i,
  /signature/i,
  /client[_-]?secret/i,
];

export const REDACTED = "[REDACTED]";

export interface RedactOptions {
  /** Max recursion depth before bailing out. Default 10. */
  maxDepth?: number;
  /**
   * Replace long opaque `[A-Za-z0-9_-]` strings with `[REDACTED:Nchars]`.
   * Default true — this is integrations' historical behaviour and it errs on
   * the safe side. It has real false positives (a dashless UUID, a long slug),
   * so a caller logging known-benign identifiers can turn it off.
   */
  redactLongOpaqueStrings?: boolean;
  /** Length above which the opaque-string rule fires. Default 20. */
  opaqueStringMinLength?: number;
}

const DEFAULTS: Required<RedactOptions> = {
  maxDepth: 10,
  redactLongOpaqueStrings: true,
  opaqueStringMinLength: 20,
};

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

function redactString(s: string, o: Required<RedactOptions>): string {
  // Bearer tokens anywhere in the string, checked first: a header value like
  // "Bearer eyJhbGciOi..." is longer than the opaque rule's threshold but is
  // more useful redacted in place than collapsed to a character count.
  if (/bearer\s+\S+/i.test(s)) {
    return s.replace(/bearer\s+[A-Za-z0-9_.\-=+/]+/gi, "Bearer [REDACTED]");
  }
  if (
    o.redactLongOpaqueStrings &&
    s.length > o.opaqueStringMinLength &&
    /^[A-Za-z0-9_-]+$/.test(s)
  ) {
    return `[REDACTED:${s.length}chars]`;
  }
  return s;
}

/**
 * Deep-redact a value for logging. Returns a new value; the input is untouched.
 *
 * Cycle-safe: the previous implementation relied on the depth cap alone, so a
 * self-referencing object logged ten levels of itself before stopping. A
 * `WeakSet` catches it at the first repeat.
 */
export function redact(value: unknown, options: RedactOptions = {}): unknown {
  const o = { ...DEFAULTS, ...options };
  return walk(value, o, 0, new WeakSet<object>());
}

function walk(
  value: unknown,
  o: Required<RedactOptions>,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > o.maxDepth) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactString(value, o);
  if (typeof value !== "object") return value;

  if (seen.has(value as object)) return "[CIRCULAR]";
  seen.add(value as object);

  // Error: message and name are useful, stack can carry a URL with a token.
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message, o) };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => walk(v, o, depth + 1, seen));
  if (value instanceof Map || value instanceof Set) {
    return walk([...(value as Iterable<unknown>)], o, depth + 1, seen);
  }
  // Buffers and typed arrays: never log the bytes.
  if (ArrayBuffer.isView(value)) return `[BINARY:${(value as { byteLength: number }).byteLength}bytes]`;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : walk(v, o, depth + 1, seen);
  }
  return out;
}

/** Redact an object, typed for the common `Record` case. */
export function redactObject(
  value: Record<string, unknown>,
  options: RedactOptions = {},
): Record<string, unknown> {
  return redact(value, options) as Record<string, unknown>;
}

/**
 * Historical name from `integrations/server/src/security.ts`, kept so that
 * consolidating did not require touching every call site — the same courtesy
 * `@symbia/pathguard` got from `runtime`.
 *
 * @deprecated Use `redact`.
 */
export function sanitizeForLogging(obj: unknown, depth = 0): unknown {
  return depth > 0 ? redact(obj, { maxDepth: Math.max(0, 10 - depth) }) : redact(obj);
}
