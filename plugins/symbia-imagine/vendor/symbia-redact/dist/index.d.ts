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
export declare const SENSITIVE_KEY_PATTERNS: RegExp[];
export declare const REDACTED = "[REDACTED]";
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
export declare function isSensitiveKey(key: string): boolean;
/**
 * Deep-redact a value for logging. Returns a new value; the input is untouched.
 *
 * Cycle-safe: the previous implementation relied on the depth cap alone, so a
 * self-referencing object logged ten levels of itself before stopping. A
 * `WeakSet` catches it at the first repeat.
 */
export declare function redact(value: unknown, options?: RedactOptions): unknown;
/** Redact an object, typed for the common `Record` case. */
export declare function redactObject(value: Record<string, unknown>, options?: RedactOptions): Record<string, unknown>;
/**
 * Historical name from `integrations/server/src/security.ts`, kept so that
 * consolidating did not require touching every call site — the same courtesy
 * `@symbia/pathguard` got from `runtime`.
 *
 * @deprecated Use `redact`.
 */
export declare function sanitizeForLogging(obj: unknown, depth?: number): unknown;
/**
 * Outbound text redaction — a DIFFERENT job from everything above.
 *
 * Above: structured values on their way to a log, matched by key name at any
 * depth. Below: credential-shaped substrings in free text on its way to a
 * person. Namespaced rather than flattened because both define `REDACTED` and
 * they mean the same thing in two different registers; a caller should have to
 * say which one it wants.
 */
export * as outbound from './outbound.js';
//# sourceMappingURL=index.d.ts.map