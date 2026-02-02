#!/bin/bash
set -e

# Symbia Stack - Local Development (No Docker)
# Runs services directly on the host machine

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[symbia]${NC} $*"; }
log_success() { echo -e "${GREEN}[symbia]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[symbia]${NC} $*"; }
log_error() { echo -e "${RED}[symbia]${NC} $*"; }

# Configuration - can be overridden via environment
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-symbia}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-symbia_dev}"
POSTGRES_DB="${POSTGRES_DB:-symbia}"

# Secrets (defaults for local dev only!)
SESSION_SECRET="${SESSION_SECRET:-symbia-local-dev-secret}"
NETWORK_HASH_SECRET="${NETWORK_HASH_SECRET:-symbia-network-local-secret}"

# Service ports (from symbia-sys defaults)
IDENTITY_PORT="${IDENTITY_PORT:-5001}"
LOGGING_PORT="${LOGGING_PORT:-5002}"
CATALOG_PORT="${CATALOG_PORT:-5003}"
ASSISTANTS_PORT="${ASSISTANTS_PORT:-5004}"
MESSAGING_PORT="${MESSAGING_PORT:-5005}"
RUNTIME_PORT="${RUNTIME_PORT:-5006}"
INTEGRATIONS_PORT="${INTEGRATIONS_PORT:-5007}"
MODELS_PORT="${MODELS_PORT:-5008}"
NETWORK_PORT="${NETWORK_PORT:-5054}"
SERVICE_ADMIN_PORT="${SERVICE_ADMIN_PORT:-3000}"

# PID tracking
PID_DIR="${SCRIPT_DIR}/.local-pids"
mkdir -p "$PID_DIR"

cleanup() {
  log_info "Shutting down services..."
  if [ -d "$PID_DIR" ]; then
    for pidfile in "$PID_DIR"/*.pid; do
      [ -f "$pidfile" ] || continue
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    done
  fi
  log_success "All services stopped"
  exit 0
}

trap cleanup SIGINT SIGTERM

check_requirements() {
  local missing=()

  if ! command -v node &>/dev/null; then
    missing+=("node")
  else
    local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt 20 ]; then
      log_error "Node.js 20+ required, found $(node -v)"
      exit 1
    fi
  fi

  if ! command -v npm &>/dev/null; then
    missing+=("npm")
  fi

  if ! command -v psql &>/dev/null; then
    missing+=("psql (PostgreSQL client)")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "Missing required tools: ${missing[*]}"
    exit 1
  fi
}

check_postgres() {
  log_info "Checking PostgreSQL connection..."

  export PGPASSWORD="$POSTGRES_PASSWORD"
  if ! psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -c "SELECT 1" &>/dev/null; then
    log_error "Cannot connect to PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT"
    log_info ""
    log_info "Make sure PostgreSQL is running. On macOS:"
    log_info "  brew services start postgresql@15"
    log_info ""
    log_info "Or start with Docker (postgres only):"
    log_info "  docker run -d --name symbia-postgres -p 5432:5432 \\"
    log_info "    -e POSTGRES_USER=$POSTGRES_USER \\"
    log_info "    -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \\"
    log_info "    postgres:15-alpine"
    exit 1
  fi

  log_success "PostgreSQL is available"
}

setup_databases() {
  log_info "Setting up databases..."

  export PGPASSWORD="$POSTGRES_PASSWORD"
  local databases=("identity" "logging" "catalog" "assistants" "messaging" "runtime" "integrations")

  for db in "${databases[@]}"; do
    if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
      log_info "  Database '$db' exists"
    else
      log_info "  Creating database '$db'..."
      psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$db\""
    fi

    # Enable pgcrypto extension
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$db" -c 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"' 2>/dev/null || true
  done

  log_success "Databases ready"
}

apply_schemas() {
  log_info "Applying database schemas..."

  export PGPASSWORD="$POSTGRES_PASSWORD"

  # Extract MEMORY_SCHEMA_SQL from TypeScript files and apply
  apply_schema() {
    local db="$1"
    local file="$2"

    if [ ! -f "$file" ]; then
      log_warn "  Schema file not found: $file"
      return
    fi

    log_info "  Applying schema to '$db'..."

    # Extract SQL from MEMORY_SCHEMA_SQL template literal
    local sql=$(awk '
      BEGIN { p=0 }
      /MEMORY_SCHEMA_SQL[[:space:]]*=[[:space:]]*`/ {
        p=1
        sub(/.*`/, "")
        print
        next
      }
      p==1 {
        if ($0 ~ /`;/) {
          sub(/`;.*/, "")
          print
          exit
        }
        print
      }
    ' "$file")

    if [ -z "$(echo "$sql" | tr -d '[:space:]')" ]; then
      log_info "  No schema SQL in $file"
      return
    fi

    # Make idempotent
    sql=$(echo "$sql" | sed -E \
      -e 's/^CREATE TYPE "([^"]+)" AS ENUM (.*);$/DO $$ BEGIN CREATE TYPE "\1" AS ENUM \2; EXCEPTION WHEN duplicate_object THEN NULL; END $$;/g' \
      -e 's/CREATE TABLE "([^"]+)"/CREATE TABLE IF NOT EXISTS "\1"/g' \
      -e 's/CREATE UNIQUE INDEX ([^I][^F])/CREATE UNIQUE INDEX IF NOT EXISTS \1/g' \
      -e 's/CREATE INDEX ([^I][^F])/CREATE INDEX IF NOT EXISTS \1/g')

    echo "$sql" | psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1
  }

  apply_schema identity "$SCRIPT_DIR/identity/server/src/memory-schema.ts"
  apply_schema logging "$SCRIPT_DIR/logging/server/src/memory-schema.ts"
  apply_schema catalog "$SCRIPT_DIR/catalog/server/src/memory-schema.ts"
  apply_schema integrations "$SCRIPT_DIR/integrations/server/src/memory-schema.ts"
  apply_schema assistants "$SCRIPT_DIR/assistants/server/src/lib/memory-schema.ts"

  log_success "Schemas applied"
}

install_dependencies() {
  if [ ! -d "node_modules" ]; then
    log_info "Installing dependencies (this may take a while on first run)..."
    npm install
    log_success "Dependencies installed"
  else
    log_info "Dependencies already installed"
  fi
}

build_libraries() {
  log_info "Building shared libraries..."

  # Level 0: No internal dependencies
  npm run build -w symbia-sys 2>/dev/null || log_warn "symbia-sys build failed"
  npm run build -w symbia-relay 2>/dev/null || log_warn "symbia-relay build failed"
  npm run build -w symbia-logging-client 2>/dev/null || log_warn "symbia-logging-client build failed"

  # Level 1: Depends on Level 0
  npm run build -w symbia-auth 2>/dev/null || log_warn "symbia-auth build failed"
  npm run build -w symbia-db 2>/dev/null || log_warn "symbia-db build failed"
  npm run build -w symbia-http 2>/dev/null || log_warn "symbia-http build failed"
  npm run build -w symbia-seed 2>/dev/null || log_warn "symbia-seed build failed"
  npm run build -w symbia-md 2>/dev/null || log_warn "symbia-md build failed"
  npm run build -w symbia-id 2>/dev/null || log_warn "symbia-id build failed"
  npm run build -w symbia-messaging-client 2>/dev/null || log_warn "symbia-messaging-client build failed"

  log_success "Libraries built"
}

start_service() {
  local name="$1"
  local port="$2"
  local db_name="$3"  # Optional, some services don't have a DB

  log_info "Starting $name on port $port..."

  local env_vars="NODE_ENV=development PORT=$port HOST=0.0.0.0"
  env_vars="$env_vars SESSION_SECRET=$SESSION_SECRET"
  env_vars="$env_vars NETWORK_HASH_SECRET=$NETWORK_HASH_SECRET"
  env_vars="$env_vars IDENTITY_SERVICE_URL=http://localhost:$IDENTITY_PORT"
  env_vars="$env_vars LOGGING_SERVICE_URL=http://localhost:$LOGGING_PORT"
  env_vars="$env_vars NETWORK_SERVICE_URL=http://localhost:$NETWORK_PORT"
  env_vars="$env_vars CATALOG_SERVICE_URL=http://localhost:$CATALOG_PORT"
  env_vars="$env_vars ASSISTANTS_SERVICE_URL=http://localhost:$ASSISTANTS_PORT"
  env_vars="$env_vars MESSAGING_SERVICE_URL=http://localhost:$MESSAGING_PORT"
  env_vars="$env_vars RUNTIME_SERVICE_URL=http://localhost:$RUNTIME_PORT"
  env_vars="$env_vars INTEGRATIONS_SERVICE_URL=http://localhost:$INTEGRATIONS_PORT"
  env_vars="$env_vars MODELS_SERVICE_URL=http://localhost:$MODELS_PORT"

  if [ -n "$db_name" ]; then
    env_vars="$env_vars DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$POSTGRES_HOST:$POSTGRES_PORT/$db_name"
  fi

  # Start service in background using npm workspaces
  cd "$SCRIPT_DIR"
  env $env_vars npm run dev -w "$name" > "$SCRIPT_DIR/.local-pids/$name.log" 2>&1 &
  local pid=$!
  echo $pid > "$PID_DIR/$name.pid"

  # Wait briefly and check if it started
  sleep 2
  if ! kill -0 $pid 2>/dev/null; then
    log_error "  $name failed to start. Check .local-pids/$name.log"
    return 1
  fi

  log_success "  $name started (PID: $pid)"
}

wait_for_service() {
  local name="$1"
  local port="$2"
  local max_attempts="${3:-30}"

  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -s "http://localhost:$port/health/live" &>/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  log_warn "$name not responding on port $port after ${max_attempts}s"
  return 1
}

start_all_services() {
  log_info "Starting services..."
  echo ""

  # Tier 1: No service dependencies
  start_service "identity" "$IDENTITY_PORT" "identity"
  wait_for_service "identity" "$IDENTITY_PORT"

  # Tier 2: Depends on identity
  start_service "network" "$NETWORK_PORT" ""
  wait_for_service "network" "$NETWORK_PORT"

  # Tier 3: Depends on identity + network
  start_service "logging" "$LOGGING_PORT" "logging"
  start_service "catalog" "$CATALOG_PORT" "catalog"
  start_service "messaging" "$MESSAGING_PORT" "messaging"
  start_service "integrations" "$INTEGRATIONS_PORT" "integrations"

  # Wait for tier 3
  wait_for_service "logging" "$LOGGING_PORT"
  wait_for_service "catalog" "$CATALOG_PORT"

  # Tier 4: Depends on catalog
  start_service "runtime" "$RUNTIME_PORT" "runtime"
  start_service "assistants" "$ASSISTANTS_PORT" "assistants"
  start_service "models" "$MODELS_PORT" ""

  # Tier 5: Admin UI
  start_service "service-admin" "$SERVICE_ADMIN_PORT" ""

  echo ""
  log_success "All services started!"
}

show_status() {
  echo ""
  log_info "Service URLs:"
  echo "  - Service Admin:  http://localhost:$SERVICE_ADMIN_PORT"
  echo "  - Identity:       http://localhost:$IDENTITY_PORT"
  echo "  - Logging:        http://localhost:$LOGGING_PORT"
  echo "  - Catalog:        http://localhost:$CATALOG_PORT"
  echo "  - Assistants:     http://localhost:$ASSISTANTS_PORT"
  echo "  - Messaging:      http://localhost:$MESSAGING_PORT"
  echo "  - Runtime:        http://localhost:$RUNTIME_PORT"
  echo "  - Integrations:   http://localhost:$INTEGRATIONS_PORT"
  echo "  - Models:         http://localhost:$MODELS_PORT"
  echo "  - Network:        http://localhost:$NETWORK_PORT"
  echo ""
  log_info "Logs: .local-pids/<service>.log"
  log_info "Press Ctrl+C to stop all services"
  echo ""
}

stop_services() {
  cleanup
}

main() {
  local db_only=false
  local skip_build=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --db-only)
        db_only=true
        shift
        ;;
      --skip-build)
        skip_build=true
        shift
        ;;
      --stop)
        stop_services
        exit 0
        ;;
      --help|-h)
        echo "Symbia Stack - Local Development (No Docker)"
        echo ""
        echo "Usage: ./start-local.sh [options]"
        echo ""
        echo "Options:"
        echo "  --db-only      Only set up databases, don't start services"
        echo "  --skip-build   Skip building libraries (faster restart)"
        echo "  --stop         Stop all running services"
        echo "  -h, --help     Show this help"
        echo ""
        echo "Environment variables:"
        echo "  POSTGRES_HOST      PostgreSQL host (default: localhost)"
        echo "  POSTGRES_PORT      PostgreSQL port (default: 5432)"
        echo "  POSTGRES_USER      PostgreSQL user (default: symbia)"
        echo "  POSTGRES_PASSWORD  PostgreSQL password (default: symbia_dev)"
        echo ""
        echo "  IDENTITY_PORT      Identity service port (default: 5001)"
        echo "  LOGGING_PORT       Logging service port (default: 5002)"
        echo "  ... etc (see .env.example for all options)"
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done

  echo ""
  log_info "╔════════════════════════════════════════════════════════════╗"
  log_info "║            SYMBIA STACK - LOCAL DEVELOPMENT                ║"
  log_info "╚════════════════════════════════════════════════════════════╝"
  echo ""

  check_requirements
  check_postgres
  setup_databases
  apply_schemas

  if [ "$db_only" = true ]; then
    log_success "Database setup complete"
    exit 0
  fi

  install_dependencies

  if [ "$skip_build" = false ]; then
    build_libraries
  fi

  start_all_services
  show_status

  # Keep running until Ctrl+C
  while true; do
    sleep 1
  done
}

main "$@"
