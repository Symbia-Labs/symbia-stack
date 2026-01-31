/**
 * @symbia/db - Row-Level Security (RLS) Utilities
 *
 * Provides database-level multi-tenant isolation using PostgreSQL RLS.
 * This ensures data isolation is enforced at the database level, making it
 * impossible to accidentally access data from other organizations.
 *
 * Usage:
 * 1. Run the RLS migration to enable policies on tables
 * 2. Before each request, call setSessionContext() with auth info
 * 3. All queries will automatically be filtered by org_id
 *
 * @example
 * ```typescript
 * import { setSessionContext, clearSessionContext } from '@symbia/db';
 *
 * // In your auth middleware
 * app.use(async (req, res, next) => {
 *   await setSessionContext(pool, {
 *     orgId: req.user.orgId,
 *     userId: req.user.id,
 *     isSuperAdmin: req.user.isSuperAdmin,
 *     capabilities: req.user.entitlements,
 *   });
 *   next();
 * });
 * ```
 */

import type { Pool, PoolClient } from "pg";

/**
 * RLS context that gets set as PostgreSQL session variables.
 * These are used by RLS policies to filter data.
 */
export interface RLSContext {
  /** Organization ID the request is scoped to */
  orgId: string;
  /** User/principal ID making the request */
  userId: string;
  /** Whether this user is a super admin (bypasses org filter) */
  isSuperAdmin?: boolean;
  /** User's capabilities/entitlements (for capability-based bypass) */
  capabilities?: string[];
  /** Service making the request */
  serviceId?: string;
}

/**
 * PostgreSQL session variable names used for RLS
 */
export const RLS_VARS = {
  ORG_ID: "symbia.org_id",
  USER_ID: "symbia.user_id",
  CAN_BYPASS_ORG: "symbia.can_bypass_org",
  SERVICE_ID: "symbia.service_id",
} as const;

/**
 * Capabilities that allow bypassing org-level filtering.
 * Users with any of these capabilities can read data across all orgs.
 */
const GLOBAL_READ_CAPABILITIES = [
  "cap:global.read",
  "cap:global.admin",
  "cap:telemetry.global-read",
  "cap:telemetry.admin",
  "cap:catalog.admin",
  "cap:messaging.admin",
  "cap:runtime.admin",
  "cap:assistants.admin",
  "cap:integrations.admin",
  "cap:identity.admin",
];

/**
 * Check if context allows bypassing org filter
 */
function canBypassOrgFilter(context: RLSContext): boolean {
  if (context.isSuperAdmin) {
    return true;
  }

  if (context.capabilities) {
    return context.capabilities.some((cap) =>
      GLOBAL_READ_CAPABILITIES.includes(cap)
    );
  }

  return false;
}

/**
 * Set session context for RLS before executing queries.
 * This should be called at the start of each request.
 *
 * Uses SET LOCAL so the settings only apply to the current transaction.
 * For connection pooling, wrap queries in a transaction or use a dedicated client.
 *
 * @param client - Database pool or client
 * @param context - RLS context with org/user info
 */
export async function setSessionContext(
  client: Pool | PoolClient,
  context: RLSContext
): Promise<void> {
  const canBypass = canBypassOrgFilter(context);

  // Use parameterized query to prevent SQL injection
  // SET LOCAL ensures settings only apply to current transaction
  await client.query(`
    SELECT
      set_config('${RLS_VARS.ORG_ID}', $1, true),
      set_config('${RLS_VARS.USER_ID}', $2, true),
      set_config('${RLS_VARS.CAN_BYPASS_ORG}', $3, true),
      set_config('${RLS_VARS.SERVICE_ID}', $4, true)
  `, [
    context.orgId || "",
    context.userId || "",
    canBypass ? "true" : "false",
    context.serviceId || "",
  ]);
}

/**
 * Clear session context (reset to empty values).
 * Call this after request completion if using persistent connections.
 *
 * @param client - Database pool or client
 */
export async function clearSessionContext(
  client: Pool | PoolClient
): Promise<void> {
  await client.query(`
    SELECT
      set_config('${RLS_VARS.ORG_ID}', '', true),
      set_config('${RLS_VARS.USER_ID}', '', true),
      set_config('${RLS_VARS.CAN_BYPASS_ORG}', 'false', true),
      set_config('${RLS_VARS.SERVICE_ID}', '', true)
  `);
}

/**
 * Execute a function with RLS context set.
 * Automatically clears context after execution.
 *
 * @param pool - Database pool
 * @param context - RLS context
 * @param fn - Function to execute with context
 * @returns Result of the function
 */
export async function withRLSContext<T>(
  pool: Pool,
  context: RLSContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setSessionContext(client, context);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * SQL to create RLS policies for a table with org_id column.
 * Returns the SQL statements to execute.
 *
 * @param tableName - Name of the table
 * @param options - Policy options
 */
export function generateRLSPolicies(
  tableName: string,
  options: {
    /** Column name for org ID (default: 'org_id') */
    orgIdColumn?: string;
    /** Whether org_id can be NULL (default: false) */
    nullableOrgId?: boolean;
    /** Additional policies to create */
    additionalPolicies?: string[];
  } = {}
): string {
  const {
    orgIdColumn = "org_id",
    nullableOrgId = false,
  } = options;

  const nullCheck = nullableOrgId
    ? `(${orgIdColumn} IS NULL OR ${orgIdColumn} = current_setting('${RLS_VARS.ORG_ID}', true))`
    : `${orgIdColumn} = current_setting('${RLS_VARS.ORG_ID}', true)`;

  return `
-- Enable RLS on ${tableName}
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (prevents bypass by superusers in app)
ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;

-- Policy: Allow users to see rows in their organization
CREATE POLICY ${tableName}_org_isolation ON ${tableName}
  FOR ALL
  USING (
    -- Bypass check: super admins and users with global read can see all
    current_setting('${RLS_VARS.CAN_BYPASS_ORG}', true) = 'true'
    OR
    -- Org isolation: user can only see their org's data
    ${nullCheck}
  );
`;
}

/**
 * SQL to create RLS policies for a table that should be globally accessible
 * (e.g., lookup tables, public resources).
 *
 * @param tableName - Name of the table
 */
export function generatePublicRLSPolicy(tableName: string): string {
  return `
-- Enable RLS on ${tableName} (public access)
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read
CREATE POLICY ${tableName}_public_read ON ${tableName}
  FOR SELECT
  USING (true);

-- Policy: Only super admins can write
CREATE POLICY ${tableName}_admin_write ON ${tableName}
  FOR ALL
  USING (current_setting('${RLS_VARS.CAN_BYPASS_ORG}', true) = 'true')
  WITH CHECK (current_setting('${RLS_VARS.CAN_BYPASS_ORG}', true) = 'true');
`;
}

/**
 * SQL to drop all RLS policies for a table.
 * Useful for migrations that need to recreate policies.
 *
 * @param tableName - Name of the table
 */
export function generateDropRLSPolicies(tableName: string): string {
  return `
-- Disable RLS on ${tableName}
ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;

-- Drop all policies (this will error if policies don't exist, which is fine)
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = '${tableName}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ${tableName}', policy_record.policyname);
  END LOOP;
END $$;
`;
}

/**
 * Master RLS migration SQL for a service.
 * Generates all RLS policies for tables with org_id columns.
 *
 * @param tables - Map of table names to options
 */
export function generateRLSMigration(
  tables: Record<string, { orgIdColumn?: string; nullableOrgId?: boolean }>
): string {
  const policies = Object.entries(tables).map(([table, options]) =>
    generateRLSPolicies(table, options)
  );

  return `
-- Row-Level Security Migration
-- Generated by @symbia/db
-- This migration enables RLS on all tables with org_id columns.

-- Ensure the session variables exist (with defaults)
DO $$
BEGIN
  -- These will be set by the application before queries
  PERFORM set_config('${RLS_VARS.ORG_ID}', '', false);
  PERFORM set_config('${RLS_VARS.USER_ID}', '', false);
  PERFORM set_config('${RLS_VARS.CAN_BYPASS_ORG}', 'false', false);
  PERFORM set_config('${RLS_VARS.SERVICE_ID}', '', false);
EXCEPTION WHEN OTHERS THEN
  -- Variables already exist, ignore
  NULL;
END $$;

${policies.join("\n")}
`;
}
