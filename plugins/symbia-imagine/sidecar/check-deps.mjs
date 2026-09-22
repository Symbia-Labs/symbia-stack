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

// THE CONNECTOR'S IMPORTS ARE THIS PACKAGING'S IMPORTS TOO.
//
// shim.mjs imports the MCP server, but by path, and a path is not a package
// name — so scanning shim.mjs alone never reached @modelcontextprotocol/sdk.
// The archive would have installed cold without the one dependency its
// entry point needs. Same class of miss as the cookie-parser case above,
// found the same way: by running the thing rather than reading it.
const mcpDir = join(here, "mcp-server");

const files = [
  ...(existsSync(servicesDir) ? readdirSync(servicesDir).filter((f) => f.endsWith(".mjs")).map((f) => join(servicesDir, f)) : []),
  ...(existsSync(mcpDir) ? readdirSync(mcpDir).filter((f) => f.endsWith(".js")).map((f) => join(mcpDir, f)) : []),
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
// optionalDependencies COUNT AS DECLARED.
//
// googleapis and node-llama-cpp moved there on 17 Aug — 166 MB of a 263 MB
// first-run install, for capabilities nothing reaches before a first graph.
// This line read `dependencies` alone, so the move immediately made two
// satisfied imports report as missing and would have failed packaging on the
// next run. Absent-by-choice is still declared.
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);
const missing = [...found].filter((p) => !declared.has(p)).sort();
const unused = [...declared].filter((p) => !found.has(p) && !p.startsWith("@symbia/")).sort();

console.log(`${found.size} external packages imported across ${files.length} files`);
console.log(`missing from package.json: ${missing.length ? missing.join(", ") : "(none)"}`);
if (unused.length) console.log(`declared but not imported: ${unused.join(", ")}`);

// ONE CODEBASE SUPPORTS ALL MODES, SO ONE VERSION MUST TOO.
//
// This file's dependency block is a hand-maintained UNION of what the bundles
// import. The services it bundles each declare the same packages in their own
// package.json, which is what the persistent (docker) packaging installs. Two
// declarations of the same dependency for the same code, and nothing compared
// them — so they drifted, silently, and were found only when someone asked
// where a change had landed:
//
//   googleapis      identity ^148.0.0   imagine ^144.0.0
//   node-llama-cpp  models   ^3.3.0     imagine ^3.3.2
//
// That means the two packagings could ship different versions of a dependency
// to the same source, and the difference would surface as a bug in one mode
// that cannot be reproduced in the other. Same failure as the catalog keeping
// its own structural copy of ConfigField: a copy of a contract is a contract
// that will eventually disagree with itself.
//
// The owning service is the authority. This is a union, not a decision.
const SERVICES = [
  "catalog", "identity", "integrations", "models", "logging",
  "directory", "network", "messaging", "runtime", "assistants",
];
const repoRoot = join(here, "..");
const owners = new Map(); // package -> [{service, range}]
for (const svc of SERVICES) {
  const p = join(repoRoot, svc, "package.json");
  if (!existsSync(p)) continue;
  const sp = JSON.parse(readFileSync(p, "utf8"));
  for (const [name, range] of Object.entries({
    ...(sp.dependencies ?? {}),
    ...(sp.optionalDependencies ?? {}),
  })) {
    if (!owners.has(name)) owners.set(name, []);
    owners.get(name).push({ service: svc, range });
  }
}

// TWO KINDS OF DISAGREEMENT, AND ONLY ONE OF THEM IS THIS PACKAGING'S FAULT.
//
//   drift    the services agree with each other and imagine differs. Imagine
//            is wrong, the fix is one line here, and it blocks packaging.
//
//   split    the services disagree among THEMSELVES, so there is no single
//            correct value for imagine to hold. Found immediately on the
//            first run: assistants is behind on uuid (^9 vs ^13), pg
//            (^8.11.3 vs ^8.16.3), jsonwebtoken and cookie-parser; models
//            is behind on express (^5.0.1 vs ^5.2.1). That is a repository
//            defect, not a packaging one.
//
// A split is reported loudly and does NOT block, because blocking a build on
// something the build cannot fix is exactly how a team learns to append
// `|| true` — and then the drift check joins the bundler guard in the list of
// things that were scrolled past. Splits belong to whoever owns the services.
const drift = [];
const splits = [];
for (const [name, range] of Object.entries({
  ...(pkg.dependencies ?? {}),
  ...(pkg.optionalDependencies ?? {}),
})) {
  if (name.startsWith("@symbia/")) continue; // vendored by path, not by range
  const owned = owners.get(name);
  if (!owned) continue; // no service claims it; this packaging's own need
  const ranges = [...new Set(owned.map((o) => o.range))];
  if (ranges.length > 1) {
    splits.push(
      `  ${name}: ${owned.map((o) => `${o.service} ${o.range}`).join(", ")}` +
        `  — imagine holds ${range}`
    );
    continue;
  }
  if (ranges[0] !== range) {
    drift.push(`  ${name}: imagine says ${range}, every service says ${ranges[0]}`);
  }
}

if (drift.length) {
  console.log(`\nDRIFT — imagine disagrees with a unanimous services position. BLOCKS PACKAGING:`);
  for (const d of drift) console.log(d);
  console.log(`\nOne codebase supports all modes, so one version must too. Fix imagine/package.json.`);
}

if (splits.length) {
  console.log(`\nSPLIT — the services disagree with each other, so no value here can be right:`);
  for (const s of splits) console.log(s);
  console.log(
    `\nThis is a repository defect rather than a packaging one, so it does not block.\n` +
      `Until it is reconciled, the ephemeral and persistent packagings can run different\n` +
      `versions of the same dependency against the same source — which surfaces as a bug\n` +
      `in one mode that cannot be reproduced in the other.`
  );
}

if (process.argv.includes("--fix") && missing.length) {
  for (const m of missing) pkg.dependencies[m] = "*";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`added ${missing.length} at "*" — pin them before release`);
}
// DRIFT FAILS THE BUILD, it does not merely print.
//
// The bundler already taught this repository the difference. 01-bundle-routes.sh
// died for two days and packaging continued, because the caller grepped its
// output for "error" instead of reading its exit code — stale bundles shipped
// and nothing said so. A check whose result is advisory is a check that will be
// scrolled past.
process.exit(missing.length || drift.length ? 1 : 0);
