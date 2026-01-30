# Symbia Stack

## Overview
An LLM-native orchestration platform for building, deploying, and operating autonomous AI workflows. This is a monorepo containing multiple microservices and a React marketing website.

## Project Structure
```
├── website/           # React/Vite marketing website (port 5000)
├── identity/          # Authentication & Authorization (port 8000)
├── logging/           # Telemetry & Observability (port 8008)
├── catalog/           # Resource Registry (port 8080)
├── assistants/        # AI Workflow Engine (port 3000)
├── messaging/         # Real-time Communication (port 3001)
├── runtime/           # Dataflow Executor (port 3002)
├── integrations/      # LLM Gateway (port 3003)
├── network/           # Service Mesh (port 9000)
└── symbia-*/          # Shared TypeScript libraries
```

## Development Setup

All 9 services run as Replit workflows:
- **Website**: Vite React frontend on port 5000 (exposed)
- **Identity Service**: Authentication on port 8000
- **Logging Service**: Telemetry on port 8008
- **Catalog Service**: Resource registry on port 8080
- **Assistants Service**: AI workflow engine on port 3000
- **Messaging Service**: Real-time communication on port 3001
- **Runtime Service**: Graph executor on port 3002
- **Integrations Service**: LLM gateway on port 3003
- **Network Service**: Event routing on port 9000

## Environment Variables
Service URLs are configured in environment variables:
- `IDENTITY_SERVICE_URL=http://localhost:8000`
- `LOGGING_SERVICE_URL=http://localhost:8008`
- `CATALOG_SERVICE_URL=http://localhost:8080`
- `ASSISTANTS_SERVICE_URL=http://localhost:3000`
- `MESSAGING_SERVICE_URL=http://localhost:3001`
- `RUNTIME_SERVICE_URL=http://localhost:3002`
- `INTEGRATIONS_SERVICE_URL=http://localhost:3003`
- `NETWORK_SERVICE_URL=http://localhost:9000`

## Shared Libraries
Pre-built TypeScript libraries:
- `@symbia/sys` - System utilities
- `@symbia/http` - Express server framework
- `@symbia/db` - Database abstraction with Drizzle ORM
- `@symbia/catalog-client` - Catalog service client
- `@symbia/messaging-client` - Messaging service client
- `@symbia/logging-client` - Telemetry SDK
- `@symbia/relay` - Service mesh client
- `@symbia/seed` - Test data generation
- `@symbia/id` - Identity utilities
- `@symbia/md` - Documentation generation

## Database
Uses Replit's PostgreSQL (Neon-backed) via `DATABASE_URL` environment variable.

## Deployment
Configured for static deployment. Build outputs to `website/dist`.

## Database Schema
Tables created for all services:
- **Identity**: users, organizations, memberships, sessions, plans, agents, entities, etc.
- **Catalog**: resources, resource_versions, artifacts, signatures, certifications, entitlements
- **Logging**: log_streams, log_entries, metrics, data_points, traces, spans, etc.
- **Messaging**: conversations, messages, participants (pre-existing)

Bootstrap data seeded: 38 resources (10 assistants, 5 contexts, 23 integrations)

## Recent Changes
- 2026-01-30: Created all database tables and seeded catalog with bootstrap data
- 2026-01-30: Configured all 9 services to run as Replit workflows
- 2026-01-30: Remapped service ports to available Replit ports
- 2026-01-30: Set up PostgreSQL database and environment variables
- 2026-01-30: Built all shared library dependencies
- 2026-01-30: Configured Vite for Replit (port 5000, allowedHosts: true)
