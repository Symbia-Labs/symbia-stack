# Messaging Service Consistency Notes

These conventions keep the messaging service aligned with other non-core Symbia services
(logging, catalog, identity) and admin experiences.

## Service Identity

- Service ID: `symbia-messaging-service`
- Base API: `/api/*`
- Health: `GET /api/health`
- Bootstrap: `GET /api/bootstrap`

## Authentication (normalized)

- Bearer token (JWT): `Authorization: Bearer <token>` → `/api/auth/introspect`
- API key: `X-API-Key: sk_*` → `/api/auth/verify-api-key`
- Session cookie: `token` or `symbia_session`
- Admin access: `isSuperAdmin` OR `role=admin` OR entitlement `messaging:admin` (alias `collaborate:admin`)

## Standard Headers

Services should accept and forward these headers when present (allow null values initially):

- `X-Org-Id`: organization scope
- `X-Service-Id`: caller service ID
- `X-Env` / `X-Environment`: environment tag
- `X-Data-Class`: data sensitivity classification
- `X-Policy-Ref`: optional policy reference

## CORS Policy

- Allow listed origins from `CORS_ALLOWED_ORIGINS` or `CORS_ORIGINS`
- Allow local origins in non-production
- Always allow the configured Identity Service origin
- Credentialed requests supported

## Modality (REST + Realtime)

- REST for CRUD: conversations, participants, messages
- REST for control: `/api/conversations/:id/control`
- Socket.IO for realtime events:
  - Client: `join:conversation`, `leave:conversation`, `message:send`, `message:edit`, `message:delete`,
    `control:send`, `typing:start`, `typing:stop`, `presence:update`
  - Server: `message:new`, `message:updated`, `message:deleted`, `typing:started`, `typing:stopped`,
    `presence:changed`, `stream.pause`, `stream.resume`, `stream.preempt`, `stream.route`, `stream.handoff`,
    `stream.cancel`, `stream.priority`

## Admin UI (if added)

Use the logging service admin console as the UI baseline:

- Left nav + content panel layout
- Consistent button, badge, and tab styling
- Table/grid density and filters aligned with logging
- Dark/light theming uses shared tokens from the UI kit
