#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[symbia]${NC} $*"; }
log_success() { echo -e "${GREEN}[symbia]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[symbia]${NC} $*"; }
log_error() { echo -e "${RED}[symbia]${NC} $*"; }

SESSION_SECRET="${SESSION_SECRET:-symbia-replit-dev-secret}"
NETWORK_HASH_SECRET="${NETWORK_HASH_SECRET:-symbia-network-replit-secret}"

IDENTITY_PORT="${IDENTITY_PORT:-5001}"
LOGGING_PORT="${LOGGING_PORT:-5002}"
CATALOG_PORT="${CATALOG_PORT:-5003}"
ASSISTANTS_PORT="${ASSISTANTS_PORT:-5004}"
MESSAGING_PORT="${MESSAGING_PORT:-5005}"
RUNTIME_PORT="${RUNTIME_PORT:-5006}"
INTEGRATIONS_PORT="${INTEGRATIONS_PORT:-5007}"
MODELS_PORT="${MODELS_PORT:-5008}"
NETWORK_PORT="${NETWORK_PORT:-5054}"

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

setup_database() {
  log_info "Setting up database schemas..."
  
  psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"' 2>/dev/null || true
  
  apply_schema() {
    local file="$1"
    
    if [ ! -f "$file" ]; then
      log_warn "  Schema file not found: $file"
      return
    fi
    
    log_info "  Applying schema from $file..."
    
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
      log_info "    No schema SQL found"
      return
    fi
    
    sql=$(echo "$sql" | sed -E \
      -e 's/^CREATE TYPE "([^"]+)" AS ENUM (.*);$/DO $$ BEGIN CREATE TYPE "\1" AS ENUM \2; EXCEPTION WHEN duplicate_object THEN NULL; END $$;/g' \
      -e 's/CREATE TABLE "([^"]+)"/CREATE TABLE IF NOT EXISTS "\1"/g' \
      -e 's/CREATE UNIQUE INDEX ([^I][^F])/CREATE UNIQUE INDEX IF NOT EXISTS \1/g' \
      -e 's/CREATE INDEX ([^I][^F])/CREATE INDEX IF NOT EXISTS \1/g')
    
    echo "$sql" | psql "$DATABASE_URL" -v ON_ERROR_STOP=0 2>/dev/null || true
  }
  
  apply_schema "$SCRIPT_DIR/identity/server/src/memory-schema.ts"
  apply_schema "$SCRIPT_DIR/logging/server/src/memory-schema.ts"
  apply_schema "$SCRIPT_DIR/catalog/server/src/memory-schema.ts"
  apply_schema "$SCRIPT_DIR/integrations/server/src/memory-schema.ts"
  apply_schema "$SCRIPT_DIR/assistants/server/src/lib/memory-schema.ts"
  
  log_success "Database schemas ready"
}

start_service() {
  local name="$1"
  local port="$2"
  
  log_info "Starting $name on port $port..."
  
  cd "$SCRIPT_DIR"
  
  NODE_ENV=production \
  PORT=$port \
  HOST=0.0.0.0 \
  SESSION_SECRET=$SESSION_SECRET \
  NETWORK_HASH_SECRET=$NETWORK_HASH_SECRET \
  IDENTITY_SERVICE_URL=http://localhost:$IDENTITY_PORT \
  LOGGING_SERVICE_URL=http://localhost:$LOGGING_PORT \
  NETWORK_SERVICE_URL=http://localhost:$NETWORK_PORT \
  CATALOG_SERVICE_URL=http://localhost:$CATALOG_PORT \
  ASSISTANTS_SERVICE_URL=http://localhost:$ASSISTANTS_PORT \
  MESSAGING_SERVICE_URL=http://localhost:$MESSAGING_PORT \
  RUNTIME_SERVICE_URL=http://localhost:$RUNTIME_PORT \
  INTEGRATIONS_SERVICE_URL=http://localhost:$INTEGRATIONS_PORT \
  npm run start -w "$name" > "$PID_DIR/$name.log" 2>&1 &
  
  local pid=$!
  echo $pid > "$PID_DIR/$name.pid"
  
  sleep 2
  if ! kill -0 $pid 2>/dev/null; then
    log_error "  $name failed to start. Check .local-pids/$name.log"
    cat "$PID_DIR/$name.log" | tail -20
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
      log_success "  $name is ready"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  
  log_warn "  $name not responding on port $port after ${max_attempts}s"
  return 1
}

log_info "Starting Symbia services..."
echo ""

setup_database

start_service "identity" "$IDENTITY_PORT"
wait_for_service "identity" "$IDENTITY_PORT" 20

start_service "network" "$NETWORK_PORT"
wait_for_service "network" "$NETWORK_PORT" 20

start_service "logging" "$LOGGING_PORT"
start_service "catalog" "$CATALOG_PORT"
start_service "messaging" "$MESSAGING_PORT"

sleep 3

start_service "runtime" "$RUNTIME_PORT"
start_service "integrations" "$INTEGRATIONS_PORT"
start_service "models" "$MODELS_PORT"
start_service "assistants" "$ASSISTANTS_PORT"

sleep 5

echo ""
log_success "All services started!"
echo ""
log_info "Service URLs:"
echo "  Identity:     http://localhost:$IDENTITY_PORT"
echo "  Logging:      http://localhost:$LOGGING_PORT"
echo "  Catalog:      http://localhost:$CATALOG_PORT"
echo "  Messaging:    http://localhost:$MESSAGING_PORT"
echo "  Runtime:      http://localhost:$RUNTIME_PORT"
echo "  Integrations: http://localhost:$INTEGRATIONS_PORT"
echo "  Models:       http://localhost:$MODELS_PORT"
echo "  Assistants:   http://localhost:$ASSISTANTS_PORT"
echo "  Network:      http://localhost:$NETWORK_PORT"
echo ""
log_info "Logs available in .local-pids/*.log"
echo ""

wait
