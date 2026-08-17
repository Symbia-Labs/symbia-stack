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

# Only these six have a separable route module. assistants, messaging,
# runtime and network define their routes inline inside index.ts (as a
# `registerRoutes:` property of the createSymbiaServer config), so they
# cannot be imported at all — that is the PS4 finding, counted.
for svc in catalog identity integrations models logging directory network messaging runtime assistants; do
  echo "bundling ${svc}..."
  # Output lands INSIDE the service directory on purpose: third-party
  # packages stay external (node-llama-cpp is native and cannot be
  # bundled), and Node resolves them from the importing file's location
  # upward — which finds `<svc>/node_modules` only if the bundle lives
  # there. Measured 15 Aug: emitting to this directory instead fails with
  # "Cannot find package 'drizzle-orm'".
  # Any service with a service.ts ships THAT (routes + bootstrap + start in
  # one module graph —
  # a second bundle would carry a second pg-mem and seed a store nobody
  # reads). Others still expose routes.ts only.
  # ONE level up. These paths said ../../ from the days this script lived at
  # experiments/standalone/; the promotion to imagine/ (5559a19) moved the
  # script and not the paths, and NOTHING REPORTED IT: esbuild died on a
  # missing entry, the crash text contains neither "error" nor "✘", the
  # caller's grep-guard saw nothing, and stale .standalone-routes.mjs files
  # from the last good build were copied into every subsequent "successful"
  # package. Found 17 Aug by the grep-a-marker rule: a freshly packaged
  # bundle contained none of the code just written. Hence set -o pipefail
  # above and the explicit exit check below — a bundler that cannot build
  # must say so in its exit code, not in prose someone greps for.
  entry="../$svc/server/src/routes.ts"
  [ -f "../$svc/server/src/service.ts" ] && entry="../$svc/server/src/service.ts"
  [ -f "$entry" ] || { echo "BUNDLE FAILED: no entry for $svc at $entry"; exit 1; }
  npx esbuild "$entry" \
    --bundle --format=esm --platform=node --target=node20 \
    --packages=external \
    --tsconfig="../$svc/tsconfig.json" \
    --outfile="../$svc/.standalone-routes.mjs" 2>&1 | tail -2 \
    || { echo "BUNDLE FAILED: esbuild exited non-zero for $svc"; exit 1; }
done
echo "done — bundles refreshed in each service directory"
