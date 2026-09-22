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
/** Key names whose value should never be printed, whatever it looks like. */
const SENSITIVE_KEYS = [
    "api[_-]?key", "secret", "token", "password", "passwd", "credential",
    "authorization", "auth", "private[_-]?key", "client[_-]?secret",
    "stream[_-]?key", "refresh[_-]?token", "access[_-]?token", "bearer",
];
export const VALUE_PATTERNS = [
    ["bearer", /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/gi],
    ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g],
    ["aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ["openai-key", /\bsk-[A-Za-z0-9_-]{16,}/g],
    ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{16,}/g],
    ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
    ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
    ["google-key", /\bAIza[0-9A-Za-z_-]{30,}/g],
    ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
    // TWITCH STREAM KEY. Absent from the Python rule set, which was measured on
    // 24 Aug against four shapes of a real key and fired on none of them — the
    // one credential guaranteed to be on a streamer's machine was the one the
    // gate could not see. Recorded as F41.
    ["twitch-stream-key", /\blive_\d{6,}_[A-Za-z0-9]{20,}/g],
    // An RTMP ingest URL carries the key in its path, where no key=value rule
    // reaches it. Measured again on 25 Aug from the other direction: ffmpeg
    // printed exactly this shape to stderr when it could not open the output.
    ["rtmp-ingest-url", /\brtmps?:\/\/[^\s/]+\/[^\s/]+\/[A-Za-z0-9_-]{16,}/g],
    ["email", /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g],
    // `key: value` / `key=value` where the key is sensitive. Takes the value to
    // the end of the token run, which over-matches rather than under-matches.
    ["labelled-secret", new RegExp(`\\b(?:${SENSITIVE_KEYS.join("|")})\\b\\s*[:=]\\s*\\S+`, "gi")],
];
export const REDACTED = "[REDACTED]";
/** Which rules match, without altering anything. */
export function scan(text) {
    if (!text)
        return [];
    return VALUE_PATTERNS
        .filter(([, rx]) => { rx.lastIndex = 0; return rx.test(text); })
        .map(([name]) => name);
}
/** Replace every credential-shaped substring. Returns what fired. */
export function redactOutbound(text) {
    if (!text)
        return { text, fired: [], clean: true };
    const fired = [];
    let out = text;
    for (const [name, rx] of VALUE_PATTERNS) {
        rx.lastIndex = 0;
        if (!rx.test(out))
            continue;
        fired.push(name);
        rx.lastIndex = 0;
        out = out.replace(rx, REDACTED);
    }
    return { text: out, fired, clean: fired.length === 0 };
}
//# sourceMappingURL=outbound.js.map