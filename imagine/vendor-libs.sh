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
root="../.."
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
  cp "$target/package.json" "$out/symbia-$name/package.json"
  n=$((n+1))
done
echo "vendored $n @symbia libraries into $out"
