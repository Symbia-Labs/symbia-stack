#!/bin/bash
# Bundle each service's routes into an importable library.
#
# Why this step exists: catalog, identity and integrations each map
# `@shared/*` to their OWN `./shared/*`. Three different files answer to
# the same specifier, so a single Node module graph cannot resolve them —
# `tsx` picks one or none. esbuild resolves the alias per service at build
# time, which makes the bundle the composable unit rather than the source.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build

for svc in catalog identity integrations models; do
  echo "bundling ${svc}..."
  # Output lands INSIDE the service directory on purpose: third-party
  # packages stay external (node-llama-cpp is native and cannot be
  # bundled), and Node resolves them from the importing file's location
  # upward — which finds `<svc>/node_modules` only if the bundle lives
  # there. Measured 15 Aug: emitting to this directory instead fails with
  # "Cannot find package 'drizzle-orm'".
  npx esbuild "../../$svc/server/src/routes.ts" \
    --bundle --format=esm --platform=node --target=node20 \
    --packages=external \
    --tsconfig="../../$svc/tsconfig.json" \
    --outfile="../../$svc/.standalone-routes.mjs" 2>&1 | tail -2
done
echo "done — build/*.mjs"
