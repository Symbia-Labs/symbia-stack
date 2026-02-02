# Symbia Platform

## Overview

Symbia is an AI-native infrastructure platform for building systems where AI assistants are first-class citizens. It provides authentication, orchestration, and observability designed for AI-native architectures.

## Project Structure

This is a Node.js monorepo containing multiple packages:

- **website/**: Marketing website with live platform integration (React + Vite)
- **symbia-***: Core library packages (auth, db, http, relay, etc.)
- **identity/**, **logging/**, **catalog/**, etc.: Backend services

## Running the Project

The website runs on port 5000 using Vite:

```bash
cd website && npm run dev
```

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

## Recent Changes

- Configured Vite to run on port 5000 with host 0.0.0.0 and allowedHosts: true for Replit compatibility
- Built all shared library packages
- Set up workflow for website development

## Architecture

The platform consists of multiple microservices:
- Identity (5001): Authentication and user management
- Logging (5002): Logging service
- Catalog (5003): Resource and component registry
- Assistants (5004): AI assistant management
- Messaging (5005): Message handling
- Runtime (5006): Execution runtime
- Integrations (5007): Third-party integrations
- Network (5054): Network management

The website frontend proxies API calls to these services during development.
