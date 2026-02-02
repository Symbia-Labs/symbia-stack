#!/bin/bash
# Deploy all Symbia services to Fly.io
#
# Usage: ./deploy-all.sh [--create]
#
# Options:
#   --create    Create apps if they don't exist

set -e

CREATE_APPS=false
for arg in "$@"; do
  case $arg in
    --create) CREATE_APPS=true ;;
  esac
done

# Service configurations
declare -A SERVICES=(
  ["identity"]="5001:512:shared:1"
  ["logging"]="5002:512:shared:1"
  ["catalog"]="5003:512:shared:1"
  ["assistants"]="5004:512:shared:1"
  ["messaging"]="5005:512:shared:1"
  ["runtime"]="5006:512:shared:1"
  ["integrations"]="5007:512:shared:1"
  ["network"]="5054:512:shared:1"
  ["models"]="5008:4096:dedicated:2"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== Deploying Symbia Stack to Fly.io ==="
echo ""

# Check flyctl is installed
if ! command -v flyctl &> /dev/null; then
  echo "Error: flyctl not installed. Run: curl -L https://fly.io/install.sh | sh"
  exit 1
fi

# Check logged in
if ! flyctl auth whoami &> /dev/null; then
  echo "Error: Not logged in. Run: flyctl auth login"
  exit 1
fi

# Deploy each service
for service in "${!SERVICES[@]}"; do
  IFS=':' read -r port memory cpu_kind cpus <<< "${SERVICES[$service]}"

  echo ""
  echo "=== Deploying $service (port: $port, memory: ${memory}MB) ==="

  # Determine Dockerfile
  if [ "$service" = "models" ]; then
    DOCKERFILE="models/Dockerfile"
  else
    DOCKERFILE="$service/Dockerfile"
  fi

  # Create fly.toml
  cd "$ROOT_DIR"

  cat > fly.toml << EOF
app = "symbia-$service"
primary_region = "iad"

[build]
  dockerfile = "$DOCKERFILE"

[env]
  NODE_ENV = "production"
  PORT = "$port"
  HOST = "0.0.0.0"
  IDENTITY_SERVICE_URL = "http://symbia-identity.internal:5001"
  LOGGING_SERVICE_URL = "http://symbia-logging.internal:5002"
  CATALOG_SERVICE_URL = "http://symbia-catalog.internal:5003"
  ASSISTANTS_SERVICE_URL = "http://symbia-assistants.internal:5004"
  MESSAGING_SERVICE_URL = "http://symbia-messaging.internal:5005"
  RUNTIME_SERVICE_URL = "http://symbia-runtime.internal:5006"
  INTEGRATIONS_SERVICE_URL = "http://symbia-integrations.internal:5007"
  MODELS_SERVICE_URL = "http://symbia-models.internal:5008"
  NETWORK_SERVICE_URL = "http://symbia-network.internal:5054"

[http_service]
  internal_port = $port
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = $port

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "30s"
    path = "/health/live"

[[vm]]
  cpu_kind = "$cpu_kind"
  cpus = $cpus
  memory_mb = $memory
EOF

  # Add models-specific config
  if [ "$service" = "models" ]; then
    cat >> fly.toml << EOF

[mounts]
  source = "models_data"
  destination = "/data/models"
EOF
  fi

  # Create app if needed
  if [ "$CREATE_APPS" = true ]; then
    flyctl apps create "symbia-$service" --org personal 2>/dev/null || true

    # Create volume for models
    if [ "$service" = "models" ]; then
      flyctl volumes create models_data --region iad --size 50 -a "symbia-$service" 2>/dev/null || true
    fi
  fi

  # Deploy
  flyctl deploy --remote-only || echo "Warning: Failed to deploy $service"

  # Cleanup
  rm -f fly.toml
done

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Services deployed:"
for service in "${!SERVICES[@]}"; do
  echo "  https://symbia-$service.fly.dev"
done
