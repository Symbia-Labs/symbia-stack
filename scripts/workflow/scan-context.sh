#!/bin/bash
# Scan codebase context at specified depth
# Usage: ./scan-context.sh [depth]

set -e
DEPTH="${1:-2}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Scanning symbia-stack context (depth: $DEPTH) ==="

# Service directories
SERVICES=(
  "assistants/server"
  "catalog/server"
  "identity/server"
  "integrations/server"
  "logging/server"
  "messaging/server"
  "network/server"
  "runtime/server"
)

# Shared packages
PACKAGES=(
  "symbia-auth"
  "symbia-db"
  "symbia-http"
  "symbia-id"
  "symbia-logging-client"
  "symbia-relay"
  "symbia-seed"
  "symbia-sys"
)

echo ""
echo "--- Services ---"
for svc in "${SERVICES[@]}"; do
  if [[ -d "$ROOT_DIR/$svc" ]]; then
    echo "  $svc"
    if [[ "$DEPTH" -ge 2 ]]; then
      find "$ROOT_DIR/$svc/src" -maxdepth 1 -name "*.ts" -exec basename {} \; 2>/dev/null | sed 's/^/    /'
    fi
  fi
done

echo ""
echo "--- Shared Packages ---"
for pkg in "${PACKAGES[@]}"; do
  if [[ -d "$ROOT_DIR/$pkg" ]]; then
    echo "  $pkg"
    if [[ "$DEPTH" -ge 2 ]]; then
      find "$ROOT_DIR/$pkg/src" -maxdepth 1 -name "*.ts" -exec basename {} \; 2>/dev/null | sed 's/^/    /'
    fi
  fi
done

echo ""
echo "--- Git Status ---"
cd "$ROOT_DIR"
git status --short

echo ""
echo "--- Recent Commits ---"
git log --oneline -5

echo ""
echo "=== Scan complete ==="
