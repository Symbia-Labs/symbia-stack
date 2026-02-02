# Symbia Platform

## Overview

Symbia is an AI-native infrastructure platform for building systems where AI assistants are first-class citizens. It provides authentication, orchestration, and observability designed for AI-native architectures.

## Project Structure

This is a Node.js monorepo containing multiple packages:

- **website/**: Marketing website with live platform integration (React + Vite)
- **symbia-***: Core library packages (auth, db, http, relay, etc.)
- **identity/**, **logging/**, **catalog/**, etc.: Backend services

## Running the Project

Two workflows run the platform:

1. **Backend Services** - Runs `./start-replit.sh` which:
   - Sets up database schemas
   - Starts all 8 microservices in the correct order

2. **Website** - Runs the Vite dev server on port 5000

## Building

Build all libraries first, then services:

```bash
npm run build:libs
npm run build:services
```

For the website:

```bash
cd website && npm run build
```

## Environment Variables

Required secrets:
- `SESSION_SECRET` - Used for JWT and session management
- `NETWORK_HASH_SECRET` - Used for network policy enforcement
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)

## Architecture

The platform consists of 8 microservices (all bound to 0.0.0.0):

| Service | Port | Description |
|---------|------|-------------|
| Identity | 5001 | Authentication and user management |
| Logging | 5002 | Structured logging service |
| Catalog | 5003 | Resource and component registry |
| Assistants | 5004 | AI assistant management |
| Messaging | 5005 | Message handling and routing |
| Runtime | 5006 | Execution runtime for workflows |
| Integrations | 5007 | Third-party OAuth and API integrations |
| Network | 5054 | Event routing and SoftSDN observability (WebSocket) |

The website frontend proxies API calls to these services via Vite:
- `/api/{service}/*` → `localhost:{port}/api/*`
- `/svc/{service}/*` → `localhost:{port}/*`

## Recent Changes

- Created `start-replit.sh` for Replit-compatible service startup
- Configured all services to bind to 0.0.0.0 for proper proxy access
- Fixed TypeScript export issue in integrations/oauth/providers
- Set up PostgreSQL database with all required schemas
- Configured Vite on port 5000 with allowedHosts for Replit iframe
