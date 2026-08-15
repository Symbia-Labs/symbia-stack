/**
 * Stage 2: register the parent and seal each derivation as a signed GKS
 * Lineage event, using the platform's own libraries and nothing else.
 *
 * The claim being made per derivation: "these child weights are the output of
 * <tool @ version> applied to the artifact with digest X under recipe R" —
 * checkable by anyone, because the transform is deterministic (P1) and the
 * signature covers the whole canonical event (@symbia/crypto rules).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey } from "node:crypto";
import { fileURLToPath } from "node:url";

// Bare imports resolve upward into the repo's root node_modules (workspaces).
import {
  generateIdentity, identityFromPrivatePem, exportPrivatePem, identityId,
  canonicalJson,
} from "@symbia/crypto";
import { GENESIS, advance, signEvent, sha256Hex, lineageLine } from "@symbia/lineage";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "data");
const chainDir = path.join(here, "chain");

function fileSha256(p) {
  // Streaming: the parent is ~1 GB.
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    fs.createReadStream(p)
      .on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

// -- identity: persistent across runs so re-running doesn't re-key ----------
const keyPath = path.join(dataDir, "spike-identity.pem"); // gitignored
let identity;
if (fs.existsSync(keyPath)) {
  identity = identityFromPrivatePem(fs.readFileSync(keyPath));
} else {
  identity = generateIdentity();
  fs.writeFileSync(keyPath, exportPrivatePem(identity), { mode: 0o600 });
}
fs.writeFileSync(path.join(chainDir, "spike-identity.pub.pem"), identity.publicKeyPem);
const actor = identityId("spike:model-derivation", identity.fingerprint);

const recipe = JSON.parse(fs.readFileSync(path.join(chainDir, "recipe.json"), "utf8"));

// -- digests ----------------------------------------------------------------
const files = {
  parent: recipe.parent.file,
  q4: "data/child-q4km-run1.gguf",
  q4repeat: "data/child-q4km-run2.gguf",
  q2: "data/child-q2k.gguf",
};
const digest = {};
for (const [k, rel] of Object.entries(files)) {
  const p = path.join(here, rel);
  digest[k] = await fileSha256(p);
  console.log(`${k}: sha256:${digest[k]} (${(fs.statSync(p).size / 1e6).toFixed(1)} MB)`);
}
console.log(`P1 determinism: q4 === q4repeat → ${digest.q4 === digest.q4repeat}`);

// -- events -----------------------------------------------------------------
let chain = GENESIS;
const events = [];
function emit(event_type, payload, parents) {
  // No continuity_context here on purpose: since the 15 Aug normalize-
  // before-sign fix, @symbia/lineage signs, verifies, and serializes one
  // normalized shape, so an absent optional field round-trips. This event is
  // built the same way sealDelegation builds them, as a regression canary.
  const ev = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor_identity: actor,
    event_type,
    payload,
    parent_links: parents,
    checksum: "",
    signature: null,
  };
  // Digest over the library's normalized shape (minus seal fields), so the
  // recomputation in 04-verify sees the same bytes after a JSONL round-trip.
  const { checksum: _c, signature: _s, ...unsealed } = JSON.parse(lineageLine(ev));
  const digestHex = sha256Hex(canonicalJson(unsealed));
  chain = advance(chain, digestHex);
  ev.checksum = `sha256:${chain}`;
  ev.signature = signEvent(ev, identity);
  events.push(ev);
  return ev.event_id;
}

const parentId = emit("model.artifact.registered", {
  digest: `sha256:${digest.parent}`,
  bytes: fs.statSync(path.join(here, files.parent)).size,
  source: recipe.parent.source,
  format: "gguf",
  precision: "f16",
}, [null]);

const q4Id = emit("model.artifact.derived", {
  parentDigest: `sha256:${digest.parent}`,
  childDigest: `sha256:${digest.q4}`,
  recipe: {
    tool: recipe.tool, toolVersion: recipe.toolVersion, toolchain: recipe.toolchain,
    args: recipe.derivations[0].args,
  },
  deterministic: digest.q4 === digest.q4repeat,
  reproductionDigest: `sha256:${digest.q4repeat}`,
}, [parentId]);

emit("model.artifact.derived", {
  parentDigest: `sha256:${digest.parent}`,
  childDigest: `sha256:${digest.q2}`,
  recipe: {
    tool: recipe.tool, toolVersion: recipe.toolVersion, toolchain: recipe.toolchain,
    args: recipe.derivations[1].args,
  },
  deterministic: null, // single run; not measured for Q2_K
}, [parentId]);

fs.writeFileSync(
  path.join(chainDir, "events.jsonl"),
  events.map(lineageLine).join("")
);
fs.writeFileSync(path.join(chainDir, "digests.json"), JSON.stringify({ digest, files }, null, 2));
console.log(`wrote ${events.length} signed events to chain/events.jsonl (actor ${actor})`);
