#!/bin/bash
# Validate documentation matches code intent
# Usage: ./validate-docs.sh

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Validating Documentation ==="

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

ISSUES=0

echo ""
echo "--- Checking OpenAPI completeness ---"
for svc in "${SERVICES[@]}"; do
  OPENAPI_FILE="$ROOT_DIR/$svc/docs/openapi.json"

  if [[ ! -f "$OPENAPI_FILE" ]]; then
    echo "  MISSING: $svc/docs/openapi.json"
    ISSUES=$((ISSUES + 1))
    continue
  fi

  # Check for routes without documentation
  ROUTES_FILE="$ROOT_DIR/$svc/server/src/routes.ts"
  if [[ -f "$ROUTES_FILE" ]]; then
    # Count route handlers in code
    CODE_ROUTES=$(grep -cE "router\.(get|post|put|patch|delete)\(" "$ROUTES_FILE" 2>/dev/null | head -1 || echo "0")
    # Count paths in OpenAPI
    DOC_PATHS=$(grep -c '"/' "$OPENAPI_FILE" 2>/dev/null | head -1 || echo "0")

    if [[ "$CODE_ROUTES" -gt "$DOC_PATHS" ]]; then
      echo "  WARNING: $svc may have undocumented routes (code: $CODE_ROUTES, docs: $DOC_PATHS)"
    else
      echo "  OK: $svc routes documented"
    fi
  else
    echo "  OK: $svc documented"
  fi
done

echo ""
echo "--- Checking INTENT.md alignment ---"
if [[ -f "$ROOT_DIR/INTENT.md" ]]; then
  echo "  Found INTENT.md - checking for key concepts..."

  # Check that key services are mentioned
  for svc in "identity" "catalog" "assistants" "messaging" "runtime" "network" "logging" "integrations"; do
    if grep -qi "$svc" "$ROOT_DIR/INTENT.md"; then
      echo "    ✓ $svc documented"
    else
      echo "    ✗ $svc not found in INTENT.md"
      ISSUES=$((ISSUES + 1))
    fi
  done
else
  echo "  WARNING: INTENT.md not found"
  ISSUES=$((ISSUES + 1))
fi

echo ""
echo "--- Checking README.md ---"
if [[ -f "$ROOT_DIR/README.md" ]]; then
  echo "  Found README.md"

  # Check for getting started section
  if grep -qi "getting started\|quick start\|installation" "$ROOT_DIR/README.md"; then
    echo "    ✓ Has getting started section"
  else
    echo "    ✗ Missing getting started section"
    ISSUES=$((ISSUES + 1))
  fi
else
  echo "  WARNING: README.md not found"
  ISSUES=$((ISSUES + 1))
fi

echo ""
if [[ "$ISSUES" -eq 0 ]]; then
  echo "=== Validation passed ==="
else
  echo "=== Validation complete with $ISSUES issues ==="
fi

exit $ISSUES
