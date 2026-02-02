#!/bin/bash
# Run ITT (Intentions, Trust, Transparency) tests
# Usage: ./test-itt.sh [category]
#
# Categories:
#   all          - Run all tests (default)
#   intentions   - Run intent alignment tests
#   trust        - Run trust tests
#   transparency - Run transparency tests

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CATEGORY="${1:-all}"

echo "=== ITT Testing Framework ==="
echo ""
echo "Running: $CATEGORY tests"
echo ""

cd "$ROOT_DIR"

# Check if tsx is available
if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Please install Node.js."
  exit 1
fi

# Run the tests
npx tsx tests/run-itt.ts "$CATEGORY"
