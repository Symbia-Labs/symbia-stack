# Symbia Stack - Replit Deployment

Deploy Symbia Stack on Replit for development or production.

## Quick Start

### Option 1: Import from GitHub

1. Go to [replit.com](https://replit.com) and click "Create Repl"
2. Select "Import from GitHub"
3. Enter the repository URL: `https://github.com/Symbia-Labs/symbia-stack`
4. Copy configuration files:
   ```bash
   cp deploy/replit/.replit .replit
   cp deploy/replit/replit.nix replit.nix
   ```
5. Click "Run"

### Option 2: Fork Existing Repl

If a Symbia Stack Repl already exists, fork it directly from the Replit community.

## Configuration

### Environment Variables (Secrets)

Set these in Replit's Secrets tab:

```
# Database (use Replit's PostgreSQL or external)
DATABASE_URL=postgresql://user:pass@host:5432/symbia

# Redis (use Replit's Redis or external)
REDIS_URL=redis://localhost:6379

# JWT Secret (generate a secure random string)
JWT_SECRET=your-secure-jwt-secret-min-32-chars

# Optional: External API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Using Replit Databases

Replit provides built-in PostgreSQL and Redis. Enable them in the "Tools" panel:

1. **PostgreSQL**: Click "PostgreSQL" in Tools → Copy the connection string to `DATABASE_URL`
2. **Redis**: Click "Redis" in Tools → Use `redis://localhost:6379` for `REDIS_URL`

## Running Services

### Development Mode (All Services)

```bash
npm run dev
```

This starts all services with hot reload.

### Single Service Mode

For resource-constrained Repls, run individual services:

```bash
# Identity service only
npm run dev -w identity

# Or multiple specific services
npm run dev -w identity & npm run dev -w catalog &
```

### Production Mode

```bash
npm run build && npm run start:prod
```

## Deployment

### Replit Deployments

1. Click the "Deploy" button in your Repl
2. Choose "Reserved VM" for persistent services
3. Configure:
   - **Run command**: `npm run start:prod`
   - **Health check**: `/health/live` on port 5001
4. Set environment variables in deployment settings

### Custom Domain

1. In deployment settings, click "Custom Domains"
2. Add your domain (e.g., `api.yourdomain.com`)
3. Update DNS with provided CNAME record

## Architecture on Replit

```
┌─────────────────────────────────────────────────┐
│                    Replit VM                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ identity │  │ catalog  │  │assistants│  ...  │
│  │  :5001   │  │  :5003   │  │  :5004   │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Replit PostgreSQL              │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │              Replit Redis                │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
              │
              ▼ Port 80 (external)
        https://your-repl.replit.app
```

## Resource Considerations

Replit has resource limits. For full Symbia Stack:

| Plan | Recommended Use |
|------|-----------------|
| Free | Single service testing |
| Hacker | 2-3 services |
| Pro | Full stack development |
| Teams | Production workloads |

### Memory Optimization

If hitting memory limits:

1. Run fewer services simultaneously
2. Use external databases instead of local
3. Increase swap in replit.nix:
   ```nix
   { pkgs }: {
     deps = [ ... ];
     env = {
       NODE_OPTIONS = "--max-old-space-size=512";
     };
   }
   ```

## Troubleshooting

### "Port already in use"

```bash
# Kill all node processes
pkill -f node
```

### Database connection errors

1. Verify PostgreSQL is enabled in Tools
2. Check `DATABASE_URL` secret is set correctly
3. Try restarting the Repl

### Build failures

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Files Reference

| File | Purpose |
|------|---------|
| `.replit` | Replit run configuration |
| `replit.nix` | System dependencies |
| Secrets | Environment variables |
