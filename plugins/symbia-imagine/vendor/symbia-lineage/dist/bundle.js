/**
 * Verifying a sealed imagine bundle.
 *
 * WHY THIS IS A LIBRARY AND NOT A FUNCTION IN THE IMPORTER. The bundle carries
 * two digests — one over its artifacts, one over its bodies — and both are only
 * protective if somebody recomputes them. Measured 19 Aug: the promote path in
 * the MCP server declared `artifactsDigest` in its type annotation and never
 * compared it, so the tamper protection added on 16 Aug had been available and
 * unexercised since the day it shipped. A check that each consumer is expected
 * to remember is a check that some consumer will not have.
 *
 * WHAT THE TWO LAYERS DO, measured against a real sealed bundle:
 *
 *   edit a body                              chain walks, bodies digest breaks
 *   remove a body                            chain walks, bodies digest breaks
 *   edit an artifact                         chain walks, artifacts digest breaks
 *   edit the seal event to match the edit    chain BREAKS
 *
 * So the digest comparison catches the content edit, and the chain walk catches
 * the attempt to update the digest to cover it. Neither alone is sufficient and
 * the chain walk alone is what an importer would naturally reach for, because
 * the chain is the part that looks like the security mechanism.
 */
import { GENESIS, advance, eventDigest } from './chain.js';
import { sha256Hex, canonicalJson } from '@symbia/crypto';
const digestOf = (v) => `sha256:${sha256Hex(canonicalJson(v))}`;
export function verifyBundle(bundle) {
    const problems = [];
    const notes = [];
    const trace = Array.isArray(bundle.trace) ? bundle.trace : [];
    // 1. Does each event follow the one before it?
    let chain = { ok: true, of: trace.length };
    let head = GENESIS;
    for (const [i, ev] of trace.entries()) {
        head = advance(head, eventDigest(ev));
        if (ev.checksum !== `sha256:${head}`) {
            chain = { ok: false, at: i, of: trace.length, reason: 'checksum does not follow from the previous head' };
            problems.push(`The chain breaks at event ${i} of ${trace.length}. Everything from there on is unattributable.`);
            break;
        }
    }
    if (trace.length === 0) {
        chain = { ok: false, of: 0, reason: 'no trace' };
        problems.push('This bundle carries no trace, so there is nothing to verify.');
    }
    // 2. Do the sealed digests still describe what is here?
    //
    // Read from the SEAL EVENT rather than from `bundle.seal`. The convenience
    // copy at the top of the bundle is not chain-protected and an editor would
    // change both; only the one inside the signed event costs a chain break.
    const sealEv = [...trace].reverse().find((e) => e.event_type === 'imagine.session.sealed');
    const sealed = (sealEv?.payload ?? {});
    const artifacts = { checked: false, ok: true };
    if (typeof sealed.artifactsDigest === 'string') {
        artifacts.checked = true;
        artifacts.ok = sealed.artifactsDigest === digestOf(bundle.artifacts ?? []);
        if (!artifacts.ok)
            problems.push('An artifact has changed since sealing: the sealed artifacts digest no longer matches.');
    }
    else {
        notes.push('This bundle predates artifact digesting, so its artifacts are unprotected. Nothing is claimed about them.');
    }
    const bodies = { checked: false, ok: true };
    if (typeof sealed.bodiesDigest === 'string') {
        bodies.checked = true;
        bodies.ok = sealed.bodiesDigest === digestOf(bundle.bodies ?? {});
        if (!bodies.ok)
            problems.push('A request or response body has changed since sealing: the sealed bodies digest no longer matches.');
    }
    else {
        // Said as a note, not a problem. Every bundle sealed before 19 Aug is in
        // this position and none of them is tampered with; they simply cannot say
        // what was sent.
        notes.push('This bundle carries no bodies digest, so it was sealed before bodies were retained. Its digests address material it does not hold.');
    }
    // 3. Does the log match the last thing the chain committed to about it?
    //
    // The checkpoint is what makes this worth checking. Comparing the log to a
    // digest taken at seal time would only prove the log had not changed since
    // sealing; comparing it to a checkpoint appended WHILE it was being written
    // proves it had not changed by then either.
    const log = bundle.hostLog;
    if (log?.digest) {
        const checkpoints = trace.filter((e) => e.event_type === 'imagine.trace.checkpoint');
        const last = checkpoints[checkpoints.length - 1];
        if (!last?.payload?.prefixDigest) {
            notes.push('The log in this bundle carries no checkpoint, so nothing pins it to the time it was written.');
        }
        else if (last.payload.bytes === log.bytes && last.payload.prefixDigest === log.digest) {
            notes.push(`The log matches the checkpoint the chain took at ${log.bytes} bytes, so every byte of it was committed to while it was being written.`);
        }
        else if (last.payload.bytes !== log.bytes) {
            // Not a failure. Lines written after the final checkpoint are the known
            // residual window, and naming its size is more use than a pass or fail.
            notes.push(`The log holds ${log.bytes} bytes; the last checkpoint covers ${last.payload.bytes}. The difference was written after that checkpoint and is unpinned.`);
        }
        else {
            problems.push('The log does not match the checkpoint the chain took at the same length: it has been altered since.');
        }
    }
    // 4. Report what the bundle says about its own completeness, without
    //    treating either dimension as standing in for the other.
    if (bundle.completeness && bundle.completeness.complete === false) {
        notes.push(`The trace is partial: ${bundle.completeness.held} of ${bundle.completeness.declared} events.`);
    }
    if (bundle.content && bundle.content.complete === false) {
        notes.push(`Bodies are partial: ${bundle.content.held} of ${bundle.content.addressable} addressed bodies are held.`);
    }
    return { ok: problems.length === 0, chain, artifacts, bodies, problems, notes };
}
//# sourceMappingURL=bundle.js.map