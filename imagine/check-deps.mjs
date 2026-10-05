/**
 * Every package the bundles import, checked against package.json.
 *
 * WHY THIS IS A FILE AND NOT A GREP. Three times today a hand-rolled regex
 * over these bundles reported something false: it read a template literal as a
 * package name, it matched a quote inside an escaped JSON string, and — the
 * one that shipped — it looked only at `from "x"` and so never saw
 * `await import("cookie-parser")` inside a function body. That last one left
 * identity unable to mount in the packaged copy, 9 of 10 services, found only
 * because the readiness flag had been made honest an hour earlier.
 *
 * Dynamic imports are the interesting case precisely because they are deferred:
 * a missing one does not fail at load, it fails when that code path first runs.
 *
 *   node check-deps.mjs        report
 *   node check-deps.mjs --fix  add what is missing at "*" and report
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = new Set([...builtinModules, "bun", "deno"]);
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;

const servicesDir = existsSync(join(here, "services")) ? join(here, "services") : join(here, "..", "services");
const files = [
  ...(existsSync(servicesDir) ? readdirSync(servicesDir).filter((f) => f.endsWith(".mjs")).map((f) => join(servicesDir, f)) : []),
  ...["sidecar.mjs", "shim.mjs", "host.mjs", "session-ledger.mjs", "session-time.mjs"].map((f) => join(here, f)),
].filter(existsSync);

const found = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const [, spec] of src.matchAll(SPEC)) {
    if (spec.startsWith("node:") || spec.startsWith(".") || spec.startsWith("/")) continue;
    // A template literal or an interpolated path is not a package name.
    if (spec.includes("${") || spec.trim() === "" || spec.includes(" ")) continue;
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (pkg && !BUILTIN.has(pkg)) found.add(pkg);
  }
}

const pkgPath = existsSync(join(here, "package.json")) ? join(here, "package.json") : join(here, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const declared = new Set(Object.keys(pkg.dependencies ?? {}));
const missing = [...found].filter((p) => !declared.has(p)).sort();
const unused = [...declared].filter((p) => !found.has(p) && !p.startsWith("@symbia/")).sort();

console.log(`${found.size} external packages imported across ${files.length} files`);
console.log(`missing from package.json: ${missing.length ? missing.join(", ") : "(none)"}`);
if (unused.length) console.log(`declared but not imported: ${unused.join(", ")}`);

if (process.argv.includes("--fix") && missing.length) {
  for (const m of missing) pkg.dependencies[m] = "*";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`added ${missing.length} at "*" — pin them before release`);
}
process.exit(missing.length ? 1 : 0);
