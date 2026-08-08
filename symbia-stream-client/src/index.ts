/**
 * @symbia/stream-client — authenticated event-stream consumption.
 *
 * WHY THIS PACKAGE EXISTS.
 *
 * Symbia services expose Server-Sent Events. The browser's built-in
 * `EventSource` cannot send custom headers — a limitation of the web platform,
 * not of this codebase — so every authenticated Symbia stream is unreachable
 * from a browser using the standard client.
 *
 * MEASURED 8 Aug 2026 against the logging service, through the console's own
 * proxy:
 *
 *   no auth                 -> 401
 *   Authorization header    -> 200
 *   ?token=<jwt> in query   -> 401
 *
 * The consequence was that the control center's Logs panel had been showing
 * nothing while its stream was refused on every attempt. It was found only
 * after the console's own polling was filtered out of the observability view:
 * 38 requests became 2, and both were that endpoint at 401.
 *
 * THE PLATFORM DEFECT, stated plainly. The first fix for this lived inside
 * `symbia-control-center`. That made it a private solution to a problem every
 * Symbia browser client has, and the platform had no shared answer for
 * "consume an authenticated stream from a service". `@symbia/logging-client`
 * exists but is write-side only — ingest and stream creation — so there was no
 * consumption client anywhere in the platform.
 *
 * A shared concern with N independent implementations is not shared. This
 * package is the one implementation, so the count stays at one.
 *
 * WHY NOT A QUERY-STRING TOKEN, which would have been simpler and needed no
 * package at all: a JWT in a URL is written into every access log, every proxy
 * log, and every `obs.http.*` record this platform emits. On a stack whose
 * purpose is recording what happened, putting a credential in the recorded
 * part is the worst option available. The measurement above shows the service
 * rejects it anyway, and it should keep rejecting it.
 *
 * SCOPE. This implements the surface Symbia clients actually use: named event
 * listeners, `onerror`, `close()`, status reporting and bounded reconnection.
 * It is deliberately not a general `EventSource` polyfill, and should not grow
 * into one without a reason written down here.
 */

/**
 * Why a request is happening, and on whose behalf.
 *
 * Duplicated as a type from `@symbia/relay` on purpose: relay is Node-only
 * (AsyncLocalStorage, express) and cannot be imported into a browser bundle.
 * This is a type-level restatement of the same vocabulary, not a second
 * implementation of any behaviour — there is nothing here to drift.
 */
export type TrafficOrigin = 'internal' | 'user' | 'agent' | 'unknown';

export const ORIGIN_HEADER = 'x-symbia-origin';

type Listener = (event: { data: string }) => void;

export interface AuthedEventSourceOptions {
  /**
   * Sent on the stream request. Include `Authorization` here — that absence is
   * the entire reason this package exists.
   */
  headers: Record<string, string>;
  /**
   * Called with the HTTP status on every connection attempt, success or not.
   *
   * `EventSource` exposes no status at all, which is why a 401 was
   * indistinguishable from an idle stream for as long as it was. A refusal
   * must be reportable as a refusal.
   */
  onStatus?: (status: number, statusText: string) => void;
  /** Cap on reconnection backoff. Defaults to 30s. */
  maxRetryMs?: number;
}

export class AuthedEventSource {
  private controller: AbortController | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private closed = false;
  private retryMs = 1000;
  private readonly maxRetryMs: number;

  /** Set by callers the way they would on a real EventSource. */
  onerror: ((error: unknown) => void) | null = null;

  constructor(
    private url: string,
    private options: AuthedEventSourceOptions
  ) {
    this.maxRetryMs = options.maxRetryMs ?? 30_000;
    void this.connect();
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.controller?.abort();
  }

  private emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      try {
        listener({ data });
      } catch (error) {
        console.error(`[stream-client] listener for "${type}" threw:`, error);
      }
    }
  }

  private async connect(): Promise<void> {
    while (!this.closed) {
      this.controller = new AbortController();
      try {
        const response = await fetch(this.url, {
          headers: { ...this.options.headers, Accept: 'text/event-stream' },
          signal: this.controller.signal,
        });

        this.options.onStatus?.(response.status, response.statusText);

        if (!response.ok || !response.body) {
          this.onerror?.(new Error(`stream refused: HTTP ${response.status}`));
          await this.backoff();
          continue;
        }

        this.retryMs = 1000;
        await this.read(response.body);
      } catch (error) {
        if (this.closed || (error as Error)?.name === 'AbortError') return;
        this.onerror?.(error);
        await this.backoff();
      }
    }
  }

  private async backoff(): Promise<void> {
    // Capped exponential. A refused stream retrying every second forever would
    // generate more traffic than the data it fails to fetch — which is exactly
    // what the built-in EventSource was doing while reporting nothing.
    await new Promise((resolve) => setTimeout(resolve, this.retryMs));
    this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs);
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!this.closed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. Split on that and keep any
      // trailing partial frame in the buffer for the next chunk.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          // `id:` and `retry:` are ignored deliberately. Nothing on this
          // platform uses last-event-id resumption, and accepting the field
          // while not honouring it would be a claim this does not keep.
        }
        if (dataLines.length > 0) this.emit(eventName, dataLines.join('\n'));
      }
    }
  }
}

/**
 * Build the headers a Symbia stream request should carry.
 *
 * Origin has no default. A default is a claim made by whoever did not stop to
 * think about it, and the convenient one here (`user`) would inflate the exact
 * count the origin field exists to isolate.
 */
export function streamHeaders(
  token: string | null | undefined,
  origin: TrafficOrigin,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    [ORIGIN_HEADER]: origin,
    ...extra,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
