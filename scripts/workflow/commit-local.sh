#!/bin/bash
# Create a local commit with proper formatting
# Usage: ./commit-local.sh [message]

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "=== Preparing Local Commit ==="

# Show current status
echo ""
echo "--- Current Status ---"
git status --short

# Check if there are changes to commit
if git diff --cached --quiet && git diff --quiet; then
  echo ""
  echo "No changes to commit."
  exit 0
fi

# Generate commit message if not provided
if [[ -n "$1" ]]; then
  COMMIT_MSG="$*"
else
  echo ""
  echo "--- Generating commit message ---"

  # Analyze changes to suggest commit type
  STAGED=$(git diff --cached --name-only)
  UNSTAGED=$(git diff --name-only)
  ALL_CHANGES="$STAGED $UNSTAGED"

  # Determine commit type based on changed files
  if echo "$ALL_CHANGES" | grep -qE "\.test\.|\.spec\."; then
    TYPE="test"
  elif echo "$ALL_CHANGES" | grep -qE "README|INTENT|docs/|\.md$"; then
    TYPE="docs"
  elif echo "$ALL_CHANGES" | grep -qE "package\.json|tsconfig|\.eslint"; then
    TYPE="chore"
  elif echo "$ALL_CHANGES" | grep -qE "auth\.ts|security|middleware"; then
    TYPE="fix"
  else
    TYPE="feat"
  fi

  # Get list of affected areas
  AREAS=$(echo "$ALL_CHANGES" | grep -oE "^[^/]+" | sort -u | head -5 | tr '\n' ', ' | sed 's/,$//')

  echo "Suggested type: $TYPE"
  echo "Affected areas: $AREAS"
  echo ""
  read -p "Enter commit message (or press Enter for auto): " USER_MSG

  if [[ -n "$USER_MSG" ]]; then
    COMMIT_MSG="$TYPE: $USER_MSG"
  else
    COMMIT_MSG="$TYPE: update $AREAS"
  fi
fi

echo ""
echo "--- Staging changes ---"
# Stage all changes (you can modify this to be more selective)
git add -A
git status --short

echo ""
echo "--- Creating commit ---"
echo "Message: $COMMIT_MSG"
echo ""

git commit -m "$(cat <<EOF
$COMMIT_MSG

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

echo ""
echo "=== Commit created ==="
git log --oneline -1
