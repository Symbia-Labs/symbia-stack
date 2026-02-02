#!/bin/bash
# Build all services and packages
# Usage: ./build-all.sh [--docker] [--skip-packages]

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DOCKER=false
SKIP_PACKAGES=false

for arg in "$@"; do
  case $arg in
    --docker) BUILD_DOCKER=true ;;
    --skip-packages) SKIP_PACKAGES=true ;;
  esac
done

echo "=== Building symbia-stack ==="

# Shared packages (build order matters for dependencies)
PACKAGES=(
  "symbia-sys"
  "symbia-db"
  "symbia-auth"
  "symbia-http"
  "symbia-id"
  "symbia-logging-client"
  "symbia-relay"
  "symbia-seed"
)

# Services (package.json is at service root, not server/)
SERVICES=(
  "identity"
  "catalog"
  "integrations"
  "logging"
  "messaging"
  "network"
  "runtime"
  "assistants"
)

if [[ "$SKIP_PACKAGES" != "true" ]]; then
  echo ""
  echo "--- Building Shared Packages ---"
  for pkg in "${PACKAGES[@]}"; do
    if [[ -d "$ROOT_DIR/$pkg" && -f "$ROOT_DIR/$pkg/package.json" ]]; then
      echo "Building $pkg..."
      (cd "$ROOT_DIR/$pkg" && npm run build 2>&1) | grep -E "(error|Done|✓)" || true
    fi
  done
fi

echo ""
echo "--- Building Services ---"
for svc in "${SERVICES[@]}"; do
  if [[ -d "$ROOT_DIR/$svc" && -f "$ROOT_DIR/$svc/package.json" ]]; then
    echo "Building $svc..."
    (cd "$ROOT_DIR/$svc" && npm run build 2>&1) | tail -5
  fi
done

if [[ "$BUILD_DOCKER" == "true" ]]; then
  echo ""
  echo "--- Building Docker Images ---"
  cd "$ROOT_DIR"
  docker-compose build --parallel
fi

echo ""
echo "=== Build complete ==="
