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
DOCS_DIR="$ROOT_DIR/docs/api"
mkdir -p "$DOCS_DIR"

for svc in "${SERVICES[@]}"; do
  if [[ -f "$ROOT_DIR/$svc/docs/openapi.json" ]]; then
    cp "$ROOT_DIR/$svc/docs/openapi.json" "$DOCS_DIR/${svc}-openapi.json"
    echo "  Copied $svc OpenAPI spec"
  fi
  if [[ -f "$ROOT_DIR/$svc/docs/llms.txt" ]]; then
    cp "$ROOT_DIR/$svc/docs/llms.txt" "$DOCS_DIR/${svc}-llms.txt"
    echo "  Copied $svc LLM docs"
  fi
done

echo ""
echo "=== Documentation build complete ==="
echo "API docs available in: $DOCS_DIR"
