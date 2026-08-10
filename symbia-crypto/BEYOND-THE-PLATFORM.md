# The boundary is already there

## @symbia/crypto and @symbia/lineage outside Symbia, with nginx as the worked example

*Sketch, 10 August 2026, Symbia Labs. Nothing here is built. This is an argument
and a design, written to be argued with. Prior art was checked against primary
documentation rather than recalled; sources at the end.*

---

## 1. The observation

Every architecture already has the thing this needs.

A reverse proxy sits exactly where material enters and leaves a system. Every
request crosses it. Every response crosses it back. It already terminates TLS,
so it already knows who it talked to. It already writes a log line for each
transaction. And that log line is the weakest artifact in the building: a
mutable text file, on a host the operator controls, describing events only the
operator witnessed.

The libraries built for Symbia do not depend on Symbia. `@symbia/crypto` is
serialization, hashing and signing. `@symbia/lineage` is a chained, signed
logbook with an explicit vocabulary for what a record does and does not claim.
Neither knows what a graph is, what an assistant is, or what a capture is. Point
them at a proxy and the proxy becomes the instrument.

## 2. What "nginx with this overlaid" would mean

Concretely: a module at the edge that, for each transaction, writes a signed
line to a logbook instead of an unsigned line to `access.log`.

Per request it would record what nginx already has:

- method, path, status, timing, upstream chosen, bytes each way
- the TLS session — cipher, and the client certificate if there was one
- **content digests**, chunked, for the request body and the response body
- the identity of the node that handled it, derived from its own key
- a running total folding in every transaction before it

The proxy signs each line with a key that never leaves the node. The result is
an `access.log` you cannot quietly edit: change any earlier line and every line
after it stops adding up, and a line removed is a break at the point of removal.

Three properties come along without extra work.

**The logbook holds no bodies.** It records fingerprints and sizes, not
payloads. At the ~2.6% overhead measured on real traffic, a year of proof costs
almost nothing to keep, and it can be handed to an auditor who is not cleared to
see the traffic it describes. Retain the logbook for seven years; retain bodies
for thirty days.

**A body can be produced later and checked against the record.** If the bodies
*are* archived, any single one can be pulled out and matched to its fingerprint
without producing the rest — the selective-disclosure property, applied to
traffic rather than to media tracks.

**Truncation is visible.** A stream that died mid-response seals with
`complete: false` and a reason. An `access.log` cannot tell you the difference
between a response that finished and one that stopped.

### The unglamorous engineering

Body capture at the edge is the expensive part and the literature is blunt about
it. In OpenResty, `body_filter_by_lua` can stream response chunks without
buffering the whole body, and practitioners warn that logging bodies wholesale
is costly. In njs, capturing response bodies has been an open pain point. So the
honest design is:

- hash **streaming**, never buffer — the chunked chain was built for exactly
  this, and hashing at 2.5 GB/s is not the bottleneck;
- make body capture **policy, per route** — digest everything, archive selected
  paths;
- treat signing cost as per-transaction, not per-chunk, at high request rates —
  30 µs a signature is 33,000/s per core, which is fine for an API and not fine
  for a CDN edge, where the answer is to sign a batch and accept that the
  granularity of recoverable evidence follows the batch.

## 3. Prior art, honestly

This idea is not new, and two of its parts are shipped products. What follows is
where this sits relative to them.

**AWS CloudTrail log file integrity validation.** The closest existing thing,
and it is good. CloudTrail hashes each delivered log file, writes an hourly
digest file referencing those hashes, signs the digest with a regional RSA key,
and **each digest includes the signature of the previous digest** — a genuine
hash chain over log files, with `aws cloudtrail validate-logs` to check it.

What differs is granularity and scope. CloudTrail chains *files, hourly*; the
recoverable unit after damage is an hour. The design here chains *transactions,
as they happen*. CloudTrail records API calls to AWS, not the bodies crossing
your own edge, and its keys are the provider's — you are verifying that AWS
delivered what AWS says it delivered. At the edge, the signer is the node you
run. Both are useful; they answer different questions, and the second one is
available to anyone who is not on AWS.

**Schneier–Kelsey forward-secure audit logs, and the line after it.** The
foundational work: hash chains plus key evolution, so an attacker who
compromises a host cannot forge entries dated before the compromise, because the
key that would have signed them has been destroyed. Documented limitations
include O(n) verification from re-derived keys, key-lifecycle complexity on
constrained devices, and vulnerability to truncation where there is no single
authentication tag over the whole body.

**This design does not have forward security, and should say so plainly.** An
attacker who steals the node key can produce a *new* chain from any point, and
nothing in the current scheme prevents it. What it does have: signatures are
asymmetric, so verification does not require the signing secret and any third
party can check without being able to forge — which is the property
Schneier–Kelsey's MAC-based scheme lacks. Adding key evolution is compatible
with the design and is the obvious hardening. **Not built, and not claimed.**

**Certificate Transparency and IETF SCITT** solve the part deliberately left
out: a *witness*. Self-verifying records answer "was this altered". They cannot
answer "was this entry ever shown to anyone else", which is what stops an
operator from keeping two consistent logbooks and showing whichever suits.
Publishing periodic chain heads to a transparency service closes it, and is
where this would go next.

## 4. Why bother, if CloudTrail exists

Four reasons, in decreasing confidence.

**It is not tied to a provider.** An nginx module works on a laptop, in a
colocation rack, on someone else's cloud, and on a machine in a substation with
an intermittent uplink. The record is self-contained: the verifying key travels
inside it, so a logbook can be checked years later with no service running, no
account, and no vendor.

**It records what crossed, not just that something crossed.** Content digests
put the payload inside the guarantee. An access log tells you a `POST` to
`/orders` returned 200; a signed digest tells you *which* order body it was, and
lets a disputed one be matched later.

**The claim vocabulary transfers.** A proxy record asserts *this endpoint
received these bytes from this client and returned those bytes* — and asserts
nothing about whether the client was who it claimed, whether the payload was
truthful, or whether the upstream behaved. Writing that into the record is what
stops a signed log from being read as a proof of correct behaviour. It is the
same discipline as the media case: the strength of the cryptography says nothing
about the breadth of the claim.

**The verifier is not privileged.** A few hundred lines of arithmetic, no
network, no service, no model. Anyone can write their own from the record
format, and if it disagrees with ours, one of us has a bug. That property is
worth more than any feature: it means a counterparty does not have to trust our
tooling, only the mathematics.

## 5. Where else the same shape fits

The proxy is the clearest case because the boundary is already a box you can
point at. The same overlay applies wherever something crosses an edge and
somebody may later dispute it:

- **A message broker** — a signed record of what was published to a topic, by
  whom, in what order, without retaining payloads.
- **A file drop or SFTP endpoint** — receipt of exactly these bytes from this
  counterparty at this time, which is a contract question rather than a
  security one.
- **An ETL boundary** — what arrived from the vendor feed before your
  transformations touched it, which is the argument nobody can settle six months
  later.
- **A device gateway** — telemetry from constrained sensors, where the chunked
  chain means a gateway losing power mid-batch still attests what it wrote.
- **An egress filter** — what left, under whose authority, which is the ALPR
  question and also the data-exfiltration question.

## 6. What would have to be true

Before any of this is more than a sketch:

1. **Measured overhead at realistic request rates**, not the 2.6% figure from a
   200 KB page fetch. A benchmark against plain `access.log` is the first
   deliverable and the first chance to be wrong.
2. **A record format specified independently of the implementation**, precise
   enough that a second party writes a verifier from the document alone. Until
   someone does, "anyone can write their own" is a claim rather than a fact.
3. **A decision on key custody.** A key on the node is only as good as the node.
   The path to hardware-backed keys exists in the attestation levels and stops
   there.
4. **A witness.** Without one, an operator can maintain two consistent logbooks.
5. **Forward security, or an explicit statement that it is absent.** Currently
   absent. Currently unstated anywhere but here.

## 7. Verdict

**Build it. Second, not first. As a demonstration, not a product.**

**Why build it.** It is the cheapest strong evidence that the record format is
general rather than a shape left over from a video recorder. A proxy is about as
far from a screen-capture instrument as you can get and still be at a boundary,
and if the same record works there without changing the primitive, the
generality claim is earned rather than asserted. That is worth more to this work
than any feature, because every argument in the positioning paper depends on it.

**Why not first.** An independent implementation of the record format in another
language is worth more, and costs less. If someone can write a verifier from the
specification alone and it agrees with ours on a set of conformance vectors,
then "the record is the authority, not the tool" stops being a slogan. The nginx
integration proves the format travels across *domains*; a second implementation
proves it travels across *implementers*, which is the harder and more important
claim. Do that one first.

**Why not a product.** Anyone who needs signed edge logs badly enough to pay for
them is in a regulated industry buying from vendors with certifications and
support contracts, and much of that need is already partly served — CloudTrail
for AWS estates, WORM storage and SIEM tooling elsewhere. A library from a small
shop does not win that on merit. It wins nothing by trying.

**What it is instead:** a reference integration that makes the format credible,
and a genuinely useful thing for anyone who wants it, given away. The commercial
value of this work is not the proxy module. It is that a platform whose
provenance core is small, open and independently verifiable is easier to believe
than one whose provenance is a private feature.

### 7.1 Two tiers, chosen by the use case rather than by the budget

The cost question is not one decision. It is two deployments, and conflating
them is what made an earlier draft of this section read as a risk.

**Metadata tier.** Record what crossed and when — method, path, status, timing,
sizes, peer, TLS session — chained and signed, with no body digesting at all.
This is cheap at any request rate and it answers the questions general-purpose
operators actually have: did this call happen, in what order, against which
upstream, and has the log been edited since. It does not answer what was in the
payload, and does not pretend to.

**Content tier.** Digest request and response bodies, chunked and chained, so a
specific payload can be produced later and matched. This is what investigative,
forensic, contractual and regulated capture require, because in those settings
the dispute is *about the content* — which order was submitted, what the vendor
feed actually sent, what left the building.

The important part: **need and cost run in opposite directions.** The
high-volume paths where digesting would hurt — static assets, health checks,
chatty internal APIs — are precisely the paths where metadata is sufficient. The
paths where content digesting is indispensable are low-volume and high-value per
transaction: a payment submission, an evidence upload, a control instruction, an
export to a third party. A CDN edge at 50,000 requests a second does not need
body digests. A case-management system taking two hundred uploads a day does,
and will never notice the cost.

So the benchmark in §6 does not decide whether the design survives. It locates
the line between the two tiers, and per-route policy is how an operator sits on
both sides of it at once.

**This split is not new here.** It is the shape of the Canonical Event Bus
(`~/vscode/canonical-event-bus`), and reading that back confirms the two tiers
were an architectural position long before today's benchmark suggested them.
Its README states the rule outright:

> Decisions are CEG-only (no payload fetch, no retrieval).

That is the metadata tier as a *constraint* rather than an optimisation —
decisions are made from a small, hash-chained, append-only log and its
rebuildable projections, and reaching for a payload is a separate, deliberate
act. Three other properties there are the same ones arrived at independently in
this work: the log is authoritative while projections are derived and can be
deleted and rebuilt to prove it; `/ceg/audit` checks chain integrity as a
first-class operation; and a stale projection produces `escalate` rather than a
guess, which is *blank beats green* implemented years before it was named.

The convergence is worth stating plainly because it is evidence about the
design rather than a nice coincidence. Two attempts at the problem, from
different directions and different decades of the same person's work, produced
an authoritative chained structural record with payload access as a distinct
lane. That is a reason to treat the split as load-bearing rather than as a
performance compromise.

### 7.2 What would still change my mind

- **If the metadata tier cannot run at line rate.** Unlikely — it is a hash and
  a signature over a few hundred bytes — but unmeasured, and everything else
  rests on it.
- **If the content tier cannot hit acceptable throughput even at investigative
  volumes.** If digesting a 10 MB evidence upload is meaningfully slower than
  storing it, the tier is theoretical.
- **If no witness ever gets built.** This one stands unchanged and is the more
  serious of the three. Without one, the record proves *unaltered* but not
  *complete*: an operator can keep two internally consistent logbooks and
  produce whichever suits. That is good enough for internal assurance and weak
  as external evidence — which, for the forensic tier, is the entire point. The
  first two are benchmarks. This one is a decision.

---

## Sources

- [Validating CloudTrail log file integrity (AWS)](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html)
- [CloudTrail digest file structure](https://docs.amazonaws.cn/en_us/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-digest-file-structure.html) — chained digests, SHA-256 with RSA
- [Custom implementations of CloudTrail log file integrity validation](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-custom-validation.html)
- [Efficient Data Structures for Tamper-Evident Logging (Crosby & Wallach, USENIX Security '09)](https://www.usenix.org/legacy/event/sec09/tech/slides/crosby.pdf)
- [Tamper Detection in Audit Logs (VLDB 2004)](https://www.vldb.org/conf/2004/RS13P1.PDF)
- [A New Approach to Secure Logging (Ma & Tsudik)](https://eprint.iacr.org/2008/185.pdf) — truncation attacks, forward-secure schemes
- [An Architecture for Trustworthy and Transparent Digital Supply Chains (IETF SCITT)](https://datatracker.ietf.org/doc/draft-ietf-scitt-architecture/)
- [Configuring Logging | NGINX Documentation](https://docs.nginx.com/nginx/admin-guide/monitoring/logging/)
- [njs reference](https://nginx.org/en/docs/njs/reference.html)
- [Unable to log response body using NJS (nginx/njs #823)](https://github.com/nginx/njs/issues/823)
- [Logging response bodies with OpenResty `body_filter_by_lua`](https://forum.openresty.us/d/4706-d350a507cf9d87940e4911986b67ee09)
