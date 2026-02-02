# Deploying Symbia Stack to Hostinger VPS

This guide walks through deploying the complete Symbia stack to a Hostinger VPS using Docker Compose.

## Prerequisites

- Hostinger VPS (KVM 2 or higher recommended)
  - Minimum: 4 GB RAM, 2 vCPU, 80 GB SSD
  - Recommended: 8 GB RAM, 4 vCPU for models service
- Domain pointed to your VPS IP
- SSH access to your VPS

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Hostinger VPS                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │                   Nginx                          │    │
│  │              (Reverse Proxy)                     │    │
│  │                 :80/:443                         │    │
│  └───────────────────┬─────────────────────────────┘    │
│                      │                                   │
│  ┌───────────────────┴─────────────────────────────┐    │
│  │              Docker Network                      │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │    │
│  │  │identity │ │ catalog │ │assistants│  ...      │    │
│  │  │  :5001  │ │  :5003  │ │  :5004  │           │    │
│  │  └─────────┘ └─────────┘ └─────────┘           │    │
│  │                                                  │    │
│  │  ┌─────────┐ ┌─────────────────────┐           │    │
│  │  │ models  │ │     PostgreSQL      │           │    │
│  │  │  :5008  │ │       :5432         │           │    │
│  │  └─────────┘ └─────────────────────┘           │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  /data/models/*.gguf                                     │
└─────────────────────────────────────────────────────────┘
```

## Cost Estimate

| Hostinger Plan | RAM | vCPU | Storage | Price/month |
|----------------|-----|------|---------|-------------|
| KVM 2 | 8 GB | 4 | 100 GB | ~$13 |
| KVM 4 | 16 GB | 8 | 200 GB | ~$18 |

*Much cheaper than AWS, but you manage the server yourself.*

## Quick Start

### 1. Initial VPS Setup

SSH into your VPS and run the setup script:

```bash
# On your local machine
scp deploy/hostinger/scripts/setup-vps.sh root@YOUR_VPS_IP:/root/
ssh root@YOUR_VPS_IP

# On the VPS
chmod +x setup-vps.sh
./setup-vps.sh
```

### 2. Configure Environment

```bash
# On the VPS
cd /opt/symbia
cp .env.example .env
nano .env  # Edit with your values
```

Required environment variables:
```bash
# Domain
DOMAIN=symbia.yourdomain.com

# Database
POSTGRES_PASSWORD=your-secure-password
DATABASE_URL=postgresql://symbia:${POSTGRES_PASSWORD}@postgres:5432/symbia

# Secrets
SESSION_SECRET=your-session-secret
NETWORK_HASH_SECRET=your-network-hash

# Optional: LLM API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Deploy

```bash
# Pull and start all services
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

### 4. Setup SSL with Let's Encrypt

```bash
# Install certbot
apt install certbot python3-certbot-nginx -y

# Get certificate
certbot --nginx -d symbia.yourdomain.com

# Auto-renewal is configured automatically
```

## Detailed Setup

### VPS Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 4 GB | 8 GB |
| vCPU | 2 | 4 |
| Storage | 50 GB | 100 GB |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |

### Directory Structure

```
/opt/symbia/
├── docker-compose.prod.yml
├── .env
├── nginx/
│   └── symbia.conf
├── data/
│   ├── postgres/
│   └── models/
└── logs/
```

### Service Ports

| Service | Internal Port | External |
|---------|--------------|----------|
| identity | 5001 | via nginx |
| logging | 5002 | internal only |
| catalog | 5003 | internal only |
| assistants | 5004 | internal only |
| messaging | 5005 | internal only |
| runtime | 5006 | internal only |
| integrations | 5007 | via nginx |
| models | 5008 | internal only |
| network | 5054 | internal only |
| postgres | 5432 | internal only |

### Nginx Configuration

The nginx config routes external traffic:
- `/api/auth/*` → identity:5001
- `/api/integrations/*` → integrations:5007
- All other internal services are not exposed

### Upload GGUF Models

```bash
# From your local machine
scp ~/models/llama-3.2-1b-instruct-q4_k_m.gguf root@YOUR_VPS_IP:/opt/symbia/data/models/

# Or use rsync for large files
rsync -avz --progress ~/models/*.gguf root@YOUR_VPS_IP:/opt/symbia/data/models/
```

## CI/CD with GitHub Actions

### Setup SSH Deploy Key

1. Generate a deploy key:
```bash
ssh-keygen -t ed25519 -C "symbia-deploy" -f symbia-deploy-key
```

2. Add public key to VPS:
```bash
cat symbia-deploy-key.pub >> ~/.ssh/authorized_keys
```

3. Add secrets to GitHub repository:
   - `VPS_HOST`: Your VPS IP address
   - `VPS_SSH_KEY`: Contents of `symbia-deploy-key` (private key)
   - `VPS_USER`: `root` or deploy user

### Workflow Triggers

| Trigger | Action |
|---------|--------|
| Push to `main` | Build images, deploy via SSH |
| Push tag `v*` | Same with version tag |
| Manual dispatch | Select and deploy |

## Monitoring

### Check Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f identity

# Nginx access logs
tail -f /var/log/nginx/access.log
```

### Health Checks

```bash
# Check all services
curl http://localhost:5001/health/live  # identity
curl http://localhost:5003/health/live  # catalog
curl http://localhost:5008/health/live  # models
```

### Resource Usage

```bash
# Docker stats
docker stats

# System resources
htop
df -h
```

## Backup

### Database Backup

```bash
# Create backup
docker exec symbia-postgres pg_dump -U symbia symbia > backup-$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker exec -i symbia-postgres psql -U symbia symbia
```

### Automated Backups

Add to crontab (`crontab -e`):
```bash
0 2 * * * docker exec symbia-postgres pg_dump -U symbia symbia > /opt/symbia/backups/db-$(date +\%Y\%m\%d).sql
0 3 * * 0 find /opt/symbia/backups -mtime +30 -delete
```

## Scaling

### Vertical Scaling

Upgrade your Hostinger VPS plan for more RAM/CPU.

### Horizontal Scaling

For high availability, consider:
1. Multiple VPS with load balancer
2. Managed PostgreSQL (external)
3. Shared storage for models (NFS)

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs identity

# Check container status
docker compose -f docker-compose.prod.yml ps

# Restart service
docker compose -f docker-compose.prod.yml restart identity
```

### Database Connection Issues

```bash
# Check postgres is running
docker compose -f docker-compose.prod.yml ps postgres

# Test connection
docker exec -it symbia-postgres psql -U symbia -d symbia
```

### Out of Memory

```bash
# Check memory usage
free -h
docker stats --no-stream

# Reduce model memory (edit docker-compose.prod.yml)
# Or upgrade VPS plan
```

### SSL Certificate Issues

```bash
# Renew certificate
certbot renew

# Check certificate
certbot certificates
```

## Security Checklist

- [ ] Change default SSH port
- [ ] Disable root login (use sudo user)
- [ ] Setup UFW firewall
- [ ] Enable fail2ban
- [ ] Use strong passwords in .env
- [ ] Keep system updated
- [ ] Regular backups

```bash
# Basic security setup
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable

apt install fail2ban -y
systemctl enable fail2ban
```
