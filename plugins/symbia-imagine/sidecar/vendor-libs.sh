#!/bin/bash
# Copy the @symbia/* workspace libraries into services/node_modules.
#
# They resolve today through symlinks in the workspace root — every one of the
# fourteen points at <repo>/symbia-<name>/dist. That works on a machine with a
# symbia-stack checkout and nowhere else, which is the last thing tying this
# directory to one machine.
#
# Lands in the sidecar's OWN node_modules, not services/: sidecar.mjs imports
# @symbia/crypto and sits above services/, so it resolves upward from here.
# Vendoring one level down fixed the bundles and left the host itself broken.
# Copies dist and package.json only. No source, no tests, no node_modules of
# their own: these are already-built ESM with their third-party dependencies
# declared in the sidecar's package.json alongside everything else.
set -euo pipefail
cd "$(dirname "$0")"
# ONE LEVEL, NOT TWO — THE SAME BREAK AS THE BUNDLER, IN THE SAME PROMOTION.
#
# This script lives in imagine/, so the repository root is ".." — not "../..",
# which points above the checkout entirely. 01-bundle-routes.sh carried the
# identical off-by-one from the same imagine/ promotion and was fixed on
# 17 Aug; this one was not, because it fails differently: the bundler crashed,
# while this reports "MISSING @symbia/<name>" for all fourteen, vendors zero
# libraries, and EXITS 0.
#
# So packaging called it, discarded its stdout with >/dev/null, saw success,
# and shipped whatever vendor/ happened to hold from before the move. Found
# 18 Aug by checking the packaged archive for a change that was supposed to
# be in it and was not.
root=".."
# FLAT NAMES, NO "@" ANYWHERE IN A SHIPPED PATH.
#
# These lived at vendor/@symbia/<name> because that mirrors how Node lays out a
# scoped package. Measured 16 Aug: the plugin archive was refused on install
# with "Zip file contains path with invalid characters" — 281 of 320 entries,
# and the only offending character in any of them was the "@".
#
# The scope still exists where it matters. Each package.json inside declares
# its own name as @symbia/<name>, so npm installs it to node_modules/@symbia/
# regardless of the directory it was read from. Only the shipped path changes.
out="vendor"
mkdir -p "$out"
# ONLY WHAT IS ACTUALLY IMPORTED.
#
# The first version copied every @symbia link in the workspace root — all 28,
# including the ten SERVICES whose bundles are already in ./services/, and a
# 26 MB control centre nothing here loads. 49 MB to ship the libraries twice
# and a web app never.
#
# The set below is read from the bundles and from sidecar.mjs, so it is what
# the code imports rather than what happens to be linked.
wanted=$(cat services/*.mjs sidecar.mjs session-ledger.mjs 2>/dev/null \
  | grep -oE 'from *"@symbia/[a-z-]+"' | sed 's|.*@symbia/||; s|"||' | sort -u)
echo "imported @symbia packages: $(echo "$wanted" | tr '\n' ' ')"

n=0
for name in $wanted; do
  link="$root/node_modules/@symbia/$name"
  target=$(cd "$link" 2>/dev/null && pwd) || { echo "  MISSING @symbia/$name"; continue; }
  [ -d "$target/dist" ] || continue
  rm -rf "${out:?}/symbia-$name"
  mkdir -p "$out/symbia-$name"
  cp -R "$target/dist" "$out/symbia-$name/dist"
  # Every node_modules under a vendored package, not just the one under dist.
  # A nested @types directory survived the first prune and put "@" back into
  # 350 archive paths — the same refusal, one level deeper.
  find "$out/symbia-$name" -name node_modules -type d -prune -exec rm -rf {} + 2>/dev/null || true
  # A VENDORED dist HAS NO BUILD-TIME NEEDS.
  #
  # package.json was copied verbatim, carrying every declaration the library
  # makes as a source project — including typescript, which two of the
  # fourteen (db, seed) declare in `dependencies` outright and the rest in
  # devDependencies. Measured 17 Aug against the packaged plugin: 23 MB of
  # a 263 MB first-run install was a TypeScript compiler, downloaded by
  # every new user, to run already-compiled ESM.
  #
  # What ships here is dist/ and nothing else, so anything the library needed
  # in order to BE built is noise at best and 23 MB at worst. Drop
  # devDependencies entirely and strip typescript from dependencies; keep the
  # runtime deps, which are real and are resolved from the sidecar's own
  # package.json.
  node -e '
    const fs = require("fs");
    const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    delete p.devDependencies;
    delete p.scripts;
    if (p.dependencies) delete p.dependencies.typescript;
    p._vendored = "dist only; build-time declarations stripped by vendor-libs.sh";
    fs.writeFileSync(process.argv[2], JSON.stringify(p, null, 2) + "\n");
  ' "$target/package.json" "$out/symbia-$name/package.json"
  n=$((n+1))
done
echo "vendored $n @symbia libraries into $out"

# VENDORING NOTHING IS NOT SUCCESS.
#
# This exited 0 after reporting "MISSING" fourteen times and copying nothing,
# and the caller suppressed its stdout, so the only evidence was a stale
# vendor/ directory that packaging happily shipped. Exactly the failure the
# bundler guard was rewritten for on 17 Aug: a step that cannot fail is a step
# nobody checks.
#
# The count is the contract now. Zero is always wrong — the sidecar imports
# @symbia/crypto directly, so a package with no vendored libraries cannot
# boot on any machine but this one.
if [ "$n" -eq 0 ]; then
  echo "REFUSING: vendored 0 libraries. Expected: $(echo "$wanted" | tr '\n' ' ')" >&2
  echo "  Looked in: $(cd "$root" 2>/dev/null && pwd)/node_modules/@symbia/" >&2
  echo "  In a checkout this needs npm install at the repository root first." >&2
  exit 1
fi
