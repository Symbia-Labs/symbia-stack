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
export declare const RLS_VARS: {
    readonly ORG_ID: "symbia.org_id";
    readonly USER_ID: "symbia.user_id";
    readonly CAN_BYPASS_ORG: "symbia.can_bypass_org";
    readonly SERVICE_ID: "symbia.service_id";
};
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
export declare function setSessionContext(client: Pool | PoolClient, context: RLSContext): Promise<void>;
/**
 * Clear session context (reset to empty values).
 * Call this after request completion if using persistent connections.
 *
 * @param client - Database pool or client
 */
export declare function clearSessionContext(client: Pool | PoolClient): Promise<void>;
/**
 * Execute a function with RLS context set.
 * Automatically clears context after execution.
 *
 * @param pool - Database pool
 * @param context - RLS context
 * @param fn - Function to execute with context
 * @returns Result of the function
 */
export declare function withRLSContext<T>(pool: Pool, context: RLSContext, fn: (client: PoolClient) => Promise<T>): Promise<T>;
/**
 * SQL to create RLS policies for a table with org_id column.
 * Returns the SQL statements to execute.
 *
 * @param tableName - Name of the table
 * @param options - Policy options
 */
export declare function generateRLSPolicies(tableName: string, options?: {
    /** Column name for org ID (default: 'org_id') */
    orgIdColumn?: string;
    /** Whether org_id can be NULL (default: false) */
    nullableOrgId?: boolean;
    /** Additional policies to create */
    additionalPolicies?: string[];
}): string;
/**
 * SQL to create RLS policies for a table that should be globally accessible
 * (e.g., lookup tables, public resources).
 *
 * @param tableName - Name of the table
 */
export declare function generatePublicRLSPolicy(tableName: string): string;
/**
 * SQL to drop all RLS policies for a table.
 * Useful for migrations that need to recreate policies.
 *
 * @param tableName - Name of the table
 */
export declare function generateDropRLSPolicies(tableName: string): string;
/**
 * Master RLS migration SQL for a service.
 * Generates all RLS policies for tables with org_id columns.
 *
 * @param tables - Map of table names to options
 */
export declare function generateRLSMigration(tables: Record<string, {
    orgIdColumn?: string;
    nullableOrgId?: boolean;
}>): string;
