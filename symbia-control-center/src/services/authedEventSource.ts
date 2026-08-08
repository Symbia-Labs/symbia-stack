/**
 * Server-Sent Events over `fetch`, so the stream can carry an Authorization
 * header.
 *
 * WHY THIS EXISTS. The browser's built-in `EventSource` cannot send custom
 * headers — that is a limitation of the API, not of this codebase — so
 * `new EventSource('/svc/logging/api/logs/stream')` arrived at the logging
 * service unauthenticated and was rejected.
 *
 * MEASURED 8 Aug 2026, through the console's own proxy:
 *
 *   no auth                 -> 401
 *   Authorization header    -> 200
 *   ?token=<jwt> in query   -> 401
 *
 * So the Logs tab has been showing whatever it could scrape from elsewhere
 * while its live stream returned 401 on every attempt, and `EventSource`
 * silently retried forever — its `onerror` gives no status code, which is why
 * this looked like "no logs" rather than "refused".
 *
 * It was found by filtering the console's own polling out of the Logging
 * panel: 38 requests became 2, and both were this endpoint at 401. Under the
 * unfiltered view it was a 5.3% error rate next to 34 healthy `/api/stats`
 * calls and read as noise.
 *
 * A QUERY-STRING TOKEN WAS NOT USED, and would not be even if the service
 * accepted one. A JWT in a URL is written into every access log, every proxy
 * log, and every `obs.http.*` record this platform emits — on a stack whose
 * whole purpose is recording what happened, putting a credential in the part
 * that gets recorded is the worst available option.
 *
 * This implements only the surface the callers actually use: named event
 * listeners, `onerror`, and `close()`. It is not a general EventSource
 * replacement and should not grow into one without a reason.
 */

type Listener = (event: { data: string }) => void;

export interface AuthedEventSourceOptions {
  headers: Record<string, string>;
  /** Called with the HTTP status when the server refuses the stream. */
  onStatus?: (status: number, statusText: string) => void;
}

export class AuthedEventSource {
  private controller: AbortController | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private closed = false;
  private retryMs = 1000;

  /** Set by callers the way they would on a real EventSource. */
  onerror: ((error: unknown) => void) | null = null;

  constructor(
    private url: string,
    private options: AuthedEventSourceOptions
  ) {
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
        console.error(`[SSE] listener for "${type}" threw:`, error);
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

        // REPORT THE STATUS. EventSource does not expose one, which is exactly
        // why a 401 here looked like an empty stream for as long as it did. A
        // refusal must be distinguishable from having nothing to say.
        if (!response.ok || !response.body) {
          this.options.onStatus?.(response.status, response.statusText);
          this.onerror?.(new Error(`SSE refused: HTTP ${response.status}`));
          await this.backoff();
          continue;
        }

        this.options.onStatus?.(response.status, response.statusText);
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
    // Capped exponential. An unauthenticated stream that retried every second
    // forever would generate more traffic than the logs it failed to fetch.
    await new Promise((resolve) => setTimeout(resolve, this.retryMs));
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!this.closed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. Split on that and keep the
      // trailing partial frame in the buffer.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          // `id:` and `retry:` are ignored deliberately: nothing here uses
          // last-event-id resumption, and pretending to support it would be a
          // claim this does not honour.
        }
        if (dataLines.length > 0) this.emit(eventName, dataLines.join('\n'));
      }
    }
  }
}
