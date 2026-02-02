#!/bin/bash
# Setup git hooks for symbia-stack
# Usage: ./scripts/setup-git-hooks.sh

set -e
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$ROOT_DIR/.git/hooks"

echo "=== Setting up Git Hooks ==="

# Pre-commit hook
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash
# Pre-commit hook: Quick validation before commit

set -e
ROOT_DIR="$(git rev-parse --show-toplevel)"

echo "[pre-commit] Running quick checks..."

# Check for debug statements in staged files
STAGED_TS=$(git diff --cached --name-only --diff-filter=ACM | grep '\.ts$' | grep -v '\.test\.' || true)

if [ -n "$STAGED_TS" ]; then
  # Check for debugger statements
  if echo "$STAGED_TS" | xargs grep -l "debugger" 2>/dev/null; then
    echo "ERROR: debugger statement found in staged files"
    exit 1
  fi

  # Warn about console.log (don't block)
  CONSOLE_FILES=$(echo "$STAGED_TS" | xargs grep -l "console.log" 2>/dev/null || true)
  if [ -n "$CONSOLE_FILES" ]; then
    echo "WARNING: console.log found in: $CONSOLE_FILES"
  fi
fi

echo "[pre-commit] Checks passed"
EOF

# Pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
# Pre-push hook: Validate before pushing

set -e
ROOT_DIR="$(git rev-parse --show-toplevel)"

echo "[pre-push] Validating before push..."

# Run documentation validation
if [ -f "$ROOT_DIR/scripts/workflow/validate-docs.sh" ]; then
  "$ROOT_DIR/scripts/workflow/validate-docs.sh" || {
    echo "WARNING: Documentation validation failed (continuing anyway)"
  }
fi

echo "[pre-push] Validation complete"
EOF

# Commit-msg hook
cat > "$HOOKS_DIR/commit-msg" << 'EOF'
#!/bin/bash
# Commit-msg hook: Validate commit message format

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Check for conventional commit format
if ! echo "$COMMIT_MSG" | head -1 | grep -qE "^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .+"; then
  echo "WARNING: Commit message doesn't follow conventional format"
  echo "Expected: <type>(<scope>): <description>"
  echo "Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert"
  # Don't block, just warn
fi
EOF

# Make hooks executable
chmod +x "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/commit-msg"

echo ""
echo "Git hooks installed:"
echo "  - pre-commit: Quick validation (debugger, console.log)"
echo "  - pre-push: Documentation validation"
echo "  - commit-msg: Conventional commit format check"
echo ""
echo "=== Setup complete ==="
