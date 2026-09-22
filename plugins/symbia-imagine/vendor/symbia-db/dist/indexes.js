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
/**
 * Standard index patterns for common query scenarios.
 * Use these with withStandardIndexes() or createIndex().
 */
export const IndexPatterns = {
    // === Multi-tenancy ===
    /** Index on org_id - required for all multi-tenant tables */
    orgId: {
        name: "orgId",
        columns: (t) => t.orgId,
        suffix: "org_id",
    },
    /** Composite index on (org_id, created_at DESC) - for listing by org */
    orgCreatedAt: {
        name: "orgCreatedAt",
        columns: (t) => [t.orgId, t.createdAt],
        suffix: "org_created",
    },
    /** Composite index on (org_id, updated_at DESC) - for listing by org with recent first */
    orgUpdatedAt: {
        name: "orgUpdatedAt",
        columns: (t) => [t.orgId, t.updatedAt],
        suffix: "org_updated",
    },
    // === Status filtering ===
    /** Index on status - for filtering by status */
    status: {
        name: "status",
        columns: (t) => t.status,
        suffix: "status",
    },
    /** Composite index on (org_id, status) - for filtering by org and status */
    orgStatus: {
        name: "orgStatus",
        columns: (t) => [t.orgId, t.status],
        suffix: "org_status",
    },
    // === Type filtering (catalog/registry patterns) ===
    /** Index on type - for filtering by resource type */
    type: {
        name: "type",
        columns: (t) => t.type,
        suffix: "type",
    },
    /** Composite index on (type, org_id) - for filtering by type within org */
    typeOrg: {
        name: "typeOrg",
        columns: (t) => [t.type, t.orgId],
        suffix: "type_org",
    },
    /** Composite index on (type, status) - for filtering by type and status */
    typeStatus: {
        name: "typeStatus",
        columns: (t) => [t.type, t.status],
        suffix: "type_status",
    },
    // === Time-series (logging, events, audit) ===
    /** Index on timestamp - for time-range queries */
    timestamp: {
        name: "timestamp",
        columns: (t) => t.timestamp,
        suffix: "timestamp",
    },
    /** Composite index on (org_id, timestamp) - for time-series by org */
    orgTimestamp: {
        name: "orgTimestamp",
        columns: (t) => [t.orgId, t.timestamp],
        suffix: "org_ts",
    },
    /** Index on created_at - for ordering by creation time */
    createdAt: {
        name: "createdAt",
        columns: (t) => t.createdAt,
        suffix: "created",
    },
    /** Index on updated_at - for ordering by update time */
    updatedAt: {
        name: "updatedAt",
        columns: (t) => t.updatedAt,
        suffix: "updated",
    },
    // === Foreign key lookups ===
    /** Index on resource_id - for FK lookups to resources */
    resourceId: {
        name: "resourceId",
        columns: (t) => t.resourceId,
        suffix: "resource_id",
    },
    /** Index on user_id - for FK lookups to users */
    userId: {
        name: "userId",
        columns: (t) => t.userId,
        suffix: "user_id",
    },
    /** Index on conversation_id - for FK lookups to conversations */
    conversationId: {
        name: "conversationId",
        columns: (t) => t.conversationId,
        suffix: "conversation_id",
    },
    // === Boolean flags ===
    /** Index on is_active - for filtering active records */
    isActive: {
        name: "isActive",
        columns: (t) => t.isActive,
        suffix: "active",
    },
    /** Index on is_bootstrap - for filtering bootstrap resources */
    isBootstrap: {
        name: "isBootstrap",
        columns: (t) => t.isBootstrap,
        suffix: "bootstrap",
    },
    // === Unique constraints ===
    /** Unique index on email */
    emailUnique: {
        name: "emailUnique",
        unique: true,
        columns: (t) => t.email,
        suffix: "email",
    },
    /** Unique index on key */
    keyUnique: {
        name: "keyUnique",
        unique: true,
        columns: (t) => t.key,
        suffix: "key",
    },
    /** Unique index on slug */
    slugUnique: {
        name: "slugUnique",
        unique: true,
        columns: (t) => t.slug,
        suffix: "slug",
    },
};
/**
 * Create a single index from a pattern.
 * For composite indexes, pass multiple columns to the columns function.
 */
export function createIndex(tableName, table, pattern) {
    const suffix = pattern.suffix || pattern.name.toLowerCase();
    const indexName = `idx_${tableName}_${suffix}`;
    const columns = pattern.columns(table);
    const columnArray = Array.isArray(columns) ? columns : [columns];
    if (pattern.unique) {
        // uniqueIndex().on() accepts multiple columns as spread args
        return uniqueIndex(indexName).on(...columnArray);
    }
    // index().on() accepts multiple columns as spread args
    return index(indexName).on(...columnArray);
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
export function withStandardIndexes(tableName, table, patterns) {
    const indexes = {};
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
export function generateIndexSQL(tableName, indexes) {
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
    resourceTable: (tableName) => generateIndexSQL(tableName, [
        { columns: ["type"], suffix: "type" },
        { columns: ["org_id"], suffix: "org_id" },
        { columns: ["type", "org_id"], suffix: "type_org" },
        { columns: ["status"], suffix: "status" },
        { columns: ["is_bootstrap"], suffix: "bootstrap" },
        { columns: ["updated_at"], suffix: "updated" },
    ]),
    /** Indexes for a time-series table (logging pattern) */
    timeSeriesTable: (tableName, timestampColumn = "timestamp") => generateIndexSQL(tableName, [
        { columns: ["org_id"], suffix: "org_id" },
        { columns: [timestampColumn], suffix: "ts" },
        { columns: ["org_id", timestampColumn], suffix: "org_ts" },
    ]),
    /** Indexes for a foreign key child table */
    childTable: (tableName, parentColumn) => generateIndexSQL(tableName, [
        { columns: [parentColumn], suffix: parentColumn.replace("_id", "") },
    ]),
    /** Indexes for a user/membership table */
    userTable: (tableName) => generateIndexSQL(tableName, [
        { columns: ["org_id"], suffix: "org_id" },
        { columns: ["user_id"], suffix: "user_id" },
        { columns: ["org_id", "user_id"], suffix: "org_user", unique: true },
    ]),
};
