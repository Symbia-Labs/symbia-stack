# Symbia Stack

## Overview
An LLM-native orchestration platform for building, deploying, and operating autonomous AI workflows. This is a monorepo containing multiple microservices and a React marketing website.

## Project Structure
```
├── website/           # React/Vite marketing website (port 5000)
├── identity/          # Authentication & Authorization (port 5001)
├── logging/           # Telemetry & Observability (port 5002)
├── catalog/           # Resource Registry (port 5003)
├── assistants/        # AI Workflow Engine (port 5004)
├── messaging/         # Real-time Communication (port 5005)
├── runtime/           # Dataflow Executor (port 5006)
├── integrations/      # LLM Gateway (port 5007)
├── network/           # Service Mesh (port 5054)
└── symbia-*/          # Shared TypeScript libraries
```

## Development Setup

### Website (Configured for Replit)
The marketing website runs on port 5000 with Vite. Dependencies are pre-built.

```bash
cd website && npm run dev
```

### Backend Services
Backend services require PostgreSQL and are designed for Docker Compose:
```bash
docker-compose up -d
```

## Shared Libraries
Local packages must be built before the website:
- `@symbia/sys` - System utilities
- `@symbia/http` - Express server framework
- `@symbia/catalog-client` - Catalog service client
- `@symbia/messaging-client` - Messaging service client
- `@symbia/logging-client` - Telemetry SDK
- `@symbia/relay` - Service mesh client

## Deployment
Configured for static deployment. Build outputs to `website/dist`.

## Recent Changes
- 2026-01-30: Configured Vite for Replit (port 5000, allowedHosts: true)
- 2026-01-30: Built all shared library dependencies
