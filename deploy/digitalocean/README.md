# Deploying Symbia Stack to DigitalOcean

This guide covers two deployment options on DigitalOcean:
1. **App Platform** - Managed containers (simple, higher cost)
2. **Droplet + Managed Database** - VPS approach (flexible, lower cost)

## Option 1: App Platform (Recommended for Simplicity)

### Prerequisites
- DigitalOcean account
- `doctl` CLI installed and authenticated
- Domain pointed to DigitalOcean (optional)

### Architecture

```
┌─────────────────────────────────────────────────┐
│              DigitalOcean App Platform           │
│  ┌─────────────────────────────────────────┐    │
│  │              Load Balancer               │    │
│  │              (automatic)                 │    │
│  └─────────────────┬───────────────────────┘    │
│                    │                             │
│  ┌─────────┬───────┴───────┬─────────┐         │
│  │identity │  catalog      │ models  │  ...     │
│  │ (web)   │  (worker)     │ (worker)│          │
│  └─────────┴───────────────┴─────────┘         │
│                    │                             │
│  ┌─────────────────┴───────────────────┐       │
│  │     Managed PostgreSQL Database      │       │
│  └─────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

### Cost Estimate (App Platform)

| Component | Size | Monthly Cost |
|-----------|------|--------------|
| 9 Services (Basic) | 512MB each | ~$45 |
| Managed PostgreSQL | Basic | ~$15 |
| **Total** | | **~$60/month** |

*Note: Models service may need Pro plan ($12/service) for more memory.*

### Quick Start

```bash
# Install doctl
brew install doctl

# Authenticate
doctl auth init

# Deploy using app spec
doctl apps create --spec deploy/digitalocean/app-spec.yaml

# Get app URL
doctl apps list
```

## Option 2: Droplet + Managed Database

### Architecture

```
┌─────────────────────────────────────────────────┐
│                   Droplet (VPS)                  │
│  ┌─────────────────────────────────────────┐    │
│  │              Docker Compose              │    │
│  │  identity, catalog, models, etc.        │    │
│  └─────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│           Managed PostgreSQL Database            │
└─────────────────────────────────────────────────┘
```

### Cost Estimate (Droplet)

| Component | Size | Monthly Cost |
|-----------|------|--------------|
| Droplet | 4GB RAM, 2 vCPU | $24 |
| Managed PostgreSQL | Basic | $15 |
| **Total** | | **~$39/month** |

### Quick Start

```bash
# Create Droplet with Docker
doctl compute droplet create symbia-stack \
  --image docker-20-04 \
  --size s-2vcpu-4gb \
  --region nyc1 \
  --ssh-keys $(doctl compute ssh-key list --format ID --no-header | head -1)

# Create managed database
doctl databases create symbia-db \
  --engine pg \
  --region nyc1 \
  --size db-s-1vcpu-1gb

# Get connection string
doctl databases connection symbia-db --format URI
```

## Terraform Deployment

For infrastructure-as-code deployment:

```bash
cd deploy/digitalocean/terraform

# Initialize
terraform init

# Configure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Deploy
terraform apply
```

### Required Variables

```hcl
do_token     = "your-digitalocean-api-token"
region       = "nyc1"
domain       = "symbia.yourdomain.com"  # Optional
ssh_key_id   = "12345678"               # Your SSH key ID
```

## CI/CD with GitHub Actions

### Setup

1. Create a DigitalOcean API token with write access
2. Add GitHub secrets:
   - `DIGITALOCEAN_ACCESS_TOKEN` - API token
   - `DIGITALOCEAN_APP_ID` - App Platform app ID (after first deploy)

### Workflow Triggers

| Trigger | Action |
|---------|--------|
| Push to `main` | Build and deploy to App Platform |
| Push tag `v*` | Deploy with version tag |
| Manual dispatch | Select environment |

## App Platform Spec

The `app-spec.yaml` defines all services. Key sections:

```yaml
services:
  - name: identity
    http_port: 5001
    health_check:
      http_path: /health/live
    envs:
      - key: DATABASE_URL
        scope: RUN_TIME
        value: ${db.DATABASE_URL}
```

## Environment Variables

All services need:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random secret for sessions |
| `IDENTITY_SERVICE_URL` | `http://identity:5001` (internal) |

## Volumes (for Models)

App Platform doesn't support persistent volumes. For models service:
1. Use a Spaces bucket to store models
2. Download models on container start
3. Or use Droplet deployment with attached volume

```bash
# Create Spaces bucket for models
doctl spaces create symbia-models --region nyc3

# Upload models
s3cmd put model.gguf s3://symbia-models/
```

## Monitoring

### App Platform Insights
- Automatic CPU/memory monitoring
- Built-in logging
- Alerts via DigitalOcean console

### Droplet Monitoring
```bash
# Enable monitoring agent
curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash
```

## Scaling

### App Platform
```bash
# Scale a service
doctl apps update $APP_ID --spec updated-spec.yaml
```

### Droplet
Resize droplet or add load balancer with multiple droplets.

## Troubleshooting

### View Logs
```bash
# App Platform
doctl apps logs $APP_ID --type=run

# Droplet
ssh root@droplet-ip 'docker compose logs -f'
```

### Database Connection
```bash
# Test connection
doctl databases connection symbia-db

# Connect via psql
psql "$(doctl databases connection symbia-db --format URI --no-header)"
```

## Cleanup

```bash
# Delete App Platform app
doctl apps delete $APP_ID

# Delete database
doctl databases delete symbia-db

# Delete Droplet
doctl compute droplet delete symbia-stack

# Or via Terraform
terraform destroy
```
