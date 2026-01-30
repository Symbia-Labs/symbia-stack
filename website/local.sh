#!/bin/bash
#
# Symbia Website - Local Development Server
#
# Serves the website with live reload for development.
# Auto-detects if Symbia platform is running and enables live mode.
#
# Usage:
#   ./website/local.sh              # Start website server
#   ./website/local.sh --stop       # Stop website server
#   ./website/local.sh --status     # Check server status
#   ./website/local.sh --platform   # Start with full platform
#
# Ports:
#   Website:  8080 (default) or PORT env var
#   Platform: 5001-5007, 5054, 5173
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PID_DIR="$ROOT_DIR/.local-pids"
LOG_BASE_DIR="$ROOT_DIR/.local-logs"
WEBSITE_PORT="${PORT:-8080}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$PID_DIR" "$LOG_BASE_DIR"

# Check if a port is in use
port_in_use() {
  local port=$1
  lsof -i ":$port" > /dev/null 2>&1
}

# Check if Symbia platform is running
check_platform() {
  if curl -s "http://localhost:5001/health" > /dev/null 2>&1; then
    return 0
  fi
  return 1
}

# Check if website server is running
is_running() {
  local pid_file="$PID_DIR/website.pid"
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

# Start website server
start_server() {
  if is_running; then
    echo -e "${YELLOW}Website server already running${NC}"
    show_status
    return 0
  fi

  if port_in_use "$WEBSITE_PORT"; then
    echo -e "${RED}Port $WEBSITE_PORT is already in use${NC}"
    echo "Try: PORT=8081 ./website/local.sh"
    exit 1
  fi

  echo -e "\n${BLUE}Starting Symbia Website${NC}"
  echo "================================"

  # Check for available server
  local server_cmd=""
  local server_name=""

  if command -v npx &> /dev/null; then
    server_cmd="npx serve -l $WEBSITE_PORT -s"
    server_name="serve (via npx)"
  elif command -v python3 &> /dev/null; then
    server_cmd="python3 -m http.server $WEBSITE_PORT"
    server_name="Python http.server"
  elif command -v python &> /dev/null; then
    server_cmd="python -m http.server $WEBSITE_PORT"
    server_name="Python http.server"
  else
    echo -e "${RED}No HTTP server found. Install Node.js or Python.${NC}"
    exit 1
  fi

  echo -e "  Using: ${CYAN}$server_name${NC}"
  echo -e "  Port:  ${CYAN}$WEBSITE_PORT${NC}"

  # Start server in background
  local log_file="$LOG_BASE_DIR/website.log"
  cd "$SCRIPT_DIR"

  (
    $server_cmd > "$log_file" 2>&1 &
    echo $! > "$PID_DIR/website.pid"
  )

  # Wait for server to start
  echo -n "  Starting server"
  local attempt=0
  while [ $attempt -lt 10 ]; do
    sleep 1
    if port_in_use "$WEBSITE_PORT"; then
      echo -e " ${GREEN}ready${NC}"
      break
    fi
    echo -n "."
    attempt=$((attempt + 1))
  done

  if ! port_in_use "$WEBSITE_PORT"; then
    echo -e " ${RED}failed${NC}"
    echo "Check log: $log_file"
    exit 1
  fi

  # Check if platform is running
  echo ""
  if check_platform; then
    echo -e "  ${GREEN}✓${NC} Symbia platform detected - live mode enabled"
    echo -e "    Services will show real-time health status"
    echo -e "    Chat will connect to messaging service"
  else
    echo -e "  ${YELLOW}○${NC} Symbia platform not running - mock mode"
    echo -e "    Start platform: ${CYAN}./scripts/dev-start.sh${NC}"
  fi

  echo ""
  echo -e "${GREEN}Website ready!${NC}"
  echo ""
  echo -e "  ${CYAN}http://localhost:$WEBSITE_PORT${NC}"
  echo ""
  echo -e "  Log:  $log_file"
  echo -e "  Stop: ${CYAN}./website/local.sh --stop${NC}"
  echo ""
}

# Stop website server
stop_server() {
  local pid_file="$PID_DIR/website.pid"

  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "${BLUE}Stopping website server (PID: $pid)...${NC}"
      kill "$pid" 2>/dev/null || true

      # Wait for shutdown
      local attempt=0
      while [ $attempt -lt 5 ] && kill -0 "$pid" 2>/dev/null; do
        sleep 1
        attempt=$((attempt + 1))
      done

      # Force kill if needed
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi

      echo -e "${GREEN}Website server stopped${NC}"
    fi
    rm -f "$pid_file"
  else
    echo -e "${YELLOW}Website server not running${NC}"
  fi
}

# Show status
show_status() {
  echo -e "\n${BLUE}Symbia Website Status${NC}"
  echo "================================"

  if is_running; then
    local pid=$(cat "$PID_DIR/website.pid")
    echo -e "${GREEN}[running]${NC} Website server (port $WEBSITE_PORT, PID $pid)"
    echo -e "          http://localhost:$WEBSITE_PORT"
  else
    echo -e "${RED}[stopped]${NC} Website server"
  fi

  echo ""
  echo -e "${BLUE}Platform Status${NC}"
  echo "--------------------------------"

  if check_platform; then
    echo -e "${GREEN}[running]${NC} Symbia platform (live mode enabled)"

    # Check individual services
    local services=("identity:5001" "logging:5002" "catalog:5003" "assistants:5004" "messaging:5005" "runtime:5006" "integrations:5007")
    for svc in "${services[@]}"; do
      IFS=':' read -r name port <<< "$svc"
      if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name (:$port)"
      else
        echo -e "  ${RED}✗${NC} $name (:$port)"
      fi
    done
  else
    echo -e "${YELLOW}[stopped]${NC} Symbia platform (mock mode)"
    echo -e "          Start with: ./scripts/dev-start.sh"
  fi
  echo ""
}

# Start with full platform
start_with_platform() {
  echo -e "\n${BLUE}Starting Symbia Website with Platform${NC}"
  echo "================================"

  # Start platform first
  if ! check_platform; then
    echo "Starting Symbia platform..."
    "$ROOT_DIR/scripts/dev-start.sh"
    echo ""
  else
    echo -e "${GREEN}Platform already running${NC}"
  fi

  # Then start website
  start_server
}

# Cleanup handler
cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  stop_server
  exit 0
}

trap cleanup SIGINT SIGTERM

# Main
case "${1:-}" in
  --stop|-s)
    stop_server
    ;;
  --status|-t)
    show_status
    ;;
  --platform|-p)
    start_with_platform
    ;;
  --help|-h)
    echo "Symbia Website - Local Development Server"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --stop, -s       Stop the website server"
    echo "  --status, -t     Show server and platform status"
    echo "  --platform, -p   Start with full Symbia platform"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Environment:"
    echo "  PORT             Server port (default: 8080)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Start website only"
    echo "  $0 --platform         # Start website + full platform"
    echo "  PORT=3000 $0          # Start on port 3000"
    ;;
  *)
    start_server
    ;;
esac
