#!/bin/bash
# Push Symbia Docker images to ECR
#
# Usage:
#   ./push-images.sh [tag]
#
# Examples:
#   ./push-images.sh          # Push with 'latest' tag
#   ./push-images.sh v1.2.0   # Push with version tag

set -e

# Configuration
TAG=${1:-latest}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
REPO_PREFIX="symbia"

# Services to build and push
SERVICES=(
  "identity"
  "logging"
  "catalog"
  "assistants"
  "messaging"
  "runtime"
  "integrations"
  "network"
  "models"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Symbia ECR Push Script ===${NC}"
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "Tag: $TAG"
echo ""

# Change to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../../.."

# Login to ECR
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_URL

# Create ECR repositories if they don't exist
echo -e "${YELLOW}Ensuring ECR repositories exist...${NC}"
for service in "${SERVICES[@]}"; do
  aws ecr describe-repositories --repository-names "$REPO_PREFIX/$service" --region $AWS_REGION 2>/dev/null || \
    aws ecr create-repository \
      --repository-name "$REPO_PREFIX/$service" \
      --image-scanning-configuration scanOnPush=true \
      --region $AWS_REGION
done

# Build base image
echo -e "${YELLOW}Building base image...${NC}"
docker build -t symbia-base:latest -f docker/Dockerfile.base .

# Build and push each service
for service in "${SERVICES[@]}"; do
  echo ""
  echo -e "${GREEN}=== Building $service ===${NC}"

  # Determine Dockerfile path
  if [ "$service" = "models" ]; then
    DOCKERFILE="models/Dockerfile"
  else
    DOCKERFILE="$service/Dockerfile"
  fi

  # Build
  docker build -t "symbia-$service:$TAG" -f "$DOCKERFILE" .

  # Tag for ECR
  docker tag "symbia-$service:$TAG" "$ECR_URL/$REPO_PREFIX/$service:$TAG"

  # Push
  echo -e "${YELLOW}Pushing $service to ECR...${NC}"
  docker push "$ECR_URL/$REPO_PREFIX/$service:$TAG"

  # Also tag as latest if not already
  if [ "$TAG" != "latest" ]; then
    docker tag "symbia-$service:$TAG" "$ECR_URL/$REPO_PREFIX/$service:latest"
    docker push "$ECR_URL/$REPO_PREFIX/$service:latest"
  fi

  echo -e "${GREEN}✓ $service pushed successfully${NC}"
done

echo ""
echo -e "${GREEN}=== All images pushed successfully ===${NC}"
echo ""
echo "Images available at:"
for service in "${SERVICES[@]}"; do
  echo "  $ECR_URL/$REPO_PREFIX/$service:$TAG"
done
