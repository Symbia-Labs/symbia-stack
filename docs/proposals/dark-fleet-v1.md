# Dark Fleet — v1 scope and envelope schema

*14 August 2026. **PAPER.** No code. Nothing in this document exists.*

*A proof case, not a product. The output is a defect ledger against the Symbia
API, in the same sense that `energy/` is a test case and its ledger is the
product. If a piece of this cannot be built through the Symbia API alone, that
is the finding — never a reason to reach outside.*

---

## 1. Why this corpus

Most provenance demos use data that is merely messy. This one uses data that is
**actively falsified by its subject**. AIS is an unauthenticated, unencrypted
VHF broadcast in which the vessel states its own identity and position. A
sanctioned tanker turns the transmitter off, or transmits a position it is not
at, or transmits another ship's identity.

That inverts the usual argument. Provenance is hygiene when a source is honest
and merely lossy; it is *the entire product* when the source is lying, because
the only defensible artifact is a record of **what a named receiver demodulated
at a named time**, which is true regardless of whether the content was true.

The platform already has the vocabulary for this and has never applied it to a
lying source:

- `claims.ts` makes every observer state `does_not_assert`. For a radio
  reception that field carries the whole spoofing problem.
- Port lanes divide by whether a value is recomputable. A remote self-report
  is not.
- "Lanes only tighten" means no conclusion downstream of a self-report can ever
  be presented as canonical. §6 works through what that costs, and it is the
  most interesting constraint in the design.

Second reason: **the delayed oracle**. Sanctions designations, port-state
detentions and P&I withdrawals arrive weeks to months after the behaviour they
describe. A detection registered in git today is adjudicated by an authority
that has not yet spoken. That is MAP with the clock running the right way — the
prediction cannot be retrofitted, because the truth did not exist when it was
written.

## 2. Scope — one box, one quarter

**Laconian Gulf STS zone**, off the southern Peloponnese between Cape Malea and
Cape Tainaron. Approximate bounding box, to be tightened against observed
traffic before any prediction is registered:

```
36.20 N – 36.80 N, 22.30 E – 23.20 E
```

Chosen because ship-to-ship transfer is the **actual laundering event** rather
than a proxy for it, the box is small enough that v1 can cover all of it, and
the area has enough published third-party findings to check ourselves against
without those findings becoming our input.

**In scope for v1:** vessels, companies, flags, hulls.
**Out of scope for v1:** natural persons. No crew, no masters, no beneficial
owners. See §10.

## 3. Ingest — where the signing happens, not how raw the bits are

### 3a. Rawness is the wrong axis

The tempting framing is "get as close to the A/D converter as possible." It is
worth writing down why that is a trap, because it looks like rigour.

Raw IQ *can* be moved over a network — `rtl_tcp` does exactly that, and public
OpenWebRX / WebSDR receivers stream from antennas all over the world, some of
them covering VHF. So a remote IQ feed is technically available. But **IQ from
someone else's receiver is exactly as unattested as a sentence from someone
else's receiver.** You have not removed the trust boundary, only moved it — and
you now sign at the same place you would have signed anyway, your own ingress,
having paid roughly three orders of magnitude in bandwidth for the privilege.
Two AIS channels at 2 Msps is ~4 MB/s continuous; a quarter of that is not
storable under the JSONL-and-local-logs constraint and would not be storable
under a real database either.

The axis that matters is **who signs, and on which side of the demodulator**.
Everything follows from that, and the practical answer is:

- **Chain the sentences continuously.** The demodulated AIVDM sentence plus
  receive metadata — timestamp, RSSI, channel, antenna position — is the
  earliest artifact that is both evidential and affordable. This is the stream.
- **Keep IQ excerpts only for contested receptions.** A few seconds of samples
  around a disputed transmission, hash-chained and *bound* to the sentence
  event. The spyglass already has this pattern: per-track chains bound at close,
  so one track can be withheld while proving it belonged to the same capture.
  Same construction, different tracks. That is the A/D-adjacent evidence, at a
  volume that exists.

So: continuous sentences, excerpted samples, one binding. Not IQ everywhere.

### 3b. Web-only ingest — streaming NMEA

For a deployment with no hardware, the closest attainable layer is **raw NMEA
before anyone's parser touches it**:

- **aisstream.io** — free websocket stream off a global volunteer station
  network. The realistic web-only source for the Mediterranean, and therefore
  for the box in §2.
- **AISHub** — share-to-receive, live.
- **National open feeds** — the Danish Maritime Authority (`dma-ais`), Norwegian
  and Finnish equivalents publish live NMEA as open data. Excellent quality,
  **wrong sea** — Nordic waters, not the Laconian Gulf. Useful for building and
  testing the pipeline against dense honest traffic before pointing it at the
  theatre.
- **VesselFinder / VT Explorer** — raw NMEA, commercial.

The honest consequence: a retrieved stream is a `retrieval`, not a `reception`.
Its claim is *"this endpoint delivered these sentences"* — never *"this receiver
heard them."* We are recording someone else's demodulation, and the attestation
tops out at self-attested-by-us-at-ingress. The UI must show that as a different
grade of evidence, not average it into the same badge. Anything else is the
forged-clip defect again: a correct hash presented as more than it is.

### 3c. The witness node — the demo generalized

One antenna we own is a trade-show prop. The same thing made **deployable** is
the actual product, and it fixes the design's weakest point.

A witness node is a cheap signed receiver anyone can run: its own key, its own
instrument identity, chained receptions, signing on the far side of the
demodulator. We do not need to own it — we need it to be *nameable* and its
records to verify without us. That is the spyglass instrument model, federated,
and there is already federation work in the repo to build on
(`docs/2026-08-12-federation-*.md`).

Two things fall out that no aggregator can offer:

1. **Corroboration.** Two independent witnesses at different positions hearing
   the same transmission is evidence of a different kind from one feed asserting
   it. More usefully, *disagreement* between witnesses — the same identity heard
   from geometrically incompatible positions — is a spoofing signal, and it is
   the only one available without owning satellites.
2. **It repairs the absence problem.** §6's central weakness is that one
   receiver's silence proves nothing. Overlapping coverage windows from
   independent witnesses make an absence claim materially stronger, and — this
   is the part worth having — the *degree* of strengthening is computable from
   the coverage records rather than asserted.

For v1 this means the local receiver is built as **witness node #1**, not as a
one-off rig. Whether a second one ever gets deployed is a later question; being
unable to express "witness #2" in the schema would be a design defect now.

### 3d. Retrieval — everything else

Copernicus Sentinel-1 (OData/S3, free, full archive), NOAA Marine Cadastre
historical AIS, OFAC SDN and EU/UK listings, plus the streaming NMEA sources in
§3b.

All of it through `@symbia/lineage`'s **retrieval observer**, which records TLS
subject, issuer, leaf fingerprint, redirects and content digests. STATUS §4a is
explicit that this observer has no consumer and should either get one real place
or be parked. **This is that one real place.** If the retrieval observer cannot
carry these fetches, that is a finding worth more than the detections.

One open question it raises immediately: the retrieval observer is built around
a *fetch* — request, response, digest, close. A websocket stream that stays open
for days is not that shape. Whether it can carry a long-lived stream at all is
D7 in §11.

## 4. A new observer kind: `reception`

`ObserverKind` is currently `'capture' | 'upload' | 'retrieval'`. None of them
fits a demodulated radio message, and the mismatch is not cosmetic — the
existing three all observe something that was *delivered to us*, whereas a
reception observes something **broadcast to no one in particular**, which we
happened to be in range of.

Proposed addition to `claims.ts`, in the existing shape:

```ts
reception: {
  asserts:
    'This receiver demodulated these exact bits from this radio frequency at this time, at this antenna position.',
  does_not_assert:
    'Anything about the transmitter. The identity, position, course and speed in the payload are ASSERTED BY THE SENDER and are trivially forgeable — the protocol is unauthenticated. This record proves a transmission was received, never that the named vessel exists, was at the stated position, or sent it. Absence of a reception proves only that this receiver did not hear one.',
}
```

That last sentence is load-bearing and is the difference between this system and
every commercial product in the space. **A gap is a property of the receiver,
not of the sea.**

Matching source binding:

```ts
export interface ReceptionSource {
  kind: 'reception';
  /** Which witness. Named from the start so a second node is not a migration. */
  witness: string;
  /** Structural only. Never the decoded payload. */
  frequency_hz: number;
  protocol: string;              // 'ais-nmea0183' for v1 — a parameter, not a component name
  /** Where the antenna was. Ours to state, unlike anything in the payload. */
  antenna: { lat: number; lon: number; height_m: number | null } | null;
  receiver_model: string | null;
  /** Demodulation quality. An observation about our hardware, not about the sender. */
  rssi_dbm: number | null;
  channel: 'A' | 'B' | null;
  /** Did we hear anything at all in this slot. Feeds coverage; see §6. */
  sentence_count: number;
  bytes: number;
  /**
   * Present only for contested receptions (§3a). Digest of a retained IQ
   * excerpt, bound to this event the way the spyglass binds tracks — so the
   * samples can be withheld while proving they belong to this reception.
   */
  samples: { digest: string; duration_ms: number; sample_rate_hz: number } | null;
}
```

Aggregated feeds (AISHub, Marine Cadastre) are **not** receptions. They are
retrievals of someone else's claim about receptions, and must be recorded as
`retrieval`. Collapsing the two would be precisely the "correct hash presented
as more than it is" failure the claims file exists to prevent.

## 5. Events

Following the GKS Lineage shape already in `chain.ts` — append-only,
parent-linked, canonical JSON (RFC 8785), ed25519, `signature_scheme:
canonical-event-v2`. Non-epistemic: the ledger carries digests, counts, offsets
and geometry, never content.

| event | emitted by | notes |
|---|---|---|
| `observation.open` / `.chunk` / `.close` | reception + retrieval observers | existing shape, unchanged |
| `track.advance` | correlation | one vessel-hypothesis extended by one report; parent = the observation event |
| `coverage.window` | receiver, retrieval | what we could have heard, per §6 |
| `detection.raise` | detectors | parent-linked to **every** observation it rests on; carries `resolves_by` (§6a) |
| `detection.resolve` | detectors | the tasked observation arrived and settled it, either way |
| `detection.retract` | detectors | a detection is never deleted, only superseded |
| `oracle.observe` | registry agent | a designation/detention arriving, as a retrieval |
| `prediction.register` | MAP registry | written before the oracle exists; see §8 |

`detection.retract` matters. Vessel identity resolution is revisable — a hull
re-flagged and renamed is the *same* hull, and we will get that wrong sometimes.
An append-only ledger with retraction is honest; an editable detections table is
not.

## 6. Lanes — and the thing this costs us

Assignments, in the existing four-value vocabulary:

| value | lane | note |
|---|---|---|
| a reception's bits | apocryphal | a broadcast cannot be recomputed from the graph |
| a retrieved body | apocryphal | already the ruling for `symbia.io.http-request` |
| geometry over given tracks | canonical | distance, dwell and containment are recomputable **from the inputs** |
| coverage window | conditional | canonical only when the receiver reported continuously across it |
| any detection | **apocryphal** | see below |

**Lanes only tighten, so no detection in this system can ever be canonical.**
Every one of them descends from a self-report. The geometry is recomputable; the
premise is not. The system is therefore structurally incapable of saying *"this
vessel went dark"* — it can only say *"these reports, taken as given, imply a
gap."*

That is not a limitation to work around. It is the correct claim, it is the one
every competing product overstates — and it is **the actionable one**.

### 6a. The apocryphal claim is the product

Treating this as a consolation prize would be the wrong reading. *"These reports,
taken as given, imply a gap"* is more useful than *"this vessel went dark"*, for
three reasons that all cash out operationally.

**It survives challenge.** An overstated claim collapses the first time a
shipowner's lawyer asks how we know the transmitter was on. A claim that already
names its premises has nothing left to concede — the argument moves to whether
the premises hold, which is where it belonged.

**It names its own resolution path.** This is the part that makes it literally
actionable. A claim with explicit premises tells you exactly which *next
observation* would settle it: a SAR pass over that box at 03:00, a second witness
with overlapping coverage, the coverage record for the lapsed window, a port-call
record at the far end. So **a detection is a tasking, not a verdict** — it is a
question with the price of the answer attached. A verdict tells an analyst what
to believe; a tasking tells them what to do next, which is the thing they are
actually short of.

That has a schema consequence, not just a rhetorical one: every
`detection.raise` carries a `resolves_by` — the specific observation that would
convert it, or retract it. A detection that cannot say what would settle it is
not a finding, it is a mood, and should not raise.

It also makes the ledger sortable by something better than confidence: **what
would most cheaply move this claim.** A detection resolvable by a free Sentinel-1
pass three days out ranks differently from one needing a witness we have not
deployed. That ranking is the daily work product.

**It puts the assertion where the authority is.** We supply the observation and
its limits; the party with standing — analyst, insurer, port state — makes the
call and carries it. That is not a hedge, it is the correct division: we are not
entitled to assert what we cannot substantiate, and they are not served by
receiving a verdict they cannot audit. Same posture as §10, arrived at from the
other direction.

The `symbia.state.rollup` note is the template: *a partial total must not pass
as the total.* The maritime form is **an unheard vessel is not a silent
vessel** — a gap where receiver coverage lapsed is not evidence of anything.
So the coverage window is `conditional` and every absence-based detection reads
`count` against `size` before it is allowed to claim anything, exactly as
`symbia.state.window` already requires.

## 7. Detections for v1

Four, in order of how much they exercise the platform rather than how
interesting they sound.

1. **Reception gap.** A track reported inside the box, then nothing for > N
   hours. Conditional on coverage: apocryphal-with-no-claim where coverage
   lapsed, and the UI must show that as *"we were not listening"* rather than
   omitting it.
2. **Unmatched hull.** A Sentinel-1 SAR detection at a position with no
   contemporaneous report within tolerance. Requires the acquisition timestamp
   and the coverage state at that instant, not merely at that hour.
3. **Rendezvous.** Two tracks within ~500 m, both near-stationary, for > 3 h.
   This is the STS signature and the one with real-world consequence.
4. **Identity discontinuity.** Static data changing under a stable identifier,
   or a stable identifier appearing under changed static data. This is how a
   designated vessel returns with a clean profile, and it is the detection most
   likely to be *wrong* — hence `detection.retract`.

Component naming is constrained: **manifests are public contracts with no domain
vocabulary.** There is no `symbia.maritime.sts-detect`. There is
`symbia.geo.proximity-dwell`, `symbia.geo.point-in-region`, and
`symbia.state.coverage-window`, and "STS" appears only in the *installation* —
in tags, in the assistant, in the app, never in a component key. Catalog keys
stay `<type-plural>/<name...>`, plural, domain in tags.

Related and easy to get wrong: **the catalog holds reusable items only, never
real-time point instances.** Detectors, components and the box definition are
catalog resources. Tracks, receptions and detections are **not** — they are
JSONL and log streams. A vessel position must never end up in the catalog.

## 8. Replay, and the delayed oracle

Two modes over one pipeline.

**Live.** Receptions and retrievals arrive, detections raise, predictions are
registered in git *before* any oracle event exists. A designation, detention or
insurance withdrawal arriving weeks later is an `oracle.observe`. The registry
reports hits, misses and false positives, and **reports the broken predictions
as broken** — the discipline is worthless the first time it is softened.

**Historical.** The same envelopes replayed at their original timestamps against
designations that have since landed. This is the "could-have-known" mode, and it
is strictly the weaker evidence, because we know the answer. It is a
demonstration; live is the measurement. Saying so in the doc is cheaper than
being caught conflating them later.

Replay must be driven by the ledger alone — if reconstructing a detection needs
anything outside the envelopes, the envelopes are incomplete, and that is a
defect in this design rather than an inconvenience.

## 9. Agents

- **witness** — edge, holds its own key, signs on the far side of the
  demodulator. Never talks to anything but its sink. Assume from day one there
  will be more than one and that we will not own all of them.
- **retriever** — the only path to the network, via the retrieval observer.
  (`docs/proposals/sole-ingress-and-derivation` argues this generally; here it
  is a hard requirement, because a fetch without a TLS record is not evidence.)
- **correlator** — reports to track hypotheses. Emits `track.advance`, and is
  the component allowed to be wrong and retract.
- **detector** — the four above.
- **registry** — oracle watcher and prediction scorer.
- **an assistant** answering questions over all of it, which must **refuse**
  when the ledger does not support an answer. Refusals have been sealed since
  12 Aug, which makes this the first application where a sealed refusal is the
  most important reply the system produces.

## 10. Do no harm — as invariants, not intentions

This is an accusation machine. The accusation is the harm, and "we were careful"
is not a mechanism.

1. **No rendered conclusion without a resolvable chain.** If the UI can display
   a claim that does not reach signed envelopes, that is a P1 platform defect,
   not a UI bug. This is the one invariant the whole thing rests on.
2. **`does_not_assert` renders with the claim.** Same visual weight, not a
   tooltip. A "dark vessel" badge without "we may simply not have been
   listening" beside it is the forged-clip failure with a maritime skin.
3. **Claimed vs substantiated are separate values**, per `substantiate()`. A
   detection from an aggregated feed is not the same evidence as one from our
   own antenna, and the interface must never let them look alike.
4. **No natural persons in v1.**
5. **Right of reply.** Every detection exports a bundle any subject can verify
   offline — the `verify-clip.mjs` pattern, no network, no model. If a target
   can break our replay, they should be able to do it without our cooperation.
   A system that can only be checked by its operator is not accountable, it is
   just confident.
6. **The ledger is publishable without the material.** Non-epistemic by
   construction, so the record can go to a journalist or regulator without
   republishing licensed imagery or third-party feeds.

## 11. Predicted platform defects

Registered before building, per MAP. These are predictions about the platform,
not a plan to route around it. Each is expected to be *measured*.

- **D1.** Envelope signing is PAPER outside the assistants' delegation path
  (STATUS §7, stages 1–3 unbuilt). A cross-service signed observation chain does
  not exist yet, so this application cannot be built without landing at least
  stage 1.
- **D2.** `@symbia/lineage` has exactly one caller — `sealDelegation` in
  `assistants/server/src/engine/provenance.ts` — and the retrieval observer has
  **zero**: verified by import search, `retrieve` appears only in the library's
  own `index.ts` export. Expect the same class of defect that surfaced the moment
  `sealDelegation` first gave the library a consumer: it had been declared with no
  dependencies at all while importing `@symbia/crypto`, because nothing had ever
  tried to consume it.
- **D3.** **Chain heads are in memory.** Ruled acceptable for conversations
  (11 Aug). A continuous sensor stream is a different case: a restart relinks to
  GENESIS mid-voyage and silently splits a track's evidence in two. This needs a
  ruling of its own, and the honest minimum is *disclosure* — the chain must say
  it lost continuity rather than present two chains as one.
- **D4.** ~~A receiver is a long-running daemon, not an invocation, and may not be
  expressible as a platform component at all.~~ **Largely dissolved by
  `dark-fleet-decomposition.md` §3** — it does not need to be. A witness is a
  signed client of a *declared ingress*
  (`runtime/server/src/catalog/ingress.ts`, `POST /api/ingress/:graphName`),
  which is the spyglass posture and is already built. `remote-service` remains
  declared-and-empty in `catalog/shared/schema.ts:97` — grep finds it in the
  schema and nowhere else — but v1 does not need the runtime to *host* a sensor,
  only to *accept* what one delivers. What survives is narrower and is now D9.
- **D5.** **There are two outbound paths and neither is both guarded and
  recorded.** `@symbia/egress` (13 Aug) is an SSRF *guard* — host resolution and
  address checks for URLs arriving from graph config or conversation context. It
  records nothing. The retrieval observer performs its own fetch and captures the
  TLS chain, but does not route through the guard. This application needs one
  path that is simultaneously allowlisted and evidentiary, and that path does not
  exist. Read `@symbia/egress`'s own honest-limit note (DNS-rebinding TOCTOU
  remains open) before assuming otherwise.
- **D7.** The retrieval observer is shaped around a **fetch** — request,
  response, digest, close. The web-only ingest path in §3b is a websocket held
  open for days, where "close" is a failure and the digest is of a stream with no
  end. Expect `Observation` to accommodate this (it already chunks and chains
  rather than hashing once, explicitly so a stream that dies halfway still attests
  the part that arrived) and expect `retrieve()` not to. If the library's chunking
  design survives contact with an unbounded stream while its one observer does
  not, that is a good outcome: the abstraction was right and the caller was
  missing.
- **D8.** Multi-witness corroboration (§3c) assumes federated identities whose
  records verify without us. `docs/2026-08-12-federation-*.md` exists; whether it
  reaches a foreign instrument identity signing into a shared ledger is unread and
  should not be assumed from the filename.

**D9–D12 continue in `dark-fleet-decomposition.md`**, which maps this scope onto
the actual primitives: websocket ingress (D9), whether a graph can branch on the
lane it received (D10 — measure this first), app-provided component key
conventions (D11), and silent collision of nested assistant keys (D12).
- **D6.** Bulk. Sentinel-1 GRD products are large. Chunked chaining exists in
  `observation.ts`; whether the JSONL-and-local-logs constraint survives a
  quarter of SAR products in the box is unmeasured.

## 12. Acceptance for v1

Deliberately small, and none of it is "it found a smuggler."

1. **Witness node #1** produces `attested` receptions verifiable from the files
   alone, with no network and no model — and the schema can name a witness #2
   without a migration.
2. The web-only path works without it: a streaming NMEA source in §3b is
   recorded as a `retrieval`, and the interface shows that as a **visibly
   different grade of evidence** from witness #1's receptions. Both paths, one
   schema, no averaging.
3. One remote fetch is recorded by the retrieval observer with a TLS chain, and
   the fetch is not possible by any other route.
3. One rendezvous detection replays from the ledger alone.
4. One absence-based detection correctly **declines to claim anything** across a
   coverage lapse — verified by deliberately unplugging the antenna.
5. Predictions for the quarter are in git, timestamped before any oracle event.
6. Every raised detection carries a `resolves_by` naming the observation that
   would settle it, and at least one is **actually resolved** by going and
   getting that observation. A tasking nobody can execute is not a tasking.
7. The defect ledger has entries. If it does not, the walk was not honest.

Item 4 is the one to build first. A system that reports a gap it cannot support
is worse than no system, and every product in this market ships that bug.

## 13. Not in v1

Spoofed-but-present AIS — a plausible fake track is far harder than silence, and
it is the research edge, not the first build. Satellite AIS (commercial).
Ownership graphs. Anything naming a person. Optical imagery. Any theatre other
than the box in §2.

---

## Sources — external data

- Sentinel-1: Copernicus Data Space Ecosystem (OData/S3/STAC), and the AWS
  Registry of Open Data mirror. Free and open, full archive.
- AIS historical: NOAA Marine Cadastre AccessAIS.
- AIS live, raw NMEA, web-only: aisstream.io (free websocket, global volunteer
  stations — the realistic source for the §2 box), AISHub (share-to-receive),
  the Danish Maritime Authority `dma-ais` open feed and its Nordic equivalents
  (excellent, wrong sea — use for pipeline testing), VesselFinder / VT Explorer
  (commercial raw NMEA).
- Decoder for a witness node: AIS-catcher. AIS channels are 161.975 and
  162.025 MHz. Raw IQ over a network, if ever needed: `rtl_tcp` — see §3a for
  why it is not the answer it looks like.
- Designations: OFAC SDN with IMO numbers, EU and UK equivalents.
- Note: Global Fishing Watch's SAR detection layer has been out since
  3 July 2026 pending Sentinel-1C/1D pipeline integration — which is the
  argument for going direct to Copernicus rather than depending on a derived
  product we cannot repair.
