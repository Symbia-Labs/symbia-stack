#!/bin/bash
# Symbia Stack - Deploy to Hostinger VPS
# Run this from your local machine to deploy updates
#
# Usage: ./deploy.sh <vps-host> [tag]
#
# Examples:
#   ./deploy.sh 123.45.67.89           # Deploy latest
#   ./deploy.sh 123.45.67.89 v1.2.0    # Deploy specific version

set -e

VPS_HOST=${1:-}
IMAGE_TAG=${2:-latest}
VPS_USER=${VPS_USER:-deploy}
REMOTE_DIR="/opt/symbia"

if [ -z "$VPS_HOST" ]; then
  echo "Usage: $0 <vps-host> [tag]"
  echo "Example: $0 123.45.67.89 v1.2.0"
  exit 1
fi

echo "=== Deploying Symbia Stack ==="
echo "Host: $VPS_HOST"
echo "User: $VPS_USER"
echo "Tag: $IMAGE_TAG"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Copy updated files
echo "--- Copying configuration files ---"
scp "$DEPLOY_DIR/docker-compose.prod.yml" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/"
scp "$DEPLOY_DIR/nginx/symbia.conf" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/nginx/"

# Deploy on remote
echo "--- Deploying on VPS ---"
ssh "$VPS_USER@$VPS_HOST" << EOF
  set -e
  cd $REMOTE_DIR

  # Update image tag
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$IMAGE_TAG/" .env

  # Pull latest images
  echo "Pulling images..."
  docker compose -f docker-compose.prod.yml pull

  # Restart services with new images
  echo "Restarting services..."
  docker compose -f docker-compose.prod.yml up -d

  # Wait for health checks
  echo "Waiting for services to be healthy..."
  sleep 10

  # Show status
  docker compose -f docker-compose.prod.yml ps

  # Cleanup old images
  echo "Cleaning up old images..."
  docker image prune -f

  echo ""
  echo "Deployment complete!"
EOF

echo ""
echo "=== Deployment Complete ==="
echo "Check status: ssh $VPS_USER@$VPS_HOST 'docker compose -f $REMOTE_DIR/docker-compose.prod.yml ps'"
