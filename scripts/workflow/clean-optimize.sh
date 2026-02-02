#!/bin/bash
# Clean repos, verify gitignore, optimize packages
# Usage: ./clean-optimize.sh [--deep]

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEEP_CLEAN=false

for arg in "$@"; do
  case $arg in
    --deep) DEEP_CLEAN=true ;;
  esac
done

echo "=== Cleaning and Optimizing ==="

echo ""
echo "--- Verifying .gitignore ---"
GITIGNORE="$ROOT_DIR/.gitignore"

# Essential patterns that should be in gitignore
REQUIRED_PATTERNS=(
  "node_modules"
  "dist"
  ".env"
  ".env.local"
  "*.log"
  ".DS_Store"
)

for pattern in "${REQUIRED_PATTERNS[@]}"; do
  if grep -q "$pattern" "$GITIGNORE" 2>/dev/null; then
    echo "  ✓ $pattern"
  else
    echo "  ✗ Missing: $pattern"
  fi
done

echo ""
echo "--- Checking for files that should be ignored ---"
# Check for files that match gitignore but are tracked
SHOULD_IGNORE=$(git ls-files --cached --ignored --exclude-standard 2>/dev/null | head -10)
if [[ -n "$SHOULD_IGNORE" ]]; then
  echo "  WARNING: These files are tracked but should be ignored:"
  echo "$SHOULD_IGNORE" | sed 's/^/    /'
fi

echo ""
echo "--- Cleaning build artifacts ---"
# Services (dist and node_modules at service root)
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

if [[ "$DEEP_CLEAN" == "true" ]]; then
  echo "  Deep clean: removing node_modules and dist..."
  for dir in "${SERVICES[@]}" "${PACKAGES[@]}"; do
    if [[ -d "$ROOT_DIR/$dir/node_modules" ]]; then
      rm -rf "$ROOT_DIR/$dir/node_modules"
      echo "    Removed $dir/node_modules"
    fi
    if [[ -d "$ROOT_DIR/$dir/dist" ]]; then
      rm -rf "$ROOT_DIR/$dir/dist"
      echo "    Removed $dir/dist"
    fi
  done
else
  echo "  Cleaning dist directories only (use --deep for node_modules)..."
  for dir in "${SERVICES[@]}" "${PACKAGES[@]}"; do
    if [[ -d "$ROOT_DIR/$dir/dist" ]]; then
      rm -rf "$ROOT_DIR/$dir/dist"
      echo "    Removed $dir/dist"
    fi
  done
fi

echo ""
echo "--- Checking for duplicate dependencies ---"
# Look for the same package at different versions
echo "  Scanning for version conflicts..."
DEPS=$(find "$ROOT_DIR" -name "package.json" -not -path "*/node_modules/*" -exec grep -h '"dependencies"\|"devDependencies"' -A 50 {} \; 2>/dev/null | grep -E '^\s+"@' | sort | uniq -c | sort -rn | head -10)
echo "$DEPS" | sed 's/^/    /'

echo ""
echo "--- Checking package sizes ---"
for dir in "${SERVICES[@]}"; do
  if [[ -d "$ROOT_DIR/$dir/dist" ]]; then
    SIZE=$(du -sh "$ROOT_DIR/$dir/dist" 2>/dev/null | cut -f1)
    echo "  $dir/dist: $SIZE"
  fi
done

echo ""
echo "=== Clean complete ==="
