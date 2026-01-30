# @symbia/seed - Database Seeding Library

Shared database seeding and test fixtures for Symbia microservices. Provides consistent, deterministic seed data across all services for development, testing, and auditing environments.

## Capabilities

| Capability | Description |
|------------|-------------|
| Deterministic IDs | Same seed produces same UUIDs across environments |
| Cross-Service Consistency | Shared IDs maintain referential integrity |
| Role-Based Test Data | Users with different permission levels |
| Bootstrap Resources | Core components marked for system initialization |
| Dependency Ordering | Seeds tables in correct foreign key order |
| Idempotent Operations | Safe to re-run with skipIfExists option |

## Quick Start

### Installation

```bash
npm install @symbia/seed
```

### Basic Usage

```typescript
import { seedIdentityData } from "@symbia/seed";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const db = drizzle(pool);

const result = await seedIdentityData(db, schema, {
  verbose: true,
  skipIfExists: true,
});

console.log(`Seeded ${result.users.length} users`);
console.log(`Seeded ${result.organizations.length} organizations`);
```

### Seed All Services

```typescript
import { seedAllServices } from "@symbia/seed";

const result = await seedAllServices(
  {
    identity: identityDb,
    catalog: catalogDb,
    messaging: messagingDb,
    assistants: assistantsDb,
  },
  {
    identity: identitySchema,
    catalog: catalogSchema,
    messaging: messagingSchema,
    assistants: assistantsSchema,
  },
  { verbose: true }
);
```

## Architecture

### Directory Structure

```
symbia-seed/
├── src/
│   ├── index.ts              # Main exports and seedAllServices()
│   ├── shared/
│   │   ├── constants.ts      # Default IDs, credentials, entitlements
│   │   └── utils.ts          # Logger, batch insert, helpers
│   ├── identity/
│   │   ├── index.ts          # seedIdentityData() orchestrator
│   │   ├── users.ts          # User seeding
│   │   ├── orgs.ts           # Organizations and plans
│   │   ├── memberships.ts    # Organization memberships
│   │   └── entitlements.ts   # User entitlements and roles
│   ├── catalog/
│   │   └── index.ts          # Components, graphs, assistants
│   ├── messaging/
│   │   └── index.ts          # Conversations
│   └── assistants/
│       └── index.ts          # Agents and prompt graphs
├── dist/                     # Compiled JavaScript + types
├── examples/
│   └── identity-seed.example.ts
└── package.json
```

## Default Seed Data

### Organizations

| ID | Name | Slug | Plan |
|----|------|------|------|
| `550e8400-e29b-41d4-a716-446655440000` | Symbia Labs | symbia-labs | Enterprise |
| `550e8400-e29b-41d4-a716-446655440001` | Acme Corp | acme-corp | Pro |
| `550e8400-e29b-41d4-a716-446655440002` | Test Organization | test-org | Free |

### Users

| ID | Email | Role | Organization |
|----|-------|------|--------------|
| `650e8400-...440000` | admin@example.com | Super Admin | Symbia Labs |
| `650e8400-...440001` | admin@acme-corp.com | Admin | Acme Corp |
| `650e8400-...440002` | member@acme-corp.com | Member | Acme Corp |
| `650e8400-...440003` | viewer@acme-corp.com | Viewer | Acme Corp |
| `650e8400-...440004` | test1@example.com | Admin | Test Org |
| `650e8400-...440005` | test2@example.com | Member | Test Org |

**Default Password:** `password123`

### Plans

| Name | Features | Limits | Price |
|------|----------|--------|-------|
| Free | catalog.read, messaging.read | 1K API calls, 100MB, 5 users | $0 |
| Pro | +catalog.write, +messaging.write | 100K API calls, 10GB, 50 users | $49 |
| Enterprise | +publish, +interrupt | Unlimited | $249 |

### Catalog Components

| ID | Key | Description |
|----|-----|-------------|
| `850e8400-...440000` | identity | User authentication and authorization |
| `850e8400-...440001` | http-request | HTTP requests to external APIs |
| `850e8400-...440002` | json-parse | Parse JSON strings into objects |
| `850e8400-...440003` | template | String template with variable substitution |

### Catalog Assistants

| ID | Key | Capabilities |
|----|-----|--------------|
| `c50e8400-...440000` | log-analyst | logs.query, logs.analyze, logs.summarize |
| `c50e8400-...440001` | metrics-analyst | metrics.query, metrics.analyze, metrics.forecast |
| `c50e8400-...440002` | trace-analyst | traces.query, traces.analyze, traces.visualize |

### Runtime Agents

| ID | Principal | Organization | Capabilities |
|----|-----------|--------------|--------------|
| `b50e8400-...440000` | agent:welcome | Symbia Labs | messaging.interrupt, messaging.route |
| `b50e8400-...440001` | agent:support | Acme Corp | messaging.interrupt, messaging.route |

## API Reference

### Configuration Types

#### SeedConfig

```typescript
interface SeedConfig {
  environment?: "development" | "test" | "staging" | "production";
  verbose?: boolean;       // Enable detailed logging
  skipIfExists?: boolean;  // Skip if data already exists
  orgId?: string;          // Target organization
}
```

#### IdentitySeedConfig

```typescript
interface IdentitySeedConfig extends SeedConfig {
  additionalTestUsers?: number;
  createSuperAdmin?: boolean;
  createDefaultOrgs?: boolean;
  createDefaultPlans?: boolean;
}
```

### Identity Seeders

#### seedIdentityData(db, schema, config?)

Seeds all identity data in dependency order.

```typescript
import { seedIdentityData } from "@symbia/seed";

const result = await seedIdentityData(db, schema, {
  createSuperAdmin: true,
  createDefaultOrgs: true,
  createDefaultPlans: true,
  verbose: true,
});
```

**Returns:**

```typescript
interface IdentitySeedResult {
  users: UserSeedData[];
  plans: PlanSeedData[];
  organizations: OrganizationSeedData[];
  memberships: MembershipSeedData[];
  userEntitlements: UserEntitlementSeedData[];
  userRoles: UserRoleSeedData[];
}
```

#### Individual Seeders

```typescript
import {
  seedUsers,
  seedPlans,
  seedOrganizations,
  seedMemberships,
  seedUserEntitlements,
  seedUserRoles,
} from "@symbia/seed";

// Seed order matters for foreign keys
const plans = await seedPlans(db, schema.plans, config);
const users = await seedUsers(db, schema.users, config);
const orgs = await seedOrganizations(db, schema.organizations, config);
const memberships = await seedMemberships(db, schema.memberships, config);
```

### Catalog Seeders

#### seedCatalogData(db, schema, config?)

Seeds catalog resources (components, graphs, assistants).

```typescript
import { seedCatalogData } from "@symbia/seed";

const result = await seedCatalogData(db, schema, { verbose: true });
// result.resources: CatalogResourceSeedData[]
```

#### Individual Generators

```typescript
import {
  generateDefaultComponents,
  generateDefaultGraphs,
  generateDefaultAssistants,
} from "@symbia/seed";

const components = generateDefaultComponents();
const graphs = generateDefaultGraphs();
const assistants = generateDefaultAssistants();
```

### Messaging Seeders

#### seedMessagingData(db, schema, config?)

Seeds messaging conversations.

```typescript
import { seedMessagingData } from "@symbia/seed";

const result = await seedMessagingData(db, schema, { verbose: true });
// result.conversations: ConversationSeedData[]
```

### Assistants Seeders

#### seedAssistantsData(db, schema, config?)

Seeds runtime agents and prompt graphs.

```typescript
import { seedAssistantsData } from "@symbia/seed";

const result = await seedAssistantsData(db, schema, { verbose: true });
// result.agents: AgentSeedData[]
// result.graphs: GraphSeedData[]
```

### seedAllServices(dbs, schemas, config?)

Seeds all services in dependency order.

```typescript
import { seedAllServices } from "@symbia/seed";

const result = await seedAllServices(
  {
    identity: identityDb,
    catalog: catalogDb,      // optional
    messaging: messagingDb,  // optional
    assistants: assistantsDb // optional
  },
  {
    identity: identitySchema,
    catalog: catalogSchema,
    messaging: messagingSchema,
    assistants: assistantsSchema,
  },
  { verbose: true }
);
```

## Constants

### Default IDs

```typescript
import { DEFAULT_IDS } from "@symbia/seed";

// Organizations
DEFAULT_IDS.ORGS.SYMBIA_LABS    // "550e8400-e29b-41d4-a716-446655440000"
DEFAULT_IDS.ORGS.ACME_CORP      // "550e8400-e29b-41d4-a716-446655440001"
DEFAULT_IDS.ORGS.TEST_ORG       // "550e8400-e29b-41d4-a716-446655440002"

// Users
DEFAULT_IDS.USERS.SUPER_ADMIN   // "650e8400-e29b-41d4-a716-446655440000"
DEFAULT_IDS.USERS.ADMIN_USER    // "650e8400-e29b-41d4-a716-446655440001"
DEFAULT_IDS.USERS.MEMBER_USER   // "650e8400-e29b-41d4-a716-446655440002"
DEFAULT_IDS.USERS.VIEWER_USER   // "650e8400-e29b-41d4-a716-446655440003"

// Catalog
DEFAULT_IDS.COMPONENTS.IDENTITY_COMPONENT
DEFAULT_IDS.COMPONENTS.HTTP_REQUEST_COMPONENT
DEFAULT_IDS.GRAPHS.HELLO_WORLD_GRAPH
DEFAULT_IDS.ASSISTANTS.LOG_ANALYST

// Runtime
DEFAULT_IDS.AGENTS.WELCOME_AGENT
DEFAULT_IDS.AGENTS.SUPPORT_AGENT
```

### Default Emails

```typescript
import { DEFAULT_EMAILS } from "@symbia/seed";

DEFAULT_EMAILS.SUPER_ADMIN  // "admin@example.com"
DEFAULT_EMAILS.ADMIN_USER   // "admin@acme-corp.com"
DEFAULT_EMAILS.MEMBER_USER  // "member@acme-corp.com"
DEFAULT_EMAILS.VIEWER_USER  // "viewer@acme-corp.com"
```

### Entitlement Keys

```typescript
import { ENTITLEMENT_KEYS } from "@symbia/seed";

// Catalog
ENTITLEMENT_KEYS.CATALOG_READ     // "cap:catalog.read"
ENTITLEMENT_KEYS.CATALOG_WRITE    // "cap:catalog.write"
ENTITLEMENT_KEYS.CATALOG_PUBLISH  // "cap:catalog.publish"
ENTITLEMENT_KEYS.CATALOG_ADMIN    // "cap:catalog.admin"

// Registry
ENTITLEMENT_KEYS.REGISTRY_READ    // "cap:registry.read"
ENTITLEMENT_KEYS.REGISTRY_WRITE   // "cap:registry.write"
ENTITLEMENT_KEYS.REGISTRY_PUBLISH // "cap:registry.publish"

// Messaging
ENTITLEMENT_KEYS.MESSAGING_READ      // "cap:messaging.read"
ENTITLEMENT_KEYS.MESSAGING_WRITE     // "cap:messaging.write"
ENTITLEMENT_KEYS.MESSAGING_INTERRUPT // "cap:messaging.interrupt"
ENTITLEMENT_KEYS.MESSAGING_ROUTE     // "cap:messaging.route"

// Assistants
ENTITLEMENT_KEYS.ASSISTANTS_EXECUTE  // "cap:assistants.execute"
ENTITLEMENT_KEYS.ASSISTANTS_MANAGE   // "cap:assistants.manage"
```

### Role Keys

```typescript
import { ROLE_KEYS } from "@symbia/seed";

ROLE_KEYS.PUBLISHER  // "role:publisher"
ROLE_KEYS.DEVELOPER  // "role:developer"
ROLE_KEYS.OPERATOR   // "role:operator"
```

## TypeScript Types

### Identity Types

```typescript
interface UserSeedData {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationSeedData {
  id: string;
  name: string;
  slug: string;
  planId: string | null;
  createdAt: Date;
}

interface PlanSeedData {
  id: string;
  name: string;
  featuresJson: string[];
  limitsJson: Record<string, number>;
  priceCents: number;
}

interface MembershipSeedData {
  id: string;
  userId: string;
  orgId: string;
  role: "admin" | "member" | "viewer";
  createdAt: Date;
}

interface UserEntitlementSeedData {
  id: string;
  userId: string;
  entitlementKey: string;
  grantedBy: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

interface UserRoleSeedData {
  id: string;
  userId: string;
  roleKey: string;
  grantedBy: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}
```

### Catalog Types

```typescript
interface CatalogResourceSeedData {
  id: string;
  key: string;
  type: string;  // "component" | "graph" | "assistant"
  name: string;
  description: string | null;
  version: string;
  ownerId: string | null;
  orgId: string | null;
  status: string;  // "published" | "draft"
  tags: string[];
  metadata: Record<string, unknown>;
  accessPolicy: Record<string, unknown>;
  isBootstrap?: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}
```

### Runtime Types

```typescript
interface AgentSeedData {
  id: string;
  orgId: string;
  principalId: string;
  principalType?: string;
  name: string;
  description?: string;
  capabilities: string[];
  webhooks: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface GraphSeedData {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  graphJson: any;
  triggerConditions: any;
  logLevel: string;
  version: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Utility Functions

### SeedLogger

```typescript
import { SeedLogger } from "@symbia/seed";

const logger = new SeedLogger({ verbose: true });
logger.info("Starting seed...");
logger.success("Seeded 10 users");
logger.warn("Skipping existing data");
logger.error("Failed to seed");
```

### Helper Functions

```typescript
import {
  shouldSeed,
  getSeedTimestamp,
  batchInsert,
  createSeedConfig,
} from "@symbia/seed";

// Check if seeding should proceed
const proceed = shouldSeed(config, existingCount);

// Generate timestamp with offset
const timestamp = getSeedTimestamp(60); // 60 minutes ago

// Batch insert large datasets
await batchInsert(items, insertFn, 100); // 100 per batch

// Create config with defaults
const config = createSeedConfig({ verbose: true });
```

## Services Using This Package

| Service | Seed Function | Data Seeded |
|---------|---------------|-------------|
| Identity | `seedIdentityData()` | Users, orgs, plans, memberships, entitlements |
| Catalog | `seedCatalogData()` | Components, graphs, assistants |
| Messaging | `seedMessagingData()` | Conversations |
| Assistants | `seedAssistantsData()` | Agents, prompt graphs |

## Security Warning

**This package is for development and testing only.**

- All passwords use a well-known test hash (`password123`)
- User emails are predictable test addresses
- Super admin credentials are publicly documented
- No encryption or production-grade security

**Never use seed data in production environments.**

## LLM Integration Guide

### Testing with Seed Data

```typescript
// Initialize database with seed data
await seedIdentityData(db, schema, { verbose: true });

// Login as test user
const response = await fetch("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({
    email: "admin@example.com",
    password: "password123",
  }),
});
```

### Reference IDs in Tests

```typescript
import { DEFAULT_IDS } from "@symbia/seed";

// Create resource in seeded org
await fetch("/api/resources", {
  method: "POST",
  headers: {
    "X-Org-Id": DEFAULT_IDS.ORGS.SYMBIA_LABS,
    "Authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({ name: "Test Resource" }),
});
```

### Verify Entitlements

```typescript
import { ENTITLEMENT_KEYS, DEFAULT_IDS } from "@symbia/seed";

// Super admin has all entitlements
// Admin user has: CATALOG_WRITE, CATALOG_PUBLISH, REGISTRY_WRITE
// Member user has: CATALOG_WRITE, MESSAGING_WRITE
// Viewer user has: CATALOG_READ, MESSAGING_READ
```

## Integration Checklist

- [ ] Install `@symbia/seed` as dev dependency
- [ ] Import seed functions in test/dev setup
- [ ] Call `seedIdentityData()` first (dependency for other services)
- [ ] Use `skipIfExists: true` for idempotent seeding
- [ ] Reference `DEFAULT_IDS` for consistent test data
- [ ] Use `DEFAULT_EMAILS` for authentication tests
- [ ] Enable `verbose: true` during debugging
- [ ] Never run seed in production
