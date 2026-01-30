/**
 * @symbia/db - Standard index definitions and utilities
 *
 * Provides reusable index patterns for common query patterns across all services.
 * Services should use these helpers when defining their schemas to ensure
 * consistent indexing strategy.
 *
 * @example
 * ```typescript
 * import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core';
 * import { withStandardIndexes, IndexPatterns } from '@symbia/db';
 *
 * export const resources = pgTable('resources', {
 *   id: varchar('id').primaryKey(),
 *   orgId: varchar('org_id'),
 *   type: varchar('type'),
 *   status: varchar('status'),
 *   createdAt: timestamp('created_at'),
 *   updatedAt: timestamp('updated_at'),
 * }, (table) => withStandardIndexes('resources', table, [
 *   IndexPatterns.orgId,
 *   IndexPatterns.type,
 *   IndexPatterns.typeOrg,
 *   IndexPatterns.status,
 *   IndexPatterns.updatedAt,
 * ]));
 * ```
 */

import { index, uniqueIndex } from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Index pattern definition
 */
export interface IndexPattern<T = any> {
  /** Pattern name for identification */
  name: string;
  /** Whether this is a unique index */
  unique?: boolean;
  /** Function to get the columns to index from a table */
  columns: (table: T) => PgColumn | PgColumn[];
  /** Optional suffix override (defaults to pattern name) */
  suffix?: string;
}

/**
 * Standard index patterns for common query scenarios.
 * Use these with withStandardIndexes() or createIndex().
 */
export const IndexPatterns = {
  // === Multi-tenancy ===

  /** Index on org_id - required for all multi-tenant tables */
  orgId: {
    name: "orgId",
    columns: (t: any) => t.orgId,
    suffix: "org_id",
  } as IndexPattern,

  /** Composite index on (org_id, created_at DESC) - for listing by org */
  orgCreatedAt: {
    name: "orgCreatedAt",
    columns: (t: any) => [t.orgId, t.createdAt],
    suffix: "org_created",
  } as IndexPattern,

  /** Composite index on (org_id, updated_at DESC) - for listing by org with recent first */
  orgUpdatedAt: {
    name: "orgUpdatedAt",
    columns: (t: any) => [t.orgId, t.updatedAt],
    suffix: "org_updated",
  } as IndexPattern,

  // === Status filtering ===

  /** Index on status - for filtering by status */
  status: {
    name: "status",
    columns: (t: any) => t.status,
    suffix: "status",
  } as IndexPattern,

  /** Composite index on (org_id, status) - for filtering by org and status */
  orgStatus: {
    name: "orgStatus",
    columns: (t: any) => [t.orgId, t.status],
    suffix: "org_status",
  } as IndexPattern,

  // === Type filtering (catalog/registry patterns) ===

  /** Index on type - for filtering by resource type */
  type: {
    name: "type",
    columns: (t: any) => t.type,
    suffix: "type",
  } as IndexPattern,

  /** Composite index on (type, org_id) - for filtering by type within org */
  typeOrg: {
    name: "typeOrg",
    columns: (t: any) => [t.type, t.orgId],
    suffix: "type_org",
  } as IndexPattern,

  /** Composite index on (type, status) - for filtering by type and status */
  typeStatus: {
    name: "typeStatus",
    columns: (t: any) => [t.type, t.status],
    suffix: "type_status",
  } as IndexPattern,

  // === Time-series (logging, events, audit) ===

  /** Index on timestamp - for time-range queries */
  timestamp: {
    name: "timestamp",
    columns: (t: any) => t.timestamp,
    suffix: "timestamp",
  } as IndexPattern,

  /** Composite index on (org_id, timestamp) - for time-series by org */
  orgTimestamp: {
    name: "orgTimestamp",
    columns: (t: any) => [t.orgId, t.timestamp],
    suffix: "org_ts",
  } as IndexPattern,

  /** Index on created_at - for ordering by creation time */
  createdAt: {
    name: "createdAt",
    columns: (t: any) => t.createdAt,
    suffix: "created",
  } as IndexPattern,

  /** Index on updated_at - for ordering by update time */
  updatedAt: {
    name: "updatedAt",
    columns: (t: any) => t.updatedAt,
    suffix: "updated",
  } as IndexPattern,

  // === Foreign key lookups ===

  /** Index on resource_id - for FK lookups to resources */
  resourceId: {
    name: "resourceId",
    columns: (t: any) => t.resourceId,
    suffix: "resource_id",
  } as IndexPattern,

  /** Index on user_id - for FK lookups to users */
  userId: {
    name: "userId",
    columns: (t: any) => t.userId,
    suffix: "user_id",
  } as IndexPattern,

  /** Index on conversation_id - for FK lookups to conversations */
  conversationId: {
    name: "conversationId",
    columns: (t: any) => t.conversationId,
    suffix: "conversation_id",
  } as IndexPattern,

  // === Boolean flags ===

  /** Index on is_active - for filtering active records */
  isActive: {
    name: "isActive",
    columns: (t: any) => t.isActive,
    suffix: "active",
  } as IndexPattern,

  /** Index on is_bootstrap - for filtering bootstrap resources */
  isBootstrap: {
    name: "isBootstrap",
    columns: (t: any) => t.isBootstrap,
    suffix: "bootstrap",
  } as IndexPattern,

  // === Unique constraints ===

  /** Unique index on email */
  emailUnique: {
    name: "emailUnique",
    unique: true,
    columns: (t: any) => t.email,
    suffix: "email",
  } as IndexPattern,

  /** Unique index on key */
  keyUnique: {
    name: "keyUnique",
    unique: true,
    columns: (t: any) => t.key,
    suffix: "key",
  } as IndexPattern,

  /** Unique index on slug */
  slugUnique: {
    name: "slugUnique",
    unique: true,
    columns: (t: any) => t.slug,
    suffix: "slug",
  } as IndexPattern,
} as const;

/**
 * Create a single index from a pattern.
 * For composite indexes, pass multiple columns to the columns function.
 */
export function createIndex<T>(
  tableName: string,
  table: T,
  pattern: IndexPattern<T>
): any {
  const suffix = pattern.suffix || pattern.name.toLowerCase();
  const indexName = `idx_${tableName}_${suffix}`;
  const columns = pattern.columns(table);

  const columnArray = Array.isArray(columns) ? columns : [columns];

  if (pattern.unique) {
    // uniqueIndex().on() accepts multiple columns as spread args
    return uniqueIndex(indexName).on(...(columnArray as [any, ...any[]]));
  }

  // index().on() accepts multiple columns as spread args
  return index(indexName).on(...(columnArray as [any, ...any[]]));
}

/**
 * Create multiple indexes from patterns and return as an object for pgTable
 *
 * @example
 * ```typescript
 * export const resources = pgTable('resources', {
 *   // ... columns
 * }, (table) => withStandardIndexes('resources', table, [
 *   IndexPatterns.orgId,
 *   IndexPatterns.type,
 *   IndexPatterns.typeOrg,
 * ]));
 * ```
 */
export function withStandardIndexes<T>(
  tableName: string,
  table: T,
  patterns: IndexPattern<T>[]
): Record<string, ReturnType<typeof index> | ReturnType<typeof uniqueIndex>> {
  const indexes: Record<string, ReturnType<typeof index> | ReturnType<typeof uniqueIndex>> = {};

  for (const pattern of patterns) {
    const key = `${pattern.name}Idx`;
    indexes[key] = createIndex(tableName, table, pattern);
  }

  return indexes;
}

/**
 * Generate SQL CREATE INDEX statements for use in memory-schema.ts files.
 * This ensures memory databases have the same indexes as production.
 *
 * @example
 * ```typescript
 * const indexSQL = generateIndexSQL('resources', [
 *   { columns: ['type'], suffix: 'type' },
 *   { columns: ['org_id'], suffix: 'org_id' },
 *   { columns: ['type', 'org_id'], suffix: 'type_org' },
 * ]);
 * ```
 */
export function generateIndexSQL(
  tableName: string,
  indexes: Array<{
    columns: string[];
    suffix: string;
    unique?: boolean;
  }>
): string {
  return indexes
    .map(({ columns, suffix, unique }) => {
      const indexName = `idx_${tableName}_${suffix}`;
      const columnList = columns.join(", ");
      const indexType = unique ? "UNIQUE INDEX" : "INDEX";
      return `CREATE ${indexType} ${indexName} ON "${tableName}"(${columnList});`;
    })
    .join("\n");
}

/**
 * Standard index SQL generators for common table patterns.
 * Use these to generate CREATE INDEX statements for memory-schema.ts files.
 */
export const StandardIndexSQL = {
  /** Indexes for a multi-tenant resource table (catalog pattern) */
  resourceTable: (tableName: string) =>
    generateIndexSQL(tableName, [
      { columns: ["type"], suffix: "type" },
      { columns: ["org_id"], suffix: "org_id" },
      { columns: ["type", "org_id"], suffix: "type_org" },
      { columns: ["status"], suffix: "status" },
      { columns: ["is_bootstrap"], suffix: "bootstrap" },
      { columns: ["updated_at"], suffix: "updated" },
    ]),

  /** Indexes for a time-series table (logging pattern) */
  timeSeriesTable: (tableName: string, timestampColumn = "timestamp") =>
    generateIndexSQL(tableName, [
      { columns: ["org_id"], suffix: "org_id" },
      { columns: [timestampColumn], suffix: "ts" },
      { columns: ["org_id", timestampColumn], suffix: "org_ts" },
    ]),

  /** Indexes for a foreign key child table */
  childTable: (tableName: string, parentColumn: string) =>
    generateIndexSQL(tableName, [
      { columns: [parentColumn], suffix: parentColumn.replace("_id", "") },
    ]),

  /** Indexes for a user/membership table */
  userTable: (tableName: string) =>
    generateIndexSQL(tableName, [
      { columns: ["org_id"], suffix: "org_id" },
      { columns: ["user_id"], suffix: "user_id" },
      { columns: ["org_id", "user_id"], suffix: "org_user", unique: true },
    ]),
};
