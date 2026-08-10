# Sole ingress for the web, and the derivation chain

*10 August 2026. Design, not implementation. Nothing here is built beyond the
retrieval observer it depends on. Written so the position can be disputed
before code is committed to it. Measurements are marked as measured; everything
else is intent.*

---

## 1. The proposition

If the retrieval observer is the **only** pathway from this system to the web,
then every model invocation that consulted a web page has a signed, chained
copy of the exact bytes that were fetched, and a record of where they came
from.

That is a different claim from a citation. A citation says *the model was told
to look at this URL*. A receipt says *these bytes were returned by this endpoint
at this time, and here they are*. The gap between those two is where most
provenance systems quietly fail: the page changed, the fetch failed and the
model answered from training data anyway, or the URL in the footnote was never
actually retrieved.

This is the platform's governing rule applied to a domain it does not yet
cover: **no capability enters without a recorded gate**. The web is a
capability. Today it is ungated.

## 2. What a retrieval observation already proves

Built and verified (`symbia-lineage/src/observers/retrieval.ts`):

- the bytes returned, chunked and hash-chained on arrival, so damage is local
  and a dead transfer still attests the part that arrived;
- the URL requested **and** the URL that answered, with the redirect chain
  between them, kept as separate facts;
- status, content-type, and the **TLS certificate chain** — the one place in
  this entire system where a third party's signature enters the record;
- `server_date` recorded as *the origin's claim about the time*, never as
  evidence of when anything happened;
- `complete: true|false`, stated explicitly, never inferred from the absence of
  an error;
- all of it signed per event, with the level of attestation recorded at capture
  time and reported by what can be substantiated rather than what is claimed.

And it states its own limits in words that travel inside the record: it does
not assert the content is true. *A page can lie, and this records the lie
exactly.*

## 3. The gap: the model does not see the raw

**A signed copy of the raw bytes is necessary and not sufficient.**

Between a retrieval and a context window there is almost always a transform —
HTML to text, boilerplate stripping, truncation to fit a budget, chunking for
embedding, template wrapping. If the raw is signed and something else is handed
to the model, the receipt proves provenance for bytes nobody processed.

That failure mode has already occurred once in this work, in a different guise:
a clip's file and its ledger agreed with each other perfectly while both
silently omitted the end (`2026-08-10-spyglass-video-lineage.md` §4.1).
Self-consistency is not completeness. A signed raw and an unrecorded transform
is the same shape of error.

So the chain has to continue past the observation:

```
observation head        the bytes the endpoint returned
  → derivation          named transform + version, digest of its output
  → context assembly    which segments, in what order, digest of the prompt
  → invocation          model, parameters, and the context digest it was given
```

Each link is a lineage event, signed, parent-linked to the one before. The
claim then becomes checkable end to end: *this model, at this time, was given
exactly these bytes, which derive by this named transform from this endpoint's
response.*

Two properties this needs, both learned already:

- **Derivations must be deterministic and versioned.** A transform that cannot
  be re-run to the same digest cannot be checked, only believed. Where a
  transform is genuinely non-deterministic, that must be recorded as a property
  of the derivation rather than hidden.
- **Truncation is a derivation, not an accident.** "The first 8000 tokens" is a
  transform with a name and a digest. If truncation is invisible, the receipt
  claims the model saw a document it saw a fragment of.

## 4. Sole ingress: current state

**Measured, 10 Aug 2026.** Outbound HTTP call sites per service
(`fetch(`, `axios.`, `http(s).request(`):

| service | sites |
|---|---|
| integrations | 38 |
| assistants | 20 |
| models | 7 |
| logging | 5 |
| network | 5 |
| catalog | 4 |
| messaging | 3 |
| runtime | 2 |
| identity | 1 |
| directory | 0 |

**Observation:** 85 outbound call sites across ten services.
**Not measured:** what fraction reach the public internet rather than a sibling
service. `fetch()` is used for both and grep cannot tell them apart. The
inference that "85 sites reach the web" would be wrong; the supportable
statement is that there is **no chokepoint** through which web access passes.

**Also measured:** the runtime's builtin components are
`io.passthrough`, `io.collect`, `io.log`, `transform.map`, `logic.filter`,
`logic.switch`, `compute.arithmetic`, `io.delay`. **There is no HTTP
component.** A graph cannot currently fetch a URL at all — web access happens
inside services, beneath the graph layer. That is convenient for this design:
adding `symbia.io.retrieve` as the only web-reaching component starts from
zero, with nothing to migrate at the graph level.

## 5. Enforcement, ranked by how hard they are to bypass

The rule this project keeps returning to: *a shortcut the platform does not
resist is a finding about the platform.* Convention is not enforcement. These
are ordered by what happens when someone takes the shortcut anyway.

**1. Network egress control.** Service containers get no route to the public
internet; only the retriever does. A direct `fetch()` to the web **fails**.
This is the only option on the list where the shortcut does not silently work,
and it is the only one that survives an author who did not read the rule. Cost:
real network configuration, and it complicates local development, where
everything currently shares a host.

**2. A single outbound client library.** All services call
`@symbia/retrieve` instead of `fetch`. Cheap, and it makes the honest path the
easy one. Bypassing it is a one-line import away, so it constrains carelessness
and not intent.

**3. Lint / CI ban on direct fetch outside the retriever.** Catches new code at
review time. Says nothing about code already written and nothing about runtime.

**4. Documentation.** Records the intent. Enforces nothing. Listed only
because it is what most systems actually have.

A defensible combination is 2 + 3 now and 1 when the appliance work makes
network topology a thing this project controls rather than borrows — the
appliance doc already argues the box is where enforcement stops being advisory
(`2026-08-09-appliance-hardware-intent.md`).

## 6. Cost

**Measured, 10 Aug 2026**, on this machine:

| operation | rate |
|---|---|
| sha256 | 2,488 MB/s |
| ed25519 sign | 33,470 sig/s (30 µs) |
| canonical serialization of an event | 419,524 ev/s (2.4 µs) |
| full per-64 KB-chunk cost | 60 µs → ~1 GB/s ceiling |

A 200 KB page: 4 chunks, 6 events, 5.1 KB of ledger — **2.6% overhead**,
verified byte-for-byte against the stored content.

The cryptography is not the expensive part and never was. The expensive parts
are storage of bodies and the discipline of routing everything through one
door.

**Storage.** Observations are content-addressed by chain head, so the same page
fetched by ten graphs stores one copy. The ledger is ~2.6% of the content,
which means ledgers can be retained effectively forever while bodies expire on
a retention policy: *the proof of what was processed outlives the copy of it*.
A ledger without its body still verifies its own chain, still names the
endpoint, and still says what was asserted — it simply cannot be re-read.

## 7. What this does not solve

Listed because the value of the record depends on nobody overstating it.

- **It does not make content true.** A signed observation of a page of
  falsehoods is a faithful record of falsehoods. This is already in the claim
  vocabulary and should stay in any UI that surfaces it.
- **It does not prevent prompt injection.** A signed hostile page is still a
  hostile page, and sole ingress does not filter it — it records it. The value
  is forensic: after an incident you can prove exactly what text reached the
  model. Treating provenance as a safety control would be a category error.
- **It does not prove the model attended to the context.** It proves what the
  model was *given*. What it did with it is a different question, and the
  provenance arenas (COMPUTED / RETRIEVED / COMPOSED / REFUSED) are the tool
  for that, not this.
- **It does not survive a compromised retriever.** An instrument that has been
  tampered with signs whatever it fetched, faithfully. This is the same limit
  the spyglass has, and it is what the hardware root of trust in the appliance
  doc is for.
- **An observation is of a response, not of a page.** Personalization, geography
  and A/B assignment mean the same URL may never return the same bytes twice.
  The record must not be read as "this is what that page says" — only as "this
  is what that endpoint returned to us, then".
- **TLS binds a name, not an intent.** A valid certificate for a hostile
  lookalike domain is still valid.

## 8. Predictions to register before building

To be committed before measuring, per MAP:

| # | Prediction |
|---|---|
| S1 | Adding `symbia.io.retrieve` as a builtin component requires no change to the Observation primitive, as the retrieval observer did not. |
| S2 | Content-addressing by chain head deduplicates repeat fetches of the same URL within a session at above 50% for typical graph runs. |
| S3 | An end-to-end chain — observation → derivation → context → invocation — verifies from the ledger alone, with the model's context digest reproducible from the stored body. |
| S4 | **The one expected to break.** HTML-to-text extraction will prove non-deterministic across library versions, so a derivation re-run months later will not reproduce its recorded digest. If so, derivations must pin the transform version in the record and re-verification must be scoped to a pinned toolchain rather than assumed reproducible. |

## 9. Decisions still open

- Whether the derivation chain lives in `@symbia/lineage` alongside
  observations, or in the assistants engine next to the existing provenance
  envelope.
- Whether the existing envelope moves to asymmetric signatures at the same
  time. It currently seals with `sha256(canonical body ‖ shared secret)`, the
  secret defaulting to a literal committed to this repository — forgeable by
  any holder, unverifiable by anyone else, and unable to say which service
  sealed it. Logged separately; it is a live weakness, not a new design.
- Where bodies are stored. Logging's object store is the natural home;
  observations are instances and must not become catalog resources.
