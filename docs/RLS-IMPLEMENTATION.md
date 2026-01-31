# PostgreSQL Row-Level Security (RLS) Implementation

This document describes the database-level multi-tenant isolation implemented across all Symbia services.

## Overview

All services with PostgreSQL databases now use Row-Level Security (RLS) to enforce data isolation at the database level. This means:

1. **Database-level enforcement**: Queries automatically filter by `org_id` based on session context
2. **Defense in depth**: Even if application code has bugs, the database won't return unauthorized data
3. **Consistent authorization**: Super admins and users with global-read capabilities bypass org filtering

## Architecture

### Session Variables

PostgreSQL session variables are used to pass authorization context:

| Variable | Purpose |
|----------|---------|
| `symbia.org_id` | Current organization ID |
| `symbia.user_id` | Current user/actor ID |
| `symbia.can_bypass_org` | Whether to bypass org filtering (super admin, global-read) |
| `symbia.service_id` | Service making the request |

### Capabilities That Bypass Org Filter

Users with any of these capabilities can read data across all organizations:

- `cap:global.read`
- `cap:global.admin`
- `cap:telemetry.global-read`
- `cap:telemetry.admin`
- `cap:catalog.admin`
- `cap:messaging.admin`
- `cap:runtime.admin`
- `cap:assistants.admin`
- `cap:integrations.admin`
- `cap:identity.admin`

## Usage

### Setting RLS Context

Each service has an RLS middleware that sets the session context after authentication:

```typescript
import { setSessionContext } from '@symbia/db';

// In your auth middleware
await setSessionContext(pool, {
  orgId: req.authContext.orgId,
  userId: req.authContext.actorId,
  isSuperAdmin: req.authContext.isSuperAdmin,
  capabilities: req.authContext.entitlements,
  serviceId: 'logging',
});
```

### With Transaction Wrapper

For operations that need transactional consistency:

```typescript
import { withRLSContext } from '@symbia/db';

const result = await withRLSContext(pool, context, async (client) => {
  // All queries in this function are RLS-protected
  return await client.query('SELECT * FROM log_streams');
});
```

## Service-Specific Notes

### Logging Service
- All telemetry tables (logs, metrics, traces, spans) are RLS-protected
- API keys table allows access to keys with NULL org_id (global keys)

### Identity Service
- Users table is global (no RLS) - protected by user ID checks
- Organizations table uses ID-based access (users see orgs they belong to)
- Memberships and related tables use standard org_id filtering

### Catalog Service
- Resources with NULL org_id are public (visible to all)
- Child tables (versions, artifacts, signatures) inherit access from parent resource

### Integrations Service
- OAuth provider configs are globally readable (only admins can write)
- Execution logs and connections are org-isolated

### Assistants Service
- All conversation and graph-related tables are org-isolated
- Uses UUID-based org_id comparison

## Applying RLS Policies

Run the migration script to apply RLS policies:

```bash
./scripts/apply-rls.sh
```

Or apply to individual databases:

```bash
psql $DATABASE_URL -f <service>/server/migrations/0001_rls_policies.sql
```

## Files Changed

### @symbia/db Package
- `symbia-db/src/rls.ts` - RLS utilities and context management
- `symbia-db/src/index.ts` - Exports RLS functions

### Service Migrations
- `logging/server/migrations/0001_rls_policies.sql`
- `identity/server/migrations/0001_rls_policies.sql`
- `catalog/server/migrations/0001_rls_policies.sql`
- `integrations/server/migrations/0001_rls_policies.sql`
- `assistants/server/src/migrations/drizzle/0001_rls_policies.sql`

### Service Integration (Logging as example)
- `logging/server/src/db.ts` - Exports RLS helpers
- `logging/server/src/auth.ts` - RLS middleware after auth
- `logging/server/src/index.ts` - Registers RLS middleware

## Testing RLS

To verify RLS is working:

1. Start services with PostgreSQL (not in-memory)
2. Create data in two different organizations
3. Authenticate as a user in org A
4. Query the API - you should only see org A data
5. Authenticate as a super admin
6. Query the API - you should see all data
