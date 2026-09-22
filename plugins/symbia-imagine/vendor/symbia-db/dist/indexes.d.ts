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
export declare const IndexPatterns: {
    /** Index on org_id - required for all multi-tenant tables */
    readonly orgId: IndexPattern;
    /** Composite index on (org_id, created_at DESC) - for listing by org */
    readonly orgCreatedAt: IndexPattern;
    /** Composite index on (org_id, updated_at DESC) - for listing by org with recent first */
    readonly orgUpdatedAt: IndexPattern;
    /** Index on status - for filtering by status */
    readonly status: IndexPattern;
    /** Composite index on (org_id, status) - for filtering by org and status */
    readonly orgStatus: IndexPattern;
    /** Index on type - for filtering by resource type */
    readonly type: IndexPattern;
    /** Composite index on (type, org_id) - for filtering by type within org */
    readonly typeOrg: IndexPattern;
    /** Composite index on (type, status) - for filtering by type and status */
    readonly typeStatus: IndexPattern;
    /** Index on timestamp - for time-range queries */
    readonly timestamp: IndexPattern;
    /** Composite index on (org_id, timestamp) - for time-series by org */
    readonly orgTimestamp: IndexPattern;
    /** Index on created_at - for ordering by creation time */
    readonly createdAt: IndexPattern;
    /** Index on updated_at - for ordering by update time */
    readonly updatedAt: IndexPattern;
    /** Index on resource_id - for FK lookups to resources */
    readonly resourceId: IndexPattern;
    /** Index on user_id - for FK lookups to users */
    readonly userId: IndexPattern;
    /** Index on conversation_id - for FK lookups to conversations */
    readonly conversationId: IndexPattern;
    /** Index on is_active - for filtering active records */
    readonly isActive: IndexPattern;
    /** Index on is_bootstrap - for filtering bootstrap resources */
    readonly isBootstrap: IndexPattern;
    /** Unique index on email */
    readonly emailUnique: IndexPattern;
    /** Unique index on key */
    readonly keyUnique: IndexPattern;
    /** Unique index on slug */
    readonly slugUnique: IndexPattern;
};
/**
 * Create a single index from a pattern.
 * For composite indexes, pass multiple columns to the columns function.
 */
export declare function createIndex<T>(tableName: string, table: T, pattern: IndexPattern<T>): any;
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
export declare function withStandardIndexes<T>(tableName: string, table: T, patterns: IndexPattern<T>[]): Record<string, ReturnType<typeof index> | ReturnType<typeof uniqueIndex>>;
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
export declare function generateIndexSQL(tableName: string, indexes: Array<{
    columns: string[];
    suffix: string;
    unique?: boolean;
}>): string;
/**
 * Standard index SQL generators for common table patterns.
 * Use these to generate CREATE INDEX statements for memory-schema.ts files.
 */
export declare const StandardIndexSQL: {
    /** Indexes for a multi-tenant resource table (catalog pattern) */
    resourceTable: (tableName: string) => string;
    /** Indexes for a time-series table (logging pattern) */
    timeSeriesTable: (tableName: string, timestampColumn?: string) => string;
    /** Indexes for a foreign key child table */
    childTable: (tableName: string, parentColumn: string) => string;
    /** Indexes for a user/membership table */
    userTable: (tableName: string) => string;
};
