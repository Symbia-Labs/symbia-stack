/**
 * The promotion gate — four-tiers.md §5a and §5b, given a caller.
 *
 * Until 20 Aug 2026 every check in the §5a table existed and none was wired
 * to promotion, so an artifact typed directly into durable was trusted more
 * than one that had passed a check. This module is the wiring, v0: it does
 * not add new checks, it runs the mechanically-arguable ones at the moment
 * of crossing and emits the record the receiving side never had.
 *
 * What v0 covers:
 *   seal-verifies   the bundle's own chain and digests (verifyBundle verdict,
 *                   recorded as an outcome rather than only enforced)
 *   key-shape       type ⇄ key-prefix agreement, the catalog convention,
 *                   checked before the target refuses it with less context
 *   map-linkage     GAP-3's structural half: a MAP artifact that references a
 *                   prediction key must reference one that exists — in the
 *                   bundle before it, or already in the target. "The thing
 *                   you cite does not exist" is not a judgement.
 *
 * What v0 deliberately does not cover: behavioural checks, lane honesty
 * re-verification, and app-requires (the target's own route runs that at
 * registration). Those wire in as later versions with their own ids, so a
 * record always names the gate version that passed it.
 *
 * The record key derives from the seal checksum — provenance, not a name an
 * author chose. That is what makes "already promoted" answerable as a
 * different question from "name taken" (D2).
 */
export const GATE_ID = "promotion-gate";
export const GATE_VERSION = "0.1.0";
export const DOES_NOT_ASSERT = "That any admitted artifact is correct. The gate asserts only that each " +
    "artifact passed the named checks at the named gate version. Content is " +
    "not vouched for — a fabricated page fetched cleanly carries a clean " +
    "receipt, and a wrong number in a well-formed artifact passes every " +
    "structural check.";
/** Provenance-keyed record location: derived from the seal, never authored. */
export function promotionRecordKey(sealChecksum) {
    const short = sealChecksum.replace(/^sha256:/, "").slice(0, 16);
    return `contexts/promotions/${short}`;
}
/**
 * MAP references an artifact carries, if any. Read from
 * metadata.references (string[]) — the shape the GAP-3 proposal names.
 */
export function mapReferences(a) {
    const meta = a.metadata ?? {};
    const refs = meta["references"];
    if (Array.isArray(refs))
        return refs.filter((r) => typeof r === "string");
    return [];
}
/** References that cannot be satisfied inside the bundle — the caller
 *  resolves these against the target before running the gate. */
export function externalReferences(artifacts) {
    const inBundle = new Set(artifacts.map((a) => String(a.key)));
    const out = new Set();
    for (const a of artifacts) {
        for (const ref of mapReferences(a)) {
            if (!inBundle.has(ref))
                out.add(ref);
        }
    }
    return [...out];
}
/** Naive plural, matching the catalog's key convention for every type the
 *  resource enum currently carries (context, integration, graph, assistant,
 *  component, app, model → +"s"). A new type with irregular plural fails
 *  loudly here, which is the correct failure. */
function expectedPrefix(type) {
    return `${type}s/`;
}
export function runGate(input) {
    const { bundle, selected, sealVerdict, resolvedInTarget } = input;
    const seal = bundle.seal;
    const sealChecksum = seal?.checksum ?? "unsealed";
    const bundleChecks = [
        {
            check: "seal-verifies",
            outcome: sealVerdict.ok ? "pass" : "fail",
            detail: sealVerdict.ok
                ? "chain walks, artifactsDigest and bodiesDigest recomputed and matched"
                : (sealVerdict.problems ?? []).join("; ").slice(0, 300),
        },
    ];
    const bundleKeyOrder = new Map();
    const allArtifacts = (bundle.artifacts ?? []);
    allArtifacts.forEach((a, i) => bundleKeyOrder.set(String(a.key), i));
    const artifacts = selected.map((a) => {
        const key = String(a.key);
        const type = String(a.type ?? "context");
        const checks = [];
        // key-shape
        const prefix = expectedPrefix(type);
        checks.push(key.startsWith(prefix)
            ? { check: "key-shape", outcome: "pass", detail: `key agrees with type '${type}' (${prefix}…)` }
            : {
                check: "key-shape", outcome: "fail",
                detail: `key '${key}' does not begin '${prefix}' required for type '${type}' — the target's write gate would refuse this with less context`,
            });
        // map-linkage
        const refs = mapReferences(a);
        if (refs.length === 0) {
            checks.push({
                check: "map-linkage", outcome: "not-applicable",
                detail: "no references declared; an exploratory artifact is legitimate and is not forced to cite",
            });
        }
        else {
            const missing = refs.filter((r) => !bundleKeyOrder.has(r) && !resolvedInTarget.has(r));
            const disordered = refs.filter((r) => {
                const ri = bundleKeyOrder.get(r);
                const ai = bundleKeyOrder.get(key);
                return ri !== undefined && ai !== undefined && ri > ai;
            });
            if (missing.length > 0) {
                checks.push({
                    check: "map-linkage", outcome: "fail",
                    detail: `references not found in bundle or target: ${missing.join(", ")}. A result citing a prediction that does not exist is refused — existence is not a judgement call.`,
                });
            }
            else if (disordered.length > 0) {
                checks.push({
                    check: "map-linkage", outcome: "fail",
                    detail: `referenced keys sealed after the artifact that cites them: ${disordered.join(", ")}. The prediction must precede the result.`,
                });
            }
            else {
                checks.push({
                    check: "map-linkage", outcome: "pass",
                    detail: `${refs.length} reference(s) resolve; in-bundle ordering holds where both sides are in this bundle. Cross-bundle chain-position ordering is not checked in v0 and is not asserted.`,
                });
            }
        }
        return { key, admitted: checks.every((c) => c.outcome !== "fail"), checks };
    });
    const sealFailed = bundleChecks.some((c) => c.outcome === "fail");
    const admittedKeys = sealFailed ? [] : artifacts.filter((v) => v.admitted).map((v) => v.key);
    const refusedKeys = artifacts.filter((v) => !v.admitted || sealFailed).map((v) => v.key);
    return {
        gate: { id: GATE_ID, version: GATE_VERSION },
        sealChecksum,
        session: bundle.session?.actor ?? null,
        bundleChecks,
        artifacts,
        admittedKeys,
        refusedKeys,
        doesNotAssert: DOES_NOT_ASSERT,
    };
}
/**
 * The §5b record, as the resource body the receiving catalog stores. This is
 * the only thing that can carry the origin, because the chain deliberately
 * does not — lose this and the link is a tag someone typed.
 */
export function buildPromotionRecord(input) {
    const { report, bundlePath, target, results } = input;
    const promoted = results.filter((r) => r.promoted === true).map((r) => r.key);
    return {
        key: promotionRecordKey(report.sealChecksum),
        type: "context",
        name: `Promotion record — seal ${report.sealChecksum.replace(/^sha256:/, "").slice(0, 16)}`,
        description: `Promotion of ${promoted.length} artifact(s) from seal ${report.sealChecksum} ` +
            `(session ${report.session ?? "unknown"}) into ${target}, passed by ${report.gate.id}@${report.gate.version}. ` +
            `Admitted: ${report.admittedKeys.join(", ") || "none"}. Refused: ${report.refusedKeys.join(", ") || "none"}. ` +
            `DOES NOT ASSERT: ${report.doesNotAssert}`,
        tags: ["promotion-record", report.gate.id],
        metadata: {
            "com.symbia/promotion": {
                sourceBundle: bundlePath,
                sealChecksum: report.sealChecksum,
                session: report.session,
                gate: report.gate,
                bundleChecks: report.bundleChecks,
                artifacts: report.artifacts,
                results,
                promotedAt: new Date().toISOString(),
                doesNotAssert: report.doesNotAssert,
            },
        },
    };
}
//# sourceMappingURL=promotion-gate.js.map