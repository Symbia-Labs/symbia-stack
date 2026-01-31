#!/bin/bash
set -e

# Symbia Stack Startup Script
# Handles first-run initialization vs fast subsequent restarts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() { echo -e "${CYAN}[symbia]${NC} $*"; }
log_success() { echo -e "${GREEN}[symbia]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[symbia]${NC} $*"; }
log_error() { echo -e "${RED}[symbia]${NC} $*"; }

# Check for required tools
check_requirements() {
  for cmd in docker docker-compose; do
    if ! command -v "$cmd" &> /dev/null; then
      log_error "Required command not found: $cmd"
      exit 1
    fi
  done
}

# Detect if this is a first run
is_first_run() {
  # Check if postgres volume has data
  if docker volume inspect symbia-stack_postgres_data &> /dev/null; then
    # Volume exists - check if it has actual data
    if docker run --rm -v symbia-stack_postgres_data:/data alpine ls /data/PG_VERSION &> /dev/null; then
      return 1  # Not first run - data exists
    fi
  fi
  return 0  # First run
}

# Check if base image exists
has_base_image() {
  docker image inspect symbia-base:latest &> /dev/null
}

# Check if service images exist
has_service_images() {
  local services=("identity" "logging" "catalog" "messaging" "network" "runtime" "assistants" "integrations" "service-admin")
  for svc in "${services[@]}"; do
    if ! docker image inspect "symbia-stack-${svc}:latest" &> /dev/null 2>&1; then
      # Try alternate naming convention
      if ! docker image inspect "symbia-stack_${svc}:latest" &> /dev/null 2>&1; then
        return 1
      fi
    fi
  done
  return 0
}

# Build base image with shared libraries
build_base_image() {
  log_info "Building shared library base image..."
  docker build -t symbia-base:latest -f docker/Dockerfile.base .
  log_success "Base image built successfully"
}

# Build all service images
build_service_images() {
  log_info "Building service images..."
  # Build sequentially to avoid I/O issues on some Docker setups
  docker-compose build
  log_success "Service images built successfully"
}

# Wait for postgres to be ready
wait_for_postgres() {
  log_info "Waiting for PostgreSQL to be ready..."
  local max_attempts=60
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if docker-compose exec -T postgres pg_isready -U symbia &> /dev/null; then
      log_success "PostgreSQL is ready"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  log_error "PostgreSQL did not become ready in time"
  exit 1
}

# Run database bootstrap
run_db_bootstrap() {
  log_info "Running database bootstrap..."
  docker-compose up -d postgres
  wait_for_postgres
  # Run bootstrap directly from main compose file, ignoring override
  docker-compose -f docker-compose.yml up db-bootstrap
  log_success "Database bootstrap complete"
}

# Create super admin user (first user in system)
create_super_admin() {
  log_info "Checking for super admin user..."

  # Check if any users exist
  local user_count
  user_count=$(docker-compose exec -T postgres psql -U symbia -d identity -tAc "SELECT COUNT(*) FROM users" 2>/dev/null || echo "0")

  if [ "$user_count" = "0" ] || [ -z "$user_count" ]; then
    echo ""
    log_info "╔════════════════════════════════════════════════════════════╗"
    log_info "║              SUPER ADMIN SETUP REQUIRED                     ║"
    log_info "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # Prompt for admin details
    local admin_name admin_email admin_password admin_password_confirm org_name

    # Name
    while [ -z "$admin_name" ]; do
      read -p "  Enter admin name (display name): " admin_name
      if [ -z "$admin_name" ]; then
        log_error "Name is required"
      fi
    done

    # Email
    while [ -z "$admin_email" ]; do
      read -p "  Enter admin email: " admin_email
      if [ -z "$admin_email" ]; then
        log_error "Email is required"
      elif [[ ! "$admin_email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
        log_error "Invalid email format"
        admin_email=""
      fi
    done

    # Password with confirmation
    while [ -z "$admin_password" ]; do
      read -s -p "  Enter admin password: " admin_password
      echo ""
      if [ -z "$admin_password" ]; then
        log_error "Password is required"
        continue
      fi
      if [ ${#admin_password} -lt 8 ]; then
        log_error "Password must be at least 8 characters"
        admin_password=""
        continue
      fi
      read -s -p "  Confirm password: " admin_password_confirm
      echo ""
      if [ "$admin_password" != "$admin_password_confirm" ]; then
        log_error "Passwords do not match"
        admin_password=""
      fi
    done

    # Organization name
    while [ -z "$org_name" ]; do
      read -p "  Enter organization name: " org_name
      if [ -z "$org_name" ]; then
        log_error "Organization name is required"
      fi
    done

    echo ""
    log_info "Creating super admin user..."

    # Start identity service
    docker-compose up -d identity

    # Wait for identity service to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
      if curl -s http://localhost:5001/health/live &> /dev/null; then
        break
      fi
      attempt=$((attempt + 1))
      sleep 2
    done

    if [ $attempt -ge $max_attempts ]; then
      log_error "Identity service not ready, cannot create super admin"
      log_error "Please create an admin user manually via the API"
      exit 1
    fi

    # Register the super admin user
    local response
    response=$(curl -s -X POST http://localhost:5001/api/auth/register \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"$admin_email\", \"password\": \"$admin_password\", \"name\": \"$admin_name\", \"orgName\": \"$org_name\"}" \
      2>/dev/null || echo "{}")

    if echo "$response" | grep -q '"user"'; then
      log_success "Super admin created successfully"
      echo ""
      log_info "╔════════════════════════════════════════════════════════════╗"
      log_info "║  Admin: $admin_name <$admin_email>"
      log_info "║  Organization: $org_name"
      log_info "╚════════════════════════════════════════════════════════════╝"
      echo ""
    else
      log_error "Could not create super admin: $response"
      exit 1
    fi
  else
    log_info "Users already exist, skipping super admin creation"
  fi
}

# Start all services
start_services() {
  log_info "Starting all services..."
  docker-compose up -d
  log_success "All services started"
}

# Show service status
show_status() {
  echo ""
  log_info "Service Status:"
  docker-compose ps
  echo ""
  log_info "Service URLs:"
  echo "  - Service Admin:  http://localhost:3000"
  echo "  - Identity:       http://localhost:5001"
  echo "  - Logging:        http://localhost:5002"
  echo "  - Catalog:        http://localhost:5003"
  echo "  - Assistants:     http://localhost:5004"
  echo "  - Messaging:      http://localhost:5005"
  echo "  - Runtime:        http://localhost:5006"
  echo "  - Integrations:   http://localhost:5007"
  echo "  - Network:        http://localhost:5054"
  echo ""
}

# Main execution
main() {
  check_requirements

  local force_rebuild=false
  local skip_admin=false

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      --rebuild|-r)
        force_rebuild=true
        shift
        ;;
      --skip-admin)
        skip_admin=true
        shift
        ;;
      --help|-h)
        echo "Symbia Stack Startup Script"
        echo ""
        echo "Usage: ./start.sh [options]"
        echo ""
        echo "Options:"
        echo "  -r, --rebuild    Force rebuild of all images"
        echo "  --skip-admin     Skip super admin creation prompt"
        echo "  -h, --help       Show this help message"
        echo ""
        echo "On first run, you will be prompted to create a super admin account"
        echo "with name, email, password, and organization name."
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
  log_info "║                    SYMBIA STACK STARTUP                     ║"
  log_info "╚════════════════════════════════════════════════════════════╝"
  echo ""

  if is_first_run || [ "$force_rebuild" = true ]; then
    log_info "First run detected - performing full initialization..."
    echo ""

    # Build base image if needed
    if ! has_base_image || [ "$force_rebuild" = true ]; then
      build_base_image
    else
      log_info "Base image already exists, skipping build"
    fi

    # Build service images
    if ! has_service_images || [ "$force_rebuild" = true ]; then
      build_service_images
    else
      log_info "Service images already exist, skipping build"
    fi

    # Initialize database
    run_db_bootstrap

    # Create super admin
    if [ "$skip_admin" = false ]; then
      create_super_admin
    fi

    # Start all services
    start_services

    log_success "First run initialization complete!"

  else
    log_info "Existing installation detected - performing fast restart..."
    echo ""

    # Just start the services
    start_services

    log_success "Fast restart complete!"
  fi

  show_status
}

main "$@"
