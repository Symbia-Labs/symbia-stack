# Deploying Symbia Stack to AWS Fargate

This guide walks through deploying the complete Symbia stack to AWS using ECS Fargate.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform 1.5+ installed
- Docker installed (for building/pushing images)
- A registered domain (optional, for custom domain)

## Architecture Components

| Component | AWS Service | Purpose |
|-----------|-------------|---------|
| Compute | ECS Fargate | Run containerized services |
| Database | RDS PostgreSQL | Persistent data storage |
| Load Balancer | Application Load Balancer | Route external traffic |
| Service Discovery | AWS Cloud Map | Inter-service communication |
| Container Registry | ECR | Store Docker images |
| Secrets | Secrets Manager | Store credentials |
| File Storage | EFS | Store GGUF models |
| DNS | Route 53 | Custom domain (optional) |

## Cost Estimate

| Resource | Estimated Monthly Cost |
|----------|----------------------|
| Fargate (9 services, 0.5 vCPU, 1GB each) | ~$150 |
| RDS PostgreSQL (db.t3.micro) | ~$15 |
| ALB | ~$20 |
| EFS (10GB) | ~$3 |
| NAT Gateway | ~$35 |
| **Total** | **~$225/month** |

*Note: Models service may need more memory (2-4GB) for larger models, which increases cost.*

## Quick Start

### 1. Set Environment Variables

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ENVIRONMENT=production
export DOMAIN_NAME=symbia.example.com  # Optional
```

### 2. Create ECR Repositories and Push Images

```bash
cd deploy/aws
./scripts/push-images.sh
```

### 3. Deploy Infrastructure with Terraform

```bash
cd terraform
terraform init
terraform plan -var-file=production.tfvars
terraform apply -var-file=production.tfvars
```

### 4. Run Database Migrations

```bash
./scripts/run-migrations.sh
```

### 5. Create Initial Admin User

```bash
./scripts/create-admin.sh
```

## Detailed Steps

### Step 1: Create ECR Repositories

Each service needs its own ECR repository:

```bash
# Create repositories for all services
for service in identity logging catalog assistants messaging runtime integrations models network; do
  aws ecr create-repository \
    --repository-name symbia/$service \
    --image-scanning-configuration scanOnPush=true \
    --region $AWS_REGION
done
```

### Step 2: Build and Push Images

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push each service
cd /path/to/symbia-stack

# Build base image first
docker build -t symbia-base:latest -f docker/Dockerfile.base .

# Build and push each service
for service in identity logging catalog assistants messaging runtime integrations network; do
  docker build -t symbia-$service:latest -f $service/Dockerfile .
  docker tag symbia-$service:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/symbia/$service:latest
  docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/symbia/$service:latest
done

# Models service (special Dockerfile)
docker build -t symbia-models:latest -f models/Dockerfile .
docker tag symbia-models:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/symbia/models:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/symbia/models:latest
```

### Step 3: Create Secrets in AWS Secrets Manager

```bash
# Generate secrets
SESSION_SECRET=$(openssl rand -base64 32)
NETWORK_HASH_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 24)

# Create secrets in AWS
aws secretsmanager create-secret \
  --name symbia/production/database \
  --secret-string "{\"username\":\"symbia\",\"password\":\"$DB_PASSWORD\"}"

aws secretsmanager create-secret \
  --name symbia/production/session \
  --secret-string "{\"secret\":\"$SESSION_SECRET\"}"

aws secretsmanager create-secret \
  --name symbia/production/network \
  --secret-string "{\"hashSecret\":\"$NETWORK_HASH_SECRET\"}"

# Optional: Add LLM provider keys
aws secretsmanager create-secret \
  --name symbia/production/llm-keys \
  --secret-string "{\"openaiApiKey\":\"sk-...\",\"anthropicApiKey\":\"sk-ant-...\"}"
```

### Step 4: Deploy with Terraform

See `terraform/` directory for full infrastructure code.

```bash
cd terraform
terraform init
terraform apply -var-file=production.tfvars
```

### Step 5: Upload GGUF Models to EFS

```bash
# Get EFS mount target IP
EFS_IP=$(aws efs describe-mount-targets --file-system-id $EFS_ID --query 'MountTargets[0].IpAddress' --output text)

# From a bastion host or VPN-connected machine:
sudo mount -t nfs4 $EFS_IP:/ /mnt/efs
sudo mkdir -p /mnt/efs/models
sudo cp /path/to/model.gguf /mnt/efs/models/
```

## Service Configuration

### Memory Requirements

| Service | Min Memory | Recommended |
|---------|------------|-------------|
| identity | 512 MB | 1 GB |
| logging | 512 MB | 1 GB |
| catalog | 512 MB | 1 GB |
| assistants | 1 GB | 2 GB |
| messaging | 512 MB | 1 GB |
| runtime | 1 GB | 2 GB |
| integrations | 512 MB | 1 GB |
| network | 512 MB | 1 GB |
| **models** | **2 GB** | **4-8 GB** |

### Environment Variables per Service

Each service needs specific environment variables. See `terraform/task-definitions/` for complete configurations.

Common variables:
```
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/dbname
IDENTITY_SERVICE_URL=http://identity.symbia.local:5001
CATALOG_SERVICE_URL=http://catalog.symbia.local:5003
NETWORK_SERVICE_URL=http://network.symbia.local:5054
```

## Networking

### Service Discovery

Services communicate via AWS Cloud Map (internal DNS):

| Service | Internal DNS | Port |
|---------|--------------|------|
| identity | identity.symbia.local | 5001 |
| logging | logging.symbia.local | 5002 |
| catalog | catalog.symbia.local | 5003 |
| assistants | assistants.symbia.local | 5004 |
| messaging | messaging.symbia.local | 5005 |
| runtime | runtime.symbia.local | 5006 |
| integrations | integrations.symbia.local | 5007 |
| models | models.symbia.local | 5008 |
| network | network.symbia.local | 5054 |

### Security Groups

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     ALB     │────▶│   Services  │────▶│     RDS     │
│  (0.0.0.0)  │     │ (ALB only)  │     │ (services)  │
└─────────────┘     └─────────────┘     └─────────────┘
    :443              :5001-5054           :5432
```

## Monitoring

### CloudWatch Logs

All services log to CloudWatch Log Groups:
- `/ecs/symbia/identity`
- `/ecs/symbia/catalog`
- etc.

### Health Checks

ALB performs health checks on `/health/live` for each service.

### Alarms (Recommended)

```bash
# Create CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name symbia-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## Scaling

### Auto Scaling

```hcl
# In Terraform
resource "aws_appautoscaling_target" "service" {
  service_namespace  = "ecs"
  resource_id        = "service/${cluster_name}/${service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = 4
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service.resource_id
  scalable_dimension = aws_appautoscaling_target.service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
```

## Troubleshooting

### Service Won't Start

1. Check CloudWatch Logs for errors
2. Verify secrets are accessible
3. Check security group rules
4. Verify service discovery registration

```bash
# Check service logs
aws logs tail /ecs/symbia/identity --follow

# Check task status
aws ecs describe-tasks --cluster symbia --tasks $TASK_ARN
```

### Database Connection Issues

1. Verify RDS security group allows traffic from ECS tasks
2. Check DATABASE_URL format
3. Verify RDS is in the same VPC

### Models Service Out of Memory

Increase task memory in task definition:

```hcl
resource "aws_ecs_task_definition" "models" {
  memory = 4096  # 4 GB
  cpu    = 1024  # 1 vCPU
}
```

## CI/CD with GitHub Actions

The repository includes a GitHub Actions workflow for automated deployments.

### Setup

1. **Create an IAM OIDC Provider** for GitHub Actions:

```bash
# Get the GitHub OIDC thumbprint
THUMBPRINT=$(openssl s_client -servername token.actions.githubusercontent.com \
  -showcerts -connect token.actions.githubusercontent.com:443 < /dev/null 2>/dev/null | \
  openssl x509 -fingerprint -noout | cut -d'=' -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')

# Create the OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list $THUMBPRINT
```

2. **Create an IAM Role** for GitHub Actions:

```bash
# Create trust policy
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/symbia-stack:*"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name symbia-github-deploy \
  --assume-role-policy-document file://trust-policy.json

# Attach permissions (ECR, ECS, etc.)
aws iam attach-role-policy \
  --role-name symbia-github-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

aws iam attach-role-policy \
  --role-name symbia-github-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess
```

3. **Add Repository Secret**:

In GitHub repository settings, add:
- `AWS_DEPLOY_ROLE_ARN`: `arn:aws:iam::ACCOUNT_ID:role/symbia-github-deploy`

### Workflow Triggers

| Trigger | Action |
|---------|--------|
| Push to `main` | Build images, deploy to ECS |
| Push tag `v*` | Build images with version tag, deploy |
| Manual dispatch | Select environment, deploy |
| Pull request | Terraform plan (no apply) |

### Manual Deployment

```bash
# Trigger workflow manually via GitHub CLI
gh workflow run deploy-aws.yml -f environment=production
```

## Cleanup

```bash
# Destroy all resources
cd terraform
terraform destroy -var-file=production.tfvars

# Delete ECR images
for service in identity logging catalog assistants messaging runtime integrations models network; do
  aws ecr delete-repository --repository-name symbia/$service --force
done

# Delete secrets
aws secretsmanager delete-secret --secret-id symbia/production/database --force-delete-without-recovery
```
