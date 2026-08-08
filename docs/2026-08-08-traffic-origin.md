# Origin: telling the platform's own noise from real activity

*8 Aug 2026. Predictions registered BEFORE building, per working discipline 1.*

## The ask

Brian: "I feel like the active browser calls should be marked 'internal-only'
somehow, we will want to isolate that traffic from actual user and agent
activities."

## What the traffic actually is

Measured before designing anything — 1,000 mesh events, of which 499 are
`obs.http.response`:

| path | count | share |
|---|---|---|
| `GET /api/stats` | 252 | **50.5%** |
| `POST /api/auth/introspect` | 206 | **41.3%** |
| `GET /stats` | 25 | 5.0% |
| `GET /api/resources` | 15 | 3.0% |
| `GET /api/auth/me` | 1 | 0.2% |

By caller: `control-center` 277, then network 52, runtime 52, catalog 48,
logging 45, models 24.

The console polls ten services on a timer. Each poll is a stats call, and each
authenticated stats call makes the receiving service introspect the token —
so the two dominant rows are one behaviour counted twice. **Roughly 96% of
observed HTTP traffic is the console watching itself.**

I made this worse this morning. Adding the auth header to `getServiceStats`
was the right fix for three blank tiles, and it doubled the request count per
poll cycle. Recorded here rather than left for someone to find.

## Why the existing vocabulary cannot answer this

The platform already has two fields and neither is the one needed:

- `boundary: intra | inter | extra` — **where** a call goes.
- `caller` — **which service** made it.

Neither says **why it happened or on whose behalf**. A dashboard poll and a
user pressing Send are both `intra`, and both can name `control-center` as
caller. They are the same by every field currently recorded, and they are not
remotely the same thing.

Overloading `boundary` with an `internal` value was considered and rejected:
a call is both `intra` and user-caused, and one field could only ever say one
of the two.

## The design

A third field, orthogonal to the other two.

```
origin: 'internal' | 'user' | 'agent' | 'unknown'
header: x-symbia-origin
```

- **internal** — the platform observing or maintaining itself. Dashboard
  polls, health checks, heartbeats.
- **user** — a human did something in a UI.
- **agent** — an assistant or model acting.
- **unknown** — nobody said. Explicit, and never silently read as `user`.

**It propagates.** `origin` joins `traceId` in the AsyncLocalStorage context,
so the fetch wrapper stamps it on every outbound call made while handling a
request. The introspect caused by a dashboard poll is therefore `internal`
too. Classifying only the first hop would leave 41% of the traffic
unattributed and would have made the amplification invisible — which is the
thing being hunted.

**It is declared, never inferred.** No guessing from path, user-agent or port.
A conclusion written into a probe rots when the code changes underneath it,
and "GET /api/stats is always internal" would be false the first time an
operator opens the stats endpoint themselves.

**Absence is a value.** `unknown` is recorded as `unknown`. It is not folded
into `user`, because a count of "real user activity" that quietly includes
everything unlabelled is exactly the confident number that means "never
asked".

### In the views

Observability defaults to `user` + `agent`, with a visible control showing how
many internal events are hidden and one click to show them. Hidden, never
dropped, and the count stays on screen so the filter cannot quietly become a
lie about volume.

## Predictions

**P1.** Once the console labels its polling, `origin=internal` will account for
between 90% and 98% of `obs.http.*` events over a quiet minute. Registered
because if it lands far below that, the propagation into introspect calls is
not working and I would otherwise be tempted to call a smaller number a
success.

**P2.** `unknown` will not be zero after the first pass. The control center
makes calls from places other than `platformClient` — SSE, sockets, the
Monaco-driven panels — and any of those reaching a service without the header
lands here. Predicting a visible nonzero `unknown` slice, and that finding
where it comes from is a second piece of work, not a bug in this one.

**P3, the one I most expect to be wrong.** I predict the control center's
proxy forwards `x-symbia-origin` from the browser without any change, because
http-proxy-middleware passes client headers through by default. It already
has to set `x-symbia-caller` explicitly, which is weak evidence the other way
— that header is *added*, not forwarded, so it proves nothing about
forwarding. If P3 is wrong the browser's label dies at the proxy and every
event reads `unknown`.

**P4.** Poll volume will not change from this work at all. Labelling makes
noise filterable; it does not make the stack do less work. Any claim that the
dashboard "got quieter" after this change is a claim about the view, not the
system, and should be treated as a misreading.

## Measured

*8 Aug 2026, after all twelve containers were rebuilt and the console was
driven in a browser. 494 `obs.http.response` events.*

| origin | count | share |
|---|---|---|
| `internal` | 294 | 59.5% |
| `unknown` | 127 | 25.7% |
| `user` | 73 | 14.8% |
| *(field absent)* | 0 | — |

### The mechanism works, and this is the evidence

**Propagation.** 123 `POST /api/auth/introspect` events arrived labelled
`internal`. Nothing sets that header on an introspect call — it was inherited
through AsyncLocalStorage from the dashboard poll that caused it. That is the
part worth having: without it, 41% of traffic would have stayed unattributed
and the amplification would still be invisible.

**Real activity is now separable.** `user` traffic is identifiable by path:
`/api/integrations/providers`, `/status`, `/registry` — panels opened in a
browser, cleanly distinguished from the polling around them.

### P3 — HELD. The one I most expected to be wrong

I predicted the proxy forwards `x-symbia-origin` untouched, and flagged it as
most likely to be wrong because the proxy has to set `x-symbia-caller`
explicitly. It forwards it. The browser's label survives to the service.

### P2 — HELD, and it named the right cause

I predicted `unknown` would be nonzero and would come from console clients
other than `platformClient`. It is 25.7%, and the paths say exactly that:
`GET /api/resources` (38) comes from `@symbia/catalog-client`, an imported
package rather than a local service file, so the per-client labelling pass
never reached it. `GET /api/auth/me` (10) is my own shell tooling — genuinely
external, correctly `unknown`.

### P1 — REFUTED

I predicted `internal` would be 90–98%. Measured **59.5%**.

The prediction was badly formed and I should say how rather than explain it
away. The 96% figure it was built on came from a sample where nobody was using
the console. Once the browser was actually driven through panels, real `user`
traffic appeared, and unlabelled sources turned out to be a larger share than I
had assumed. I predicted a proportion without stating the precondition it
depended on, which makes it a prediction that could not have been wrong for an
interesting reason.

### P4 — HELD

Poll volume is unchanged: 150 `GET /api/stats` plus 123 inherited introspects
in this window. Labelling made the noise filterable and did not make the stack
do less work, exactly as registered.

### Unpredicted: the filter immediately surfaced a real defect

Opening the Logging panel with internal traffic hidden left **two** requests
out of 38: `GET /api/logs/stream`, both **401**, a 100% error rate on that
endpoint. Under the unfiltered view this sits under 34 healthy `/api/stats`
calls and reads as a 5.3% overall error rate — noise.

The log stream is failing authentication. Not investigated here; recorded. It
is the first thing this change was built to make visible, and it showed up
within a minute of the filter existing.

## Not checked

- Whether the introspect result can safely be cached per token, and for how
  long. Not investigated; it is the obvious way to halve the poll cost and it
  is a correctness question about token revocation, not a performance one.
- The poll interval itself. Not read, not changed.
- Whether WebSocket and SSE traffic can carry an origin at all. Headers on the
  upgrade request are available; whether they survive to the event record is
  untested.
- ~~Why `GET /api/logs/stream` returns 401.~~ **Diagnosed and fixed.** The
  browser's built-in `EventSource` cannot send custom headers, so the stream
  arrived unauthenticated. Measured through the proxy: no auth → 401,
  `Authorization` header → 200, `?token=` in the query → 401. Replaced with
  `AuthedEventSource`, SSE over `fetch`, which can carry the header. The Logs
  panel now streams live where it had been empty.

  A query-string token was rejected on principle as well as on evidence: a JWT
  in a URL is written into every access log, every proxy log and every
  `obs.http.*` record this platform emits. On a stack built to record what
  happened, putting a credential in the recorded part is the worst option
  available.

  Worth naming: `EventSource.onerror` carries no status code, so a 401 was
  indistinguishable from an idle stream, and it retried silently forever.
  `AuthedEventSource` reports the status and backs off exponentially to 30s.
- `@symbia/catalog-client` sends no origin, so catalog reads land in `unknown`.
  It is an imported package rather than a console file and was missed by the
  per-client pass.
- The Log Search panel has no origin filter yet, so it is currently a wall of
  `GET /api/stats`. The field is on the records; the view does not use it.
- **The NET light reads red on `/logs` and green on `/overview`.** Observed,
  not diagnosed. The network socket is subscribed per page, and the status bar
  appears to report "this page did not subscribe" as "Network: Disconnected" —
  a global claim derived from local state. Not caused by this work: the socket
  is untouched, and the network service logs show it delivering to watchers
  throughout.

---

## Was the SSE fix a capability fix or a bandaid?

Brian asked. Tested rather than asserted, because the answer was not obvious
and the flattering one was available.

### Where today's five fixes actually landed

| fix | landed in | verdict |
|---|---|---|
| Anthropic dropped system prompts | `integrations/server/.../anthropic.ts` | platform — every caller on the stack |
| Overview said 8/8 | **`symbia-sys`** (`ProxiedServices`, +24) | platform — one list, both consumers derive |
| `api` had no `/api/stats` | `service-admin/server.js` (+21) | platform — that service now answers what every other service answers |
| `origin` | **`symbia-relay`** (trace-context, middleware, integration) | platform — every service inherits it |
| **log stream 401** | `symbia-control-center` **only** | **app** |

Four of five went into shared packages. The fifth did not.

### The verdict: a real fix, misplaced

**Not a bandaid**, on three counts that matter:

1. **Nothing was bypassed.** It uses the platform's own auth, against the
   platform's own endpoint, through the platform's own proxy. No unregistered
   service, no hand-edited route, no hardcoded ingress.
2. **The capability already existed.** The logging service was *correct* to
   require auth — measured, header → 200. The console simply could not reach a
   capability that was already there. Restoring reach is not the same as
   working around an absence.
3. **It refused the bandaid that was available.** A query-string token would
   have worked, taken five minutes, and written a credential into every log
   this platform produces. Rejecting the shortcut that the platform would not
   have resisted is the whole test, and it is the strongest evidence here.

**But it is in the wrong place.** `authedEventSource.ts` sits in the control
center. Browser-safe shared packages already exist and are already consumed by
this app — `@symbia/sys`, `@symbia/http`, `@symbia/catalog-client`,
`@symbia/messaging-client` — so there is a home and it was not used.
`@symbia/logging-client` exists but is **write-side only** (ingest, stream
creation); the platform has no consumption client at all. That gap is the
actual platform defect, and this fix papered over it locally rather than
closing it.

Not yet a discipline-7 violation, because N=1. But it is the shape that
becomes one.

### A claim I was about to make, and checked instead

I was going to write that the `models` service exposes SSE and therefore hits
the identical wall. Measured first:

```
POST /svc/models/v1/chat/completions  (stream:true, no auth)  ->  200
```

**It does not hit the wall, because it requires no authentication at all.**
The prediction would have been wrong, and wrong in the direction that made my
fix look more important than it is.

Recorded separately and NOT chased: an inference endpoint answering
unauthenticated requests is its own finding, and a worse one than the defect
this section is about.

### Closed

`@symbia/stream-client` — browser-safe, zero runtime dependencies, a workspace
package like every other client on this stack. Authenticated stream
consumption is now a platform capability rather than a control-center private.

Verified after the rebuild:

```
implementations of AuthedEventSource : 1   (symbia-stream-client/src/index.ts)
raw `new EventSource(` anywhere       : 0
```

The control-center copy is deleted, not merely superseded — leaving both would
have been the N-implementations problem with extra steps.

`services/origin.ts` now **re-exports** `TrafficOrigin` and `ORIGIN_HEADER`
from the package instead of restating the union. Only the per-client decision
of *which* value to declare stays in the console, which is correct: that is an
app judgement, not a platform one.

The package also carries `streamHeaders(token, origin)`, so the two headers a
Symbia stream needs — the one whose absence caused the 401, and the one that
classifies the traffic — are produced in one place instead of assembled by
hand at each call site.

Re-verified in the browser: the Logs panel streams live from the shared
package, now showing `obs.http.request`, `obs.http.response`,
`network.socket.connected` and `network.user.authenticated` as separate event
types.

**Still open, and named rather than quietly left:** `@symbia/logging-client`
remains write-side only. A caller wanting logs still assembles the stream URL
and query shape itself, and that shape is a logging-service API detail that
belongs in the logging client. The transport gap is closed; the log-specific
consumption API is not. It is not pulled in here because adding it would make
every service image carry a browser transport package for a consumer that does
not yet exist.
