# Deploying Symbia Stack to Fly.io

Fly.io runs containers on edge servers worldwide, providing low-latency access. Great for the models service where inference latency matters.

## Prerequisites

- Fly.io account
- `flyctl` CLI installed and authenticated
- Credit card on file (for provisioning)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Fly.io Edge                           │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  iad     │  │  lax     │  │  ams     │   Edge regions    │
│  │ (models) │  │ (models) │  │ (models) │                   │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Primary Region (iad)                │   │
│  │  identity, catalog, assistants, messaging, etc.     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌───────────────────────┴─────────────────────────────┐   │
│  │              Fly Postgres (iad)                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Cost Estimate

| Component | Size | Monthly Cost |
|-----------|------|--------------|
| 8 Services (shared-cpu-1x) | 256MB each | ~$16 |
| Models Service (dedicated-cpu-2x) | 2GB | ~$30 |
| Fly Postgres | 1GB | ~$7 |
| Volumes (10GB for models) | | ~$2 |
| **Total** | | **~$55/month** |

*Fly.io bills by the second, so costs scale with actual usage.*

## Quick Start

### 1. Install Fly CLI

```bash
# macOS
brew install flyctl

# Or curl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

### 2. Create Organization (optional)

```bash
fly orgs create symbia
```

### 3. Create Postgres Database

```bash
fly postgres create \
  --name symbia-db \
  --region iad \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 10
```

### 4. Deploy Services

```bash
cd deploy/fly

# Deploy each service
for service in identity logging catalog assistants messaging runtime integrations network models; do
  cd $service
  fly launch --no-deploy
  fly secrets set DATABASE_URL="postgres://..." SESSION_SECRET="..."
  fly deploy
  cd ..
done
```

Or use the deployment script:

```bash
./deploy/fly/scripts/deploy-all.sh
```

## Service Configuration

Each service has its own `fly.toml`:

```toml
# fly.toml for identity service
app = "symbia-identity"
primary_region = "iad"

[build]
  dockerfile = "../../../identity/Dockerfile"

[env]
  PORT = "5001"
  NODE_ENV = "production"

[http_service]
  internal_port = 5001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[services]]
  protocol = "tcp"
  internal_port = 5001

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = "15s"
    timeout = "2s"
    path = "/health/live"
```

## Internal Networking

Fly.io provides private networking between apps via `.internal` DNS:

```
identity.internal:5001
catalog.internal:5003
models.internal:5008
```

Set environment variables:
```bash
fly secrets set \
  IDENTITY_SERVICE_URL=http://symbia-identity.internal:5001 \
  CATALOG_SERVICE_URL=http://symbia-catalog.internal:5003 \
  MODELS_SERVICE_URL=http://symbia-models.internal:5008
```

## Models Service (Special Configuration)

The models service needs:
1. More memory for LLM inference
2. Persistent volume for GGUF files
3. Optionally deployed to multiple regions for edge inference

```toml
# fly.toml for models
app = "symbia-models"
primary_region = "iad"

[build]
  dockerfile = "../../../models/Dockerfile"

[env]
  PORT = "5008"
  MODELS_PATH = "/data/models"
  MAX_LOADED_MODELS = "2"

[mounts]
  source = "models_data"
  destination = "/data/models"

[[vm]]
  cpu_kind = "dedicated"
  cpus = 2
  memory_mb = 4096
```

### Upload Models via SFTP

```bash
# Connect to the machine
fly ssh console -a symbia-models

# Or use sftp
fly ssh sftp shell -a symbia-models
put llama-3.2-1b-instruct-q4_k_m.gguf /data/models/
```

## Multi-Region Deployment

Deploy models service to multiple regions for edge inference:

```bash
# Add regions
fly regions add lax ams fra -a symbia-models

# Scale to multiple regions
fly scale count 3 -a symbia-models --max-per-region 1
```

## CI/CD with GitHub Actions

### Setup

1. Create Fly.io API token: `fly tokens create deploy`
2. Add GitHub secrets:
   - `FLY_API_TOKEN` - Deploy token

### Workflow

The GitHub Action deploys all services on push to main.

## Environment Variables

Set secrets for each app:

```bash
# Generate secrets
SESSION_SECRET=$(openssl rand -base64 32)
NETWORK_HASH_SECRET=$(openssl rand -base64 32)

# Set for all apps
for app in symbia-identity symbia-catalog symbia-models; do
  fly secrets set \
    SESSION_SECRET="$SESSION_SECRET" \
    NETWORK_HASH_SECRET="$NETWORK_HASH_SECRET" \
    -a $app
done

# Database URL (get from postgres)
fly secrets set DATABASE_URL="$(fly postgres connect -a symbia-db)" -a symbia-identity
```

## Monitoring

### Logs
```bash
# Tail logs
fly logs -a symbia-identity

# All apps
fly logs -a symbia-identity & fly logs -a symbia-catalog &
```

### Metrics
```bash
# Built-in metrics
fly status -a symbia-identity

# Grafana dashboard (Fly.io provides)
fly dashboard -a symbia-identity
```

### Health Checks
```bash
# Check all services
for app in symbia-identity symbia-catalog symbia-models; do
  echo "$app: $(curl -s https://$app.fly.dev/health/live)"
done
```

## Scaling

```bash
# Scale horizontally
fly scale count 3 -a symbia-identity

# Scale vertically
fly scale vm dedicated-cpu-2x -a symbia-models
fly scale memory 4096 -a symbia-models
```

## Connecting Postgres

```bash
# Get connection string
fly postgres connect -a symbia-db

# Attach to app (creates DATABASE_URL secret)
fly postgres attach symbia-db -a symbia-identity
```

## Custom Domains

```bash
# Add custom domain
fly certs create api.symbia.com -a symbia-identity

# Check status
fly certs show api.symbia.com -a symbia-identity
```

## Troubleshooting

### SSH into Container
```bash
fly ssh console -a symbia-identity
```

### View Running Processes
```bash
fly status -a symbia-identity
fly machine list -a symbia-identity
```

### Restart Service
```bash
fly apps restart symbia-identity
```

### Database Issues
```bash
# Connect to postgres
fly postgres connect -a symbia-db

# Check connections
SELECT * FROM pg_stat_activity;
```

## Cleanup

```bash
# Delete all apps
for app in symbia-identity symbia-logging symbia-catalog symbia-assistants \
           symbia-messaging symbia-runtime symbia-integrations symbia-network symbia-models; do
  fly apps destroy $app -y
done

# Delete postgres
fly postgres destroy symbia-db -y

# Delete volumes
fly volumes list -a symbia-models
fly volumes destroy vol_xxxxx -y
```
