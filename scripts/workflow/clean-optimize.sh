#!/bin/bash
# Clean repos, verify gitignore, optimize packages
# Usage: ./clean-optimize.sh [--deep] [--cruft] [--untrack]
#
# Options:
#   --deep     Remove node_modules as well as dist
#   --cruft    Remove untracked cruft files (.DS_Store, *.bak, etc.)
#   --untrack  Remove backup files that are tracked in git (requires commit after)

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEEP_CLEAN=false
CRUFT_CLEAN=false
UNTRACK_BACKUPS=false

for arg in "$@"; do
  case $arg in
    --deep) DEEP_CLEAN=true ;;
    --cruft) CRUFT_CLEAN=true ;;
    --untrack) UNTRACK_BACKUPS=true ;;
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

# Cruft cleanup - remove untracked temp/backup files
if [[ "$CRUFT_CLEAN" == "true" ]]; then
  echo ""
  echo "--- Removing untracked cruft files ---"
  cd "$ROOT_DIR"

  # Remove .DS_Store files
  DS_COUNT=$(find . -name ".DS_Store" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$DS_COUNT" -gt 0 ]]; then
    find . -name ".DS_Store" -not -path "*/node_modules/*" -delete 2>/dev/null
    echo "  ✓ Removed $DS_COUNT .DS_Store files"
  fi

  # Remove *.bak files (untracked only)
  BAK_FILES=$(find . -name "*.bak" -not -path "*/node_modules/*" 2>/dev/null)
  if [[ -n "$BAK_FILES" ]]; then
    for f in $BAK_FILES; do
      if ! git ls-files --error-unmatch "$f" &>/dev/null; then
        rm -f "$f"
        echo "  ✓ Removed $f"
      fi
    done
  fi

  # Remove *~ backup files
  TILDE_COUNT=$(find . -name "*~" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$TILDE_COUNT" -gt 0 ]]; then
    find . -name "*~" -not -path "*/node_modules/*" -delete 2>/dev/null
    echo "  ✓ Removed $TILDE_COUNT ~ backup files"
  fi

  # Remove empty directories
  find . -type d -empty -not -path "*/node_modules/*" -not -path "*/.git/*" -delete 2>/dev/null || true
fi

# Untrack backup files from git
if [[ "$UNTRACK_BACKUPS" == "true" ]]; then
  echo ""
  echo "--- Removing tracked backup files from git ---"
  cd "$ROOT_DIR"

  # Find and remove tracked backup files
  BACKUP_FILES=$(git ls-files | grep -E "\.backup$|backup-.*\.json$" || true)
  if [[ -n "$BACKUP_FILES" ]]; then
    for f in $BACKUP_FILES; do
      git rm --cached "$f" 2>/dev/null && echo "  ✓ Untracked: $f"
    done
    echo ""
    echo "  NOTE: Run 'git commit' to finalize removal from tracking"
    echo "  The files still exist locally but won't be tracked in git"
  else
    echo "  No tracked backup files found"
  fi
fi

echo ""
echo "=== Clean complete ==="
