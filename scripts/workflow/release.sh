#!/bin/bash
# Push to remote with changelog, optional versioning
# Usage: ./release.sh [--version <major|minor|patch>] [--tag] [--dry-run]

set -e
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

VERSION_BUMP=""
CREATE_TAG=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION_BUMP="$2"; shift 2 ;;
    --tag) CREATE_TAG=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) shift ;;
  esac
done

echo "=== Preparing Release ==="

# Get current branch
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"

# Check for unpushed commits
UNPUSHED=$(git log origin/$BRANCH..$BRANCH --oneline 2>/dev/null || echo "")
if [[ -z "$UNPUSHED" ]]; then
  echo "No unpushed commits."
  exit 0
fi

echo ""
echo "--- Unpushed Commits ---"
echo "$UNPUSHED"

# Generate changelog
echo ""
echo "--- Generating Changelog ---"

CHANGELOG=""
while IFS= read -r line; do
  HASH=$(echo "$line" | cut -d' ' -f1)
  MSG=$(echo "$line" | cut -d' ' -f2-)
  FILES=$(git diff-tree --no-commit-id --name-only -r "$HASH" | head -5 | tr '\n' ', ' | sed 's/,$//')

  CHANGELOG+="- $MSG"$'\n'
  CHANGELOG+="  Files: $FILES"$'\n'
done <<< "$UNPUSHED"

echo "$CHANGELOG"

# Version bump if requested
if [[ -n "$VERSION_BUMP" ]]; then
  echo ""
  echo "--- Version Bump: $VERSION_BUMP ---"

  # Get current version from a reference package.json
  CURRENT_VERSION=$(grep '"version"' "$ROOT_DIR/catalog/server/package.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  echo "Current version: $CURRENT_VERSION"

  # Calculate new version
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  case $VERSION_BUMP in
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
    patch) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
    *) echo "Invalid version bump: $VERSION_BUMP"; exit 1 ;;
  esac
  echo "New version: $NEW_VERSION"

  if [[ "$DRY_RUN" != "true" ]]; then
    # Update all package.json files
    find "$ROOT_DIR" -name "package.json" -not -path "*/node_modules/*" -exec \
      sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" {} \;

    git add -A
    git commit -m "chore: bump version to $NEW_VERSION

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  else
    echo "(dry-run: would update version to $NEW_VERSION)"
  fi
fi

# Create tag if requested
if [[ "$CREATE_TAG" == "true" && -n "$NEW_VERSION" ]]; then
  echo ""
  echo "--- Creating Tag ---"
  if [[ "$DRY_RUN" != "true" ]]; then
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION

$CHANGELOG"
    echo "Created tag: v$NEW_VERSION"
  else
    echo "(dry-run: would create tag v$NEW_VERSION)"
  fi
fi

# Push to remote
echo ""
echo "--- Push to Remote ---"
if [[ "$DRY_RUN" != "true" ]]; then
  git push origin "$BRANCH"

  if [[ "$CREATE_TAG" == "true" && -n "$NEW_VERSION" ]]; then
    git push origin "v$NEW_VERSION"
  fi

  echo ""
  echo "=== Release complete ==="
else
  echo "(dry-run: would push to origin/$BRANCH)"
  echo ""
  echo "=== Dry run complete ==="
fi
