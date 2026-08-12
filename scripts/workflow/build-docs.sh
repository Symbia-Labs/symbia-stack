#!/bin/bash
# Build documentation for all services
# Usage: ./build-docs.sh

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Building Documentation ==="

SERVICES=(
  "assistants"
  "catalog"
  "identity"
  "integrations"
  "logging"
  "messaging"
  "models"
  "network"
  "runtime"
)

echo ""
echo "--- Generating OpenAPI specs ---"
for svc in "${SERVICES[@]}"; do
  if [[ -d "$ROOT_DIR/$svc" && -f "$ROOT_DIR/$svc/package.json" ]]; then
    echo "Generating docs for $svc..."
    (cd "$ROOT_DIR/$svc" && npm run build 2>&1) | grep -E "(openapi|llms|✓)" || true
  fi
done

echo ""
echo "--- Collecting docs ---"
# The aggregated copy under docs/api was removed 10 Aug 2026. It duplicated
# */docs/ and nothing read it — validate-docs.sh and CI both read the
# per-service files directly. A second copy of a generated artifact is a
# second thing to drift.
