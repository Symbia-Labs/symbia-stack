/**
 * Stage 4: verify from the records alone (P5), and optionally re-derive (P6).
 *
 * Inputs: chain/events.jsonl, chain/spike-identity.pub.pem, and the files on
 * disk. No server, no session state, no private key.
 *
 *   node 04-verify.mjs             # signatures + chain + digests
 *   node 04-verify.mjs --rederive  # also re-runs llama-quantize and compares
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, createPublicKey } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GENESIS, advance, verifyEvent, sha256Hex } from "@symbia/lineage";
import { canonicalJson } from "@symbia/crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const chainDir = path.join(here, "chain");

function fileSha256(p) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    fs.createReadStream(p).on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

const pub = createPublicKey(fs.readFileSync(path.join(chainDir, "spike-identity.pub.pem")));
const events = fs.readFileSync(path.join(chainDir, "events.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

// 1. signatures (whole-document, ed25519, from the record alone)
for (const ev of events) {
  check(`signature ${ev.event_type} ${ev.event_id.slice(0, 8)}`, verifyEvent(ev, pub));
}

// 2. chain integrity: recompute advance() over the sequence
let chain = GENESIS;
let chainOk = true;
for (const ev of events) {
  const { checksum: _c, signature: _s, ...unsealed } = ev;
  chain = advance(chain, sha256Hex(canonicalJson(unsealed)));
  if (ev.checksum !== `sha256:${chain}`) chainOk = false;
}
check("chain recomputes end to end", chainOk);

// 3. digests: the files on disk are the artifacts the events name
const reg = events.find((e) => e.event_type === "model.artifact.registered");
const derived = events.filter((e) => e.event_type === "model.artifact.derived");
const { files } = JSON.parse(fs.readFileSync(path.join(chainDir, "digests.json"), "utf8"));

check("parent digest matches disk",
  `sha256:${await fileSha256(path.join(here, files.parent))}` === reg.payload.digest);
check("q4 child digest matches disk",
  `sha256:${await fileSha256(path.join(here, files.q4))}` === derived[0].payload.childDigest);
check("q2 child digest matches disk",
  `sha256:${await fileSha256(path.join(here, files.q2))}` === derived[1].payload.childDigest);

// 4. optional re-derivation (P6): parent + recipe → recorded child digest
if (process.argv.includes("--rederive")) {
  const recipe = derived[0].payload.recipe;
  const tmp = path.join(os.tmpdir(), `rederive-${Date.now()}.gguf`);
  console.log(`re-deriving with ${recipe.tool} ${recipe.args.join(" ")} ...`);
  execFileSync(recipe.tool, [path.join(here, files.parent), tmp, ...recipe.args], { stdio: "ignore" });
  const re = await fileSha256(tmp);
  check("re-derivation reproduces child digest (P6)",
    `sha256:${re}` === derived[0].payload.childDigest, `sha256:${re.slice(0, 16)}…`);
  fs.unlinkSync(tmp);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
