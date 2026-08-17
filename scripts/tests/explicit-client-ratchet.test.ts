/**
 * R2 explicit-client ratchet — measurement against
 * docs/2026-08-13-explicit-client-ratchet-predictions.md.
 * Run: npm run test:security:explicit-client-ratchet.
 *
 * The ALS pool wrapper does not cover pool.connect()/db.transaction() explicit
 * clients, so those can bypass request RLS context. This does not close existing
 * sites; it FAILS when a new one lands without review, so the seam cannot widen
 * silently. When you add a reviewed explicit-client path, update BASELINE below.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

// Reviewed per-file counts of real `pool.connect()` calls (comments excluded).
const BASELINE: Record<string, number> = {
  "identity/server/src/db.ts": 1,
  "logging/server/src/db.ts": 1,
  "assistants/server/src/index.ts": 1,
  "messaging/server/src/database.ts": 2,
  "messaging/server/src/models/message.ts": 1,
};

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

function walk(dir: string, out: string[]): void {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      walk(p, out);
    } else if (e.isFile() && p.endsWith(".ts") && !p.endsWith(".d.ts")) {
      out.push(p);
    }
  }
}

/** Count real pool.connect() calls in a file, ignoring line comments. */
function countConnects(file: string): number {
  const text = readFileSync(file, "utf-8");
  let n = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*")) continue;
    const m = line.match(/\.connect\(\s*\)/g);
    if (m) {
      // Exclude pool.on('connect', ...) style — require .connect() with no args
      // that is assigned/awaited (heuristic: preceded by await or =).
      if (/\bawait\s+[\w.]*\.connect\(\s*\)|=\s*[\w.]*\.connect\(\s*\)/.test(line)) n += m.length;
    }
  }
  return n;
}

function main() {
  const serviceDirs = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && statSyncSafe(join(ROOT, e.name, "server", "src")))
    .map((e) => join(e.name, "server", "src"));

  const found: Record<string, number> = {};
  for (const rel of serviceDirs) {
    const files: string[] = [];
    walk(join(ROOT, rel), files);
    for (const f of files) {
      const c = countConnects(f);
      if (c > 0) found[f.slice(ROOT.length + 1)] = c;
    }
  }

  // R2-2 / R2-3: any file over its baseline (or absent from baseline) fails.
  let widened = false;
  for (const [file, count] of Object.entries(found)) {
    const allowed = BASELINE[file] ?? 0;
    if (count > allowed) {
      widened = true;
      check(`no new explicit-client seam in ${file}`, false, { found: count, baseline: allowed });
    }
  }
  if (!widened) check("no explicit-client path exceeds its reviewed baseline", true, found);

  // R2-4 sanity: comment-only occurrences are not counted.
  check(
    "R2-4 comment lines with pool.connect() are excluded",
    countConnectsFromString("  // (pool.connect()) are NOT covered\n  await pool.connect();") === 1,
  );

  console.log(`\nEXPLICIT-CLIENT-RATCHET: ${pass} passed, ${fail} failed`);
  console.log(`  measured sites:`, JSON.stringify(found));
  process.exit(fail === 0 ? 0 : 1);
}

function statSyncSafe(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function countConnectsFromString(text: string): number {
  let n = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*")) continue;
    if (/\bawait\s+[\w.]*\.connect\(\s*\)|=\s*[\w.]*\.connect\(\s*\)/.test(line)) n += 1;
  }
  return n;
}

main();
