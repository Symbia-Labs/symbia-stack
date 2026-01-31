import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex("idx_users_email").on(table.email),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

// Organizations table
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  planId: varchar("plan_id").references(() => plans.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  plan: one(plans, {
    fields: [organizations.planId],
    references: [plans.id],
  }),
  memberships: many(memberships),
  entitlements: many(entitlements),
}));

// Memberships table (user-org relationship with roles)
export const memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // admin, member, viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_memberships_user_id").on(table.userId),
  orgIdx: index("idx_memberships_org_id").on(table.orgId),
  orgUserIdx: uniqueIndex("idx_memberships_org_user").on(table.orgId, table.userId),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [memberships.orgId],
    references: [organizations.id],
  }),
}));

// Plans table
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  featuresJson: json("features_json").$type<string[]>().default([]),
  limitsJson: json("limits_json").$type<Record<string, number>>().default({}),
  priceCents: integer("price_cents").notNull().default(0),
});

export const plansRelations = relations(plans, ({ many }) => ({
  organizations: many(organizations),
}));

// Entitlements table
export const entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at"),
});

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [entitlements.orgId],
    references: [organizations.id],
  }),
}));

// Sessions table
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_sessions_user_id").on(table.userId),
  expiresIdx: index("idx_sessions_expires").on(table.expiresAt),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"), // active, archived, suspended
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_projects_org_id").on(table.orgId),
  orgSlugIdx: uniqueIndex("idx_projects_org_slug").on(table.orgId, table.slug),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  applications: many(applications),
  services: many(services),
}));

// Applications table
export const applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  environment: text("environment").notNull().default("development"), // development, staging, production
  appType: text("app_type").notNull().default("web"), // web, mobile, api, cli
  repoUrl: text("repo_url"),
  metadataJson: json("metadata_json").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_applications_org_id").on(table.orgId),
  projectIdx: index("idx_applications_project_id").on(table.projectId),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  project: one(projects, {
    fields: [applications.projectId],
    references: [projects.id],
  }),
  organization: one(organizations, {
    fields: [applications.orgId],
    references: [organizations.id],
  }),
  serviceLinks: many(applicationServices),
}));

// Services table (integrations, external APIs, databases, etc.)
export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(), // database, api, auth, storage, messaging, analytics
  provider: text("provider"), // aws, gcp, stripe, twilio, etc.
  endpointUrl: text("endpoint_url"),
  externalId: text("external_id"), // External service identifier
  status: text("status").notNull().default("active"), // active, inactive, error
  metadataJson: json("metadata_json").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_services_org_id").on(table.orgId),
  projectIdx: index("idx_services_project_id").on(table.projectId),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id],
  }),
  organization: one(organizations, {
    fields: [services.orgId],
    references: [organizations.id],
  }),
  applicationLinks: many(applicationServices),
}));

// Application-Service link table (which apps use which services)
export const applicationServices = pgTable("application_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const applicationServicesRelations = relations(applicationServices, ({ one }) => ({
  application: one(applications, {
    fields: [applicationServices.applicationId],
    references: [applications.id],
  }),
  service: one(services, {
    fields: [applicationServices.serviceId],
    references: [services.id],
  }),
}));

// Entitlement tranches (plan-defined bundles)
export const entitlementTranches = pgTable("entitlement_tranches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").references(() => plans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trancheKey: text("tranche_key").notNull(), // e.g., "api_calls", "storage_gb", "users"
  description: text("description"),
  defaultQuota: integer("default_quota").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const entitlementTranchesRelations = relations(entitlementTranches, ({ one }) => ({
  plan: one(plans, {
    fields: [entitlementTranches.planId],
    references: [plans.id],
  }),
}));

// Scoped entitlements (polymorphic - can be org, project, application, or service level)
export const scopedEntitlements = pgTable("scoped_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull(), // org, project, application, service
  scopeId: varchar("scope_id").notNull(), // ID of the scoped entity
  trancheId: varchar("tranche_id").references(() => entitlementTranches.id),
  featureKey: text("feature_key").notNull(),
  quota: integer("quota").default(0),
  consumed: integer("consumed").default(0),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  metadataJson: json("metadata_json").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scopedEntitlementsRelations = relations(scopedEntitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [scopedEntitlements.orgId],
    references: [organizations.id],
  }),
  tranche: one(entitlementTranches, {
    fields: [scopedEntitlements.trancheId],
    references: [entitlementTranches.id],
  }),
}));

// User entitlements table (capability grants like cap:registry.write)
export const userEntitlements = pgTable("user_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entitlementKey: text("entitlement_key").notNull(), // e.g., "cap:registry.write", "cap:registry.publish"
  grantedBy: varchar("granted_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userEntitlementsRelations = relations(userEntitlements, ({ one }) => ({
  user: one(users, {
    fields: [userEntitlements.userId],
    references: [users.id],
  }),
  granter: one(users, {
    fields: [userEntitlements.grantedBy],
    references: [users.id],
  }),
}));

// User roles table (global roles like role:admin, role:publisher)
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleKey: text("role_key").notNull(), // e.g., "role:admin", "role:publisher", "role:reviewer"
  grantedBy: varchar("granted_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  granter: one(users, {
    fields: [userRoles.grantedBy],
    references: [users.id],
  }),
}));

// API Keys table (for service-to-service authentication)
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for identification
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  scopes: json("scopes").$type<string[]>().default([]), // e.g., ["read:resources", "write:resources"]
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("idx_api_keys_org_id").on(table.orgId),
  createdByIdx: index("idx_api_keys_created_by").on(table.createdBy),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
}));

// Agents table (parallel to users - for AI agent authentication)
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull().unique(), // Unique identifier like "assistant:onboarding" or "agent:my-bot"
  credentialHash: text("credential_hash").notNull(), // bcrypt hash of credential (parallel to passwordHash)
  name: text("name").notNull(),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  capabilities: json("capabilities").$type<string[]>().default([]), // e.g., ["cap:messaging.send", "cap:messaging.receive"]
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  agentIdIdx: uniqueIndex("idx_agents_agent_id").on(table.agentId),
  orgIdx: index("idx_agents_org_id").on(table.orgId),
}));

export const agentsRelations = relations(agents, ({ one }) => ({
  organization: one(organizations, {
    fields: [agents.orgId],
    references: [organizations.id],
  }),
}));

// =============================================================================
// Entity Directory - UUID-based entity addressing for messaging/network
// =============================================================================

// Entity type enum for validation
export const entityTypeEnum = z.enum([
  'user',
  'assistant',
  'service',
  'integration',
  'sandbox',
]);

// Entity status enum
export const entityStatusEnum = z.enum([
  'active',
  'inactive',
  'suspended',
]);

// Entities table - unified UUID addressing for all principals
export const entities = pgTable("entities", {
  // UUID primary key with ent_ prefix convention
  id: varchar("id").primaryKey().default(sql`'ent_' || gen_random_uuid()`),

  // Entity type
  type: text("type").notNull(), // user, assistant, service, integration, sandbox

  // Human-readable addressing
  slug: text("slug").notNull(), // e.g., "log-analyst", "brian", "messaging"
  displayName: text("display_name").notNull(), // e.g., "Log Analyst", "Brian"

  // Multi-instance support
  instanceId: text("instance_id"), // e.g., "prod-1", "us-west-1"
  instanceIndex: integer("instance_index").default(1), // 1, 2, 3 for ordered instances

  // Org/Network scoping
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  networkId: text("network_id"), // For federation: "acme.symbia.io"

  // Resolution hints
  capabilities: json("capabilities").$type<string[]>().default([]),
  tags: json("tags").$type<string[]>().default([]),

  // Lifecycle
  status: text("status").notNull().default("active"), // active, inactive, suspended

  // Network binding (ephemeral - current connection)
  boundNodeId: text("bound_node_id"), // Current network node ID (null if disconnected)
  boundAt: timestamp("bound_at"), // When bound to current node

  // Source reference (links to original user/agent record)
  sourceTable: text("source_table"), // 'users' or 'agents'
  sourceId: varchar("source_id"), // ID in the source table

  // Metadata
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),

  // Timestamps
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint on slug + org + instance for local addressing
  slugOrgInstanceIdx: uniqueIndex("idx_entities_slug_org_instance").on(
    table.slug,
    table.orgId,
    table.instanceId
  ),
  // Index for org lookups
  orgIdx: index("idx_entities_org_id").on(table.orgId),
  // Index for type filtering
  typeIdx: index("idx_entities_type").on(table.type),
  // Index for network node binding lookups
  boundNodeIdx: index("idx_entities_bound_node").on(table.boundNodeId),
  // Index for source table lookups (syncing from users/agents)
  sourceIdx: index("idx_entities_source").on(table.sourceTable, table.sourceId),
  // Index for status filtering
  statusIdx: index("idx_entities_status").on(table.status),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [entities.orgId],
    references: [organizations.id],
  }),
  aliases: many(entityAliases),
}));

// Entity aliases table - multiple addressing formats for the same entity
export const entityAliases = pgTable("entity_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),

  // Alias format
  aliasType: text("alias_type").notNull(), // 'slug', 'qualified', 'legacy', 'federated'
  aliasValue: text("alias_value").notNull(), // The actual alias string

  // Scoping (for ambiguity resolution)
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),

  // Priority for resolution (higher = preferred)
  priority: integer("priority").notNull().default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint on alias value within org
  aliasOrgIdx: uniqueIndex("idx_entity_aliases_value_org").on(table.aliasValue, table.orgId),
  // Index for entity lookups
  entityIdx: index("idx_entity_aliases_entity").on(table.entityId),
  // Index for alias resolution
  aliasValueIdx: index("idx_entity_aliases_value").on(table.aliasValue),
}));

export const entityAliasesRelations = relations(entityAliases, ({ one }) => ({
  entity: one(entities, {
    fields: [entityAliases.entityId],
    references: [entities.id],
  }),
  organization: one(organizations, {
    fields: [entityAliases.orgId],
    references: [organizations.id],
  }),
}));

// Entity instances table - track multiple instances of the same entity type
export const entityInstances = pgTable("entity_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),

  // Instance identification
  instanceId: text("instance_id").notNull(), // e.g., "prod-1", "us-west-1"
  instanceIndex: integer("instance_index").notNull(), // 1, 2, 3...

  // Runtime state
  nodeId: text("node_id"), // Current network node (if connected)
  status: text("status").notNull().default("available"), // available, busy, offline
  lastHeartbeat: timestamp("last_heartbeat"),

  // Load balancing metadata
  loadScore: integer("load_score").default(0), // Higher = more loaded
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entityInstanceIdx: uniqueIndex("idx_entity_instances_entity_instance").on(
    table.entityId,
    table.instanceId
  ),
  entityIdx: index("idx_entity_instances_entity").on(table.entityId),
  statusIdx: index("idx_entity_instances_status").on(table.status),
}));

export const entityInstancesRelations = relations(entityInstances, ({ one }) => ({
  entity: one(entities, {
    fields: [entityInstances.entityId],
    references: [entities.id],
  }),
}));

// Insert schemas for entity tables
export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  registeredAt: true,
});

export const insertEntityAliasSchema = createInsertSchema(entityAliases).omit({
  id: true,
  createdAt: true,
});

export const insertEntityInstanceSchema = createInsertSchema(entityInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// API schemas for entity operations
export const createEntitySchema = z.object({
  type: entityTypeEnum,
  slug: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Slug must be lowercase alphanumeric with dashes or underscores"),
  displayName: z.string().min(1),
  instanceId: z.string().optional(),
  orgId: z.string().optional(),
  networkId: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sourceTable: z.enum(['users', 'agents']).optional(),
  sourceId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const resolveEntitySchema = z.object({
  address: z.string().min(1), // @slug, slug#instance, qualified:address, ent_uuid
  orgId: z.string().optional(), // Context for ambiguous resolution
});

export const bindEntitySchema = z.object({
  entityId: z.string().min(1),
  nodeId: z.string().min(1),
});

export const unbindEntitySchema = z.object({
  entityId: z.string().min(1),
});

// Types for entity tables
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entities.$inferSelect;
export type InsertEntityAlias = z.infer<typeof insertEntityAliasSchema>;
export type EntityAlias = typeof entityAliases.$inferSelect;
export type InsertEntityInstance = z.infer<typeof insertEntityInstanceSchema>;
export type EntityInstance = typeof entityInstances.$inferSelect;
export type EntityType = z.infer<typeof entityTypeEnum>;
export type EntityStatus = z.infer<typeof entityStatusEnum>;

// Extended entity types
export type EntityWithAliases = Entity & { aliases: EntityAlias[] };
export type EntityWithInstances = Entity & { instances: EntityInstance[] };

// User credentials table (third-party API keys and OAuth tokens for integrations)
export const userCredentials = pgTable("user_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // e.g., "openai", "huggingface", "anthropic", "replit"
  name: text("name").notNull(), // User-friendly name like "My OpenAI Key"
  credentialEncrypted: text("credential_encrypted").notNull(), // Encrypted API key or access token
  credentialPrefix: text("credential_prefix"), // First 8 chars for identification (e.g., "sk-proj-...")
  isOrgWide: boolean("is_org_wide").notNull().default(false), // Shared across org members
  metadata: json("metadata").$type<Record<string, unknown>>().default({}),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // OAuth-specific fields
  credentialType: text("credential_type").default("api_key"), // 'api_key' | 'oauth_token'
  refreshTokenEncrypted: text("refresh_token_encrypted"), // Encrypted OAuth refresh token
  expiresAt: timestamp("expires_at"), // Token expiration time
  oauthUserId: varchar("oauth_user_id", { length: 255 }), // External user ID from OAuth provider
  oauthUserEmail: text("oauth_user_email"), // External email from OAuth provider
  oauthUserName: text("oauth_user_name"), // External name from OAuth provider
}, (table) => ({
  userIdx: index("idx_user_credentials_user_id").on(table.userId),
  orgIdx: index("idx_user_credentials_org_id").on(table.orgId),
  providerIdx: index("idx_user_credentials_provider").on(table.provider),
  userProviderIdx: index("idx_user_credentials_user_provider").on(table.userId, table.provider),
  credentialTypeIdx: index("idx_user_credentials_type").on(table.credentialType),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userCredentials.orgId],
    references: [organizations.id],
  }),
}));

// Audit logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  orgId: varchar("org_id").references(() => organizations.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: varchar("resource_id"),
  metadataJson: json("metadata_json").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgCreatedIdx: index("idx_audit_logs_org_created").on(table.orgId, table.createdAt),
  userCreatedIdx: index("idx_audit_logs_user_created").on(table.userId, table.createdAt),
  resourceIdx: index("idx_audit_logs_resource").on(table.resource, table.resourceId),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [auditLogs.orgId],
    references: [organizations.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});

export const insertMembershipSchema = createInsertSchema(memberships).omit({
  id: true,
  createdAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
});

export const insertEntitlementSchema = createInsertSchema(entitlements).omit({
  id: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
});

export const insertApplicationServiceSchema = createInsertSchema(applicationServices).omit({
  id: true,
  createdAt: true,
});

export const insertEntitlementTrancheSchema = createInsertSchema(entitlementTranches).omit({
  id: true,
  createdAt: true,
});

export const insertScopedEntitlementSchema = createInsertSchema(scopedEntitlements).omit({
  id: true,
  createdAt: true,
});

export const insertUserEntitlementSchema = createInsertSchema(userEntitlements).omit({
  id: true,
  createdAt: true,
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCredentialSchema = createInsertSchema(userCredentials).omit({
  id: true,
  createdAt: true,
});

// Registration/Login schemas for API validation
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  orgName: z.string().min(1, "Organization name is required").optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "viewer"]),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: z.string().optional(),
});

export const createApplicationSchema = z.object({
  name: z.string().min(1, "Application name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  appType: z.enum(["web", "mobile", "api", "cli"]).default("web"),
  repoUrl: z.string().url().optional().or(z.literal("")),
});

export const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  serviceType: z.enum(["database", "api", "auth", "storage", "messaging", "analytics"]),
  provider: z.string().optional(),
  endpointUrl: z.string().url().optional().or(z.literal("")),
  externalId: z.string().optional(),
});

export const scopeTypeEnum = z.enum(["org", "project", "application", "service"]);

export const createScopedEntitlementSchema = z.object({
  scopeType: scopeTypeEnum,
  scopeId: z.string().min(1),
  featureKey: z.string().min(1, "Feature key is required"),
  quota: z.number().int().min(0).optional(),
  enabled: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, "API key name is required").max(100),
  orgId: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});

// Agent registration/login schemas (parallel to user auth)
export const agentRegisterSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required").regex(/^[a-z0-9:_-]+$/, "Agent ID must be lowercase alphanumeric with colons, underscores, or dashes"),
  credential: z.string().min(32, "Credential must be at least 32 characters"),
  name: z.string().min(1, "Name is required"),
  orgId: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const agentLoginSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
  credential: z.string().min(1, "Credential is required"),
});

// User credential (third-party API key) schemas
export const createUserCredentialSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  name: z.string().min(1, "Name is required").max(100),
  apiKey: z.string().min(1, "API key is required"),
  isOrgWide: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const userCredentialProviderEnum = z.enum([
  "openai",
  "huggingface",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "replicate",
]);

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Membership = typeof memberships.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertEntitlement = z.infer<typeof insertEntitlementSchema>;
export type Entitlement = typeof entitlements.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;
export type InsertApplicationService = z.infer<typeof insertApplicationServiceSchema>;
export type ApplicationService = typeof applicationServices.$inferSelect;
export type InsertEntitlementTranche = z.infer<typeof insertEntitlementTrancheSchema>;
export type EntitlementTranche = typeof entitlementTranches.$inferSelect;
export type InsertScopedEntitlement = z.infer<typeof insertScopedEntitlementSchema>;
export type ScopedEntitlement = typeof scopedEntitlements.$inferSelect;
export type ScopeType = z.infer<typeof scopeTypeEnum>;
export type InsertUserEntitlement = z.infer<typeof insertUserEntitlementSchema>;
export type UserEntitlement = typeof userEntitlements.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertUserCredential = z.infer<typeof insertUserCredentialSchema>;
export type UserCredential = typeof userCredentials.$inferSelect;

// Extended types with relations
export type MembershipWithUser = Membership & { user: User };
export type MembershipWithOrg = Membership & { organization: Organization };
export type OrganizationWithPlan = Organization & { plan: Plan | null };
export type ProjectWithApps = Project & { applications: Application[]; services: Service[] };
export type ApplicationWithServices = Application & { serviceLinks: (ApplicationService & { service: Service })[] };
