#!/bin/bash
# Audit codebase and fix common issues
# Usage: ./audit-fix.sh [--fix] [--type-check]

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
AUTO_FIX=false
TYPE_CHECK=false

for arg in "$@"; do
  case $arg in
    --fix) AUTO_FIX=true ;;
    --type-check) TYPE_CHECK=true ;;
  esac
done

echo "=== Auditing symbia-stack ==="

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

# Check for common issues
echo ""
echo "--- Checking for issues ---"

# 1. Look for console.log in production code (excluding tests)
echo "Checking for debug console.log statements..."
CONSOLE_LOGS=$(grep -r "console\.log" --include="*.ts" --exclude-dir="node_modules" --exclude-dir="dist" --exclude="*.test.ts" --exclude="*.spec.ts" "$ROOT_DIR" 2>/dev/null | grep -v "// debug" | wc -l | tr -d ' ')
echo "  Found $CONSOLE_LOGS console.log statements (review manually)"

# 2. Check for TODO/FIXME comments
echo "Checking for TODO/FIXME comments..."
TODOS=$(grep -rE "(TODO|FIXME|XXX|HACK)" --include="*.ts" --exclude-dir="node_modules" --exclude-dir="dist" "$ROOT_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "  Found $TODOS TODO/FIXME comments"

# 3. Check for any files without proper exports
echo "Checking auth patterns..."
for svc in "${SERVICES[@]}"; do
  AUTH_FILE="$ROOT_DIR/$svc/src/auth.ts"
  if [[ -f "$AUTH_FILE" ]]; then
    if ! grep -q "@symbia/auth" "$AUTH_FILE"; then
      echo "  WARNING: $svc/src/auth.ts does not use @symbia/auth"
    fi
  fi
done

# 4. TypeScript type checking
if [[ "$TYPE_CHECK" == "true" ]]; then
  echo ""
  echo "--- Type Checking Services ---"
  ERRORS=0
  # Type check runs from service root (where tsconfig.json is)
  for svc in "assistants" "catalog" "identity" "integrations" "logging" "messaging" "network" "runtime"; do
    if [[ -d "$ROOT_DIR/$svc" && -f "$ROOT_DIR/$svc/tsconfig.json" ]]; then
      echo "Type checking $svc..."
      if ! (cd "$ROOT_DIR/$svc" && npx tsc --noEmit 2>&1 | head -20); then
        ERRORS=$((ERRORS + 1))
      fi
    fi
  done
  echo "Type check complete. $ERRORS services with errors."
fi

# 5. Security audit
echo ""
echo "--- Security Checks ---"
echo "Checking for hardcoded secrets..."
SECRETS=$(grep -rE "(password|secret|apikey|api_key)\\s*[:=]\\s*['\"][^'\"]+['\"]" --include="*.ts" --exclude-dir="node_modules" --exclude-dir="dist" --exclude="*.test.ts" "$ROOT_DIR" 2>/dev/null | grep -v "process.env" | grep -v "example" | wc -l | tr -d ' ')
echo "  Found $SECRETS potential hardcoded secrets (review manually)"

echo ""
echo "=== Audit complete ==="
