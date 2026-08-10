# @symbia/crypto — custody for everything a system takes in and puts out

*Positioning paper. 10 August 2026, Symbia Labs.*

*Status is marked throughout: **built** means running and verified, **designed**
means specified and not implemented, **intended** means a direction with no
commitment. Comparisons to other work were checked against their specifications
rather than recalled; sources at the end.*

---

## 1. Position

A system that reasons over material it did not author has two questions to
answer about every artifact it touches:

- **Ingress** — how did these bytes get here, and are they still the bytes that
  arrived?
- **Egress** — what did this system emit, on whose authority, derived from what?

Most systems answer neither. Some answer the first with a citation, which is a
*reference* rather than a *receipt*: a URL in a footnote does not establish that
the URL was fetched, that the fetch succeeded, or that what came back is what
was read.

`@symbia/crypto` and `@symbia/lineage` provide the substrate for answering both,
identically, for every source and every sink — a screen capture, an uploaded
file, a fetched page, a reply returned to a user, an action taken in a facility.
The commitment is that **provenance is a property of the boundary, not of a
media type**, and that the same record shape and the same cryptographic strength
apply wherever the boundary is crossed.

## 2. What is actually in the box

**`@symbia/crypto` — primitives. Built.**

RFC 8785 canonical JSON; SHA-256; ed25519 identity where the id is derived from
the public key, so it cannot be claimed by a non-holder; signing and
verification over whole canonical documents; durable service identity loaded
once at process start.

Deliberately small. It exists so that nothing in the platform has to grow its
own. The alternative is what this codebase contained before today in more than
one place: a digest over a shared secret. That detects accidents. It cannot be
checked by anyone who does not already hold the secret, and anyone who holds it
can forge — so it is not evidence, it is a checksum with ceremony.

**`@symbia/lineage` — the record. Built.**

A hash chain, an `Observation` primitive, an attestation vocabulary, and a
claims vocabulary. `chain(n) = sha256(chain(n-1) ‖ digest(n))` over content
chunks, with one append-only, parent-linked, signed event per chunk, following
the GKS Lineage primitive: immutable, ordered, identity-scoped, verifiable, and
**non-epistemic** — the ledger carries digests, byte counts, offsets and
geometry, never content. It can be published precisely because it cannot leak
what it describes.

## 3. Sources and sinks are the same shape

An **Observation** is anything entering. A **Emission** is anything leaving.
They share the record and differ only in what they claim.

| boundary | kind | claim |
|---|---|---|
| ingress | `capture` | this instrument framed a region of a display and captured these bytes from it — **built** |
| ingress | `retrieval` | this endpoint returned these bytes to this instrument, over this transport — **built** |
| ingress | `upload` | this instrument received these bytes from this principal — **designed** |
| egress | `reply` | this system emitted this text, derived from these observations — **designed** |
| egress | `action` | this system issued this instruction to this actuator, under this authority — **intended** |
| egress | `publication` | this system wrote these bytes to this destination — **intended** |

The egress side matters more than it first appears, and it is where this differs
most from provenance work aimed at media or software artifacts. In a platform
that takes actions — a control setpoint inside a facility, a message sent, a
row written — the interesting question is not only *what informed this* but
*what did we do, and can we still show it a year from now*. An emission record
parent-links to the observations that fed it, so the receipt for an action
reaches back through the derivation to the moment the bytes entered.

**Not built.** Only the two ingress observers exist today. The symmetry is a
design commitment, and stating it as anything more would be the exact error this
system is built to prevent.

## 4. Six commitments, and why each one

These are the parts that are load-bearing. Most were forced by a defect.

**The claim travels inside the record, including what it does not assert.**
Every observer produces a record of identical cryptographic strength, and they
assert entirely different things. A capture asserts an act of observation — it
says nothing about whether the screen showed the truth. An upload asserts
**receipt**, and can never assert that a file is genuine: a signed record of a
forged document is a faithful record of a forged document. A retrieval asserts
what an endpoint returned, and nothing about whether the page is true. A single
"verified" badge across all three would be false while every hash in the system
was sound. So `asserts` and `does_not_assert` are fields, in words, in the
artifact.

**Attestation is three-valued, and reported by what can be substantiated.**
`unsigned` / `self-attested` / `attested` / `hardware-attested`, recorded at
capture time. "Signed" and "trusted" are different claims and collapsing them is
how a pseudonym gets read as an identity. A verifier reports what it can
*substantiate*, never what the record claims about itself — a forged `attested`
reports as `self-attested — not substantiated`, with the claim printed
separately.

**Non-retroactivity is arithmetic, not policy.** Importing a trust anchor must
not bless records made before it. Rather than enforce that in a verifier,
rotation generates a *new* key and the anchor certifies only that one, so
earlier records were signed by a key the anchor says nothing about. Nothing —
not the tool, not the verifier, not a hostile party holding the anchor — can
raise them.

**Content is chunked and chained, not hashed once.** A single digest over a
whole artifact is binary: one flipped byte and you know only that something is
wrong. Chained chunks localise damage, so a corrupted record degrades to a
shorter trustworthy record rather than to nothing, and a stream that dies
half-way still attests what arrived.

**Completion is stated, never inferred.** A truncated transfer and a finished
one otherwise produce identical-looking ledgers. Sealing takes an explicit
`complete` flag, because "it stopped" must never read as "it finished".

**Signatures cover whole canonical documents.** Not a body, not a chain value.
Signing a subset leaves the rest rewritable — including, in an early version of
this work, the attestation level itself.

## 5. The spyglass, as one embodiment

A native capture instrument: a ring floating over the whole desktop, capturing
real pixels from any application. It is a good demonstration precisely because
it is the *least* general case — if the primitive fits a video recorder with a
microphone, it fits a file upload.

A clip is a directory:

```
clip-0c29f317625a5096/
  clip.webm      147,111 bytes
  audio.webm      26,428 bytes
  lineage.jsonl    5,148 bytes
```

Video and audio each carry their **own chain**, and the close event binds the
heads:

```
binding = sha256( "audio" ‖ head_audio ‖ "video" ‖ head_video )
```

Which buys the property worth having: **you can release the video, withhold the
audio, and still prove the audio belonged to that capture.** Verified by
deleting `audio.webm` and re-running the verifier, which reports the video
complete, the binding confirmed, and the audio *withheld* rather than missing.

The parts are not media. A "track" is a named chain, and `TRACK_FILES` mapping
ids to filenames is the entire coupling to media. The same structure gives
per-part disclosure over a document set, a multi-party recording where one
speaker consented and another did not, or the source set behind a model's
context.

Measured cost: SHA-256 at 2.5 GB/s, ed25519 at 30 µs a signature, canonical
serialization at 2.4 µs an event, 2.6% ledger overhead on a 200 KB retrieval.
Cryptography is not why systems lack provenance.

## 6. Relationship to existing work

Stated carefully, because an earlier draft of this argument overclaimed against
C2PA and had to be retracted.

**C2PA / Content Credentials** answers *how was this asset made* — captured,
edited, generated — and binds a manifest to an asset through hard bindings. Its
redaction mechanism removes **assertions** from a manifest, replacing JUMBF
content boxes with zeros and recording the removal in `redacted_assertions`,
with action assertions protected from redaction entirely. That is redaction of
*metadata about an asset*. What is described here is withholding an entire
**content stream** while retaining proof that it belonged to the same capture.
Different question, different mechanism, and largely complementary: an asset
leaving this system could carry C2PA credentials while its arrival is recorded
here.

**in-toto / DSSE / SLSA** is the closest structural analogue. An in-toto
Statement binds a Subject (artifacts, by digest) to a Predicate (typed payload),
carried in a DSSE envelope. The layering is the same instinct as ours, and
adopting DSSE as an envelope for observation records is a live option worth
evaluating rather than a settled decision. The difference is domain and time:
in-toto attests **build-time** steps in a software supply chain; this attests
**runtime** custody of material entering and leaving a reasoning system.

**IETF SCITT** provides what we deliberately do not: a transparency service that
registers signed statements on an append-only, cryptographically verifiable
ledger, performing a notarization role before recording. Our records are
self-verifying and offline-checkable, with the public key travelling in the
record; there is no registry, so we cannot answer "was this statement ever
withdrawn" or offer third-party notarisation. SCITT is the natural complement,
and registering emission records with a transparency service is the obvious
route to non-repudiation. **Intended, not built.**

**W3C PROV-O** is the established domain-agnostic model for entities,
activities and agents — deliberately a meta-model that leaves verification
semantics to the consuming domain, with extension points for exactly that. Our
records are a substrate PROV could describe; PROV is not an alternative to
them.

**LLM audit-trail and agent-provenance work** (2026) is converging on typed
graphs connecting evidence, tool calls, memory and final actions, and on the
observation that evidence can be relevant without being *authorized* to
determine a decision. That is the same concern arriving from the agent side. The
gap we would claim is at the boundary: those systems generally begin at the
point where content is already inside, and inherit whatever custody the ingress
path happened to provide.

## 7. What this does not do

- **It does not make content true.** A signed observation of a page of
  falsehoods is a faithful record of falsehoods.
- **It does not prevent prompt injection.** A signed hostile page is still
  hostile. The value is forensic — after an incident you can prove exactly what
  reached the model. Treating provenance as a safety control is a category
  error.
- **It does not prove a model attended to what it was given.** It proves what
  was *given*.
- **It does not survive a compromised instrument.** A tampered instrument signs
  whatever it captured, faithfully. This is what a hardware root of trust is
  for, and it is why the attestation levels go up to `hardware-attested`.
- **An observation is of a response, not of a source.** Personalisation and
  A/B assignment mean the same URL may never return the same bytes twice.
- **The raw is not what the model sees.** Extraction, truncation and templating
  sit between a retrieval and a context window. Signing the raw while handing
  the model something else proves provenance for bytes nobody processed. The
  derivation chain that closes this is **designed, not built**, and is the most
  important open item.

## 8. Open

- **Role binding.** A key proves a *holder*. It cannot prove which service or
  machine it belongs to — the same key asserting a different role keeps the same
  id. Records therefore carry `role_claimed`, unverified. Binding requires an
  issuer, and that decision is deliberately unmade.
- **Sole ingress.** The guarantee is only as good as the claim that nothing
  bypasses the observer. Enforcement ranked by what happens when someone takes
  the shortcut anyway — only network egress control makes a direct fetch *fail*
  rather than silently succeed.
- **Transparency registry.** Self-verifying records answer integrity and
  attribution, not withdrawal or notarisation.

---

## Sources

- [C2PA Technical Specification 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) — manifests, hard bindings, redaction of assertions
- [C2PA Technical Specification 2.2 (PDF)](https://spec.c2pa.org/specifications/specifications/2.2/specs/_attachments/C2PA_Specification.pdf)
- [An Architecture for Trustworthy and Transparent Digital Supply Chains (IETF SCITT)](https://datatracker.ietf.org/doc/draft-ietf-scitt-architecture/) — transparency services, signed statements, notarisation
- [scitt.io](https://scitt.io/)
- [SLSA — Software attestations](https://slsa.dev/spec/v1.0/attestation-model) — Statement, Subject, Predicate, DSSE envelope
- [in-toto and SLSA](https://slsa.dev/blog/2023/05/in-toto-and-slsa)
- [PROV-O: The PROV Ontology (W3C)](https://www.w3.org/TR/prov-o/)
- [From Agent Traces to Trust: Evidence Tracing and Execution Provenance in LLM Agents](https://arxiv.org/html/2606.04990v1)
- [Auditing Provenance Sensitivity in LLM Agent Action Selection](https://arxiv.org/abs/2607.20827v1)
