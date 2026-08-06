# Symbia Stack — API Documentation Validation Report

_Generated 2026-08-05 · validated against the live running stack (9/9 services healthy) and the OpenAPI specs the services serve._

## Method

Each service's committed OpenAPI spec (`<svc>/docs/openapi.json`, mirrored to `docs/api/`) was validated in both directions against the routes actually registered in the service source that the live stack is running: (1) **advertised → implemented** (does every documented path have a real route?), and (2) **implemented → advertised** (is every real route documented?). Route extraction resolves Express router mounts, ESM `.js`→`.ts` imports, factory/barrel re-exports, array-path registrations (`app.get(['/a','/b'])`), and shared `symbia-http` framework routes (`/health`, `/health/live`, `/health/ready`). Live health, versions and titles were confirmed via the Symbia MCP.

## Headline result

**No broken documentation: every advertised endpoint across all 9 services is backed by a real route (0 advertised-but-missing).** Service versions and titles in the specs all match the live services. The drift that exists is the reverse — implemented endpoints that are not yet in the OpenAPI specs — plus one packaging gap (the `models` service was missing from the docs tooling).

## Summary

| Service | Port | Ver ✓ | Central copy | Advertised→missing | Implemented but undocumented |
|---|---|---|---|---|---|
| identity | 5001 | ✔ | in sync | **0** | 46 |
| logging | 5002 | ✔ | in sync | **0** | 37 |
| catalog | 5003 | ✔ | in sync | **0** | 14 |
| assistants | 5004 | ✔ | in sync | **0** | 8 |
| messaging | 5005 | ✔ | in sync | **0** | 4 |
| runtime | 5006 | ✔ | in sync | **0** | 4 |
| integrations | 5007 | ✔ | in sync | **0** | 28 |
| models | 5008 | ✔ | added ✔ | **0** | 0 |
| network | 5054 | ✔ | in sync | **0** | 2 |

_Total undocumented endpoints: **143**. Total advertised-but-missing: **0**._

## Fixes applied

The `models` service (added recently) was omitted from the documentation tooling. Fixed:

- Added `models` to the service list in `scripts/workflow/build-docs.sh` and `scripts/workflow/validate-docs.sh` (and its INTENT.md check).
- Added `-w models` to `build:services` in `package.json`.
- Generated the missing central copies `docs/api/models-openapi.json` and `docs/api/models-llms.txt` (now byte-in-sync with `models/docs/`). `docs/api/` now covers all 9 services.

## Undocumented endpoints by service

These routes are implemented and live but absent from the service's OpenAPI spec. Health/`openapi.json`/`docs`/`llms.txt`/`/internal`/`/debug` infrastructure routes are excluded. Many are platform plumbing (auth/session, api-keys, bootstrap, stats) that may be intentionally internal; others are feature endpoints that arguably belong in the public spec.

### identity (46)

**Feature endpoints (recommend documenting):**

- `DELETE /api/admin/orgs/{}`
- `DELETE /api/admin/users/{}`
- `DELETE /api/credentials/{}`
- `DELETE /api/orgs/{}/members/{}`
- `GET    /api/admin/audit-logs`
- `GET    /api/admin/orgs`
- `GET    /api/admin/plans`
- `GET    /api/admin/users`
- `GET    /api/auth/agent/me`
- `GET    /api/auth/user/me`
- `GET    /api/credentials`
- `GET    /api/entities`
- `GET    /api/entities/by-node/{}`
- `GET    /api/entities/{}`
- `PATCH  /api/admin/orgs/{}`
- `PATCH  /api/admin/plans/{}`
- `PATCH  /api/admin/users/{}`
- `PATCH  /api/entities/{}`
- `PATCH  /api/orgs/{}/members/{}`
- `POST   /api/admin/plans`
- `POST   /api/auth/agent/login`
- `POST   /api/auth/agent/refresh`
- `POST   /api/auth/agent/register`
- `POST   /api/auth/forgot-password`
- `POST   /api/auth/reset-password`
- `POST   /api/auth/user/login`
- `POST   /api/auth/user/refresh`
- `POST   /api/auth/user/register`
- `POST   /api/credentials`
- `POST   /api/entities`
- `POST   /api/entities/resolve`
- `POST   /api/entities/sync`
- `POST   /api/entities/{}/bind`
- `POST   /api/entities/{}/unbind`
- `POST   /api/orgs/{}/members/invite`
- `POST   /api/users/me/password`

**Platform plumbing (confirm if intentionally internal):**

- `DELETE /api/auth/keys/{}`
- `GET    /api/auth/config`
- `GET    /api/auth/keys`
- `GET    /api/auth/keys/{}`
- `GET    /api/auth/me`
- `GET    /api/bootstrap/service`
- `GET    /api/stats`
- `POST   /api/auth/keys`
- `POST   /api/auth/keys/{}/revoke`
- `POST   /api/auth/keys/{}/rotate`

### logging (37)

**Feature endpoints (recommend documenting):**

- `DELETE /api/data-sources/{}`
- `DELETE /api/integrations/{}`
- `DELETE /api/logs/streams/{}`
- `DELETE /api/metrics/{}`
- `DELETE /api/objects/streams/{}`
- `GET    /api/data-sources`
- `GET    /api/data-sources/{}`
- `GET    /api/integrations`
- `GET    /api/integrations/{}`
- `GET    /api/logs/stream`
- `GET    /api/logs/streams/{}`
- `GET    /api/metrics/{}`
- `GET    /api/objects/streams/{}`
- `GET    /api/traces/{}`
- `PATCH  /api/data-sources/{}`
- `PATCH  /api/integrations/{}`
- `PATCH  /api/logs/streams/{}`
- `PATCH  /api/metrics/{}`
- `PATCH  /api/objects/streams/{}`
- `POST   /api/data-sources`
- `POST   /api/data-sources/{}/sync`
- `POST   /api/ingest`
- `POST   /api/integrations`
- `POST   /api/integrations/{}/test`
- `POST   /api/query`

**Platform plumbing (confirm if intentionally internal):**

- `DELETE /api/auth/keys/{}`
- `GET    /api/auth/config`
- `GET    /api/auth/keys`
- `GET    /api/auth/me`
- `GET    /api/auth/session`
- `GET    /api/bootstrap/service`
- `GET    /api/stats`
- `GET    /api/stats/ingest-rate`
- `GET    /api/stats/query-latency`
- `POST   /api/auth/keys`
- `POST   /api/auth/login`
- `POST   /api/auth/logout`

### catalog (14)

**Feature endpoints (recommend documenting):**

- `GET    /api/resources/{}/artifacts`
- `GET    /api/resources/{}/certifications`
- `GET    /api/resources/{}/signatures`
- `GET    /api/versions`
- `POST   /api/nl/search`

**Platform plumbing (confirm if intentionally internal):**

- `DELETE /api/api-keys/{}`
- `DELETE /api/auth/keys/{}`
- `GET    /api/api-keys`
- `GET    /api/auth/config`
- `GET    /api/auth/keys`
- `GET    /api/auth/me`
- `GET    /api/bootstrap/service`
- `POST   /api/api-keys`
- `POST   /api/auth/keys`

### assistants (8)

**Feature endpoints (recommend documenting):**

- `DELETE /api/rules/runs`
- `DELETE /api/rules/{}/rules/{}`
- `GET    /api/assistants`
- `GET    /api/assistants/mentionable`
- `GET    /api/rules/runs`
- `POST   /api/webhook/messaging`

**Platform plumbing (confirm if intentionally internal):**

- `GET    /api/bootstrap/service`
- `GET    /api/stats`

### messaging (4)

**Platform plumbing (confirm if intentionally internal):**

- `GET    /api/auth/config`
- `GET    /api/auth/me`
- `GET    /api/bootstrap/service`
- `GET    /api/stats`

### runtime (4)

**Feature endpoints (recommend documenting):**

- `POST   /api/routines`
- `POST   /api/routines/preview`
- `POST   /api/routines/validate`

**Platform plumbing (confirm if intentionally internal):**

- `GET    /api/stats`

### integrations (28)

**Feature endpoints (recommend documenting):**

- `DELETE /api/oauth/connections/{}`
- `GET    /admin/users`
- `GET    /api/integrations/channels/benchmarks`
- `GET    /api/integrations/channels/benchmarks/{}`
- `GET    /api/integrations/channels/catalog/export`
- `GET    /api/integrations/channels/catalog/preview`
- `GET    /api/integrations/channels/evaluations`
- `GET    /api/integrations/channels/evaluations/{}`
- `GET    /api/integrations/channels/models`
- `GET    /api/integrations/channels/scores`
- `GET    /api/integrations/models`
- `GET    /api/integrations/namespace`
- `GET    /api/integrations/operations/search`
- `GET    /api/integrations/registry/{}`
- `GET    /api/integrations/usage/by-user`
- `GET    /api/integrations/usage/logs`
- `GET    /api/oauth/callback`
- `GET    /api/oauth/connections`
- `GET    /api/oauth/providers`
- `POST   /api/integrations/channels/benchmarks/run`
- `POST   /api/integrations/channels/catalog/sync`
- `POST   /api/integrations/channels/recommendations`
- `POST   /api/integrations/channels/scores/aggregate`
- `POST   /api/integrations/parse/mcp`
- `POST   /api/integrations/parse/openapi`
- `POST   /api/integrations/registry/{}/refresh`
- `POST   /api/oauth/authorize`

**Platform plumbing (confirm if intentionally internal):**

- `GET    /api/stats`

### models — none ✔

### network (2)

**Feature endpoints (recommend documenting):**

- `GET    /api/platform/health`

**Platform plumbing (confirm if intentionally internal):**

- `GET    /api/bootstrap/service`
