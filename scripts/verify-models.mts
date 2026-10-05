/**
 * Standing evidence for the models service (verify-assistants shape).
 *
 * Checks, against a RUNNING service and the files on disk:
 *   M1  every local model in /api/models carries a digest
 *   M2  each reported digest matches an independent sha256 of the file
 *   M3  the artifact ledger verifies from the directory alone
 *       (signatures via the sidecar public key, chain via eventDigest)
 *   M4  catalog cards (when a catalog is reachable) carry no live state
 *       and their digest agrees with the file
 *
 * Usage:
 *   MODELS_URL=http://localhost:5008 MODELS_PATH=./models/data/models \
 *     npx tsx scripts/verify-models.mts
 */
import { createHash, createPublicKey } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GENESIS, advance, verifyEvent, eventDigest, type LineageEvent } from "@symbia/lineage";

const MODELS_URL = process.env.MODELS_URL || "http://localhost:5008";
const MODELS_PATH = process.env.MODELS_PATH || "./models/data/models";
const CATALOG_URL = process.env.CATALOG_URL || "";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  cond ? pass++ : fail++;
};

function fileSha256(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(p).on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

interface ApiModel {
  id: string;
  symbia: { source: string; digest?: string; digestMismatch?: unknown };
}

const list = (await (await fetch(`${MODELS_URL}/api/models`)).json()) as { data: ApiModel[] };
const locals = list.data.filter((m) => m.symbia.source === "local");
ok("M0 service lists local models", locals.length > 0, `${locals.length} local`);

// M1: digests present
for (const m of locals) {
  ok(`M1 ${m.id} carries a digest`, typeof m.symbia.digest === "string");
}

// M2: digests true. Model id derives from filename; walk the reported ids
// back to files by asking the single-model endpoint for the filename.
for (const m of locals) {
  const detail = (await (await fetch(`${MODELS_URL}/api/models/${m.id}`)).json()) as {
    digest?: string;
  };
  // The API does not expose the filepath (correctly); find the file whose
  // scanner-derived id matches.
  const { readdirSync } = await import("node:fs");
  const file = readdirSync(MODELS_PATH).find(
    (f) => f.endsWith(".gguf") &&
      f.replace(/\.gguf$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-") === m.id
  );
  if (!file) { ok(`M2 ${m.id} has a file`, false, "no matching file"); continue; }
  const digest = await fileSha256(join(MODELS_PATH, file));
  ok(`M2 ${m.id} digest is true`, detail.digest === `sha256:${digest}`);
}

// M3: ledger verifies from the directory alone
const ledger = join(MODELS_PATH, ".lineage.jsonl");
const pubPem = join(MODELS_PATH, ".lineage.pub.pem");
if (existsSync(ledger) && existsSync(pubPem)) {
  const pub = createPublicKey(readFileSync(pubPem));
  const events = readFileSync(ledger, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LineageEvent);
  ok("M3 ledger has events", events.length > 0, `${events.length} events`);
  ok("M3 every ledger signature verifies", events.every((e) => verifyEvent(e, pub)));
  let chain = GENESIS, chainOk = true;
  for (const e of events) {
    chain = advance(chain, eventDigest(e));
    if (e.checksum !== `sha256:${chain}`) chainOk = false;
  }
  ok("M3 ledger chain recomputes", chainOk);
} else {
  ok("M3 ledger present", false, "no .lineage.jsonl / .lineage.pub.pem (nothing pulled yet?)");
}

// M4: cards, when a catalog is named
if (CATALOG_URL) {
  const rows = (await (
    await fetch(`${CATALOG_URL}/api/resources`, { headers: { "X-Service-Auth": "internal" } })
  ).json()) as Array<{ key: string; metadata?: Record<string, unknown> }>;
  for (const m of locals) {
    // Both key shapes: `models/<publisher>/<id>` (stage 5) and the
    // pre-migration `integrations/<provider>/models/<id>`.
    const card = rows.find(
      (r) =>
        new RegExp(`^models/[^/]+/${m.id}$`).test(r.key) ||
        r.key.endsWith(`/models/${m.id}`)
    );
    if (!card) { ok(`M4 ${m.id} has a card`, false); continue; }
    const meta = card.metadata ?? {};
    ok(`M4 ${m.id} card carries no live state`,
      !("loaded" in meta) && !("status" in meta) && !("memoryUsageMB" in meta));
    ok(`M4 ${m.id} card digest agrees`, meta.digest === m.symbia.digest);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
