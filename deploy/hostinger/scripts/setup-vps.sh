#!/bin/bash
# Symbia Stack - Hostinger VPS Setup Script
# Run this on a fresh Ubuntu 22.04 VPS
#
# Usage: ./setup-vps.sh

set -e

echo "=== Symbia Stack VPS Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./setup-vps.sh)"
  exit 1
fi

# Update system
echo "--- Updating system packages ---"
apt update && apt upgrade -y

# Install dependencies
echo "--- Installing dependencies ---"
apt install -y \
  curl \
  wget \
  git \
  htop \
  ufw \
  fail2ban \
  certbot \
  python3-certbot-nginx

# Install Docker
echo "--- Installing Docker ---"
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "Docker installed successfully"
else
  echo "Docker already installed"
fi

# Install Docker Compose (standalone)
echo "--- Installing Docker Compose ---"
if ! command -v docker-compose &> /dev/null; then
  curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  echo "Docker Compose installed successfully"
else
  echo "Docker Compose already installed"
fi

# Create symbia directory structure
echo "--- Creating directory structure ---"
mkdir -p /opt/symbia/{nginx,data/models,data/postgres,backups,logs}

# Create environment file template
echo "--- Creating environment template ---"
cat > /opt/symbia/.env.example << 'EOF'
# Symbia Stack - Environment Configuration

# Image tag (set by CI/CD or manually)
IMAGE_TAG=latest

# Database
POSTGRES_PASSWORD=CHANGE_ME_TO_SECURE_PASSWORD
DATABASE_URL=postgresql://symbia:${POSTGRES_PASSWORD}@postgres:5432/symbia

# Security secrets (generate with: openssl rand -base64 32)
SESSION_SECRET=CHANGE_ME_TO_RANDOM_STRING
NETWORK_HASH_SECRET=CHANGE_ME_TO_RANDOM_STRING

# Optional: LLM API Keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
HUGGINGFACE_TOKEN=
EOF

# Generate secure secrets if .env doesn't exist
if [ ! -f /opt/symbia/.env ]; then
  echo "--- Generating secure secrets ---"
  POSTGRES_PWD=$(openssl rand -base64 24 | tr -d '/+=')
  SESSION_SECRET=$(openssl rand -base64 32)
  NETWORK_SECRET=$(openssl rand -base64 32)

  cat > /opt/symbia/.env << EOF
# Symbia Stack - Environment Configuration
# Generated on $(date)

# Image tag
IMAGE_TAG=latest

# Database
POSTGRES_PASSWORD=${POSTGRES_PWD}
DATABASE_URL=postgresql://symbia:${POSTGRES_PWD}@postgres:5432/symbia

# Security secrets
SESSION_SECRET=${SESSION_SECRET}
NETWORK_HASH_SECRET=${NETWORK_SECRET}

# Optional: LLM API Keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
HUGGINGFACE_TOKEN=
EOF
  chmod 600 /opt/symbia/.env
  echo "Generated .env with secure random secrets"
fi

# Configure firewall
echo "--- Configuring firewall ---"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable
echo "Firewall configured (SSH, HTTP, HTTPS allowed)"

# Configure fail2ban
echo "--- Configuring fail2ban ---"
systemctl enable fail2ban
systemctl start fail2ban

# Create deploy user (optional but recommended)
echo "--- Creating deploy user ---"
if ! id "deploy" &>/dev/null; then
  useradd -m -s /bin/bash -G docker deploy
  mkdir -p /home/deploy/.ssh
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true
  chown -R deploy:deploy /opt/symbia
  echo "Created 'deploy' user with docker access"
else
  echo "Deploy user already exists"
fi

# Download docker-compose.prod.yml
echo "--- Downloading docker-compose.prod.yml ---"
echo "You'll need to copy docker-compose.prod.yml and nginx config to /opt/symbia"
echo ""

# Print summary
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy files to VPS:"
echo "   scp deploy/hostinger/docker-compose.prod.yml root@YOUR_VPS:/opt/symbia/"
echo "   scp deploy/hostinger/nginx/symbia.conf root@YOUR_VPS:/opt/symbia/nginx/"
echo ""
echo "2. Edit environment file:"
echo "   nano /opt/symbia/.env"
echo ""
echo "3. Start services:"
echo "   cd /opt/symbia"
echo "   docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "4. Setup SSL (after DNS is configured):"
echo "   certbot --nginx -d your-domain.com"
echo ""
echo "5. Upload models (optional):"
echo "   scp ~/models/*.gguf root@YOUR_VPS:/opt/symbia/data/models/"
echo ""
echo "Secrets generated in: /opt/symbia/.env"
echo "Logs directory: /opt/symbia/logs"
echo "Backups directory: /opt/symbia/backups"
echo ""
