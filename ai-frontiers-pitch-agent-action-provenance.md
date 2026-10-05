# AI Frontiers pitch — agent action provenance

Working title: **We're Labeling AI Content. AI Actions Are Next.**
(Alternate: *Your AI Agent Left No Receipts*)

---

## Pitch text (≤200 words, paste into submission form or Google Doc)

New EU and California rules require AI-generated media to carry signed provenance labels — Eddan Katz covered this in AI Frontiers on August 13. But content is the easy half of the problem. AI agents don't just generate media; they act. They call APIs, file reports, move money, and reconfigure systems, and today none of those actions carry verifiable lineage. We can increasingly prove where a picture came from. We cannot prove what an agent did, on whose authority, or from what inputs.

This piece argues that action provenance — a signed, append-only record of what an agent observed, inferred, and did — is buildable now with the same primitives C2PA uses for media, and that regulators drafting agent rules should require it before delegation scales. I'll draw on lessons from building a provenance-first agent platform, including the core discipline: any action that can't be captured in the provenance record is a system defect, not an exception to tolerate.

Audience: policymakers writing agent regulation, security teams deploying agents, and readers of the Katz piece who want to know what comes after content labels.

Word count: ~190

## Proposed structure (if they ask for the draft)

1. **Lede.** A concrete failure: an agent takes a consequential action (books, pays, deletes, reports) and afterward nobody can reconstruct why. Contrast with the new content-labeling regime: we're signing pixels while actions go unrecorded.
2. **Content provenance is the easy half.** Quick recap of C2PA / EU AI Act Article 50 / California AI Transparency Act (link to Katz). The same laws are silent on agent actions.
3. **What action provenance is.** Signed, append-only event lineage: inputs observed, inferences made, tools invoked, authority chain (who delegated what to whom). Plain-language example, not spec language.
4. **It's buildable now.** Same cryptographic primitives as media provenance. The hard part is discipline, not technology: every action must flow through the recorded path. If a capability can't be exercised through the audited interface, that's a defect to fix, not a reason to go around the record. (Disclosure paragraph: I build one such system.)
5. **The policy hook.** Agent rules are being drafted now. Require action records the way Article 50 requires content marks — before agent delegation scales, not after the first unattributable incident.
6. **Close.** Metadata stripping and forged manifests plague content provenance; action provenance inherits those challenges too. The standard isn't perfection; it's whether "what did the agent do" has a checkable answer.

## Form details

- Submission format: Pitch
- Author link: linkedin.com/in/industrialdata
- Previously appeared elsewhere: No
- Time sensitivity: Somewhat time sensitive (responds to their Aug 13 piece; EU/CA rules are current news)
- Disclosure (also note in submission email): Founder at Symbia Labs, which builds agent-provenance infrastructure; the article discusses the problem class the company works on.
