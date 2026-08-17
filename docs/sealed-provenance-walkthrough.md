# Sealed Provenance — t0 Walkthrough

**Purpose:** run the full certified-review loop on a clean machine, in a fresh conversation, with no prior context. Retrieve → certify → review → check → rework → seal, and then verify the seal proves what it claims.

**Opening prompt** (paste this into the new project's first message):

> Load symbia imagine and run the sealed provenance walkthrough in sealed-provenance-walkthrough.md. Follow it exactly as written — do not improvise your own version of the checks, and fill in the results table with what you actually observe.

**Rule for the agent running this:** you are the subject of the experiment, not its author. Register predictions before measuring, report broken predictions as broken, and never adjust a step after seeing its result. If a step cannot be completed, write `CANNOT BE MEASURED` and say why — a blank is worth more than a green you can't defend.

---

## Stage 0 — Attach, and confirm the checker can see red

**0.1** Call `symbia_selftest`. Record `mode`, the port, and the session actor.
*Expect:* `mode: "imagine"`, loopback 200. The port should be **ephemeral (5-digit, not 7717)** — that means this conversation owns its own host rather than sharing one.

**0.2** Call `symbia_stack_health`. Record healthy count.
*Expect:* ≥ 4 healthy including `runtime` and `catalog`. Services answering 404 on `/api/health` are known not to mount a health route — that is not a failure. `control-center` and `api` are genuinely not mounted in imagine.

**0.3** Call `symbia_list_components`. Find `symbia.canon.check-claims` and record its `meta`.
*Expect:* `controlStatus: "passing"`, `controlVectors: 4`.

> **This is the most important step in the walkthrough and it costs one call.** The checker carries four control vectors — one honest claim and three planted failures — and runs them at registration. If `controlStatus` is anything but `passing`, **stop**: every verdict that follows would be worthless, because a checker that cannot detect a planted failure returns PASS for everything and reads exactly like one that works.

---

## Stage 1 — Register predictions (before any retrieval)

**1.1** Write your predictions for stages 2–6 into the catalog as a context resource, via `symbia_call`:
`service: "catalog", method: "POST", path: "/api/contexts"`, body `{key, name, type: "context", tags: ["map","predictions"], content: {...}}`.

Predict at least: whether the fetched page digests will match the reference below; whether your first review draft will contain any indefensible claim; and one prediction you **expect to be wrong**. Aim that one at a *join between components*, not at a component itself — that is where this system actually fails.

*Known defect, not yours:* the catalog accepts the write and returns 201, then reads back with `content` absent. The certification is the **ledger position** of that write, not the catalog's copy. Note it and continue.

---

## Stage 2 — Retrieve through the witness layer

**2.1** Load a retrieval graph via `symbia_call` (`runtime`, POST `/api/graphs`) with three nodes: `symbia.io.passthrough` → `symbia.io.http-request` (config `{url, method: "GET"}`) → `symbia.io.collect`, plus an `error` edge to a second collect. Execute it (`post_graphs_id_execute`), then inject with `post_ingress_graphName_`.

Fetch this first, as a fixed anchor:
```
https://www.gao.gov/robots.txt
```

**2.2** Record the output's `lane` and `receipt`.
*Expect:* `lane: "apocryphal"` with a `witness` receipt — a digest of the bytes as received, the source URL, and `transport: "GET 200"`. Apocryphal is correct and is not a complaint: a remote body cannot be recomputed, only witnessed.

**REFERENCE ANCHOR A —** that file's sha256, dual-witnessed on 2026-08-17 by the imagine host and an independent local fetch:
```
38f284999fe48dfe3c7c1fc89600a2c65ed07066243f4224eb0e70845e140dcd
```
If your digest matches, you have byte-identical evidence with a run on another day. If it differs, the file changed — record both digests and carry on; a changed source is a finding, not an error.

**2.3** Now build the real corpus. Add a `symbia.transform.extract-text` node between the fetch and the collect, and retrieve these two documents (one graph each, or reuse with different config):
```
https://www.gao.gov/products/gao-26-108694
https://www.gao.gov/press-release/gao-reports-improper-payments-rose-estimated-186-billion-across-federal-government-fiscal-year-2025
```

Record for each: `algorithm`, output `sha256`, `chars`, and the receipt's `inputSha256` / `outputSha256`.

*Expect:* `algorithm: "strip-v1"`, lane tightened to `apocryphal` (the fetch was apocryphal; lanes only tighten), recipe receipt intact. **Note the size difference between the HTML fetched and the text emitted** — roughly 86,000 bytes in, roughly 8,000 characters out for the first document. The HTML never has to cross a transport boundary; that is the point of extracting host-side.

*If the fetch is blocked or the page has moved:* record it and substitute any two documents you can retrieve. The loop is the subject here, not these two files.

---

## Stage 3 — Certify the corpus, before reading it

**3.1** Load and execute a certify graph: `passthrough` → `symbia.canon.certify` → `collect` (+ error collect). Inject:
```json
{"slug": "t0-canon", "title": "t0 walkthrough canon",
 "items": [{"name": "src-a.txt", "content": "<extracted text of doc 1>", "url": "..."},
           {"name": "src-b.txt", "content": "<extracted text of doc 2>", "url": "..."}]}
```

**3.2** Record `resourceId`, and for each item: `sha256`, `catalogChecksum`, `secondWitness`.
*Expect:* `secondWitness: true` on every item — the catalog digested the same bytes independently and agreed. `lane: "canonical"` with a recipe of the item digests.

> **Order is the whole claim.** This write happens *before* you read the documents for review. Its ledger position is what makes "I did not fit the corpus to my conclusions" checkable by someone who wasn't here. If you certify after drafting, the loop still runs and proves nothing.

---

## Stage 4 — Review, with every claim citable

**4.1** Now read the certified texts and write a claim register — an array of `{id, claim, source, quote}` where `source` is the artifact name (`src-a.txt`) and `quote` is **verbatim** from that source.

Aim for 10–15 claims covering the document's substance. Write at natural speed; do not pre-filter for what you think will pass.

**4.2** Load and execute a check graph: `passthrough` → `symbia.canon.check-claims` → `collect` (+ error collect). Inject `{"canonResourceId": "<from 3.2>", "claims": [...]}`.

**4.3** Record `clean`, `passed`, `failed`, `verdictSha256`, and every failing claim's `problems`.

---

## Stage 5 — Prove the checker sees red *in this session*

The manifest said the control passed at registration. Verify it against your own canon, now, with claims you construct to fail:

**5.1** Inject a second register against the same `canonResourceId` containing exactly three planted claims:
- one with a **number that appears nowhere** in your canon
- one whose `quote` is a **paraphrase** rather than verbatim text
- one with a **real quote from `src-b.txt` cited as `src-a.txt`**

*Expect:* all three FAIL, and the third is reported specifically as **misattribution rather than invention** — the checker distinguishes a fabricated quote from a real one pointed at the wrong document.

If any planted claim PASSES, stop and report it. Everything in stage 4 is void.

---

## Stage 6 — Rework until nothing indefensible remains

**6.1** For each failure in 4.3: correct the quote, correct the citation, or **drop the claim**. Do not soften a claim to make it pass — either it is supported by canon or it goes.

**6.2** Re-run the check. Repeat until `clean: true`.

**6.3** Record what you dropped and why. A review that dropped three claims and says so is stronger than one that never had them.

---

## Stage 7 — Determinism anchor (the reproducibility claim)

This step uses fixed inline canon so the result cannot drift with the live web. Inject **exactly** this into the check graph:

```json
{"canon": [
  {"name": "src-a.txt", "text": "Agencies reported about $186 billion in improper payments across 64 programs."},
  {"name": "src-b.txt", "text": "Overpayments accounted for $153 billion, roughly 82 percent."}],
 "claims": [
  {"id": "good-1", "claim": "Agencies reported about $186 billion across 64 programs.", "source": "src-a.txt", "quote": "about $186 billion in improper payments across 64 programs"},
  {"id": "good-2", "claim": "Overpayments were roughly 82 percent.", "source": "src-b.txt", "quote": "roughly 82 percent"},
  {"id": "bad-number", "claim": "Fraud alone was $47 billion.", "source": "src-a.txt", "quote": "about $186 billion in improper payments across 64 programs"},
  {"id": "bad-paraphrase", "claim": "Most were overpayments.", "source": "src-b.txt", "quote": "the vast majority were overpayments"},
  {"id": "bad-wrongsource", "claim": "Overpayments were roughly 82 percent.", "source": "src-a.txt", "quote": "roughly 82 percent"}]}
```

**REFERENCE ANCHOR B —** verdict digest, measured 2026-08-17 across two calls, a freshly spawned host, and two different canon-delivery paths:
```
verdictSha256 starts: 24ddba974668336b664e
passed: 2   failed: 3
```

*This is the contract under test:* same canon, same claims, same algorithm → same verdict, on any machine, any day. A mismatch here is the single most important result this walkthrough can produce — it means the verdict depends on something other than its declared inputs. Report the full digest either way.

---

## Stage 8 — Seal, and check that the seal proves what it says

**8.1** Call `symbia_seal`. Record the bundle path, `traceEntries`, and the seal checksum.

**8.2** Read the bundle from disk and record `completeness` — `state`, `held` vs `declared`, `gaps`.
*Expect:* `state: "sealed"`, `held == declared`, `gaps: []`.

**8.3** **Verify the ordering claim.** In the bundle's trace, find the sequence number of the stage-1 predictions write and the stage-3 certify write, and compare them to the sequence numbers of the stage-4 check. Confirm predictions and certification both precede every measurement they govern.

> This is what "sealed provenance" means operationally. Not that the review is true — the platform never claims that — but that **the corpus was fixed before the reading, the predictions before the results, and a third party can check the ordering without trusting you.**

---

## Results table

| Stage | Check | Observed | Verdict |
|---|---|---|---|
| 0.1 | mode / owned port | | |
| 0.2 | services healthy | | |
| 0.3 | `controlStatus` | | |
| 1.1 | predictions ledgered (seq) | | |
| 2.2 | robots.txt digest vs Anchor A | | |
| 2.3 | strip-v1 digests, HTML→text sizes | | |
| 3.2 | `secondWitness` all items | | |
| 4.3 | first-draft clean? passed/failed | | |
| 5.1 | 3 planted claims all FAIL, misattribution named | | |
| 6.2 | clean after rework; claims dropped | | |
| 7 | verdict digest vs Anchor B | | |
| 8.2 | completeness sealed, no gaps | | |
| 8.3 | predictions & certify precede checks | | |

---

## Known open defects — expect these, they are not your bugs

1. **Catalog drops `content`** on context creation (201, then absent on read). Ledger digest is the proof of what was written.
2. **`laneReason` does not survive re-emission** through passthrough hops — the lane tightening persists, its explanation is dropped.
3. **Artifact storage is cwd-relative** — canon bytes land under the host's working directory, which on a plugin host is the conversation's outputs folder.
4. **Large bodies truncate through MCP** — this is why extraction happens host-side. If you try to move raw HTML through a tool result, expect truncation.

## What a pass means, stated narrowly

A clean run says: the documents were fetched with witnessed digests, the corpus was fixed before it was read, every surviving claim quotes canon verbatim, three deliberate failures were caught including a misattribution, the verdict reproduces a digest computed on another machine on another day, and the whole ordering is sealed in a signed chain.

It does not say the review is correct, that the sources are trustworthy, or that the conclusions are sound. A signed record of bad work is a faithful record of bad work. What you gain is that **every one of those questions is now separately checkable by someone who was not in the room.**
