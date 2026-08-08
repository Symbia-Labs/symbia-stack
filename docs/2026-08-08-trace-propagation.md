# Trace propagation: making the topology edges observed

*8 Aug 2026. Predictions registered BEFORE measuring, per working discipline 1.*

## The task

Brian, on the topology graph: "isn't valuable as it sits" → agreed plan was
"overlay now, tracing next". The overlay shipped (4ede8f8). This is the tracing.

## Why the graph cannot draw real edges today

Measured 8 Aug 2026, not assumed:

- `obs.http.*` payloads carry `method`, `path`, `statusCode`, `durationMs`,
  `traceId`. **No callee and no caller.**
- The event wrapper carries `source` (the service that *handled* the request)
  and an optional `target` that observability never sets.
- 1011 distinct trace ids in the last 2000 events. **Zero** appeared from more
  than one service. Trace context is minted per request per service and never
  propagated.

So every edge on the graph is a declared contract — three of them — and every
actual call is invisible.

## The shape being aimed at

From `RoutineFlowPreview` / `routineFlowUtils`, the assistant routine graph:
typed stages laid out left-to-right with dagre, `input → router → routine →
step → output`, each node showing what kind of thing it is and what it did. A
request crossing services is the same shape — an ordered flow with a direction
and a duration per hop — and it is what a trace waterfall already is.

Two things fall out of propagation, and they are different:

1. **Edges** — `caller → handler`, direct, no reconstruction needed.
2. **Waterfall** — every hop of one request, ordered, from a shared trace id.

## Design

Two headers on every service-to-service call:

- `x-symbia-trace` — the trace id, adopted from the inbound request if present,
  minted if not. (`traceparent` is read as a fallback so anything speaking W3C
  is not ignored.)
- `x-symbia-caller` — the service id making the call.

Inbound, `observabilityMiddleware` adopts the trace id rather than minting one,
and records `caller` in the event payload.

Outbound is the hard half, because every service makes bare `fetch()` calls
from dozens of places. Rather than edit each one, `createSymbiaServer` installs
a `globalThis.fetch` wrapper that reads the current request's trace id from an
`AsyncLocalStorage` store and adds both headers.

That is invasive and worth stating plainly: patching a global is the kind of
thing that makes behaviour non-local and hard to reason about. It is chosen
because the alternative — touching every call site in nine services — is where
"a shared concern with N independent implementations" comes from, and this
codebase already has four of those on record.

## Predictions

**P1 (baseline, already measured).** Before the change: zero trace ids shared
between two services.

**P2.** After: a control-center-proxied request that fans out will produce a
trace id appearing from **two or more** services.

**P3.** `obs.http.request` will carry a `caller` field on internal calls and
leave it absent on browser-originated ones, because a browser does not send
the header.

**P4, the one I expect to get wrong.** The control center proxies with
`http-proxy-middleware`, which uses Node's `http` module, **not** `fetch`. The
global fetch wrapper will therefore NOT cover the console → service hop — the
single most common call on this stack. Predicted symptom if unaddressed: caller
is absent on exactly the requests the operator is most likely to look at, while
service → service calls work. It needs an explicit `proxyReq` header injection.

**P5.** AsyncLocalStorage context will survive across `await` inside request
handlers but will be LOST for calls made from timers, intervals and socket
handlers, because those run outside the request's async context. Those calls
will emit with no caller and a fresh trace id. That is correct behaviour, not a
bug, but it means "no caller" will mean two different things and the UI must
not read it as one.

## Measured

*(filled in after each prediction is tested)*

## Not checked

*(kept honest as the work proceeds)*
