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

> **Unsettled — the framing above, not the substance.** "A property of the
> boundary, not of a media type" has not survived first reading. Two likely
> reasons, recorded so the next attempt is better aimed. It is a *negative*
> definition, saying what this is not rather than what it is. And the thing it
> denies — that provenance belongs to media — is an objection nobody raised;
> it entered this work because the first implementation happened to be a video
> recorder, so the headline is answering a question the reader never asked.
>
> Candidates for the positive form, none adopted: *the record attaches to an
> act, not to an artifact* — C2PA describes an object's history, this describes
> an event of custody; or plainly, *every time something enters or leaves, the
> same receipt gets written, whatever the something is*. Left open deliberately.
> A positioning paper whose central sentence does not land is not finished, and
> replacing one abstraction with another would hide that rather than fix it.

## 2. What is actually in the box

**`@symbia/crypto` — the signing pen and the seal. Built.**

Two jobs. It writes a document down the *same way every time*, so that two
people who each have a copy can agree, byte for byte, on what the document says
— which sounds trivial and is the part most systems get wrong. And it signs
that document with a key only the signer holds, so anyone can check the
signature and nobody else can produce one.

A signer's name is worked out from its own key. You cannot take someone else's
name without taking their key, and you cannot make up a name for a key you do
not have. Nobody issues the names and nobody can hand one out twice.

The key is made once, the first time something starts up, and kept. A new key
every morning would mean a new stranger every morning, and none of yesterday's
signatures would mean anything today.

*Under the hood, for those who want it: RFC 8785 canonical JSON, SHA-256,
ed25519, and signatures that cover a whole document rather than any part of it.*

The usual alternative is a **shared secret** — a checksum both sides compute
using a password they both know. It is a wax seal whose stamp is kept in the
drawer everyone uses. It will catch a file that got corrupted in transit. It
will not survive anyone asking the only question that matters in a dispute:
*could the people showing me this have made it themselves?* They could. And
nobody outside the organisation can check it at all, because checking requires
the stamp, and holding the stamp means you could have pressed it.

**`@symbia/lineage` — the logbook. Built.**

A running record of what passed through, written a line at a time as it
happened. Each line carries a fingerprint of one piece of content, plus a
running total that folds in every line before it:
`chain(n) = sha256(chain(n-1) ‖ digest(n))`. Change any earlier line and every
line after it stops adding up — which is how you can tell that a page was torn
out of a logbook rather than merely suspecting it.

Lines are only ever appended, never revised, each one signed and pointing back
at its parent. Following the GKS Lineage primitive, the logbook is
**non-epistemic**: it records fingerprints, sizes, offsets and where a thing
came from — never the content itself. Reading the whole logbook tells you
exactly what passed through, in what order, and shows you none of it. That is
why it can be handed to a regulator, a court or a counterparty who is not
allowed to see the material it describes.

## 3. Sources and sinks are the same shape

An **Observation** is anything entering. An **Emission** is anything leaving.
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
most from provenance work aimed at media or software artifacts. When a system
takes an action — changes a setpoint in a facility, sends a message, writes a
row — three questions can be asked about it afterwards: **what did it do, who
authorised it, and what was it working from?**

Those questions are almost never asked on the day. They arrive months later,
when a machine has failed and an insurer is disputing the claim, when a
regulator audits a period, or when someone's lawyer asks why an automated system
did what it did. By then the people who were there have moved on, the dashboards
have rolled over, and all that remains is whatever got written down at the time
— usually a log line that the operator's own team could have written yesterday.

An emission record points back at the observations it was derived from. So a
challenged action can be followed backwards, step by step, to the moment those
bytes entered the system — and by someone who does not trust the operator,
because every step in the path was signed by a key its holder cannot deny and
nobody else could have used.

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

**The verifier is not a model, and must never be one.** It is a 393-line script
that reads the files and does arithmetic: re-hash each chunk of the media,
recompute the running total, compare it to what the logbook recorded, check each
signature against the key travelling in the record. There is no judgement in it,
no network call, and nothing to configure. Every check either adds up or does
not.

That matters more than it sounds. A verifier that *interpreted* a record — a
model reading it and forming a view — would reintroduce the problem the whole
design exists to remove: you would be trusting the reader instead of the
evidence, and two runs could disagree. Verification here is closer to balancing
a ledger than to reviewing a document.

It follows that the verifier is not privileged, and this is the real test.
Anyone can write their own from the specification in a few hundred lines, and if
theirs disagrees with ours, one of us has a bug — the record is the authority,
not the tool. That was checked rather than assumed: a signature from one of
these clips was verified with `openssl`, given nothing but the public key lifted
out of the logbook, and it agreed. It also refused, as it must, when a single
bit of the signed value was flipped.

The parts are not media. A "track" is a named chain, and `TRACK_FILES` mapping
ids to filenames is the entire coupling to media. The same structure gives
per-part disclosure over a document set, a multi-party recording where one
speaker consented and another did not, or the source set behind a model's
context.

Measured cost: SHA-256 at 2.5 GB/s, ed25519 at 30 µs a signature, canonical
serialization at 2.4 µs an event, 2.6% ledger overhead on a 200 KB retrieval.
Cryptography is not why systems lack provenance.

## 6. Three domains where the boundary is the whole problem

These are illustrations of fit, not deployments. None has been built. They are
chosen because in each one the value of a record is decided at the boundary, and
because each stresses a different part of the design.

### 6.1 Asset monitoring, tracking and analysis

A condition-monitoring programme produces readings — vibration, temperature,
current draw, runtime hours — that are used to decide when a machine is
replaced, whether a warranty claim is honoured, whether a lease return is
disputed, and whether a regulatory report is true. The readings are ordinary
numbers. What makes them worth anything in a dispute is whether anyone can show
they came from that sensor, at that time, unaltered.

The parts of this design that carry the load here are the unglamorous ones. A
telemetry stream is a **chunked chain**, so a gateway that loses power mid-batch
still attests everything it wrote rather than invalidating a shift. `complete:
false` is the difference between "the machine was quiet" and "we stopped
listening" — two readings that look identical in every historian and mean
opposite things. And because the ledger is **non-epistemic**, it is roughly 2.6%
of the data volume and carries no readings at all: a plant can retain the proof
that a year of telemetry was intact long after expiring the telemetry, and can
hand a counterparty the ledger for one asset without exposing the rest of the
site.

The `attested` level matters commercially rather than technically. A
self-attested reading proves internal consistency; a reading signed by a key an
OEM or an inspection body certified is what changes a warranty conversation.

### 6.2 Criminal forensics

Digital evidence is admitted on a showing that it is what it purports to be, and
US practice has been converging on cryptographic hashes as the mechanism.
**FRE 902(13)** permits self-authentication of records generated by an
electronic process or system through certification rather than live testimony,
and **902(14)** does the same for a digital copy verified by hash value — the
Advisory Committee notes explicitly contemplate a qualified person certifying a
matching hash. SWGDE and NIST SP 800-86 supply the operational practice around
it.

Two properties here go beyond "we hashed the file".

**Damage does not destroy the exhibit.** A single digest over a recording is
binary — one corrupted byte and the whole item is impeached. A chained record
localises the break, so a partially damaged recording is still evidence for
everything before the break, and the break itself is provable and dated. In
practice, evidence degrades; a scheme that treats degradation as total failure
throws away recoverable truth.

**Disclosure without exposure.** The per-track binding is a redaction primitive.
A two-party recording where one party consented and another did not, a video
whose audio contains privileged material, an exhibit where one stream is
subject to a protective order — in each case you can produce one stream and
prove the withheld stream belonged to the same capture, at the same moment,
unaltered. Today's alternative is usually to produce everything or to produce a
re-encoded excerpt whose relationship to the original rests on testimony.

The limits are sharper here than anywhere else, and stating them is not
optional. This attests **custody**, never **truth**: it cannot show a camera
was pointed where it was claimed, that a scene was not staged, or that an
instrument was not compromised before it signed. It is the chain-of-custody
question, mechanised — not a substitute for the rest of the foundation.

### 6.3 ALPR, and the accountability problem

Automated licence plate recognition is the hardest case, and the most
instructive, because the technology's accountability failures in 2025–26 were
not failures of image capture. They were failures of **the record of who looked
and why**.

The reported pattern is instructive: an officer allegedly used an ALPR network
to stalk a former partner, and an internal-affairs detective assigned to
investigate that incident was later charged with using the same system to
surveil two people. Vendors have responded with audit tooling — Flock's Audit
Assistance surfaces searches for review, where auditing had been manual and
reactive — and legislatures have responded with registration and certification
regimes, such as Washington's SB 6002 requiring agencies to register ALPR
systems with the Attorney General. Civil-liberties organisations continue to
argue the systems should not be deployed at all.

The design point, held separately from the policy question: **an audit log
maintained by the party being audited is a weaker artifact than a signed,
chained record**, and the difference is exactly the one this substrate is built
on. A conventional audit table can be edited by an administrator, and a query
that was never logged is indistinguishable from a query that never happened. A
chained ledger makes deletion detectable — the chain breaks at the point of the
missing entry — and signing makes the record checkable by an oversight body that
does not trust the agency or the vendor.

This is the case where **egress attestation matters more than ingress**. The
plate read is the least interesting event. The consequential events are the
query, the hit notification, the sharing of a record with another agency, and
the action taken — each of which is an emission, each of which should carry the
authority it was issued under and parent-link to what it was derived from. A
system built this way could answer *which searches were run, by whom, under what
stated purpose, and what left this jurisdiction* in a way an oversight body
could verify independently. It would not have prevented the misuse. It would
have made it undeniable, promptly, and by someone outside the department.

And the honest tension, which belongs in the paper rather than in a footnote:
**the same properties that make a surveillance record accountable make it
durable.** A tamper-evident, non-repudiable ledger of who was seen where is a
more permanent artifact than a mutable database, and permanence is not neutral.
Nothing here decides whether such a system should exist, what it may retain, or
who may query it — those are policy questions, and this substrate answers none
of them. What it can do is make the answers checkable once they are chosen,
including by parties the operator would prefer could not check. A system whose
retention limits are enforced only by the operator's own tooling is asking for
trust; one whose deletions are provable is not.

## 7. Relationship to existing work

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

## 8. What this does not do

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

## 9. Open

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

**Use-case grounding**

- [Amendments to the Federal Rules of Evidence 2017 — Self-Authenticating Electronic Evidence (FJC)](https://www.fjc.gov/content/325216/amendments-federal-rules-practice-and-procedure-evidence-2017-self-authenticating) — FRE 902(13) and 902(14)
- [Self-Authentication of Electronic Evidence: New Rules 902(13)-(14)](https://www.txs.uscourts.gov/sites/txs/files/Self-Authentication%20of%20Electronic%20Evidence%20-%20New%20Rules%20-%20G.Joseph.pdf) — hash-value certification in the Advisory Committee notes
- [SWGDE published standards](https://www.swgde.org/documents/published-complete-listing/22-f-003-best-practices-for-remote-collection-of-digital-evidence-from-an-endpoint/)
- [EFF — investigations into Flock Safety, 2025 in review](https://www.eff.org/deeplinks/2025/12/effs-investigations-expose-flock-safetys-surveillance-abuses-2025-review)
- [ACLU — ALPR campaign](https://www.aclu.org/campaigns-initiatives/get-the-flock-out)
- [Flock Safety introduces Audit Assistance](https://www.securitysystemsnews.com/article/flock-safety-introduces-audit-assistance-tool-for-accountable-public-safety-technology)
- [MRSC — new restrictions on Flock and similar camera systems (WA SB 6002)](https://mrsc.org/stay-informed/mrsc-insight/april-2026/restrictions-flock-cameras)
