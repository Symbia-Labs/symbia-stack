/**
 * A short, safe string form of a message value, for traces and log lines.
 *
 * WHY THIS IS A FUNCTION AND NOT AN EXPRESSION.
 *
 * `JSON.stringify(value).slice(0, N)` appeared in three places. It throws when
 * `value` is `undefined`, because `JSON.stringify(undefined)` returns
 * `undefined` — not the string `"undefined"` — and `.slice` is then called on
 * nothing.
 *
 * MEASURED 8 Aug 2026, reported by an agent driving the API: injecting a body
 * shaped `{nodeId, port, message}` (no `value`) produced a bare
 * `Cannot read properties of undefined (reading 'slice')`. The route's own
 * validation is fine — it checks `nodeId` and `port` and returns a clean 400 —
 * so the error surfaced from deep in the executor, named nothing the caller
 * had done, and sent them looking in the wrong place.
 *
 * One of the three copies, in `components-sinks.ts`, already had `?.` on it.
 * Someone hit this before and fixed the copy in front of them. A shared
 * concern with N independent implementations is not shared, and this is what
 * the third one cost.
 *
 * `undefined` renders as the string `"undefined"` on purpose: a trace line
 * reading `undefined` is a true statement about what flowed through the node,
 * whereas an empty string would look like an empty payload.
 */
export function preview(value: unknown, max = 200): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structures and BigInt both throw here. A trace line is not
    // worth failing an execution over.
    text = '[unserialisable]';
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
