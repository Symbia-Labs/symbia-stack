#!/bin/bash
# Main workflow orchestrator for symbia-stack
# Usage: ./workflow.sh <command> [options]
#
# Commands:
#   scan [depth]     - Scan codebase context (default depth: 2)
#   audit [--fix]    - Audit code and find issues
#   build [--docker] - Build all services and packages
#   docs             - Build documentation
#   validate         - Validate documentation against code
#   clean [--deep]   - Clean and optimize repos
#   commit [message] - Create local commit
#   release [opts]   - Push to remote with changelog
#   all              - Run full pipeline (scan → validate)
#   ci               - CI pipeline (audit → build → validate)
#
# Examples:
#   ./workflow.sh scan 3              # Deep scan
#   ./workflow.sh build --docker      # Build with Docker
#   ./workflow.sh release --version minor --tag

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  scan)
    bash "$SCRIPT_DIR/scan-context.sh" "$@"
    ;;
  audit)
    bash "$SCRIPT_DIR/audit-fix.sh" "$@"
    ;;
  build)
    bash "$SCRIPT_DIR/build-all.sh" "$@"
    ;;
  docs)
    bash "$SCRIPT_DIR/build-docs.sh" "$@"
    ;;
  validate)
    bash "$SCRIPT_DIR/validate-docs.sh" "$@"
    ;;
  clean)
    bash "$SCRIPT_DIR/clean-optimize.sh" "$@"
    ;;
  commit)
    bash "$SCRIPT_DIR/commit-local.sh" "$@"
    ;;
  release)
    bash "$SCRIPT_DIR/release.sh" "$@"
    ;;
  test|itt)
    bash "$SCRIPT_DIR/test-itt.sh" "$@"
    ;;
  all)
    echo "=== Running Full Pipeline ==="
    echo ""
    bash "$SCRIPT_DIR/scan-context.sh" 2
    echo ""
    bash "$SCRIPT_DIR/audit-fix.sh"
    echo ""
    bash "$SCRIPT_DIR/build-all.sh"
    echo ""
    bash "$SCRIPT_DIR/build-docs.sh"
    echo ""
    bash "$SCRIPT_DIR/validate-docs.sh"
    echo ""
    bash "$SCRIPT_DIR/clean-optimize.sh"
    echo ""
    echo "=== Full Pipeline Complete ==="
    ;;
  ci)
    echo "=== Running CI Pipeline ==="
    bash "$SCRIPT_DIR/audit-fix.sh" --type-check
    bash "$SCRIPT_DIR/build-all.sh"
    bash "$SCRIPT_DIR/validate-docs.sh"
    echo "=== CI Pipeline Complete ==="
    ;;
  help|*)
    cat << 'EOF'
Symbia Stack Workflow Automation

Usage: ./workflow.sh <command> [options]

Commands:
  scan [depth]       Scan codebase context
                     - Lists services, packages, git status
                     - depth: 1=dirs only, 2+=include files (default: 2)

  audit [options]    Audit code and find issues
                     --fix        Auto-fix where possible
                     --type-check Run TypeScript type checking

  build [options]    Build all services and packages
                     --docker         Also build Docker images
                     --skip-packages  Skip shared packages

  docs               Build documentation
                     - Generates OpenAPI specs
                     - Generates LLM docs
                     - Collects to docs/api/

  validate           Validate documentation
                     - Check OpenAPI completeness
                     - Verify INTENT.md alignment
                     - Check README.md

  clean [options]    Clean and optimize
                     --deep  Also remove node_modules

  commit [message]   Create local commit
                     - Auto-generates message if not provided
                     - Adds Co-Authored-By

  release [options]  Push to remote with changelog
                     --version <major|minor|patch>
                     --tag      Create git tag
                     --dry-run  Preview without executing

  test [category]    Run ITT tests (Intentions, Trust, Transparency)
                     all          All tests (default)
                     intentions   Intent alignment tests
                     trust        Security/auth tests
                     transparency Code quality tests

  all                Run full pipeline (scan → clean)
  ci                 Run CI pipeline (audit → validate)

Examples:
  ./workflow.sh scan 3
  ./workflow.sh build --docker
  ./workflow.sh release --version minor --tag
  ./workflow.sh all
EOF
    ;;
esac
