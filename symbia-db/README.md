# @symbia/db - Shared Database Library

Shared database and persistence utilities for Symbia microservices. Provides standardized database connection, Drizzle ORM setup, and indexing patterns.

## Capabilities

| Capability | Description |
|------------|-------------|
| Dual-Mode Database | Production PostgreSQL or in-memory (pg-mem) for development/testing |
| Drizzle ORM Integration | Type-safe SQL queries with automatic schema binding |
| Connection Pooling | Managed pg.Pool with graceful shutdown |
| Index Patterns | 23 pre-defined patterns for consistent indexing across services |
| PostgreSQL Function Support | Auto-registers `gen_random_uuid()`, `uuid_generate_v4()`, `now()` for memory mode |
| Memory DB Export | Export in-memory database to JSON for debugging/persistence |

## Quick Start

### Installation

```bash
npm install @symbia/db
```

### Basic Usage

```typescript
import { initializeDatabase } from "@symbia/db";
import * as schema from "./schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";

const { db, pool, isMemory, close } = initializeDatabase({
  serviceId: "my-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "MY_SERVICE_USE_MEMORY_DB",
}, schema);

// Use Drizzle ORM
const users = await db.query.users.findMany();

// Graceful shutdown
await close();
```

### Environment Variables

```bash
# PostgreSQL connection (production)
DATABASE_URL=postgresql://user:pass@localhost:5432/symbia

# Force in-memory mode per service
IDENTITY_USE_MEMORY_DB=true
CATALOG_USE_MEMORY_DB=true
LOGGING_USE_MEMORY_DB=true
```

## Architecture

### Directory Structure

```
symbia-db/
├── src/
│   ├── index.ts          # Main entry - re-exports all modules
│   ├── types.ts          # TypeScript interfaces
│   ├── database.ts       # Core initialization logic
│   ├── memory.ts         # In-memory database utilities
│   └── indexes.ts        # Standard index patterns
├── dist/                 # Compiled JavaScript + type definitions
├── package.json
└── tsconfig.json
```

### Initialization Flow

```
initializeDatabase(config, schema)
    │
    ├─→ Merge configuration (params + env vars + defaults)
    │
    ├─→ Determine database type:
    │   ├─ config.useMemoryDb = true → Memory
    │   ├─ {SERVICE}_USE_MEMORY_DB = "true" → Memory
    │   ├─ DATABASE_URL not set → Memory
    │   └─ DATABASE_URL set → PostgreSQL
    │
    ├─→ Create connection:
    │   ├─ Memory: pg-mem + function registration + schema execution
    │   └─ Real: pg.Pool with DATABASE_URL
    │
    ├─→ Initialize Drizzle ORM with schema
    │
    └─→ Return { db, pool, isMemory, exportToFile, close }
```

## API Reference

### Core Functions

#### `initializeDatabase<TSchema>(config, schema?)`

Initialize database connection with automatic mode detection.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `DatabaseConfig` | Configuration options |
| `schema` | `TSchema` | Optional Drizzle schema object |

**Returns:** `DatabaseInstance<TSchema>`

```typescript
interface DatabaseConfig {
  databaseUrl?: string;        // Override DATABASE_URL
  useMemoryDb?: boolean;       // Force in-memory mode
  memorySchema?: string;       // SQL DDL for memory mode
  serviceId?: string;          // Service name for logging
  enableLogging?: boolean;     // Enable connection logs (default: true)
  memoryDbEnvVar?: string;     // Custom env var name (e.g., "MY_SERVICE_USE_MEMORY_DB")
}

interface DatabaseInstance<TSchema = any> {
  db: any;                     // Drizzle ORM instance
  pool: Pool;                  // pg.Pool connection pool
  isMemory: boolean;           // True if using in-memory database
  exportToFile: (path: string) => boolean;  // Export memory DB to JSON
  close: () => Promise<void>;  // Graceful shutdown
}
```

**Example:**

```typescript
import { initializeDatabase } from "@symbia/db";
import * as schema from "@shared/schema";

const database = initializeDatabase({
  serviceId: "identity",
  memorySchema: `
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `,
  memoryDbEnvVar: "IDENTITY_USE_MEMORY_DB",
}, schema);

export const { db, pool, isMemory, close } = database;
```

#### `isDatabaseConfigured()`

Check if `DATABASE_URL` environment variable is set.

```typescript
import { isDatabaseConfigured } from "@symbia/db";

if (!isDatabaseConfigured()) {
  console.log("No database configured, using in-memory mode");
}
```

#### `getDatabaseConfig(servicePrefix?)`

Read database configuration from environment variables.

```typescript
import { getDatabaseConfig } from "@symbia/db";

const config = getDatabaseConfig("identity");
// Returns { databaseUrl, useMemoryDb, ... } from env vars
```

### Memory Database Functions

#### `createMemoryDatabase(schemaSQL?)`

Create standalone in-memory PostgreSQL database.

```typescript
import { createMemoryDatabase } from "@symbia/db";

const pool = createMemoryDatabase(`
  CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
`);

await pool.query("INSERT INTO items (name) VALUES ('test')");
```

#### `wrapPgMemPool(pool)`

Wrap pg-mem pool for Drizzle ORM compatibility.

```typescript
import { wrapPgMemPool } from "@symbia/db";
import { newDb } from "pg-mem";

const mem = newDb();
const rawPool = mem.adapters.createPg().Pool;
const pool = wrapPgMemPool(new rawPool());
```

#### `exportMemoryDatabase(filePath, serviceId?)`

Export in-memory database contents to JSON file.

```typescript
import { exportMemoryDatabase } from "@symbia/db";

// Export all tables to JSON
const success = exportMemoryDatabase("./backup.json", "identity");
// Creates file with: { timestamp, serviceId, tables: {...}, isMemoryExport: true }
```

#### `getMemoryDbInstance()`

Get reference to current pg-mem instance for advanced operations.

```typescript
import { getMemoryDbInstance } from "@symbia/db";

const memDb = getMemoryDbInstance();
if (memDb) {
  // Access pg-mem internals
  memDb.public.none("TRUNCATE users CASCADE");
}
```

#### `registerMemoryFunctions(mem, functions)`

Register custom PostgreSQL functions in pg-mem.

```typescript
import { registerMemoryFunctions } from "@symbia/db";

registerMemoryFunctions(memDb, [
  {
    name: "my_custom_function",
    returns: DataType.text,
    implementation: () => "custom result",
  },
]);
```

### Index Patterns

#### Pre-defined IndexPatterns

23 standard patterns for consistent indexing:

| Pattern | Columns | Use Case |
|---------|---------|----------|
| `orgId` | `org_id` | Multi-tenant filtering |
| `orgCreatedAt` | `(org_id, created_at)` | Org-scoped time queries |
| `orgUpdatedAt` | `(org_id, updated_at)` | Org-scoped update tracking |
| `status` | `status` | Status filtering |
| `orgStatus` | `(org_id, status)` | Org-scoped status queries |
| `type` | `type` | Type filtering (catalog) |
| `typeOrg` | `(type, org_id)` | Type + org filtering |
| `typeStatus` | `(type, status)` | Type + status filtering |
| `timestamp` | `timestamp` | Time-series queries |
| `orgTimestamp` | `(org_id, timestamp)` | Org-scoped time-series |
| `createdAt` | `created_at` | Creation time queries |
| `updatedAt` | `updated_at` | Update time queries |
| `resourceId` | `resource_id` | Foreign key lookup |
| `userId` | `user_id` | User-scoped queries |
| `conversationId` | `conversation_id` | Conversation filtering |
| `isActive` | `is_active` | Active record filtering |
| `isBootstrap` | `is_bootstrap` | Bootstrap record filtering |
| `emailUnique` | `email` (UNIQUE) | Email uniqueness |
| `keyUnique` | `key` (UNIQUE) | Key uniqueness |
| `slugUnique` | `slug` (UNIQUE) | Slug uniqueness |

#### `createIndex(tableName, table, pattern)`

Create single index from pattern.

```typescript
import { IndexPatterns, createIndex } from "@symbia/db";

const orgIndex = createIndex("users", usersTable, IndexPatterns.orgId);
// Creates: idx_users_org_id
```

#### `withStandardIndexes(tableName, table, patterns)`

Create multiple indexes for use with pgTable.

```typescript
import { IndexPatterns, withStandardIndexes } from "@symbia/db";
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => withStandardIndexes("resources", table, [
  IndexPatterns.orgId,
  IndexPatterns.type,
  IndexPatterns.orgCreatedAt,
]));
```

#### `generateIndexSQL(tableName, indexes)`

Generate CREATE INDEX SQL statements.

```typescript
import { generateIndexSQL } from "@symbia/db";

const sql = generateIndexSQL("users", [
  { columns: ["org_id"], suffix: "org_id" },
  { columns: ["email"], suffix: "email", unique: true },
]);
// Returns:
// CREATE INDEX idx_users_org_id ON users(org_id);
// CREATE UNIQUE INDEX idx_users_email ON users(email);
```

#### StandardIndexSQL Generators

Pre-built SQL generators for common table patterns.

```typescript
import { StandardIndexSQL } from "@symbia/db";

// Resource table indexes (org_id, type, status, created_at, updated_at)
const resourceIndexes = StandardIndexSQL.resourceTable("resources");

// Time-series table indexes (timestamp, org_id + timestamp)
const logIndexes = StandardIndexSQL.timeSeriesTable("logs", "timestamp");

// Child table indexes (parent foreign key + org_id)
const membershipIndexes = StandardIndexSQL.childTable("memberships", "user_id");

// User table indexes (org_id, email unique, is_active)
const userIndexes = StandardIndexSQL.userTable("users");
```

## TypeScript Types

### Core Types

```typescript
import type { DatabaseConfig, DatabaseInstance, IndexPattern } from "@symbia/db";

// DatabaseConfig - initialization options
interface DatabaseConfig {
  databaseUrl?: string;
  useMemoryDb?: boolean;
  memorySchema?: string;
  serviceId?: string;
  enableLogging?: boolean;
  memoryDbEnvVar?: string;
}

// DatabaseInstance - returned from initializeDatabase
interface DatabaseInstance<TSchema = any> {
  db: any;
  pool: Pool;
  isMemory: boolean;
  exportToFile: (filePath: string) => boolean;
  close: () => Promise<void>;
}

// IndexPattern - index definition
interface IndexPattern<T = any> {
  name: string;
  unique?: boolean;
  columns: (table: T) => PgColumn | PgColumn[];
  suffix?: string;
}
```

## Services Using This Package

| Service | memoryDbEnvVar | Port |
|---------|----------------|------|
| Identity | `IDENTITY_USE_MEMORY_DB` | 5001 |
| Catalog | `CATALOG_USE_MEMORY_DB` | 5003 |
| Logging | `LOGGING_USE_MEMORY_DB` | 5002 |
| Assistants | `ASSISTANTS_USE_MEMORY_DB` | 5004 |

## Service Integration Pattern

Each service follows this standard pattern:

### 1. Create db.ts

```typescript
// server/src/db.ts
import { initializeDatabase } from "@symbia/db";
import * as schema from "@shared/schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";

const database = initializeDatabase({
  serviceId: "my-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "MY_SERVICE_USE_MEMORY_DB",
}, schema);

export const { db, pool, isMemory, exportToFile, close } = database;
export { database };
```

### 2. Create memory-schema.ts

```typescript
// server/src/memory-schema.ts
export const MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX idx_resources_org_id ON resources(org_id);
  CREATE INDEX idx_resources_type ON resources(type);
`;
```

### 3. Define Schema with Index Patterns

```typescript
// shared/schema/resources.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { IndexPatterns, withStandardIndexes } from "@symbia/db";

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => withStandardIndexes("resources", table, [
  IndexPatterns.orgId,
  IndexPatterns.type,
  IndexPatterns.orgCreatedAt,
]));
```

### 4. Use in Routes

```typescript
// server/src/routes/resources.ts
import { db } from "../db";
import { resources } from "@shared/schema";
import { eq, and } from "drizzle-orm";

router.get("/", async (req, res) => {
  const { orgId } = req.auth;

  const items = await db.query.resources.findMany({
    where: eq(resources.orgId, orgId),
  });

  res.json(items);
});
```

## LLM Integration Guide

### Common Operations

#### Initialize Database Connection

```typescript
import { initializeDatabase } from "@symbia/db";
import * as schema from "./schema";

const { db, isMemory } = initializeDatabase({
  serviceId: "llm-service",
  memorySchema: SCHEMA_SQL,
}, schema);

console.log(`Database mode: ${isMemory ? "memory" : "postgresql"}`);
```

#### Query with Drizzle ORM

```typescript
// Find many with filtering
const users = await db.query.users.findMany({
  where: eq(users.orgId, orgId),
  orderBy: [desc(users.createdAt)],
  limit: 100,
});

// Find one
const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
});

// Insert
const [newUser] = await db.insert(users).values({
  email: "user@example.com",
  orgId: orgId,
}).returning();

// Update
await db.update(users)
  .set({ name: "New Name", updatedAt: new Date() })
  .where(eq(users.id, userId));

// Delete
await db.delete(users).where(eq(users.id, userId));
```

#### Raw SQL Queries

```typescript
// Use pool for complex queries
const result = await pool.query(`
  SELECT u.*, COUNT(p.id) as project_count
  FROM users u
  LEFT JOIN projects p ON p.user_id = u.id
  WHERE u.org_id = $1
  GROUP BY u.id
`, [orgId]);
```

#### Export Memory Database for Debugging

```typescript
import { exportMemoryDatabase } from "@symbia/db";

if (isMemory) {
  exportMemoryDatabase("./debug-export.json", "my-service");
}
```

#### Graceful Shutdown

```typescript
process.on("SIGTERM", async () => {
  await close();
  process.exit(0);
});
```

### Best Practices

1. **Always use parameterized queries** - Never interpolate user input into SQL
2. **Use transactions for multi-step operations** - `await db.transaction(async (tx) => {...})`
3. **Apply index patterns consistently** - Use `withStandardIndexes` for all tables
4. **Check isMemory for environment-specific logic** - Some features may behave differently
5. **Call close() on shutdown** - Ensures connections are released properly
6. **Mirror memory schema with production** - Keep `memory-schema.ts` in sync with actual schema

### Error Handling

```typescript
try {
  const result = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!result) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(result);
} catch (error) {
  console.error("Database error:", error);
  return res.status(500).json({ error: "Database operation failed" });
}
```

### Integration Checklist

- [ ] Import `initializeDatabase` from `@symbia/db`
- [ ] Create `memory-schema.ts` with SQL DDL matching production schema
- [ ] Configure `memoryDbEnvVar` for environment-specific memory mode
- [ ] Apply `IndexPatterns` to all table definitions
- [ ] Export `db`, `pool`, `isMemory`, `close` from db.ts
- [ ] Set `DATABASE_URL` for production environments
- [ ] Implement graceful shutdown with `close()`
- [ ] Use Drizzle ORM for type-safe queries
