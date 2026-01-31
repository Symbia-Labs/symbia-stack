#!/bin/sh
set -eu

log() {
  echo "[db-bootstrap] $*"
}

require_env() {
  name="$1"
  eval "val=\${$name:-}"
  if [ -z "$val" ]; then
    echo "[db-bootstrap] Missing required env var: $name" >&2
    exit 1
  fi
}

require_env PGHOST
require_env PGUSER
require_env PGPASSWORD
require_env PGPORT

wait_for_postgres() {
  log "Waiting for Postgres at ${PGHOST}:${PGPORT}..."
  i=0
  while [ "$i" -lt 60 ]; do
    if psql -d postgres -c "select 1" >/dev/null 2>&1; then
      log "Postgres is ready."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[db-bootstrap] Postgres did not become ready in time" >&2
  exit 1
}

create_db_if_missing() {
  db="$1"
  if psql -d postgres -tAc "select 1 from pg_database where datname='${db}'" | grep -q 1; then
    log "Database '${db}' already exists."
    return 0
  fi
  log "Creating database '${db}'..."
  psql -d postgres -v ON_ERROR_STOP=1 -c "create database \"${db}\""
}

extract_memory_schema_sql() {
  file="$1"
  awk '
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
  ' "$file"
}

to_idempotent() {
  # Make DDL safe to re-run (Postgres)
  # - CREATE TABLE -> CREATE TABLE IF NOT EXISTS
  # - CREATE INDEX -> CREATE INDEX IF NOT EXISTS
  # - CREATE UNIQUE INDEX -> CREATE UNIQUE INDEX IF NOT EXISTS
  # - CREATE TYPE ... AS ENUM -> DO-block ignoring duplicate_object
  sed -r \
    -e 's/^CREATE TYPE "([^"]+)" AS ENUM (.*);$/DO $$ BEGIN CREATE TYPE "\1" AS ENUM \2; EXCEPTION WHEN duplicate_object THEN NULL; END $$;/g' \
    -e 's/CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/g' \
    -e 's/CREATE UNIQUE INDEX /CREATE UNIQUE INDEX IF NOT EXISTS /g' \
    -e 's/CREATE INDEX /CREATE INDEX IF NOT EXISTS /g'
}

apply_schema_file() {
  db="$1"
  file="$2"
  if [ ! -f "$file" ]; then
    echo "[db-bootstrap] Schema file not found: $file" >&2
    exit 1
  fi

log "Applying schema to '${db}' from '${file}'..."
  # pgcrypto is needed for gen_random_uuid() in several schemas
  psql -d "$db" -v ON_ERROR_STOP=1 -c 'create extension if not exists "pgcrypto"'

  sql="$(extract_memory_schema_sql "$file" | to_idempotent)"
  if [ -z "$(echo "$sql" | tr -d '[:space:]')" ]; then
    log "No schema SQL found in '${file}', skipping."
    return 0
  fi
  echo "$sql" | psql -d "$db" -v ON_ERROR_STOP=1
}

wait_for_postgres

# Create per-service databases to avoid cross-service table-name collisions.
create_db_if_missing identity
create_db_if_missing logging
create_db_if_missing catalog
create_db_if_missing assistants
create_db_if_missing messaging
create_db_if_missing runtime

# Apply each service's DDL into its own database.
apply_schema_file identity /workspace/identity/server/src/memory-schema.ts
apply_schema_file logging /workspace/logging/server/src/memory-schema.ts
apply_schema_file catalog /workspace/catalog/server/src/memory-schema.ts
apply_schema_file assistants /workspace/assistants/server/src/lib/memory-schema.ts

log "Bootstrap complete."
