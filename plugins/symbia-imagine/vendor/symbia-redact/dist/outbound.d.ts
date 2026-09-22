/**
 * Outbound redaction — credential SHAPES in text a person will read.
 *
 * TWO JOBS, ONE PACKAGE, AND THEY ARE NOT THE SAME JOB. `index.ts` next door
 * redacts structured values on their way to a LOG, by key name and at any
 * depth. This redacts credential-shaped substrings in FREE TEXT on its way to a
 * human — a chat message, a broadcast caption, an assistant's reply. A log
 * redactor keyed on `apiKey` cannot see `sk-...` sitting in the middle of a
 * sentence, and this cannot see `{ auth: { token } }`. Keep both, and keep them
 * named for what they do.
 *
 * WHY IT MOVED HERE. It lived in `integrations/server/src/channels/redact.ts`
 * and gated the Twitch path only. Measured 25 Aug: `@echo` returned
 * `sk-test-NOTAREALKEY000000000000000000000000000000` verbatim through the
 * messaging path, and the Control Center chat panel has no equivalent gate. The
 * protection existed per channel rather than at the point the text is produced,
 * so every new channel started unprotected and nobody would notice until it
 * carried something real.
 *
 * That is the same forked-concern defect `index.ts` was created to end and that
 * `@symbia/pathguard` was created to end. One implementation, imported by both
 * services. Do not add a third copy — extend `VALUE_PATTERNS`.
 *
 * FAIL CLOSED, BY SUBSTRING. If a rule fires the substring is replaced and the
 * rest of the message goes through. Dropping the whole message teaches the
 * reader nothing; a reply that is 90% useful and 10% masked still answers the
 * question.
 *
 * WHAT THIS DOES NOT CLAIM. It recognises credential SHAPES. It cannot
 * recognise a secret that looks like ordinary prose, it cannot recognise one it
 * has no pattern for, and it is not a substitute for keeping secrets out of a
 * model's context in the first place. A clean result means no rule fired, not
 * that the text is safe.
 */
export declare const VALUE_PATTERNS: Array<[string, RegExp]>;
export declare const REDACTED = "[REDACTED]";
export interface RedactionResult {
    text: string;
    fired: string[];
    clean: boolean;
}
/** Which rules match, without altering anything. */
export declare function scan(text: string): string[];
/** Replace every credential-shaped substring. Returns what fired. */
export declare function redactOutbound(text: string): RedactionResult;
//# sourceMappingURL=outbound.d.ts.map