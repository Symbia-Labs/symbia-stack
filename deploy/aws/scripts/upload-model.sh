#!/bin/bash
# Upload a GGUF model to EFS via a bastion/jump host
#
# Usage:
#   ./upload-model.sh <model-file> [efs-id]
#
# Example:
#   ./upload-model.sh ~/models/llama-3.2-1b-instruct-q4_k_m.gguf

set -e

MODEL_FILE=$1
EFS_ID=${2:-$(terraform -chdir=../terraform output -raw efs_id 2>/dev/null)}

if [ -z "$MODEL_FILE" ]; then
  echo "Usage: $0 <model-file> [efs-id]"
  exit 1
fi

if [ ! -f "$MODEL_FILE" ]; then
  echo "Error: Model file not found: $MODEL_FILE"
  exit 1
fi

if [ -z "$EFS_ID" ]; then
  echo "Error: EFS ID not provided and could not be retrieved from Terraform"
  exit 1
fi

MODEL_NAME=$(basename "$MODEL_FILE")
AWS_REGION=${AWS_REGION:-us-east-1}

echo "=== Upload Model to EFS ==="
echo "Model: $MODEL_NAME"
echo "EFS ID: $EFS_ID"
echo ""

# Method 1: Use DataSync (recommended for large files)
echo "Creating DataSync task..."

# Create S3 bucket for staging if it doesn't exist
STAGING_BUCKET="symbia-model-staging-$(aws sts get-caller-identity --query Account --output text)"
aws s3 mb "s3://$STAGING_BUCKET" --region $AWS_REGION 2>/dev/null || true

# Upload to S3
echo "Uploading model to S3 staging bucket..."
aws s3 cp "$MODEL_FILE" "s3://$STAGING_BUCKET/models/$MODEL_NAME" --region $AWS_REGION

echo ""
echo "Model uploaded to S3: s3://$STAGING_BUCKET/models/$MODEL_NAME"
echo ""
echo "To complete the transfer to EFS, you can either:"
echo ""
echo "1. Use AWS DataSync (recommended for production):"
echo "   - Create a DataSync task from S3 to EFS in the AWS Console"
echo ""
echo "2. Use a bastion host with EFS mounted:"
echo "   aws s3 cp s3://$STAGING_BUCKET/models/$MODEL_NAME /mnt/efs/models/"
echo ""
echo "3. Run a one-time ECS task:"
echo "   See: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html"
