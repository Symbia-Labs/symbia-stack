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
} from "@symbia/crypto";
import {
  GENESIS, lineageLine, sealArtifactEvent, registeredPayload, derivedPayload,
} from "@symbia/lineage";

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
// Stage 3 exit criterion: ZERO local event-shape definitions. The library
// owns the vocabulary (artifact.registered / artifact.derived, claims in
// words, verified-vs-asserted parent links); this file only supplies facts.
let chain = GENESIS;
const events = [];
const seal = (eventType, payload, parents) => {
  const sealed = sealArtifactEvent({
    eventType, payload, actor, chain, parents, identity,
  });
  chain = sealed.chain;
  events.push(sealed.event);
  return sealed.event.event_id;
};

const parentId = seal("artifact.registered", registeredPayload({
  digest: `sha256:${digest.parent}`,
  bytes: fs.statSync(path.join(here, files.parent)).size,
  source: recipe.parent.source,
  format: "gguf",
  precision: "f16",
}), [null]);

seal("artifact.derived", derivedPayload({
  parentDigest: `sha256:${digest.parent}`,
  childDigest: `sha256:${digest.q4}`,
  recipe: {
    tool: recipe.tool, toolVersion: recipe.toolVersion, toolchain: recipe.toolchain,
    args: recipe.derivations[0].args,
  },
  parentLink: "verified",
  deterministic: digest.q4 === digest.q4repeat,
  reproductionDigest: `sha256:${digest.q4repeat}`,
}), [parentId]);

seal("artifact.derived", derivedPayload({
  parentDigest: `sha256:${digest.parent}`,
  childDigest: `sha256:${digest.q2}`,
  recipe: {
    tool: recipe.tool, toolVersion: recipe.toolVersion, toolchain: recipe.toolchain,
    args: recipe.derivations[1].args,
  },
  // Still `verified` — same deterministic tool — but reproduction was not
  // run for Q2_K, and `deterministic: null` says so rather than implying it.
  parentLink: "verified",
  deterministic: null,
}), [parentId]);

fs.writeFileSync(
  path.join(chainDir, "events.jsonl"),
  events.map(lineageLine).join("")
);
fs.writeFileSync(path.join(chainDir, "digests.json"), JSON.stringify({ digest, files }, null, 2));
console.log(`wrote ${events.length} signed events to chain/events.jsonl (actor ${actor})`);
