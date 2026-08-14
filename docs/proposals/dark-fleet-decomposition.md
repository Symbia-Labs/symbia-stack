# Dark Fleet — decomposition onto platform primitives

*14 August 2026. **PAPER.** Companion to `dark-fleet-v1.md`, which is the scope
and the schema. This is the mapping: what is an app, what is a graph, what is a
component, what is an assistant, and what has to be built because it is not
there.*

*Every primitive named here was read out of the code, not assumed. Where
something is genuinely missing it is numbered as a defect and continues the
series in `dark-fleet-v1.md` §11.*

---

## 1. The shape, in one paragraph

**One app, `apps/dark-fleet`. The Laconian Gulf is an installation of it, not the
app.** Six graphs, one declared ingress, one assistant, one new platform
component, and a set of geometry components that are not maritime and should not
pretend to be. The witness node is explicitly *outside* the platform and reaches
it through the ingress boundary — which is what an ingress is for, and which
turns out to dissolve most of D4.

Everything below follows from resource types that exist:
`context | integration | graph | assistant | component | app`.

## 2. `apps/dark-fleet` — the artifact

The app/installation split does real work here and gets the most important thing
right for free: **the theatre is configuration.**

Baking `36.20–36.80 N, 22.30–23.20 E` into the artifact would be the same defect
as baking in an org id — the app could then only ever be installed once, over one
sea. As config, a second installation over Hormuz costs a config value. §2 of the
scope doc reads like a scope decision; in this model it is an *installation*.

```jsonc
{
  "symbia": "app/1.0",
  "key": "apps/dark-fleet",
  "name": "Dark Fleet",
  "version": "0.1.0",
  "description": "Correlates radio receptions, imagery detections and designation lists into resolvable claims about vessel behaviour.",

  "requires": {
    "platform": ">=1.1.0",
    "components": [
      "symbia.io.passthrough@^1.2.0",
      "symbia.logic.filter@^1.2.0",
      "symbia.logic.switch@^1.2.0",
      "symbia.source.timer@^1.2.0",
      "symbia.io.http-request@^1.2.0",
      "symbia.state.latest@^1.2.0",
      "symbia.state.window@^1.2.0",
      "symbia.state.rollup@^1.2.0",
      "symbia.state.join@^1.2.0",
      "symbia.transform.map@^1.2.0",
      "symbia.io.collect@^1.2.0",
      "symbia.sink.log@^1.2.0",
      "symbia.sink.lineage@^0.1.0"      // does not exist — §6
    ],
    "services": ["catalog", "logging", "runtime", "integrations", "identity"]
  },

  "provides": {
    "graphs": ["df-receive", "df-retrieve", "df-correlate",
               "df-coverage", "df-detect", "df-oracle"],
    "components": [],                    // see §5 — deliberately empty
    "ingresses": ["df-receive"]
  },

  "surfaces": {
    "ingress": ["df-receive"],
    "metrics": ["darkfleet.v0.receptions", "darkfleet.v0.coverage_ratio",
                "darkfleet.v0.detections_open", "darkfleet.v0.detections_resolved"],
    "ui": "/app/dark-fleet"
  },

  // Schema only. The theatre lives here, per installation.
  "config": {
    "region_north":   { "type": "number", "required": true, "description": "Northern bound of the box of interest" },
    "region_south":   { "type": "number", "required": true, "description": "Southern bound" },
    "region_east":    { "type": "number", "required": true, "description": "Eastern bound" },
    "region_west":    { "type": "number", "required": true, "description": "Western bound" },
    "gap_hours":      { "type": "number", "required": true, "description": "Silence before a reception gap is considered" },
    "dwell_hours":    { "type": "number", "required": true, "description": "Co-location duration qualifying as a rendezvous" },
    "proximity_m":    { "type": "number", "required": true, "description": "Separation below which two tracks are co-located" },
    "coverage_slots": { "type": "number", "required": true, "description": "Expected reports per witness per window; feeds the rollup gate" }
  },

  // Isolation is the default and nothing here needs an exception.
  "privilege": {},

  // Named, with reasons. An app that cannot say what it left outside has not
  // drawn a boundary.
  "outside": [
    { "what": "The witness node: SDR driver, AIS-catcher demodulation, and edge signing.",
      "why": "A radio front end is not expressible as a runtime component (D4). It is a signed client of a declared ingress, exactly as the spyglass is a signed client of the platform." },
    { "what": "Retained IQ sample excerpts for contested receptions.",
      "why": "Binary bulk that the ledger references by digest and never carries. The ledger stays non-epistemic." }
  ],

  "principal": null                      // apps do not yet act
}
```

Two of these fields are load-bearing rather than decorative. `outside` forces the
witness node to be *declared* as a thing we left out, which is the difference
between a boundary and an omission. And `config` being schema-only is what stops
the Laconian Gulf becoming a property of the artifact.

## 3. Ingress — the witness seam

This is the part of the model that already exists and is better than expected.

`runtime/server/src/catalog/ingress.ts` registers a graph's `metadata.ingress` as
a catalog resource — as an `integration`, "because that is what an ingress is
from the outside" — and exposes `POST /api/ingress/:graphName`. The file's own
comment states the rule: *an ingress nobody declared is a surface nobody
governs.*

So the witness node does not need to be a component, a service, or anything
inside the platform. It needs to be a **governed client of a declared delivery
boundary**, signing its own records before they arrive. That is the same posture
as `spyglass-agent`, which is standalone, holds its own instrument identity, and
is the thing in this repo that works.

**This substantially dissolves D4.** The daemon problem was "a receiver is not an
invocation." Correct — and it does not have to be. `remote-service` remaining
unimplemented stops being a blocker for v1, because nothing here needs the
runtime to *host* a long-running sensor; it needs the runtime to *accept* what
one delivers. D4 should be rewritten to that effect and downgraded.

What survives is narrower and worth stating precisely: the ingress is an HTTP
`POST` boundary, and §3b's web-only path is a websocket held open for days. A
socket-shaped ingress is not declared anywhere. `GraphDefinition.bindings`
carries a `NetworkBinding` with `protocol: 'grpc' | 'http' | 'ws'`, so the type
anticipates it — which is exactly the shape of thing this codebase keeps finding
declared and empty. **D9: verify whether `ws` bindings reach a running graph, or
whether the streaming path must poll.**

## 4. Graphs

Six, each with one job. Node/edge shape as in `examples/order-margin`.

| graph | trigger | does |
|---|---|---|
| `df-receive` | ingress (witness POST) | validate sentence, normalize, seal reception, emit coverage tick |
| `df-retrieve` | `symbia.source.timer` | fetch imagery/feeds/lists, seal as retrieval |
| `df-correlate` | fan-in from both | reports → track hypotheses; `state.latest` per track |
| `df-coverage` | `symbia.source.timer` | the absence gate — §4a |
| `df-detect` | fan-in | the four detectors, branched by `logic.switch` |
| `df-oracle` | `symbia.source.timer` | designations in, predictions scored |

### 4a. `df-coverage` — the one that matters

The absence gate in `dark-fleet-v1.md` §6 does not need inventing. It is
`symbia.state.rollup`, whose manifest already says: **canonical only when
`missing` is empty; a partial total must not pass as the total.**

Map the witness set onto the rollup's expected keys and the semantics come out
right by construction — a lapsed witness leaves a missing key, the rollup emits
`conditional`, and every absence-based detection downstream is gated on it. The
maritime rule *an unheard vessel is not a silent vessel* becomes a component
already in the runtime, doing the thing it was written to do.

```jsonc
{
  "symbia": "graph/1.0",
  "name": "df-coverage",
  "version": "0.1.0",
  "description": "Derives, per window, whether the witness set heard continuously. Gates every absence claim.",
  "nodes": [
    { "id": "tick",   "component": "symbia.source.timer",
      "config": { "intervalMs": 300000 } },
    { "id": "window", "component": "symbia.state.window",
      "config": { "size": "{{config.coverage_slots}}" } },
    { "id": "roll",   "component": "symbia.state.rollup",
      "config": { "expect": "{{witnesses}}" } },
    { "id": "ratio",  "component": "symbia.compute.arithmetic",
      "config": { "expression": "{count} / {size}" } },
    { "id": "m",      "component": "symbia.sink.metric",
      "config": { "name": "darkfleet.v0.coverage_ratio", "valueField": "result" } },
    { "id": "seal",   "component": "symbia.sink.lineage",
      "config": { "eventType": "coverage.window" } },
    { "id": "out",    "component": "symbia.io.collect" }
  ],
  "edges": [
    { "id": "e1", "source": { "node": "tick",   "port": "out" }, "target": { "node": "window", "port": "in" } },
    { "id": "e2", "source": { "node": "window", "port": "out" }, "target": { "node": "roll",   "port": "in" } },
    { "id": "e3", "source": { "node": "roll",   "port": "out" }, "target": { "node": "ratio",  "port": "in" } },
    { "id": "e4", "source": { "node": "ratio",  "port": "out" }, "target": { "node": "m",      "port": "in" } },
    { "id": "e5", "source": { "node": "m",      "port": "out" }, "target": { "node": "seal",   "port": "in" } },
    { "id": "e6", "source": { "node": "seal",   "port": "out" }, "target": { "node": "out",    "port": "in" } }
  ],
  "metadata": { "role": "gate" }
}
```

And immediately, the sharpest finding in this decomposition:

**D10 — a graph cannot see the lane it received. MEASURED 14 Aug, confirmed.**
6/6 predictions held; full record in `docs/2026-08-14-lane-visibility-results.md`,
predictions registered beforehand at `0d4ac7d`.

A filter attempting to branch on `lane` emitted `fail` in both the apocryphal and
the canonical case — the lane changed underneath it and its behaviour did not.
`FlowValue` is `{value, lane}` and `logic.filter` reads `input.value` only. The
same port fires in both cases, so port-based branching is no escape either, and
`conditional` never reaches a value at all: it is manifest-only, resolved to one
of two runtime lanes before anything downstream sees it.

The asymmetry is the finding: the run output *reports* the lane to an operator
(P6 held) while withholding it from the graph that must act on it.

**The gate is still constructible today, through the payload** —
`filter(field: "coverage", op: "eq", value: 1)` did discriminate correctly. But
`coverage` and the emitted lane are set three lines apart in
`components-state.ts` and are bound by nothing but that adjacency. A gate built
on it *looks* like it enforces the lane rule and does not.

So `df-coverage` grows a prerequisite: **`symbia.logic.lane-gate`**, about
fifteen lines, emitting on a `canonical` or `apocryphal` port by reading the
field next to the one filters already read. It is the smallest change that lets a
graph *refuse* — the behaviour the entire lane vocabulary exists to support and
which no graph can currently express. Build it before the gate, not after.

## 5. Components — and a naming collision worth settling first

Most of the work is composition. Only geometry is missing:

- `symbia.geo.point-in-region` — is a position inside the configured box.
  Lane `canonical`: recomputable from the point and the bounds.
- `symbia.geo.proximity-dwell` — two tracks within *n* metres for *t* hours.
  Lane `canonical` on the same grounds, and `inherit` does the honest work
  downstream, since the tracks arriving are apocryphal and lanes only tighten.

Note what these are *not*: they are not maritime. Distance, containment and dwell
are as domain-free as `symbia.compute.arithmetic`, and the constraint that
component manifests are public contracts with no domain vocabulary says so.

Which surfaces a rule the platform has not written down. **D11: there is no
stated convention for app-provided component keys, and two existing rules
collide.** Apps must carry their own components — "an artifact that only
references resources cannot be deployed anywhere else" — yet a component manifest
may carry no domain vocabulary, and `symbia.*` is plainly the platform's
namespace. A key like `dark-fleet.geo.proximity-dwell` violates the second rule;
`symbia.geo.proximity-dwell` supplied by an app violates the first.

The resolution I would argue for, and it is a ruling someone has to make rather
than something to infer: **geometry is platform, not app.** Nothing about
distance is about ships. `provides.components` stays `[]`, the two geo components
are proposed as platform builtins, and `apps/dark-fleet` merely `requires` them.
An app whose components are all general-purpose is evidence the boundary was
drawn in the right place.

## 6. The one primitive that has to exist: `symbia.sink.lineage`

The runtime has `symbia.sink.metric` and `symbia.sink.log`. There is **no sink
that writes a signed lineage event**, and grep confirms it: 27 builtin component
keys, no `sink.lineage`, no `sink.event`.

That is the gap between this platform and this application, and it is one
component wide. Everything else here is composition of things that run today.

```
symbia.sink.lineage
  in  : any            lane inherit
  out : { event_id, checksum, signature }   lane canonical
        (the receipt is recomputable from the event and the key)
  config:
    eventType   string   required   observation.open | detection.raise | …
    chainKey    string   required   what this event chains on
  capability: lineage.write
```

It would give `@symbia/lineage` its **second** caller. STATUS §4a says the
library should either get one real place or be parked; §4 records that giving
`sealDelegation` a caller immediately exposed two defects that had survived
precisely because nothing consumed it. Expect the same again — that is the point
of building it, not a risk of building it.

It also converts `dark-fleet-v1.md` D1 from a blocker into a work item. Envelope
signing being PAPER across services matters much less if the signing happens in
one sink component with one identity, rather than needing every service to seal
its own traffic.

## 7. Assistants

One: `assistants/dark-fleet/analyst`, `status: published` (the roster gate, and
it was decoration until 11 Aug).

It rides machinery that already works. Deterministic three-tier routing —
`@mention`, declared patterns, then the naive-Bayes classifier — with a model
consulted only when all three decline; reproducible routing, so an inaccuracy is
a bug rather than weather. Every reply carries an arena (`COMPUTED` / `RETRIEVED`
/ `COMPOSED` / `GENERATED` / `REFUSED`) and the delegation is sealed as a GKS
Lineage event.

`REFUSED` is the reply class that matters most here, and it has been sealed since
12 Aug. **A question the ledger cannot support must produce a signed refusal, not
a hedge** — this is the first application where the refusal is the most important
thing the system emits, and it is already the one reply class that was quietly
unverifiable until someone stopped excluding failures from the denominator.

`routing.handles` and `routing.examples` carry the routing signal; `description`
goes back to prose, per the assistant object review.

**D12 — nested assistant keys collide silently.** The object spec flags it:
`loadedAssistantKey()` derives the short form from the last path segment, so
`assistants/dark-fleet/analyst` becomes `analyst`, and any other `…/analyst`
collides with no check. Either flatten to `assistants/dark-fleet-analyst` for v1
or fix the derivation. Do not discover this with two apps installed.

## 8. What must never become a resource

The catalog holds reusable items only, never real-time point instances. The line
is unambiguous here and easy to cross by accident:

| catalog resource | **not** a resource |
|---|---|
| the six graphs | graph executions |
| component manifests | receptions, tracks, detections |
| the app manifest | config *values*, the box, the org |
| the ingress declaration | delivered payloads |
| the assistant | conversations |

Detections are events on a ledger and series in `logging`, reached by
`symbia_query_logs`. A vessel position must never appear in the catalog. If one
does, the catalog has become a database and the ruling has been lost.

Unresolved: **`context` is a declared resource type with no reader.** It appears
in `resourceTypes` and grep finds nothing that consumes it. It is the plausible
home for the claims vocabulary and the `resolves_by` catalogue — the reusable
prose that must travel with records — but that is a guess, and the honest state
is *declared, unexamined*. Worth ten minutes before assuming it is available.

## 9. Build order

Sequenced so each step can fail informatively rather than by surprise.

1. ~~**Measure D10.**~~ **Done, 14 Aug — the answer is no.** See §4a and
   `docs/2026-08-14-lane-visibility-results.md`.
1a. ~~**Build `symbia.logic.lane-gate`.**~~ **Superseded the same day.**
   `docs/proposals/canonical-bus.md` argues the lane is a topology marker rather
   than a gate, and that per-value labels inside the graph are the wrong
   mechanism — the graph *is* the apocryphal lane, and what matters is the
   boundary crossing to a deterministic bus, which is readable off the graph
   definition. `lane-gate` solves a problem the bus does not have. Do not build
   it without reading that first.
2. **Build `symbia.sink.lineage`.** One component, second caller for
   `@symbia/lineage`. Expect defects in the library; they are the yield.
   Unaffected by the above — the reception ledger needs it either way.
3. **`df-coverage` alone**, on synthetic ticks. Prove the rollup gate refuses to
   claim across a manufactured gap before any real data exists. This is
   acceptance item 4, and it is buildable first.
4. **Witness node #1 → `df-receive`** through the declared ingress. First real
   receptions, first `attested` records.
5. **`df-retrieve`** — the retrieval observer's first caller, and the point where
   D5 (guarded-or-recorded, not both) and D7 (fetch-shaped observer, stream-shaped
   source) stop being predictions.
6. **`df-correlate`, `df-detect`**, with `resolves_by` populated from the start.
7. **`df-oracle`** and the assistant.

Steps 1–3 involve no maritime data at all. If the platform cannot do those, the
theatre was never the hard part.
