/**
 * I3. Alter the bundle and see what the importer notices.
 *
 * Two separate alterations, because the bundle has two parts and the seal
 * may not cover both:
 *   A — change one trace event's payload
 *   B — change one artifact's metadata
 *
 * The bundle's own claim is "these artifacts AND this trace came from one
 * imagine session, unaltered since sealing". If B passes verification, the
 * claim is broader than the mechanism.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "fixtures", "bundle.json");

function run(path) {
  try {
    const out = execFileSync("/opt/homebrew/bin/node", [join(here, "import-bundle.mjs"), path, "--dry-run"], { encoding: "utf8" });
    return { refused: false, out };
  } catch (e) {
    return { refused: true, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

// A — tamper the trace
const a = JSON.parse(readFileSync(src, "utf8"));
const mid = Math.floor(a.trace.length / 2);
a.trace[mid].payload = { ...a.trace[mid].payload, tampered: true };
const pathA = join(here, "fixtures", "tampered-trace.json");
writeFileSync(pathA, JSON.stringify(a, null, 2));
const rA = run(pathA);
console.log(`A trace event ${mid} altered  -> ${rA.refused ? "REFUSED" : "ACCEPTED"}`);
console.log("  " + rA.out.split("\n").filter(l => /REFUSED|reason|VERIFIED/.test(l)).join("\n  "));

// B — tamper an artifact
const b = JSON.parse(readFileSync(src, "utf8"));
const victim = b.artifacts.findIndex((x) => x.type === "graph");
const idx = victim >= 0 ? victim : 0;
b.artifacts[idx].metadata = { ...(b.artifacts[idx].metadata ?? {}), injected: "a node nobody authored" };
const pathB = join(here, "fixtures", "tampered-artifact.json");
writeFileSync(pathB, JSON.stringify(b, null, 2));
const rB = run(pathB);
console.log(`\nB artifact "${b.artifacts[idx].key}" metadata altered -> ${rB.refused ? "REFUSED" : "ACCEPTED"}`);
console.log("  " + rB.out.split("\n").filter(l => /REFUSED|reason|VERIFIED/.test(l)).join("\n  "));

console.log(`\nI3 ${rA.refused && rB.refused ? "HELD" : "BROKEN"}`);
if (rA.refused && !rB.refused) {
  console.log(
    "\nThe seal covers the trace and not the artifacts. The bundle's claim\n" +
    "says both. An artifact can be edited after sealing and the chain still\n" +
    "verifies, so import would register content the session never authored."
  );
}
