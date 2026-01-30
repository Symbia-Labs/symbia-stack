export const llmsTxt = `# Symbia Assistants Backend

> Backend APIs for prompt graphs, actor principals, and run orchestration used by Collaborate.

## Overview

Symbia Assistants Backend provides:
- Prompt graph CRUD and publishing
- Actor principal management
- Graph run history and logs
- Messaging webhooks for message/control events

## Quick Start

1. **Create graph**: POST /api/graphs
2. **Publish graph**: POST /api/graphs/{id}/publish
3. **List runs**: GET /api/runs
4. **Send webhook message**: POST /api/webhook/message

## Required Inputs

- Most endpoints require \`orgId\` (query or body)

## Key Endpoints

- GET /health
- GET /api/status
- GET /api/graphs
- POST /api/graphs
- POST /api/graphs/{id}/publish
- GET /api/runs
- GET /api/runs/{id}/logs
- GET /api/actors
- POST /api/actors
- POST /api/webhook/message
- POST /api/webhook/control

## Docs

- OpenAPI: /docs/openapi.json (also /api/openapi.json, /api/docs/openapi.json)
- LLM docs: /docs/llms-full.txt
`;

export const llmsFullTxt = `# Symbia Assistants Backend - Complete API Documentation

## Overview

This service manages prompt graphs, actor principals, and run history for Symbia Collaborate.

## Base URL

/api

## Health

- GET /health
- GET /api/status

## Graphs

- GET /api/graphs?orgId=...
- POST /api/graphs
- GET /api/graphs/{id}?orgId=...
- PUT /api/graphs/{id}?orgId=...
- DELETE /api/graphs/{id}?orgId=...
- POST /api/graphs/{id}/publish?orgId=...
- GET /api/graphs/{id}/runs?orgId=...

## Runs

- GET /api/runs?orgId=...&conversationId=...&graphId=...&status=...
- GET /api/runs/{id}?orgId=...
- GET /api/runs/{id}/logs?orgId=...&level=...

## Actors

- GET /api/actors?orgId=...
- POST /api/actors
- GET /api/actors/{id}?orgId=...
- PUT /api/actors/{id}?orgId=...
- DELETE /api/actors/{id}?orgId=...

## Webhooks

- POST /api/webhook/message
- POST /api/webhook/control

## Documentation

- /docs/openapi.json
- /docs/llms.txt
- /docs/llms-full.txt
`;
