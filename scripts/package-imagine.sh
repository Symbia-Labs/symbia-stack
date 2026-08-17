#!/bin/bash
# Build the Symbia Imagine plugin from source.
#
# ONE STACK, TWO PACKAGINGS. The services in this repository are the only
# source. This script produces the EPHEMERAL packaging — a plugin an AI client
# installs, holding an in-memory stack that dies with its process. The
# persistent packaging is `docker compose up`, from the same service source and
# the same Dockerfiles. Neither is a fork of the other.
#
# Everything under build/plugin/ is generated. It was briefly committed, and a
# stale vendor/@symbia directory survived a rename inside it because nothing
# ever rebuilt that tree from scratch — which is the argument for this file.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
OUT=$ROOT/build/plugin/symbia-imagine
VERSION=$(node -p "require('./imagine/plugin/plugin.json').version" 2>/dev/null || echo 0.1.0)

echo "1/6  bundling services from TypeScript source"
( cd imagine && bash 01-bundle-routes.sh 2>&1 | grep -iE "error|✘" ) && { echo "bundle failed"; exit 1; } || true
mkdir -p imagine/services/data
for f in "$ROOT"/*/.standalone-routes.mjs; do
  svc=$(basename "$(dirname "$f")")
  cp "$f" "imagine/services/$svc.mjs"
done
cp "$ROOT"/catalog/data/*.json imagine/services/data/

echo "2/6  vendoring workspace libraries"
( cd imagine && bash vendor-libs.sh >/dev/null )

echo "3/6  checking every import has a declared package"
node imagine/check-deps.mjs

echo "4/6  assembling"
rm -rf "$OUT"; mkdir -p "$OUT"/{.claude-plugin,sidecar,services,skills}
cp imagine/plugin/plugin.json "$OUT/.claude-plugin/plugin.json"
cp imagine/plugin/mcp.json "$OUT/.mcp.json"
cp imagine/plugin/README.md "$OUT/README.md"
cp -R imagine/plugin/skills/. "$OUT/skills/"
cp imagine/{sidecar.mjs,shim.mjs,host.mjs,host-address.mjs,session-ledger.mjs,session-time.mjs,check-deps.mjs,vendor-libs.sh,reload.sh} "$OUT/sidecar/"
cp imagine/package.json "$OUT/package.json"
cp imagine/services/*.mjs "$OUT/services/"
mkdir -p "$OUT/services/data" && cp imagine/services/data/*.json "$OUT/services/data/"
cp -R imagine/vendor "$OUT/vendor"

echo "5/6  pruning what must never ship"
# npm writes transitive dependencies INTO a file: dependency's own directory, so
# a tree clean at vendor time is dirty again after any install. Prune here
# rather than trusting the source tree.
find "$OUT" -name node_modules -type d -prune -exec rm -rf {} + 2>/dev/null || true
rm -rf "$OUT"/.identity "$OUT"/sidecar/.session "$OUT"/sidecar/.models

# Refusals a plugin installer makes, checked before packaging rather than
# discovered on install: "@" anywhere in a path is rejected outright.
BAD=$(find "$OUT" | grep -cE '[^A-Za-z0-9._/ -]' || true)
[ "$BAD" -eq 0 ] || { echo "REFUSING: $BAD paths contain characters an installer rejects"; find "$OUT" | grep -E '[^A-Za-z0-9._/ -]' | head -5; exit 1; }
SECRETS=$(find "$OUT" \( -name "*.pem" -o -name "*.key" -o -name "host.json" -o -name "*.jsonl" \) | wc -l | tr -d ' ')
[ "$SECRETS" -eq 0 ] || { echo "REFUSING: $SECRETS key or session files in the tree"; exit 1; }

echo "6/6  packaging"
ZIP=$ROOT/build/symbia-imagine-$VERSION.plugin
rm -f "$ZIP"
( cd "$OUT" && zip -rq "$ZIP" . -x "*.DS_Store" )
echo
echo "  $ZIP"
echo "  $(unzip -Z1 "$ZIP" | wc -l | tr -d ' ') entries, $(du -h "$ZIP" | cut -f1)"
