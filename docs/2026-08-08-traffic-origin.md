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
- **Why `GET /api/logs/stream` returns 401.** Surfaced by this change, not
  diagnosed by it.
- `@symbia/catalog-client` sends no origin, so catalog reads land in `unknown`.
  It is an imported package rather than a console file and was missed by the
  per-client pass.
