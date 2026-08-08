/**
 * Why a request is happening, declared at the browser edge.
 *
 * THE PROBLEM, measured 8 Aug 2026 across 499 `obs.http.response` events:
 * `GET /api/stats` was 50.5% of all traffic and `POST /api/auth/introspect`
 * — the token check each authenticated poll provokes — was another 41.3%.
 * About 96% of everything recorded was this console watching the stack, and
 * nothing in the record could distinguish it from a person pressing a button.
 * Both were `intra`, both named `control-center` as caller.
 *
 * `boundary` says WHERE a call goes. `caller` says WHICH service made it.
 * Neither says WHY, which is the only question that separates the console's
 * own heartbeat from the activity an operator actually wants to watch.
 *
 * THE BROWSER IS THE ONLY PLACE THIS IS KNOWN. By the time a request reaches a
 * service, a timer firing and a click look identical — same session, same
 * paths in some cases. Anything downstream would be guessing, and a guess
 * baked into a probe rots the moment the code changes underneath it.
 *
 * From here it propagates by itself: services carry it through
 * AsyncLocalStorage, so a call made while handling a request inherits that
 * request's reason. Measured after this shipped: 40 introspect calls arrived
 * labelled `internal`, inherited from the polls that caused them.
 */
export type TrafficOrigin = 'internal' | 'user' | 'agent' | 'unknown';

export const ORIGIN_HEADER = 'x-symbia-origin';

/**
 * Header fragment to spread into a fetch.
 *
 * There is deliberately no default parameter. A default is a claim made by
 * whoever did not stop to think about it, and the convenient default here
 * (`user`) would inflate the exact number this field exists to isolate.
 */
export function originHeader(origin: TrafficOrigin): Record<string, string> {
  return { [ORIGIN_HEADER]: origin };
}

/**
 * The reason each console client exists, declared once per client.
 *
 * Stated here rather than at 200 call sites because these are properties of
 * the client, not of the call: `networkClient` and `loggingStreamClient` exist
 * to feed dashboards on timers, and every request they make is the console
 * looking at itself. Where a client genuinely serves both — `platformClient`,
 * whose health check is polled every 5s AND called when someone types
 * `/health` — the origin is a required argument instead and this map does not
 * cover it.
 *
 * A client added here without thought will claim something untrue, so the
 * comment for each is the evidence, not decoration.
 */
export const CLIENT_ORIGIN = {
  /** Polls the mesh for topology and events to draw the network panel. */
  network: 'internal',
  /** Streams and polls logs for the observability dashboards. */
  loggingStream: 'internal',
  /** Writes console metrics. Nobody asked for these; the console emits them. */
  logging: 'internal',
  /** Reads catalog resources to populate browsing panels a person opened. */
  catalog: 'user',
  /** Session and org lookups, driven by a person being signed in and acting. */
  identity: 'user',
  /** Provider config screens — opened and edited by a person. */
  integrations: 'user',
  /** Assistant CRUD from the Assistants panel, driven by a person. */
  assistants: 'user',
  /** Sending and reading chat messages. A person typed something. */
  messaging: 'user',
} as const satisfies Record<string, TrafficOrigin>;
