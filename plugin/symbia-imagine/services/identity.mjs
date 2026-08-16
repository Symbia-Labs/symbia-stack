var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../identity/server/src/service.ts
import bcrypt2 from "bcryptjs";

// ../../identity/server/src/db.ts
import { initializeDatabase, setSessionContext, clearSessionContext, splitSqlStatements } from "@symbia/db";

// ../../identity/shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  agentLoginSchema: () => agentLoginSchema,
  agentRegisterSchema: () => agentRegisterSchema,
  agents: () => agents,
  agentsRelations: () => agentsRelations,
  apiKeys: () => apiKeys,
  apiKeysRelations: () => apiKeysRelations,
  applicationServices: () => applicationServices,
  applicationServicesRelations: () => applicationServicesRelations,
  applications: () => applications,
  applicationsRelations: () => applicationsRelations,
  auditLogs: () => auditLogs,
  auditLogsRelations: () => auditLogsRelations,
  bindEntitySchema: () => bindEntitySchema,
  createApiKeySchema: () => createApiKeySchema,
  createApplicationSchema: () => createApplicationSchema,
  createEntitySchema: () => createEntitySchema,
  createOrgSchema: () => createOrgSchema,
  createProjectSchema: () => createProjectSchema,
  createScopedEntitlementSchema: () => createScopedEntitlementSchema,
  createServiceSchema: () => createServiceSchema,
  createUserCredentialSchema: () => createUserCredentialSchema,
  entities: () => entities,
  entitiesRelations: () => entitiesRelations,
  entitlementTranches: () => entitlementTranches,
  entitlementTranchesRelations: () => entitlementTranchesRelations,
  entitlements: () => entitlements,
  entitlementsRelations: () => entitlementsRelations,
  entityAliases: () => entityAliases,
  entityAliasesRelations: () => entityAliasesRelations,
  entityInstances: () => entityInstances,
  entityInstancesRelations: () => entityInstancesRelations,
  entityStatusEnum: () => entityStatusEnum,
  entityTypeEnum: () => entityTypeEnum,
  forgotPasswordSchema: () => forgotPasswordSchema,
  insertAgentSchema: () => insertAgentSchema,
  insertApiKeySchema: () => insertApiKeySchema,
  insertApplicationSchema: () => insertApplicationSchema,
  insertApplicationServiceSchema: () => insertApplicationServiceSchema,
  insertAuditLogSchema: () => insertAuditLogSchema,
  insertEntitlementSchema: () => insertEntitlementSchema,
  insertEntitlementTrancheSchema: () => insertEntitlementTrancheSchema,
  insertEntityAliasSchema: () => insertEntityAliasSchema,
  insertEntityInstanceSchema: () => insertEntityInstanceSchema,
  insertEntitySchema: () => insertEntitySchema,
  insertMembershipSchema: () => insertMembershipSchema,
  insertOrganizationSchema: () => insertOrganizationSchema,
  insertPlanSchema: () => insertPlanSchema,
  insertProjectSchema: () => insertProjectSchema,
  insertScopedEntitlementSchema: () => insertScopedEntitlementSchema,
  insertServiceSchema: () => insertServiceSchema,
  insertSessionSchema: () => insertSessionSchema,
  insertUserCredentialSchema: () => insertUserCredentialSchema,
  insertUserEntitlementSchema: () => insertUserEntitlementSchema,
  insertUserRoleSchema: () => insertUserRoleSchema,
  insertUserSchema: () => insertUserSchema,
  inviteMemberSchema: () => inviteMemberSchema,
  loginSchema: () => loginSchema,
  memberships: () => memberships,
  membershipsRelations: () => membershipsRelations,
  organizations: () => organizations,
  organizationsRelations: () => organizationsRelations,
  passwordResetTokens: () => passwordResetTokens,
  passwordResetTokensRelations: () => passwordResetTokensRelations,
  plans: () => plans,
  plansRelations: () => plansRelations,
  projects: () => projects,
  projectsRelations: () => projectsRelations,
  registerSchema: () => registerSchema,
  resetPasswordSchema: () => resetPasswordSchema,
  resolveEntitySchema: () => resolveEntitySchema,
  scopeTypeEnum: () => scopeTypeEnum,
  scopedEntitlements: () => scopedEntitlements,
  scopedEntitlementsRelations: () => scopedEntitlementsRelations,
  services: () => services,
  servicesRelations: () => servicesRelations,
  sessions: () => sessions,
  sessionsRelations: () => sessionsRelations,
  unbindEntitySchema: () => unbindEntitySchema,
  userCredentialProviderEnum: () => userCredentialProviderEnum,
  userCredentials: () => userCredentials,
  userCredentialsRelations: () => userCredentialsRelations,
  userEntitlements: () => userEntitlements,
  userEntitlementsRelations: () => userEntitlementsRelations,
  userRoles: () => userRoles,
  userRolesRelations: () => userRolesRelations,
  users: () => users,
  usersRelations: () => usersRelations
});
import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  emailIdx: uniqueIndex("idx_users_email").on(table.email)
}));
var usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions)
}));
var organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  planId: varchar("plan_id").references(() => plans.id),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var organizationsRelations = relations(organizations, ({ one, many }) => ({
  plan: one(plans, {
    fields: [organizations.planId],
    references: [plans.id]
  }),
  memberships: many(memberships),
  entitlements: many(entitlements)
}));
var memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  // admin, member, viewer
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userIdx: index("idx_memberships_user_id").on(table.userId),
  orgIdx: index("idx_memberships_org_id").on(table.orgId),
  orgUserIdx: uniqueIndex("idx_memberships_org_user").on(table.orgId, table.userId)
}));
var membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [memberships.orgId],
    references: [organizations.id]
  })
}));
var plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  featuresJson: json("features_json").$type().default([]),
  limitsJson: json("limits_json").$type().default({}),
  priceCents: integer("price_cents").notNull().default(0)
});
var plansRelations = relations(plans, ({ many }) => ({
  organizations: many(organizations)
}));
var entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at")
});
var entitlementsRelations = relations(entitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [entitlements.orgId],
    references: [organizations.id]
  })
}));
var sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userIdx: index("idx_sessions_user_id").on(table.userId),
  expiresIdx: index("idx_sessions_expires").on(table.expiresAt)
}));
var sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));
var passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id]
  })
}));
var projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  // active, archived, suspended
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_projects_org_id").on(table.orgId),
  orgSlugIdx: uniqueIndex("idx_projects_org_slug").on(table.orgId, table.slug)
}));
var projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id]
  }),
  applications: many(applications),
  services: many(services)
}));
var applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  environment: text("environment").notNull().default("development"),
  // development, staging, production
  appType: text("app_type").notNull().default("web"),
  // web, mobile, api, cli
  repoUrl: text("repo_url"),
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_applications_org_id").on(table.orgId),
  projectIdx: index("idx_applications_project_id").on(table.projectId)
}));
var applicationsRelations = relations(applications, ({ one, many }) => ({
  project: one(projects, {
    fields: [applications.projectId],
    references: [projects.id]
  }),
  organization: one(organizations, {
    fields: [applications.orgId],
    references: [organizations.id]
  }),
  serviceLinks: many(applicationServices)
}));
var services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(),
  // database, api, auth, storage, messaging, analytics
  provider: text("provider"),
  // aws, gcp, stripe, twilio, etc.
  endpointUrl: text("endpoint_url"),
  externalId: text("external_id"),
  // External service identifier
  status: text("status").notNull().default("active"),
  // active, inactive, error
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_services_org_id").on(table.orgId),
  projectIdx: index("idx_services_project_id").on(table.projectId)
}));
var servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id]
  }),
  organization: one(organizations, {
    fields: [services.orgId],
    references: [organizations.id]
  }),
  applicationLinks: many(applicationServices)
}));
var applicationServices = pgTable("application_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var applicationServicesRelations = relations(applicationServices, ({ one }) => ({
  application: one(applications, {
    fields: [applicationServices.applicationId],
    references: [applications.id]
  }),
  service: one(services, {
    fields: [applicationServices.serviceId],
    references: [services.id]
  })
}));
var entitlementTranches = pgTable("entitlement_tranches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").references(() => plans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trancheKey: text("tranche_key").notNull(),
  // e.g., "api_calls", "storage_gb", "users"
  description: text("description"),
  defaultQuota: integer("default_quota").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var entitlementTranchesRelations = relations(entitlementTranches, ({ one }) => ({
  plan: one(plans, {
    fields: [entitlementTranches.planId],
    references: [plans.id]
  })
}));
var scopedEntitlements = pgTable("scoped_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull(),
  // org, project, application, service
  scopeId: varchar("scope_id").notNull(),
  // ID of the scoped entity
  trancheId: varchar("tranche_id").references(() => entitlementTranches.id),
  featureKey: text("feature_key").notNull(),
  quota: integer("quota").default(0),
  consumed: integer("consumed").default(0),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var scopedEntitlementsRelations = relations(scopedEntitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [scopedEntitlements.orgId],
    references: [organizations.id]
  }),
  tranche: one(entitlementTranches, {
    fields: [scopedEntitlements.trancheId],
    references: [entitlementTranches.id]
  })
}));
var userEntitlements = pgTable("user_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entitlementKey: text("entitlement_key").notNull(),
  // e.g., "cap:registry.write", "cap:registry.publish"
  grantedBy: varchar("granted_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userEntitlementsRelations = relations(userEntitlements, ({ one }) => ({
  user: one(users, {
    fields: [userEntitlements.userId],
    references: [users.id]
  }),
  granter: one(users, {
    fields: [userEntitlements.grantedBy],
    references: [users.id]
  })
}));
var userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleKey: text("role_key").notNull(),
  // e.g., "role:admin", "role:publisher", "role:reviewer"
  grantedBy: varchar("granted_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id]
  }),
  granter: one(users, {
    fields: [userRoles.grantedBy],
    references: [users.id]
  })
}));
var apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  // First 8 chars for identification
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  scopes: json("scopes").$type().default([]),
  // e.g., ["read:resources", "write:resources"]
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_api_keys_org_id").on(table.orgId),
  createdByIdx: index("idx_api_keys_created_by").on(table.createdBy)
}));
var apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id]
  }),
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id]
  })
}));
var agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull().unique(),
  // Unique identifier like "assistant:onboarding" or "agent:my-bot"
  credentialHash: text("credential_hash").notNull(),
  // bcrypt hash of credential (parallel to passwordHash)
  name: text("name").notNull(),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  capabilities: json("capabilities").$type().default([]),
  // e.g., ["cap:messaging.send", "cap:messaging.receive"]
  metadata: json("metadata").$type().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  agentIdIdx: uniqueIndex("idx_agents_agent_id").on(table.agentId),
  orgIdx: index("idx_agents_org_id").on(table.orgId)
}));
var agentsRelations = relations(agents, ({ one }) => ({
  organization: one(organizations, {
    fields: [agents.orgId],
    references: [organizations.id]
  })
}));
var entityTypeEnum = z.enum([
  "user",
  "assistant",
  "service",
  "integration",
  "sandbox"
]);
var entityStatusEnum = z.enum([
  "active",
  "inactive",
  "suspended"
]);
var entities = pgTable("entities", {
  // UUID primary key with ent_ prefix convention
  id: varchar("id").primaryKey().default(sql`'ent_' || gen_random_uuid()`),
  // Entity type
  type: text("type").notNull(),
  // user, assistant, service, integration, sandbox
  // Human-readable addressing
  slug: text("slug").notNull(),
  // e.g., "log-analyst", "brian", "messaging"
  displayName: text("display_name").notNull(),
  // e.g., "Log Analyst", "Brian"
  // Multi-instance support
  instanceId: text("instance_id"),
  // e.g., "prod-1", "us-west-1"
  instanceIndex: integer("instance_index").default(1),
  // 1, 2, 3 for ordered instances
  // Org/Network scoping
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  networkId: text("network_id"),
  // For federation: "acme.symbia.io"
  // Resolution hints
  capabilities: json("capabilities").$type().default([]),
  tags: json("tags").$type().default([]),
  // Lifecycle
  status: text("status").notNull().default("active"),
  // active, inactive, suspended
  // Network binding (ephemeral - current connection)
  boundNodeId: text("bound_node_id"),
  // Current network node ID (null if disconnected)
  boundAt: timestamp("bound_at"),
  // When bound to current node
  // Source reference (links to original user/agent record)
  sourceTable: text("source_table"),
  // 'users' or 'agents'
  sourceId: varchar("source_id"),
  // ID in the source table
  // Metadata
  metadata: json("metadata").$type().default({}),
  // Timestamps
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
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
  statusIdx: index("idx_entities_status").on(table.status)
}));
var entitiesRelations = relations(entities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [entities.orgId],
    references: [organizations.id]
  }),
  aliases: many(entityAliases)
}));
var entityAliases = pgTable("entity_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  // Alias format
  aliasType: text("alias_type").notNull(),
  // 'slug', 'qualified', 'legacy', 'federated'
  aliasValue: text("alias_value").notNull(),
  // The actual alias string
  // Scoping (for ambiguity resolution)
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  // Priority for resolution (higher = preferred)
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  // Unique constraint on alias value within org
  aliasOrgIdx: uniqueIndex("idx_entity_aliases_value_org").on(table.aliasValue, table.orgId),
  // Index for entity lookups
  entityIdx: index("idx_entity_aliases_entity").on(table.entityId),
  // Index for alias resolution
  aliasValueIdx: index("idx_entity_aliases_value").on(table.aliasValue)
}));
var entityAliasesRelations = relations(entityAliases, ({ one }) => ({
  entity: one(entities, {
    fields: [entityAliases.entityId],
    references: [entities.id]
  }),
  organization: one(organizations, {
    fields: [entityAliases.orgId],
    references: [organizations.id]
  })
}));
var entityInstances = pgTable("entity_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  // Instance identification
  instanceId: text("instance_id").notNull(),
  // e.g., "prod-1", "us-west-1"
  instanceIndex: integer("instance_index").notNull(),
  // 1, 2, 3...
  // Runtime state
  nodeId: text("node_id"),
  // Current network node (if connected)
  status: text("status").notNull().default("available"),
  // available, busy, offline
  lastHeartbeat: timestamp("last_heartbeat"),
  // Load balancing metadata
  loadScore: integer("load_score").default(0),
  // Higher = more loaded
  metadata: json("metadata").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  entityInstanceIdx: uniqueIndex("idx_entity_instances_entity_instance").on(
    table.entityId,
    table.instanceId
  ),
  entityIdx: index("idx_entity_instances_entity").on(table.entityId),
  statusIdx: index("idx_entity_instances_status").on(table.status)
}));
var entityInstancesRelations = relations(entityInstances, ({ one }) => ({
  entity: one(entities, {
    fields: [entityInstances.entityId],
    references: [entities.id]
  })
}));
var insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  registeredAt: true
});
var insertEntityAliasSchema = createInsertSchema(entityAliases).omit({
  id: true,
  createdAt: true
});
var insertEntityInstanceSchema = createInsertSchema(entityInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var createEntitySchema = z.object({
  type: entityTypeEnum,
  slug: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Slug must be lowercase alphanumeric with dashes or underscores"),
  displayName: z.string().min(1),
  instanceId: z.string().optional(),
  orgId: z.string().optional(),
  networkId: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sourceTable: z.enum(["users", "agents"]).optional(),
  sourceId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});
var resolveEntitySchema = z.object({
  address: z.string().min(1),
  // @slug, slug#instance, qualified:address, ent_uuid
  orgId: z.string().optional()
  // Context for ambiguous resolution
});
var bindEntitySchema = z.object({
  entityId: z.string().min(1),
  nodeId: z.string().min(1)
});
var unbindEntitySchema = z.object({
  entityId: z.string().min(1)
});
var userCredentials = pgTable("user_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  // e.g., "openai", "huggingface", "anthropic", "replit"
  name: text("name").notNull(),
  // User-friendly name like "My OpenAI Key"
  credentialEncrypted: text("credential_encrypted").notNull(),
  // Encrypted API key or access token
  credentialPrefix: text("credential_prefix"),
  // First 8 chars for identification (e.g., "sk-proj-...")
  isOrgWide: boolean("is_org_wide").notNull().default(false),
  // Shared across org members
  metadata: json("metadata").$type().default({}),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // OAuth-specific fields
  credentialType: text("credential_type").default("api_key"),
  // 'api_key' | 'oauth_token'
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  // Encrypted OAuth refresh token
  expiresAt: timestamp("expires_at"),
  // Token expiration time
  oauthUserId: varchar("oauth_user_id", { length: 255 }),
  // External user ID from OAuth provider
  oauthUserEmail: text("oauth_user_email"),
  // External email from OAuth provider
  oauthUserName: text("oauth_user_name")
  // External name from OAuth provider
}, (table) => ({
  userIdx: index("idx_user_credentials_user_id").on(table.userId),
  orgIdx: index("idx_user_credentials_org_id").on(table.orgId),
  providerIdx: index("idx_user_credentials_provider").on(table.provider),
  userProviderIdx: index("idx_user_credentials_user_provider").on(table.userId, table.provider),
  credentialTypeIdx: index("idx_user_credentials_type").on(table.credentialType)
}));
var userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [userCredentials.orgId],
    references: [organizations.id]
  })
}));
var auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  orgId: varchar("org_id").references(() => organizations.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: varchar("resource_id"),
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgCreatedIdx: index("idx_audit_logs_org_created").on(table.orgId, table.createdAt),
  userCreatedIdx: index("idx_audit_logs_user_created").on(table.userId, table.createdAt),
  resourceIdx: index("idx_audit_logs_resource").on(table.resource, table.resourceId)
}));
var auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [auditLogs.orgId],
    references: [organizations.id]
  })
}));
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true
});
var insertMembershipSchema = createInsertSchema(memberships).omit({
  id: true,
  createdAt: true
});
var insertPlanSchema = createInsertSchema(plans).omit({
  id: true
});
var insertEntitlementSchema = createInsertSchema(entitlements).omit({
  id: true
});
var insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true
});
var insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true
});
var insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true
});
var insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true
});
var insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true
});
var insertApplicationServiceSchema = createInsertSchema(applicationServices).omit({
  id: true,
  createdAt: true
});
var insertEntitlementTrancheSchema = createInsertSchema(entitlementTranches).omit({
  id: true,
  createdAt: true
});
var insertScopedEntitlementSchema = createInsertSchema(scopedEntitlements).omit({
  id: true,
  createdAt: true
});
var insertUserEntitlementSchema = createInsertSchema(userEntitlements).omit({
  id: true,
  createdAt: true
});
var insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true
});
var insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true
});
var insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertUserCredentialSchema = createInsertSchema(userCredentials).omit({
  id: true,
  createdAt: true
});
var registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  orgName: z.string().min(1, "Organization name is required").optional()
});
var loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required")
});
var forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address")
});
var resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters")
});
var createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes")
});
var inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "viewer"])
});
var createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: z.string().optional()
});
var createApplicationSchema = z.object({
  name: z.string().min(1, "Application name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  appType: z.enum(["web", "mobile", "api", "cli"]).default("web"),
  repoUrl: z.string().url().optional().or(z.literal(""))
});
var createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  serviceType: z.enum(["database", "api", "auth", "storage", "messaging", "analytics"]),
  provider: z.string().optional(),
  endpointUrl: z.string().url().optional().or(z.literal("")),
  externalId: z.string().optional()
});
var scopeTypeEnum = z.enum(["org", "project", "application", "service"]);
var createScopedEntitlementSchema = z.object({
  scopeType: scopeTypeEnum,
  scopeId: z.string().min(1),
  featureKey: z.string().min(1, "Feature key is required"),
  quota: z.number().int().min(0).optional(),
  enabled: z.boolean().default(true),
  expiresAt: z.string().datetime().optional()
});
var createApiKeySchema = z.object({
  name: z.string().min(1, "API key name is required").max(100),
  orgId: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional()
});
var agentRegisterSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required").regex(/^[a-z0-9:_-]+$/, "Agent ID must be lowercase alphanumeric with colons, underscores, or dashes"),
  credential: z.string().min(32, "Credential must be at least 32 characters"),
  name: z.string().min(1, "Name is required"),
  orgId: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});
var agentLoginSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
  credential: z.string().min(1, "Credential is required")
});
var createUserCredentialSchema = z.object({
  provider: z.string().min(1, "Provider is required"),
  name: z.string().min(1, "Name is required").max(100),
  apiKey: z.string().min(1, "API key is required"),
  isOrgWide: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
});
var userCredentialProviderEnum = z.enum([
  "openai",
  "huggingface",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "replicate"
]);

// ../../identity/server/src/memory-schema.ts
var MEMORY_SCHEMA_SQL = `
CREATE TABLE "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "is_super_admin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "plans" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL UNIQUE,
  "features_json" json DEFAULT '[]'::json,
  "limits_json" json DEFAULT '{}'::json,
  "price_cents" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "organizations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "plan_id" varchar REFERENCES "plans"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "memberships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "feature_key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp
);

CREATE TABLE "sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "password_reset_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "projects" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "applications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'development',
  "app_type" text NOT NULL DEFAULT 'web',
  "repo_url" text,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "service_type" text NOT NULL,
  "provider" text,
  "endpoint_url" text,
  "external_id" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "application_services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" varchar NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "service_id" varchar NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "entitlement_tranches" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" varchar REFERENCES "plans"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "tranche_key" text NOT NULL,
  "description" text,
  "default_quota" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "scoped_entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "scope_type" text NOT NULL,
  "scope_id" varchar NOT NULL,
  "tranche_id" varchar REFERENCES "entitlement_tranches"("id"),
  "feature_key" text NOT NULL,
  "quota" integer DEFAULT 0,
  "consumed" integer DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entitlement_key" text NOT NULL,
  "granted_by" varchar REFERENCES "users"("id"),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_roles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_key" text NOT NULL,
  "granted_by" varchar REFERENCES "users"("id"),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "api_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "scopes" json DEFAULT '[]'::json,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar REFERENCES "users"("id"),
  "org_id" varchar REFERENCES "organizations"("id"),
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "resource_id" varchar,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "agents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL UNIQUE,
  "credential_hash" text NOT NULL,
  "name" text NOT NULL,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "capabilities" json DEFAULT '[]'::json,
  "metadata" json DEFAULT '{}'::json,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_credentials" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "name" text NOT NULL,
  "credential_encrypted" text NOT NULL,
  "credential_prefix" text,
  "is_org_wide" boolean NOT NULL DEFAULT false,
  "metadata" json DEFAULT '{}'::json,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,

  -- OAuth fields. shared/schema.ts:615-620 is the schema of record and has
  -- declared these since the OAuth work landed; this CREATE TABLE, which is
  -- what actually builds the table, stopped at created_at. A fresh install
  -- therefore built a table the code already believed had six more columns.
  "credential_type" text DEFAULT 'api_key',
  "refresh_token_encrypted" text,
  "expires_at" timestamp,
  "oauth_user_id" varchar(255),
  "oauth_user_email" text,
  "oauth_user_name" text
);

-- Indexes for users table
CREATE UNIQUE INDEX idx_users_email ON "users"("email");

-- Indexes for memberships table
CREATE INDEX idx_memberships_user_id ON "memberships"("user_id");
CREATE INDEX idx_memberships_org_id ON "memberships"("org_id");
CREATE UNIQUE INDEX idx_memberships_org_user ON "memberships"("org_id", "user_id");

-- Indexes for sessions table
CREATE INDEX idx_sessions_user_id ON "sessions"("user_id");
CREATE INDEX idx_sessions_expires ON "sessions"("expires_at");

-- Indexes for projects table
CREATE INDEX idx_projects_org_id ON "projects"("org_id");
CREATE UNIQUE INDEX idx_projects_org_slug ON "projects"("org_id", "slug");

-- Indexes for applications table
CREATE INDEX idx_applications_org_id ON "applications"("org_id");
CREATE INDEX idx_applications_project_id ON "applications"("project_id");

-- Indexes for services table
CREATE INDEX idx_services_org_id ON "services"("org_id");
CREATE INDEX idx_services_project_id ON "services"("project_id");

-- Indexes for api_keys table
CREATE INDEX idx_api_keys_org_id ON "api_keys"("org_id");
CREATE INDEX idx_api_keys_created_by ON "api_keys"("created_by");

-- Indexes for audit_logs table
CREATE INDEX idx_audit_logs_org_created ON "audit_logs"("org_id", "created_at");
CREATE INDEX idx_audit_logs_user_created ON "audit_logs"("user_id", "created_at");
CREATE INDEX idx_audit_logs_resource ON "audit_logs"("resource", "resource_id");

-- Indexes for agents table
CREATE UNIQUE INDEX idx_agents_agent_id ON "agents"("agent_id");
CREATE INDEX idx_agents_org_id ON "agents"("org_id");

-- Indexes for user_credentials table
CREATE INDEX idx_user_credentials_user_id ON "user_credentials"("user_id");
CREATE INDEX idx_user_credentials_org_id ON "user_credentials"("org_id");
CREATE INDEX idx_user_credentials_provider ON "user_credentials"("provider");
CREATE INDEX idx_user_credentials_user_provider ON "user_credentials"("user_id", "provider");
`;

// ../../identity/server/src/db.ts
var database = initializeDatabase({
  serviceId: "identity-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "IDENTITY_USE_MEMORY_DB"
}, schema_exports);
var { db, isMemory, exportToFile, close } = database;
var pool = database.pool;

// ../../identity/server/src/service.ts
import { DEFAULT_USER_IDS, DEFAULT_ORG_IDS as DEFAULT_ORG_IDS2 } from "@symbia/seed";

// ../../identity/server/src/system-bootstrap.ts
import crypto from "crypto";

// ../../identity/server/src/storage.ts
import { eq, and, or, like, inArray, isNull } from "drizzle-orm";
var DatabaseStorage = class {
  // Users
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || void 0;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return user || void 0;
  }
  async getAllUsers() {
    return db.select().from(users);
  }
  async deleteUser(id) {
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
    await db.delete(apiKeys).where(eq(apiKeys.createdBy, id));
    await db.delete(users).where(eq(users.id, id));
  }
  // Organizations
  async getOrganization(id) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org || void 0;
  }
  async getOrganizationBySlug(slug) {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return org || void 0;
  }
  async getAllOrganizations() {
    return db.select().from(organizations);
  }
  async createOrganization(insertOrg) {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }
  async createOrganizationWithId(insertOrg) {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }
  async updateOrganization(id, data) {
    const [org] = await db.update(organizations).set(data).where(eq(organizations.id, id)).returning();
    return org || void 0;
  }
  async deleteOrganization(id) {
    await db.update(auditLogs).set({ orgId: null }).where(eq(auditLogs.orgId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  // Memberships
  async getMembership(id) {
    const [membership] = await db.select().from(memberships).where(eq(memberships.id, id));
    return membership || void 0;
  }
  async getMembershipByUserAndOrg(userId, orgId) {
    const [membership] = await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
    return membership || void 0;
  }
  async getMembershipsByUser(userId) {
    return db.select().from(memberships).where(eq(memberships.userId, userId));
  }
  async getMembershipsByOrg(orgId) {
    const result = await db.select({
      id: memberships.id,
      userId: memberships.userId,
      orgId: memberships.orgId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      user: users
    }).from(memberships).leftJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.orgId, orgId));
    return result.filter((r) => r.user !== null);
  }
  async createMembership(insertMembership) {
    const [membership] = await db.insert(memberships).values(insertMembership).returning();
    return membership;
  }
  async updateMembership(id, data) {
    const [membership] = await db.update(memberships).set(data).where(eq(memberships.id, id)).returning();
    return membership || void 0;
  }
  async deleteMembership(id) {
    await db.delete(memberships).where(eq(memberships.id, id));
  }
  // Plans
  async getPlan(id) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan || void 0;
  }
  async getPlanByName(name) {
    const [plan] = await db.select().from(plans).where(eq(plans.name, name));
    return plan || void 0;
  }
  async getAllPlans() {
    return db.select().from(plans);
  }
  async createPlan(insertPlan) {
    const normalizedPlan = {
      ...insertPlan,
      featuresJson: insertPlan.featuresJson ? [...insertPlan.featuresJson] : [],
      limitsJson: insertPlan.limitsJson ? { ...insertPlan.limitsJson } : {}
    };
    const [plan] = await db.insert(plans).values(normalizedPlan).returning();
    return plan;
  }
  async updatePlan(id, data) {
    const normalized = {
      ...data,
      featuresJson: data.featuresJson ? [...data.featuresJson] : data.featuresJson,
      limitsJson: data.limitsJson ? { ...data.limitsJson } : data.limitsJson
    };
    const [plan] = await db.update(plans).set(normalized).where(eq(plans.id, id)).returning();
    return plan || void 0;
  }
  // Entitlements
  async getEntitlementsByOrg(orgId) {
    return db.select().from(entitlements).where(eq(entitlements.orgId, orgId));
  }
  async createEntitlement(insertEntitlement) {
    const [entitlement] = await db.insert(entitlements).values(insertEntitlement).returning();
    return entitlement;
  }
  async updateEntitlement(id, data) {
    const [entitlement] = await db.update(entitlements).set(data).where(eq(entitlements.id, id)).returning();
    return entitlement || void 0;
  }
  // Sessions
  async getSession(id) {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || void 0;
  }
  async getSessionByTokenHash(tokenHash) {
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return session || void 0;
  }
  async createSession(insertSession) {
    const [session] = await db.insert(sessions).values(insertSession).returning();
    return session;
  }
  async deleteSession(id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  async deleteSessionsByUser(userId) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
  // Audit Logs
  async createAuditLog(insertLog) {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }
  async getAuditLogsByOrg(orgId) {
    return db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
  }
  async getAllAuditLogs() {
    return db.select().from(auditLogs);
  }
  // Projects
  async getProject(id) {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || void 0;
  }
  async getProjectsByOrg(orgId) {
    return db.select().from(projects).where(eq(projects.orgId, orgId));
  }
  async createProject(insertProject) {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }
  async updateProject(id, data) {
    const [project] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return project || void 0;
  }
  async deleteProject(id) {
    await db.delete(projects).where(eq(projects.id, id));
  }
  // Applications
  async getApplication(id) {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    return app || void 0;
  }
  async getApplicationsByProject(projectId) {
    return db.select().from(applications).where(eq(applications.projectId, projectId));
  }
  async getApplicationsByOrg(orgId) {
    return db.select().from(applications).where(eq(applications.orgId, orgId));
  }
  async createApplication(insertApp) {
    const [app] = await db.insert(applications).values(insertApp).returning();
    return app;
  }
  async updateApplication(id, data) {
    const [app] = await db.update(applications).set(data).where(eq(applications.id, id)).returning();
    return app || void 0;
  }
  async deleteApplication(id) {
    await db.delete(applications).where(eq(applications.id, id));
  }
  // Services
  async getService(id) {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service || void 0;
  }
  async getServicesByProject(projectId) {
    return db.select().from(services).where(eq(services.projectId, projectId));
  }
  async getServicesByOrg(orgId) {
    return db.select().from(services).where(eq(services.orgId, orgId));
  }
  async createService(insertService) {
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }
  async updateService(id, data) {
    const [service] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    return service || void 0;
  }
  async deleteService(id) {
    await db.delete(services).where(eq(services.id, id));
  }
  // Application-Service Links
  async linkApplicationService(appId, serviceId) {
    const [link] = await db.insert(applicationServices).values({
      applicationId: appId,
      serviceId
    }).returning();
    return link;
  }
  async unlinkApplicationService(appId, serviceId) {
    await db.delete(applicationServices).where(
      and(eq(applicationServices.applicationId, appId), eq(applicationServices.serviceId, serviceId))
    );
  }
  async getServicesByApplication(appId) {
    const links = await db.select({ serviceId: applicationServices.serviceId }).from(applicationServices).where(eq(applicationServices.applicationId, appId));
    if (links.length === 0) return [];
    const serviceIds = links.map((l) => l.serviceId);
    const result = [];
    for (const serviceId of serviceIds) {
      const [service] = await db.select().from(services).where(eq(services.id, serviceId));
      if (service) result.push(service);
    }
    return result;
  }
  // Entitlement Tranches
  async getEntitlementTranche(id) {
    const [tranche] = await db.select().from(entitlementTranches).where(eq(entitlementTranches.id, id));
    return tranche || void 0;
  }
  async getEntitlementTranchesByPlan(planId) {
    return db.select().from(entitlementTranches).where(eq(entitlementTranches.planId, planId));
  }
  async createEntitlementTranche(insertTranche) {
    const [tranche] = await db.insert(entitlementTranches).values(insertTranche).returning();
    return tranche;
  }
  // Scoped Entitlements
  async getScopedEntitlement(id) {
    const [entitlement] = await db.select().from(scopedEntitlements).where(eq(scopedEntitlements.id, id));
    return entitlement || void 0;
  }
  async getScopedEntitlementsByScope(scopeType, scopeId) {
    return db.select().from(scopedEntitlements).where(
      and(eq(scopedEntitlements.scopeType, scopeType), eq(scopedEntitlements.scopeId, scopeId))
    );
  }
  async getScopedEntitlementsByOrg(orgId) {
    return db.select().from(scopedEntitlements).where(eq(scopedEntitlements.orgId, orgId));
  }
  async createScopedEntitlement(insertEntitlement) {
    const [entitlement] = await db.insert(scopedEntitlements).values(insertEntitlement).returning();
    return entitlement;
  }
  async updateScopedEntitlement(id, data) {
    const [entitlement] = await db.update(scopedEntitlements).set(data).where(eq(scopedEntitlements.id, id)).returning();
    return entitlement || void 0;
  }
  async deleteScopedEntitlement(id) {
    await db.delete(scopedEntitlements).where(eq(scopedEntitlements.id, id));
  }
  // Password Reset Tokens
  async createPasswordResetToken(insertToken) {
    const [token] = await db.insert(passwordResetTokens).values(insertToken).returning();
    return token;
  }
  async getPasswordResetToken(token) {
    const [result] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return result || void 0;
  }
  async markPasswordResetTokenUsed(token) {
    await db.update(passwordResetTokens).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq(passwordResetTokens.token, token));
  }
  // User Entitlements
  async getUserEntitlements(userId) {
    return db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId));
  }
  async getUserEntitlementKeys(userId) {
    const result = await db.select({ key: userEntitlements.entitlementKey }).from(userEntitlements).where(eq(userEntitlements.userId, userId));
    return result.map((r) => r.key);
  }
  async createUserEntitlement(entitlement) {
    const [result] = await db.insert(userEntitlements).values(entitlement).returning();
    return result;
  }
  async deleteUserEntitlement(id) {
    await db.delete(userEntitlements).where(eq(userEntitlements.id, id));
  }
  async deleteUserEntitlementByKey(userId, entitlementKey) {
    await db.delete(userEntitlements).where(
      and(eq(userEntitlements.userId, userId), eq(userEntitlements.entitlementKey, entitlementKey))
    );
  }
  // User Roles
  async getUserRoles(userId) {
    return db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }
  async getUserRoleKeys(userId) {
    const result = await db.select({ key: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId));
    return result.map((r) => r.key);
  }
  async createUserRole(role) {
    const [result] = await db.insert(userRoles).values(role).returning();
    return result;
  }
  async deleteUserRole(id) {
    await db.delete(userRoles).where(eq(userRoles.id, id));
  }
  async deleteUserRoleByKey(userId, roleKey) {
    await db.delete(userRoles).where(
      and(eq(userRoles.userId, userId), eq(userRoles.roleKey, roleKey))
    );
  }
  // Enriched user data for external services (Object Service integration)
  async getEnrichedUser(userId) {
    const user = await this.getUser(userId);
    if (!user) return void 0;
    const userMemberships = await db.select({
      orgId: memberships.orgId,
      role: memberships.role,
      orgName: organizations.name,
      orgSlug: organizations.slug
    }).from(memberships).innerJoin(organizations, eq(memberships.orgId, organizations.id)).where(eq(memberships.userId, userId));
    const entitlementKeys = await this.getUserEntitlementKeys(userId);
    const roleKeys = await this.getUserRoleKeys(userId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      organizations: userMemberships.map((m) => ({
        id: m.orgId,
        name: m.orgName,
        slug: m.orgSlug,
        role: m.role
      })),
      entitlements: entitlementKeys,
      roles: roleKeys
    };
  }
  // API Keys
  async createApiKey(insertApiKey) {
    const normalizedApiKey = {
      ...insertApiKey,
      scopes: insertApiKey.scopes ? [...insertApiKey.scopes] : []
    };
    const [apiKey] = await db.insert(apiKeys).values(normalizedApiKey).returning();
    return apiKey;
  }
  async getApiKey(id) {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey || void 0;
  }
  async getApiKeyByHash(keyHash) {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return apiKey || void 0;
  }
  async getApiKeysByUser(userId) {
    return db.select().from(apiKeys).where(eq(apiKeys.createdBy, userId));
  }
  async getApiKeysByOrg(orgId) {
    return db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId));
  }
  async updateApiKeyLastUsed(id) {
    await db.update(apiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id));
  }
  async revokeApiKey(id) {
    await db.update(apiKeys).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id));
  }
  async deleteApiKey(id) {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }
  // Agents (parallel to Users)
  async getAgent(id) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent || void 0;
  }
  async getAgentByAgentId(agentId) {
    const [agent] = await db.select().from(agents).where(eq(agents.agentId, agentId));
    return agent || void 0;
  }
  async getAgentsByOrg(orgId) {
    return db.select().from(agents).where(eq(agents.orgId, orgId));
  }
  async getAllAgents() {
    return db.select().from(agents);
  }
  async createAgent(insertAgent) {
    const [agent] = await db.insert(agents).values(insertAgent).returning();
    return agent;
  }
  async updateAgent(id, data) {
    const [agent] = await db.update(agents).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(agents.id, id)).returning();
    return agent || void 0;
  }
  async updateAgentLastSeen(id) {
    await db.update(agents).set({ lastSeenAt: /* @__PURE__ */ new Date() }).where(eq(agents.id, id));
  }
  async deleteAgent(id) {
    await db.delete(agents).where(eq(agents.id, id));
  }
  // User Credentials (third-party API keys)
  async getUserCredential(id) {
    const [credential] = await db.select().from(userCredentials).where(eq(userCredentials.id, id));
    return credential || void 0;
  }
  async getUserCredentialsByUser(userId) {
    return db.select().from(userCredentials).where(eq(userCredentials.userId, userId));
  }
  async getUserCredentialsByUserAndProvider(userId, provider) {
    const [credential] = await db.select().from(userCredentials).where(
      and(eq(userCredentials.userId, userId), eq(userCredentials.provider, provider))
    );
    return credential || void 0;
  }
  async getCredentialForUserOrOrg(userId, orgId, provider) {
    console.log(`[storage] getCredentialForUserOrOrg - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
    const userCred = await this.getUserCredentialsByUserAndProvider(userId, provider);
    console.log(`[storage] User-specific credential: ${userCred ? `found (id: ${userCred.id})` : "not found"}`);
    if (userCred) return userCred;
    if (orgId) {
      console.log(`[storage] Looking for org-wide credential - orgId: ${orgId}, provider: ${provider}`);
      const [orgCred] = await db.select().from(userCredentials).where(
        and(
          eq(userCredentials.orgId, orgId),
          eq(userCredentials.provider, provider),
          eq(userCredentials.isOrgWide, true)
        )
      );
      console.log(`[storage] Org-wide credential: ${orgCred ? `found (id: ${orgCred.id})` : "not found"}`);
      if (orgCred) return orgCred;
    }
    return void 0;
  }
  async getUserCredentialsByOrg(orgId) {
    return db.select().from(userCredentials).where(eq(userCredentials.orgId, orgId));
  }
  async createUserCredential(credential) {
    const [created] = await db.insert(userCredentials).values(credential).returning();
    return created;
  }
  async updateUserCredential(id, updates) {
    const [updated] = await db.update(userCredentials).set(updates).where(eq(userCredentials.id, id)).returning();
    return updated || void 0;
  }
  async updateUserCredentialLastUsed(id) {
    await db.update(userCredentials).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(userCredentials.id, id));
  }
  async deleteUserCredential(id) {
    await db.delete(userCredentials).where(eq(userCredentials.id, id));
  }
  // =============================================================================
  // Entity Directory - UUID-based addressing for all principals
  // =============================================================================
  async getEntity(id) {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity || void 0;
  }
  async getEntityBySlugOrgInstance(slug, orgId, instanceId) {
    const conditions = [eq(entities.slug, slug)];
    if (orgId) {
      conditions.push(eq(entities.orgId, orgId));
    } else {
      conditions.push(isNull(entities.orgId));
    }
    if (instanceId) {
      conditions.push(eq(entities.instanceId, instanceId));
    } else {
      conditions.push(isNull(entities.instanceId));
    }
    const [entity] = await db.select().from(entities).where(and(...conditions));
    return entity || void 0;
  }
  async getEntityBySourceId(sourceTable, sourceId) {
    const [entity] = await db.select().from(entities).where(
      and(eq(entities.sourceTable, sourceTable), eq(entities.sourceId, sourceId))
    );
    return entity || void 0;
  }
  async getEntityByNodeId(nodeId) {
    const [entity] = await db.select().from(entities).where(eq(entities.boundNodeId, nodeId));
    return entity || void 0;
  }
  async listEntities(filters) {
    const conditions = [];
    if (filters.type) {
      conditions.push(eq(entities.type, filters.type));
    }
    if (filters.orgId) {
      conditions.push(eq(entities.orgId, filters.orgId));
    }
    if (filters.slug) {
      conditions.push(eq(entities.slug, filters.slug));
    }
    if (filters.status) {
      conditions.push(eq(entities.status, filters.status));
    }
    let query = db.select().from(entities);
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    const results = await query;
    if (filters.allowedOrgIds) {
      return results.filter(
        (e) => !e.orgId || filters.allowedOrgIds.includes(e.orgId)
      );
    }
    return results;
  }
  async createEntity(entity) {
    const [created] = await db.insert(entities).values({
      ...entity,
      registeredAt: /* @__PURE__ */ new Date(),
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return created;
  }
  async updateEntity(id, updates) {
    const [updated] = await db.update(entities).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(entities.id, id)).returning();
    return updated || void 0;
  }
  async bindEntityToNode(entityId, nodeId) {
    const [updated] = await db.update(entities).set({
      boundNodeId: nodeId,
      boundAt: /* @__PURE__ */ new Date(),
      lastSeenAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(entities.id, entityId)).returning();
    return updated || void 0;
  }
  async unbindEntityFromNode(entityId) {
    const [updated] = await db.update(entities).set({
      boundNodeId: null,
      boundAt: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(entities.id, entityId)).returning();
    return updated || void 0;
  }
  async resolveEntityAddress(address, contextOrgId) {
    const cleanAddress = address.startsWith("@") ? address.slice(1) : address;
    if (cleanAddress.startsWith("ent_")) {
      const entity = await this.getEntity(cleanAddress);
      return entity ? [entity] : [];
    }
    const instanceMatch = cleanAddress.match(/^([^#]+)#(.+)$/);
    if (instanceMatch) {
      const [, slug, instanceId] = instanceMatch;
      const entity = await this.getEntityBySlugOrgInstance(slug, contextOrgId, instanceId);
      return entity ? [entity] : [];
    }
    const qualifiedMatch = cleanAddress.match(/^([^:]+):(.+)$/);
    if (qualifiedMatch) {
      const [, type, slug] = qualifiedMatch;
      const conditions = [eq(entities.type, type), eq(entities.slug, slug)];
      if (contextOrgId) {
        conditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId)));
      }
      return db.select().from(entities).where(and(...conditions));
    }
    const aliasConditions = [eq(entityAliases.aliasValue, cleanAddress)];
    if (contextOrgId) {
      aliasConditions.push(or(eq(entityAliases.orgId, contextOrgId), isNull(entityAliases.orgId)));
    }
    const aliasResults = await db.select().from(entityAliases).where(and(...aliasConditions)).orderBy(entityAliases.priority);
    if (aliasResults.length > 0) {
      const entityIds = [...new Set(aliasResults.map((a) => a.entityId))];
      return db.select().from(entities).where(inArray(entities.id, entityIds));
    }
    const slugConditions = [eq(entities.slug, cleanAddress)];
    if (contextOrgId) {
      slugConditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId)));
    }
    return db.select().from(entities).where(and(...slugConditions));
  }
  async getSimilarEntities(address, contextOrgId) {
    const cleanAddress = address.startsWith("@") ? address.slice(1) : address;
    const pattern = `%${cleanAddress}%`;
    const conditions = [like(entities.slug, pattern)];
    if (contextOrgId) {
      conditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId)));
    }
    const results = await db.select({ slug: entities.slug }).from(entities).where(and(...conditions)).limit(5);
    return results.map((r) => r.slug);
  }
  // Entity Aliases
  async createEntityAlias(alias) {
    const [created] = await db.insert(entityAliases).values(alias).returning();
    return created;
  }
  async getEntityAliases(entityId) {
    return db.select().from(entityAliases).where(eq(entityAliases.entityId, entityId));
  }
  async deleteEntityAlias(id) {
    await db.delete(entityAliases).where(eq(entityAliases.id, id));
  }
  // Entity Instances
  async createEntityInstance(instance) {
    const [created] = await db.insert(entityInstances).values(instance).returning();
    return created;
  }
  async getEntityInstances(entityId) {
    return db.select().from(entityInstances).where(eq(entityInstances.entityId, entityId));
  }
  async updateEntityInstanceStatus(id, status, nodeId) {
    const updates = {
      status,
      lastHeartbeat: /* @__PURE__ */ new Date()
    };
    if (nodeId !== void 0) {
      updates.nodeId = nodeId;
    }
    const [updated] = await db.update(entityInstances).set(updates).where(eq(entityInstances.id, id)).returning();
    return updated || void 0;
  }
  // Stats
  async getStats() {
    const allUsers = await db.select().from(users);
    const allOrgs = await db.select().from(organizations);
    const allAgents = await db.select().from(agents);
    return {
      totalUsers: allUsers.length,
      totalOrgs: allOrgs.length,
      totalAgents: allAgents.length
    };
  }
};
var storage = new DatabaseStorage();

// ../../identity/server/src/system-bootstrap.ts
import { DEFAULT_ORG_IDS } from "@symbia/seed";
var SYSTEM_SECRET = null;
var SYSTEM_ORG_ID = DEFAULT_ORG_IDS.SYMBIA_SYSTEM;
var SYSTEM_ORG_NAME = "Symbia System";
var SYSTEM_ORG_SLUG = "symbia-system";
async function initSystemBootstrap() {
  SYSTEM_SECRET = crypto.randomBytes(32).toString("hex");
  console.log("[identity] System bootstrap secret generated (in-memory only)");
  const existingOrg = await storage.getOrganization(SYSTEM_ORG_ID);
  if (!existingOrg) {
    await storage.createOrganizationWithId({
      id: SYSTEM_ORG_ID,
      name: SYSTEM_ORG_NAME,
      slug: SYSTEM_ORG_SLUG
    });
    console.log("[identity] Created symbia-system organization");
  } else {
    console.log("[identity] symbia-system organization already exists");
  }
}
function getBootstrapConfig() {
  if (!SYSTEM_SECRET) return null;
  return {
    secret: SYSTEM_SECRET,
    orgId: SYSTEM_ORG_ID,
    orgName: SYSTEM_ORG_NAME,
    serviceId: "system"
  };
}
async function addUserToSystemOrg(userId) {
  const memberships2 = await storage.getMembershipsByUser(userId);
  const alreadyMember = memberships2.some((m) => m.orgId === SYSTEM_ORG_ID);
  if (!alreadyMember) {
    await storage.createMembership({
      userId,
      orgId: SYSTEM_ORG_ID,
      role: "admin"
    });
    console.log(`[identity] Added user ${userId} to symbia-system org`);
  }
}

// ../../identity/server/src/routes.ts
import crypto2 from "crypto";

// ../../identity/server/src/email.ts
import { google } from "googleapis";
var connectionSettings;
async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }
  const response = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        "Accept": "application/json",
        "X_REPLIT_TOKEN": xReplitToken
      }
    }
  );
  const data = await response.json();
  connectionSettings = data.items?.[0];
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }
  return accessToken;
}
async function getGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}
function createEmailMessage(to, subject, body) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    body
  ].join("\n");
  return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sendPasswordResetEmail(to, resetToken, userName) {
  try {
    const gmail = await getGmailClient();
    const { resolveServiceUrl, ServiceId } = await import("@symbia/sys");
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : process.env.REPLIT_DEPLOYMENT_URL || resolveServiceUrl(ServiceId.SERVER);
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Password Reset Request</h2>
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password for your Symbia account. Click the button below to set a new password:</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #0066cc;">${resetLink}</p>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          <div class="footer">
            <p>This is an automated message from Symbia Identity Service.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const encodedMessage = createEmailMessage(to, "Reset Your Symbia Password", htmlBody);
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage
      }
    });
    console.log(`Password reset email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return false;
  }
}

// ../../identity/server/src/routes.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z as z2 } from "zod";

// ../../identity/server/src/openapi.ts
var apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Identity Service API",
    version: "1.0.0",
    description: "Authentication, authorization, and entitlements API for the Symbia ecosystem. Use this service to manage users, organizations, projects, applications, services, and feature entitlements.\n\n**Scope Headers (optional)**: X-Org-Id, X-Service-Id, X-Env, X-Data-Class, X-Policy-Ref."
  },
  servers: [
    {
      url: "/api",
      description: "API Base URL"
    }
  ],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "User registered successfully" },
          "400": { description: "Invalid input or email already exists" }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Login successful, returns user data and sets auth cookie" },
          "401": { description: "Invalid credentials" }
        }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Logout user",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Logged out successfully" }
        }
      }
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Refresh authentication token",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Token refreshed" },
          "401": { description: "Invalid or expired token" }
        }
      }
    },
    "/auth/introspect": {
      post: {
        tags: ["Authentication", "Service-to-Service"],
        summary: "Validate token and get user principal (RFC 7662)",
        description: "Token introspection endpoint for service-to-service auth. Returns user principal with organizations, entitlements, and roles if token is valid.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: { type: "string", description: "JWT token to validate" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Token introspection response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    active: { type: "boolean", description: "Whether the token is valid" },
                    sub: { type: "string", format: "uuid", description: "User ID" },
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                    isSuperAdmin: { type: "boolean" },
                    organizations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          slug: { type: "string" },
                          role: { type: "string", enum: ["admin", "member", "viewer"] }
                        }
                      }
                    },
                    entitlements: { type: "array", items: { type: "string" } },
                    roles: { type: "array", items: { type: "string" } },
                    token_type: { type: "string", enum: ["Bearer"] },
                    iat: { type: "integer", description: "Issued at timestamp" },
                    exp: { type: "integer", description: "Expiration timestamp" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/auth/verify-api-key": {
      post: {
        tags: ["Authentication", "API Keys"],
        summary: "Verify an API key (for service-to-service auth)",
        description: "Validates an API key and returns the associated user/org principal if valid. Use this for service-to-service authentication.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["apiKey"],
                properties: {
                  apiKey: { type: "string", description: "API key to validate (e.g., sk_...)" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Verification result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    valid: { type: "boolean" },
                    error: { type: "string", description: "Error message if not valid" },
                    keyId: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    orgId: { type: "string", format: "uuid", nullable: true },
                    scopes: { type: "array", items: { type: "string" } },
                    creator: {
                      type: "object",
                      description: "Enriched user data of the key creator",
                      properties: {
                        id: { type: "string", format: "uuid" },
                        email: { type: "string", format: "email" },
                        entitlements: { type: "array", items: { type: "string" } },
                        roles: { type: "array", items: { type: "string" } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api-keys": {
      post: {
        tags: ["API Keys"],
        summary: "Create a new API key",
        description: "Mints a new API key for service-to-service authentication. The full key is returned only once.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", description: "Human-readable name for the key" },
                  orgId: { type: "string", format: "uuid", description: "Optional org to scope the key to" },
                  scopes: { type: "array", items: { type: "string" }, description: "Permission scopes" },
                  expiresAt: { type: "string", format: "date-time", description: "Optional expiration date" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "API key created - includes the full key (shown only once)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKeyCreated" }
              }
            }
          },
          "403": { description: "Insufficient permissions" }
        }
      },
      get: {
        tags: ["API Keys"],
        summary: "List your API keys",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "List of API keys (without the actual key values)",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ApiKey" }
                }
              }
            }
          }
        }
      }
    },
    "/api-keys/{id}": {
      get: {
        tags: ["API Keys"],
        summary: "Get API key details",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "API key details" },
          "404": { description: "API key not found" }
        }
      },
      delete: {
        tags: ["API Keys"],
        summary: "Delete an API key permanently",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "API key deleted" },
          "404": { description: "API key not found" }
        }
      }
    },
    "/api-keys/{id}/revoke": {
      post: {
        tags: ["API Keys"],
        summary: "Revoke an API key",
        description: "Marks the key as revoked. It can no longer be used but remains in history.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "API key revoked" },
          "400": { description: "API key already revoked" }
        }
      }
    },
    "/api-keys/{id}/rotate": {
      post: {
        tags: ["API Keys"],
        summary: "Rotate an API key",
        description: "Revokes the old key and creates a new one with the same settings.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "New API key created (old key revoked)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKeyCreated" }
              }
            }
          }
        }
      }
    },
    "/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get current user profile",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "User profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Users"],
        summary: "Update current user profile",
        security: [{ cookieAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Profile updated" }
        }
      }
    },
    "/orgs": {
      get: {
        tags: ["Organizations"],
        summary: "List user's organizations",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "List of organizations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    organizations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Organization" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Organizations"],
        summary: "Create a new organization",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Organization created" }
        }
      }
    },
    "/orgs/{orgId}": {
      get: {
        tags: ["Organizations"],
        summary: "Get organization details",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Organization details with members and entitlements"
          }
        }
      }
    },
    "/orgs/{orgId}/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects in an organization",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of projects",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    projects: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Project" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Projects"],
        summary: "Create a new project",
        description: "Requires admin or member role",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" },
                  description: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Project created" },
          "403": { description: "Insufficient permissions" }
        }
      }
    },
    "/projects/{projectId}": {
      get: {
        tags: ["Projects"],
        summary: "Get project details",
        description: "Returns project with its applications, services, and entitlements",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Project details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project: { $ref: "#/components/schemas/Project" },
                    applications: { type: "array", items: { $ref: "#/components/schemas/Application" } },
                    services: { type: "array", items: { $ref: "#/components/schemas/Service" } },
                    entitlements: { type: "array", items: { $ref: "#/components/schemas/ScopedEntitlement" } }
                  }
                }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Projects"],
        summary: "Update project",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  status: { type: "string", enum: ["active", "archived", "suspended"] }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Project updated" }
        }
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete project",
        description: "Admin only",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Project deleted" },
          "403": { description: "Only admins can delete projects" }
        }
      }
    },
    "/projects/{projectId}/applications": {
      get: {
        tags: ["Applications"],
        summary: "List applications in a project",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "List of applications" }
        }
      },
      post: {
        tags: ["Applications"],
        summary: "Create a new application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug", "environment", "appType"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" },
                  environment: { type: "string", enum: ["development", "staging", "production"] },
                  appType: { type: "string", enum: ["web", "mobile", "api", "cli"] },
                  repoUrl: { type: "string", format: "uri" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Application created" }
        }
      }
    },
    "/applications/{appId}": {
      get: {
        tags: ["Applications"],
        summary: "Get application details",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Application with services and entitlements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    application: { $ref: "#/components/schemas/Application" },
                    services: { type: "array", items: { $ref: "#/components/schemas/Service" } },
                    entitlements: { type: "array", items: { $ref: "#/components/schemas/ScopedEntitlement" } }
                  }
                }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Applications"],
        summary: "Update application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Application updated" }
        }
      },
      delete: {
        tags: ["Applications"],
        summary: "Delete application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Application deleted" }
        }
      }
    },
    "/projects/{projectId}/services": {
      get: {
        tags: ["Services"],
        summary: "List services in a project",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "List of services" }
        }
      },
      post: {
        tags: ["Services"],
        summary: "Create a new service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "serviceType"],
                properties: {
                  name: { type: "string" },
                  serviceType: { type: "string", enum: ["database", "api", "auth", "storage", "messaging", "analytics"] },
                  provider: { type: "string" },
                  endpointUrl: { type: "string", format: "uri" },
                  externalId: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Service created" }
        }
      }
    },
    "/services/{serviceId}": {
      get: {
        tags: ["Services"],
        summary: "Get service details",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service with entitlements" }
        }
      },
      patch: {
        tags: ["Services"],
        summary: "Update service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service updated" }
        }
      },
      delete: {
        tags: ["Services"],
        summary: "Delete service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service deleted" }
        }
      }
    },
    "/applications/{appId}/services/{serviceId}": {
      post: {
        tags: ["Applications", "Services"],
        summary: "Link a service to an application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service linked to application" }
        }
      },
      delete: {
        tags: ["Applications", "Services"],
        summary: "Unlink a service from an application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service unlinked" }
        }
      }
    },
    "/scoped-entitlements/{scopeType}/{scopeId}": {
      get: {
        tags: ["Entitlements"],
        summary: "Get entitlements for a specific scope",
        description: "Retrieve entitlements scoped to an org, project, application, or service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "scopeType", in: "path", required: true, schema: { type: "string", enum: ["org", "project", "application", "service"] } },
          { name: "scopeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of scoped entitlements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entitlements: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ScopedEntitlement" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/scoped-entitlements": {
      post: {
        tags: ["Entitlements"],
        summary: "Create a scoped entitlement",
        description: "Admin only. Create an entitlement for org, project, application, or service scope.",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scopeType", "scopeId", "featureKey", "enabled"],
                properties: {
                  scopeType: { type: "string", enum: ["org", "project", "application", "service"] },
                  scopeId: { type: "string", format: "uuid" },
                  featureKey: { type: "string" },
                  quota: { type: "integer" },
                  enabled: { type: "boolean" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Entitlement created" },
          "403": { description: "Only admins can manage entitlements" }
        }
      }
    },
    "/scoped-entitlements/{id}": {
      patch: {
        tags: ["Entitlements"],
        summary: "Update a scoped entitlement",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  quota: { type: "integer" },
                  consumed: { type: "integer" },
                  enabled: { type: "boolean" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Entitlement updated" }
        }
      },
      delete: {
        tags: ["Entitlements"],
        summary: "Delete a scoped entitlement",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Entitlement deleted" }
        }
      }
    },
    "/entitlements/{orgId}": {
      get: {
        tags: ["Entitlements"],
        summary: "Get organization entitlements (legacy)",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Organization entitlements" }
        }
      }
    },
    "/license/{orgId}": {
      get: {
        tags: ["License"],
        summary: "Get organization license status",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "License status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    valid: { type: "boolean" },
                    plan: { $ref: "#/components/schemas/Plan" },
                    features: { type: "object" },
                    limits: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Get dashboard data",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Dashboard data with stats and recent activity" }
        }
      }
    },
    "/admin/users/{userId}/entitlements": {
      get: {
        tags: ["Super Admin"],
        summary: "Get user's capability entitlements",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of user entitlements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entitlements: { type: "array", items: { $ref: "#/components/schemas/UserEntitlement" } }
                  }
                }
              }
            }
          },
          "403": { description: "Super admin access required" }
        }
      },
      post: {
        tags: ["Super Admin"],
        summary: "Grant a capability entitlement to a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entitlementKey"],
                properties: {
                  entitlementKey: { type: "string", description: "e.g., cap:registry.write" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Entitlement granted" },
          "400": { description: "User already has this entitlement" },
          "403": { description: "Super admin access required" }
        }
      }
    },
    "/admin/users/{userId}/entitlements/{entitlementKey}": {
      delete: {
        tags: ["Super Admin"],
        summary: "Revoke a capability entitlement from a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "entitlementKey", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Entitlement revoked" },
          "403": { description: "Super admin access required" },
          "404": { description: "Entitlement not found" }
        }
      }
    },
    "/admin/users/{userId}/roles": {
      get: {
        tags: ["Super Admin"],
        summary: "Get user's global roles",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of user roles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    roles: { type: "array", items: { $ref: "#/components/schemas/UserRole" } }
                  }
                }
              }
            }
          },
          "403": { description: "Super admin access required" }
        }
      },
      post: {
        tags: ["Super Admin"],
        summary: "Grant a global role to a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roleKey"],
                properties: {
                  roleKey: { type: "string", description: "e.g., role:publisher" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Role granted" },
          "400": { description: "User already has this role" },
          "403": { description: "Super admin access required" }
        }
      }
    },
    "/admin/users/{userId}/roles/{roleKey}": {
      delete: {
        tags: ["Super Admin"],
        summary: "Revoke a global role from a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "roleKey", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Role revoked" },
          "403": { description: "Super admin access required" },
          "404": { description: "Role not found" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "auth_token",
        description: "JWT token stored in httpOnly cookie"
      }
    },
    parameters: {
      OrgIdHeader: {
        name: "X-Org-Id",
        in: "header",
        required: false,
        description: "Optional organization scope override.",
        schema: { type: "string" }
      },
      ServiceIdHeader: {
        name: "X-Service-Id",
        in: "header",
        required: false,
        description: "Optional service scope identifier.",
        schema: { type: "string" }
      },
      EnvHeader: {
        name: "X-Env",
        in: "header",
        required: false,
        description: "Optional environment scope (dev|stage|prod).",
        schema: { type: "string" }
      },
      DataClassHeader: {
        name: "X-Data-Class",
        in: "header",
        required: false,
        description: "Optional data classification (none|pii|phi|secret).",
        schema: { type: "string", enum: ["none", "pii", "phi", "secret"] }
      },
      PolicyRefHeader: {
        name: "X-Policy-Ref",
        in: "header",
        required: false,
        description: "Optional policy reference for auditing.",
        schema: { type: "string" }
      }
    },
    schemas: {
      User: {
        type: "object",
        description: "User profile with organizations, entitlements, and roles for Object Service integration",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          isSuperAdmin: { type: "boolean" },
          organizations: {
            type: "array",
            description: "Organizations the user belongs to with their role",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                slug: { type: "string" },
                role: { type: "string", enum: ["admin", "member", "viewer"] }
              }
            }
          },
          entitlements: {
            type: "array",
            description: "Capability entitlements (e.g., cap:registry.write, cap:registry.publish)",
            items: { type: "string" }
          },
          roles: {
            type: "array",
            description: "Global roles (e.g., role:publisher, role:admin)",
            items: { type: "string" }
          },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      UserEntitlement: {
        type: "object",
        description: "A capability grant for a user",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          entitlementKey: { type: "string", description: "e.g., cap:registry.write" },
          grantedBy: { type: "string", format: "uuid", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      UserRole: {
        type: "object",
        description: "A global role for a user",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          roleKey: { type: "string", description: "e.g., role:publisher" },
          grantedBy: { type: "string", format: "uuid", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Organization: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          planId: { type: "string", format: "uuid", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string", nullable: true },
          status: { type: "string", enum: ["active", "archived", "suspended"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Application: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          environment: { type: "string", enum: ["development", "staging", "production"] },
          appType: { type: "string", enum: ["web", "mobile", "api", "cli"] },
          repoUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Service: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          serviceType: { type: "string", enum: ["database", "api", "auth", "storage", "messaging", "analytics"] },
          provider: { type: "string", nullable: true },
          endpointUrl: { type: "string", nullable: true },
          externalId: { type: "string", nullable: true },
          status: { type: "string", enum: ["active", "inactive", "error"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ScopedEntitlement: {
        type: "object",
        description: "Polymorphic entitlement that can be scoped to org, project, application, or service",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          scopeType: { type: "string", enum: ["org", "project", "application", "service"] },
          scopeId: { type: "string", format: "uuid" },
          featureKey: { type: "string" },
          quota: { type: "integer", nullable: true, description: "Maximum allowed usage" },
          consumed: { type: "integer", description: "Current usage count" },
          enabled: { type: "boolean" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Plan: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          featuresJson: { type: "object" },
          limitsJson: { type: "object" },
          priceCents: { type: "integer" }
        }
      },
      ApiKey: {
        type: "object",
        description: "API key metadata (excludes actual key value)",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          keyPrefix: { type: "string", description: "First 8 chars of the key for identification" },
          orgId: { type: "string", format: "uuid", nullable: true },
          scopes: { type: "array", items: { type: "string" } },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          revokedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ApiKeyCreated: {
        type: "object",
        description: "API key response when creating or rotating (includes full key)",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          key: { type: "string", description: "The full API key - only shown once, store securely" },
          keyPrefix: { type: "string" },
          orgId: { type: "string", format: "uuid", nullable: true },
          scopes: { type: "array", items: { type: "string" } },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          _warning: { type: "string" }
        }
      },
      HealthCheck: {
        type: "object",
        description: "System health status including database connectivity",
        properties: {
          status: { type: "string", enum: ["ok", "degraded", "error"] },
          timestamp: { type: "string", format: "date-time" },
          database: {
            type: "object",
            properties: {
              connected: { type: "boolean" },
              latencyMs: { type: "integer", description: "DB query latency in ms" },
              error: { type: "string", description: "Error message if not connected" }
            }
          },
          email: {
            type: "object",
            properties: {
              enabled: { type: "boolean" }
            }
          },
          version: { type: "string" }
        }
      }
    }
  }
};
var scopeParameters = [
  { $ref: "#/components/parameters/OrgIdHeader" },
  { $ref: "#/components/parameters/ServiceIdHeader" },
  { $ref: "#/components/parameters/EnvHeader" },
  { $ref: "#/components/parameters/DataClassHeader" },
  { $ref: "#/components/parameters/PolicyRefHeader" }
];
var scopeRefs = new Set(scopeParameters.map((param) => param.$ref));
if (apiDocumentation.paths) {
  Object.values(apiDocumentation.paths).forEach((pathItem) => {
    const existing = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    const merged = [...scopeParameters, ...existing.filter((param) => !scopeRefs.has(param?.$ref))];
    pathItem.parameters = merged;
  });
}
{
  const __autoDocumentedPaths = {
    "/admin/orgs/{id}": {
      "delete": {
        "tags": [
          "Admin"
        ],
        "summary": "Delete orgs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Admin"
        ],
        "summary": "Update orgs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/admin/users/{id}": {
      "delete": {
        "tags": [
          "Admin"
        ],
        "summary": "Delete users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Admin"
        ],
        "summary": "Update users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/keys/{id}": {
      "delete": {
        "tags": [
          "Auth"
        ],
        "summary": "Delete keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/credentials/{id}": {
      "delete": {
        "tags": [
          "Credentials"
        ],
        "summary": "Delete credentials",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/orgs/{orgId}/members/{memberId}": {
      "delete": {
        "tags": [
          "Orgs"
        ],
        "summary": "Delete members",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "orgId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "memberId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Orgs"
        ],
        "summary": "Update members",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "orgId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "memberId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/admin/audit-logs": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List audit logs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/orgs": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List orgs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/plans": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List plans",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Admin"
        ],
        "summary": "Create plans",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/users": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/agent/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/config": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get config",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/keys": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "List keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/bootstrap/service": {
      "get": {
        "tags": [
          "Bootstrap"
        ],
        "summary": "Get service",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/credentials": {
      "get": {
        "tags": [
          "Credentials"
        ],
        "summary": "List credentials",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Credentials"
        ],
        "summary": "Create credentials",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities": {
      "get": {
        "tags": [
          "Entities"
        ],
        "summary": "List entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Create entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/by-node/{nodeId}": {
      "get": {
        "tags": [
          "Entities"
        ],
        "summary": "Get by node",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "nodeId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/entities/{id}": {
      "get": {
        "tags": [
          "Entities"
        ],
        "summary": "Get entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Entities"
        ],
        "summary": "Update entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/stats": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "List stats",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/plans/{id}": {
      "patch": {
        "tags": [
          "Admin"
        ],
        "summary": "Update plans",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/agent/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Login auth agent login",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/agent/refresh": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Refresh auth agent refresh",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/agent/register": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Register auth agent register",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/forgot-password": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create forgot password",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/keys/{id}/revoke": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Revoke auth keys revoke",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/keys/{id}/rotate": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Rotate auth keys rotate",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/reset-password": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create reset password",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Login auth user login",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/refresh": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Refresh auth user refresh",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/register": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Register auth user register",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/resolve": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Resolve entities resolve",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/sync": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Sync entities sync",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/{id}/bind": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Bind entities bind",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/entities/{id}/unbind": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Unbind entities unbind",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/orgs/{id}/members/invite": {
      "post": {
        "tags": [
          "Orgs"
        ],
        "summary": "Invite orgs members invite",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/users/me/password": {
      "post": {
        "tags": [
          "Users"
        ],
        "summary": "Create password",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = apiDocumentation.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../identity/server/src/doc-routes.ts
import fs from "fs";
import path from "path";
var docsRoot = path.resolve(process.cwd(), "docs");
function sendDocFile(res, filename, contentType) {
  const filePath = path.join(docsRoot, filename);
  if (fs.existsSync(filePath)) {
    res.type(contentType).sendFile(filePath);
  } else {
    res.status(404).json({ error: "Document not found. Run build to generate docs." });
  }
}
function registerDocRoutes(app) {
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/openapi.json", (_req, res) => {
    const filePath = path.join(docsRoot, "openapi.json");
    if (fs.existsSync(filePath)) {
      res.type("application/json").sendFile(filePath);
    } else {
      res.type("application/json").json(apiDocumentation);
    }
  });
  app.get("/api/docs/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/.well-known/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/api/docs", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/docs/llms.txt", (_req, res) => {
    sendDocFile(res, "llms.txt", "text/plain");
  });
  app.get("/llms.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/llm.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/llms-full.txt", (_req, res) => {
    sendDocFile(res, "llms-full.txt", "text/plain");
  });
  app.get("/llms-full.txt", (_req, res) => {
    res.redirect(302, "/docs/llms-full.txt");
  });
  app.get("/.well-known/jwks.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").json({
      keys: [],
      _note: "This service uses HS256 symmetric tokens. Use POST /api/auth/introspect for token validation.",
      introspect_endpoint: "/api/auth/introspect"
    });
  });
}

// ../../identity/server/src/routes.ts
import { runWithRLSContext } from "@symbia/db";
import { encryptSecret, decryptSecret, nodeCredentialCrypto } from "@symbia/crypto";
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var updateUserAdminSchema = z2.object({
  name: z2.string().min(1).optional(),
  email: z2.string().email().optional(),
  isSuperAdmin: z2.boolean().optional()
});
var updateOrgAdminSchema = z2.object({
  name: z2.string().min(1).optional(),
  slug: z2.string().regex(/^[a-z0-9-]+$/).optional(),
  planId: z2.string().nullable().optional()
});
var createPlanAdminSchema = z2.object({
  name: z2.string().min(1, "Plan name is required"),
  featuresJson: z2.array(z2.string()).optional(),
  limitsJson: z2.record(z2.string(), z2.number()).optional(),
  priceCents: z2.number().int().min(0).optional()
});
var updatePlanAdminSchema = z2.object({
  name: z2.string().min(1).optional(),
  featuresJson: z2.array(z2.string()).optional(),
  limitsJson: z2.record(z2.string(), z2.number()).optional(),
  priceCents: z2.number().int().min(0).optional()
});
function runRequestWithRLS(context, res, next) {
  try {
    runWithRLSContext(context, () => next());
  } catch (error) {
    console.error("[identity-service] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to establish request security context" });
    }
  }
}
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
var JWT_SECRET = process.env.SESSION_SECRET;
var JWT_EXPIRES_IN = "7d";
var SALT_ROUNDS = 10;
function signToken(user) {
  return jwt.sign(
    { sub: user.id, type: "user", email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function signAgentToken(agent) {
  return jwt.sign(
    { sub: agent.id, type: "agent", agentId: agent.agentId, name: agent.name, orgId: agent.orgId || void 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.type) {
      payload.type = "user";
    }
    return payload;
  } catch {
    return null;
  }
}
var DEV_NO_AUTH = process.env.DEV_NO_AUTH === "true";
if (DEV_NO_AUTH) {
  console.warn(
    "\n  ############################################################\n  #  DEV_NO_AUTH=true \u2014 UNTOKENED REQUESTS ARE ACCEPTED       #\n  #  Every request without a token runs as the first user.    #\n  #  Development only. Never on a reachable stack.            #\n  ############################################################\n"
  );
}
async function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    if (DEV_NO_AUTH) {
      const [firstUser] = await storage.getAllUsers();
      if (!firstUser) {
        return res.status(503).json({
          message: "DEV_NO_AUTH is enabled but there are no users to attach to",
          hint: "seed the database or register a user"
        });
      }
      req.user = {
        id: firstUser.id,
        email: firstUser.email,
        name: firstUser.name,
        isSuperAdmin: firstUser.isSuperAdmin
      };
      req.principal = { id: firstUser.id, type: "user", name: firstUser.name };
      return runRequestWithRLS(
        {
          orgId: "",
          userId: firstUser.id,
          isSuperAdmin: firstUser.isSuperAdmin,
          capabilities: [],
          serviceId: "identity"
        },
        res,
        next
      );
    }
    return res.status(401).json({ message: "Authentication required" });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  if (payload.type === "agent") {
    const agent = await storage.getAgent(payload.sub);
    if (!agent) {
      return res.status(401).json({ message: "Agent not found" });
    }
    if (!agent.isActive) {
      return res.status(401).json({ message: "Agent is inactive" });
    }
    req.agent = {
      id: agent.id,
      agentId: agent.agentId,
      name: agent.name,
      orgId: agent.orgId || void 0,
      capabilities: agent.capabilities || []
    };
    req.principal = { id: agent.id, type: "agent", name: agent.name };
    storage.updateAgentLastSeen(agent.id).catch(() => {
    });
    return runRequestWithRLS(
      {
        orgId: agent.orgId || "",
        userId: agent.id,
        isSuperAdmin: false,
        capabilities: agent.capabilities || [],
        serviceId: "identity"
      },
      res,
      next
    );
  } else {
    const user = await storage.getUser(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.user = { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
    req.principal = { id: user.id, type: "user", name: user.name };
    return runRequestWithRLS(
      {
        orgId: "",
        // Identity service operates cross-org; specific org context set per-query
        userId: user.id,
        isSuperAdmin: user.isSuperAdmin,
        capabilities: [],
        serviceId: "identity"
      },
      res,
      next
    );
  }
}
async function superAdminMiddleware(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({
      message: "Super admin access required",
      code: "SUPERADMIN_REQUIRED",
      hint: "This action requires super admin privileges. Contact your system administrator."
    });
  }
  next();
}
var rateLimitStore = /* @__PURE__ */ new Map();
var RATE_LIMIT_WINDOW_MS = 60 * 1e3;
var SUPERADMIN_RATE_LIMIT = 30;
var AUTH_RATE_LIMIT = 10;
function createRateLimitMiddleware(limit, windowMs = RATE_LIMIT_WINDOW_MS) {
  return (req, res, next) => {
    const key = `${req.ip || "unknown"}_${req.path}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1e3);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter
      });
    }
    entry.count++;
    next();
  };
}
var superAdminRateLimit = createRateLimitMiddleware(SUPERADMIN_RATE_LIMIT);
var authRateLimit = createRateLimitMiddleware(AUTH_RATE_LIMIT);
function isEmailEnabled() {
  if (process.env.EMAIL_ENABLED === "false") return false;
  if (process.env.EMAIL_ENABLED === "true") return true;
  const hasConnector = !!(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
  return hasConnector;
}
async function registerRoutes(httpServer, app) {
  const cookieParser = await import("cookie-parser");
  app.use(cookieParser.default());
  registerDocRoutes(app);
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "identity" });
  });
  app.get("/health/ready", async (req, res) => {
    const healthCheck = {
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      database: { connected: false },
      email: { enabled: isEmailEnabled() },
      version: "1.0.0"
    };
    try {
      const start = Date.now();
      await storage.getAllPlans();
      const latencyMs = Date.now() - start;
      healthCheck.database = { connected: true, latencyMs };
    } catch (error) {
      healthCheck.status = "error";
      healthCheck.database = {
        connected: false,
        error: error.message || "Database connection failed"
      };
    }
    const statusCode = healthCheck.status === "ok" ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  });
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "identity",
      version: "1.0.0",
      description: "Authentication, authorization, and identity management service",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
        openapiDirect: "/api/docs/openapi.json"
      },
      endpoints: {
        auth: "/api/auth",
        users: "/api/users",
        orgs: "/api/orgs",
        projects: "/api/projects",
        applications: "/api/applications",
        services: "/api/services",
        entitlements: "/api/entitlements",
        apiKeys: "/api/auth/keys",
        admin: "/api/admin"
      },
      authentication: [
        "Bearer token (JWT)",
        "Session cookie (token)"
      ],
      jwks: "/.well-known/jwks.json"
    });
  });
  app.get("/api/bootstrap/internal", (req, res) => {
    const forwarded = req.headers["x-forwarded-for"];
    const remoteIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
    const isInternal = remoteIp && (remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp.startsWith("172.") || remoteIp.startsWith("10.") || remoteIp.startsWith("192.168.") || remoteIp === "::ffff:127.0.0.1");
    if (!isInternal && process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Internal endpoint only" });
    }
    const config = getBootstrapConfig();
    if (!config) {
      return res.status(503).json({ error: "Bootstrap not initialized" });
    }
    res.json(config);
  });
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });
  app.get("/api/auth/config", (_req, res) => {
    const baseUrl = process.env.IDENTITY_BASE_URL || "";
    res.json({
      identityServiceUrl: baseUrl,
      loginUrl: `${baseUrl}/login`,
      logoutUrl: `${baseUrl}/api/auth/logout`
    });
  });
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    if (req.agent) {
      const agent = await storage.getAgent(req.agent.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      return res.json({
        type: "agent",
        agent: {
          id: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities
        }
      });
    }
    const enrichedUser = await storage.getEnrichedUser(req.user.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    const issuedToken = !req.headers.authorization && !req.cookies?.token && DEV_NO_AUTH ? signToken({ id: enrichedUser.id, email: enrichedUser.email, name: enrichedUser.name }) : void 0;
    res.json({
      type: "user",
      user: enrichedUser,
      organizations: enrichedUser.organizations || [],
      ...issuedToken ? { token: issuedToken, tokenIssuedBy: "DEV_NO_AUTH" } : {}
    });
  });
  app.get("/api/auth/user/me", authMiddleware, async (req, res) => {
    if (!req.user) {
      return res.status(403).json({ message: "This endpoint is for users only" });
    }
    const enrichedUser = await storage.getEnrichedUser(req.user.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      user: enrichedUser,
      organizations: enrichedUser.organizations || []
    });
  });
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/api/docs", (req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/api/docs/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/docs/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/llm.txt", (req, res) => {
    res.redirect("/llms.txt");
  });
  app.get("/llms.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(`# Symbia Identity Service

> Authentication, authorization, and entitlements API for the Symbia ecosystem

## Overview

Symbia Identity Service provides:
- User authentication (register, login, password reset)
- Organization management with role-based access control
- Project, Application, and Service hierarchy
- Polymorphic scoped entitlements with quotas
- Audit logging

## Quick Start

1. **Authentication**: POST /api/auth/login with email/password, receive JWT token
2. **Create Organization**: POST /api/orgs with name
3. **Create Project**: POST /api/orgs/{orgId}/projects
4. **Check Entitlements**: GET /api/scoped-entitlements/{scopeType}/{scopeId}

## Authentication

All authenticated endpoints require either:
- Cookie: \`token\` (set automatically after login)
- Header: \`Authorization: Bearer <token>\`

## Scope Headers (optional)

- \`X-Org-Id\`
- \`X-Service-Id\`
- \`X-Env\`
- \`X-Data-Class\`
- \`X-Policy-Ref\`

## Key Endpoints

- POST /api/auth/register - Create new user
- POST /api/auth/login - Authenticate user
- GET /api/users/me - Get current user
- GET /api/orgs - List user's organizations
- POST /api/orgs - Create organization
- GET /api/orgs/{orgId}/projects - List projects
- GET /api/scoped-entitlements/{scopeType}/{scopeId} - Check entitlements
- GET /api/license/{orgId} - Get license status

## OpenAPI Spec

Full OpenAPI 3.0 specification: /docs/openapi.json

## More Info

See /llms-full.txt for complete API documentation.
`);
  });
  app.get("/docs/llms.txt", (req, res) => {
    res.redirect("/llms.txt");
  });
  app.get("/llms-full.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const doc = apiDocumentation;
    let content = `# ${doc.info.title} - Complete API Documentation

> ${doc.info.description}

## Base URL

${doc.servers?.[0]?.url || "/api"} - ${doc.servers?.[0]?.description || "API Base URL"}

## Authentication

All authenticated endpoints require either:
- Cookie: \`token\` (set automatically after login)
- Header: \`Authorization: Bearer <token>\`

## Scope Headers (optional)

- \`X-Org-Id\`
- \`X-Service-Id\`
- \`X-Env\`
- \`X-Data-Class\`
- \`X-Policy-Ref\`

## Endpoints

`;
    const endpointsByTag = {};
    for (const [path2, methods] of Object.entries(doc.paths || {})) {
      for (const [method, details] of Object.entries(methods)) {
        const d = details;
        const tag = d.tags?.[0] || "Other";
        if (!endpointsByTag[tag]) {
          endpointsByTag[tag] = [];
        }
        let endpoint = `### ${method.toUpperCase()} ${path2}

`;
        endpoint += `${d.summary || ""}

`;
        if (d.description) {
          endpoint += `${d.description}

`;
        }
        if (d.requestBody?.content?.["application/json"]?.schema) {
          const schema = d.requestBody.content["application/json"].schema;
          endpoint += `**Request Body:**
\`\`\`json
`;
          if (schema.properties) {
            const example = {};
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
              const ps = propSchema;
              if (ps.type === "string") example[prop] = ps.example || "string";
              else if (ps.type === "integer" || ps.type === "number") example[prop] = ps.example || 0;
              else if (ps.type === "boolean") example[prop] = ps.example || false;
              else if (ps.type === "array") example[prop] = [];
              else example[prop] = ps.example || null;
            }
            endpoint += JSON.stringify(example, null, 2);
          }
          endpoint += `
\`\`\`

`;
        }
        if (d.responses) {
          endpoint += `**Responses:**
`;
          for (const [code, resp] of Object.entries(d.responses)) {
            const r = resp;
            endpoint += `- \`${code}\`: ${r.description || ""}
`;
          }
          endpoint += `
`;
        }
        endpointsByTag[tag].push(endpoint);
      }
    }
    for (const [tag, endpoints] of Object.entries(endpointsByTag)) {
      content += `## ${tag}

`;
      content += endpoints.join("\n---\n\n");
    }
    content += `
## Documentation

Full OpenAPI 3.0 specification available at:
- /docs/openapi.json
- /api/docs/openapi.json
- /openapi.json
- /.well-known/openapi.json

LLM summary available at:
- /docs/llms.txt

## Token Introspection

For service-to-service authentication, use POST /api/auth/introspect with { "token": "..." }
`;
    res.send(content);
  });
  app.get("/docs/llms-full.txt", (req, res) => {
    res.redirect("/llms-full.txt");
  });
  app.get("/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/.well-known/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/.well-known/jwks.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      keys: [],
      _note: "This service uses HS256 symmetric tokens. Use POST /api/auth/introspect for token validation.",
      introspect_endpoint: "/api/auth/introspect"
    });
  });
  app.post("/api/auth/introspect", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.json({ active: false });
      }
      const payload = verifyToken(token);
      if (!payload) {
        return res.json({ active: false });
      }
      if (payload.type === "agent") {
        const agent = await storage.getAgent(payload.sub);
        if (!agent || !agent.isActive) {
          return res.json({ active: false });
        }
        return res.json({
          active: true,
          type: "agent",
          sub: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities || [],
          token_type: "Bearer",
          iat: payload.iat,
          exp: payload.exp
        });
      }
      const enrichedUser = await storage.getEnrichedUser(payload.sub);
      if (!enrichedUser) {
        return res.json({ active: false });
      }
      res.json({
        active: true,
        type: "user",
        sub: enrichedUser.id,
        email: enrichedUser.email,
        name: enrichedUser.name,
        isSuperAdmin: enrichedUser.isSuperAdmin,
        organizations: enrichedUser.organizations,
        entitlements: enrichedUser.entitlements,
        roles: enrichedUser.roles,
        token_type: "Bearer",
        iat: payload.iat,
        exp: payload.exp
      });
    } catch (error) {
      console.error("Introspection error:", error);
      res.json({ active: false });
    }
  });
  async function handleUserRegister(req, res) {
    try {
      const data = registerSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      const allUsers = await storage.getAllUsers();
      const isFirstUser = allUsers.length === 0;
      const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        name: data.name,
        isSuperAdmin: isFirstUser
      });
      if (isFirstUser) {
        await addUserToSystemOrg(user.id);
      }
      let org = null;
      if (data.orgName) {
        const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        org = await storage.createOrganization({
          name: data.orgName,
          slug: slug || "default"
        });
        await storage.createMembership({
          userId: user.id,
          orgId: org.id,
          role: "admin"
        });
        await storage.createAuditLog({
          userId: user.id,
          orgId: org.id,
          action: "org.created",
          resource: "organization",
          resourceId: org.id,
          metadataJson: { name: org.name, slug: org.slug }
        });
      }
      await storage.createAuditLog({
        userId: user.id,
        orgId: isFirstUser ? SYSTEM_ORG_ID : org?.id,
        action: isFirstUser ? "superadmin.created" : "user.registered",
        resource: "user",
        metadataJson: { email: user.email, orgName: data.orgName, isSuperAdmin: isFirstUser }
      });
      const token = signToken(user);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      res.json({
        user: { id: user.id, email: user.email, name: user.name, isSuperAdmin: isFirstUser },
        organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
        token
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  }
  app.post("/api/auth/user/register", handleUserRegister);
  app.post("/api/auth/register", handleUserRegister);
  async function handleUserLogin(req, res) {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const validPassword = await bcrypt.compare(data.password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      await storage.createAuditLog({
        userId: user.id,
        action: "user.login",
        resource: "user",
        metadataJson: { email: user.email }
      });
      const token = signToken(user);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      const memberships2 = await storage.getMembershipsByUser(user.id);
      const organizations2 = [];
      for (const membership of memberships2) {
        const org = await storage.getOrganization(membership.orgId);
        if (org) {
          organizations2.push({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: membership.role
          });
        }
      }
      res.json({
        user: { id: user.id, email: user.email, name: user.name, organizations: organizations2 },
        token
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  }
  app.post("/api/auth/user/login", handleUserLogin);
  app.post("/api/auth/login", handleUserLogin);
  const mcpSessions = /* @__PURE__ */ new Map();
  const pruneSessions = () => {
    const now = Math.floor(Date.now() / 1e3);
    for (const [h, s] of mcpSessions) if (now > s.session.expiresAt) mcpSessions.delete(h);
  };
  app.post("/api/auth/session", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const ttlSecs = Math.min(Math.max(Number(req.body?.ttlSecs) || 86400, 60), 7 * 86400);
      const scope = typeof req.body?.scope === "string" ? req.body.scope : "viewer";
      const masterKey = crypto2.randomBytes(32);
      const { session, token } = nodeCredentialCrypto.createSession(masterKey, ttlSecs);
      mcpSessions.set(session.tokenHash, { session, userId, scope });
      res.json({ token, sessionId: session.sessionId, expiresAt: session.expiresAt, scope });
    } catch (error) {
      console.error("Session mint error:", error);
      res.status(500).json({ message: "Failed to mint session" });
    }
  });
  app.post("/api/auth/session/resolve", async (req, res) => {
    try {
      pruneSessions();
      const presented = typeof req.body?.token === "string" ? req.body.token : "";
      if (!presented) return res.status(400).json({ message: "token required" });
      const hash = crypto2.createHash("sha256").update(presented).digest("hex");
      const entry = mcpSessions.get(hash);
      if (!entry) return res.status(401).json({ message: "invalid or expired session" });
      try {
        nodeCredentialCrypto.resolveSession(entry.session, presented);
      } catch {
        return res.status(401).json({ message: "invalid or expired session" });
      }
      const user = await storage.getUser(entry.userId);
      if (!user) return res.status(401).json({ message: "session principal no longer exists" });
      const jwt2 = signToken({ id: user.id, email: user.email, name: user.name });
      res.json({ token: jwt2, scope: entry.scope, expiresAt: entry.session.expiresAt });
    } catch (error) {
      console.error("Session resolve error:", error);
      res.status(500).json({ message: "Failed to resolve session" });
    }
  });
  app.delete("/api/auth/session/:sessionId", authMiddleware, async (req, res) => {
    const id = getParam(req.params, "sessionId");
    let revoked = false;
    for (const [h, s] of mcpSessions) if (s.session.sessionId === id) {
      mcpSessions.delete(h);
      revoked = true;
    }
    res.json({ revoked });
  });
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
  });
  app.post("/api/auth/agent/register", async (req, res) => {
    try {
      const data = agentRegisterSchema.parse(req.body);
      const existingAgent = await storage.getAgentByAgentId(data.agentId);
      if (existingAgent) {
        return res.status(400).json({ message: "Agent ID already in use" });
      }
      if (data.orgId) {
        const org = await storage.getOrganization(data.orgId);
        if (!org) {
          return res.status(400).json({ message: "Organization not found" });
        }
      }
      const credentialHash = await bcrypt.hash(data.credential, SALT_ROUNDS);
      const agent = await storage.createAgent({
        agentId: data.agentId,
        credentialHash,
        name: data.name,
        orgId: data.orgId || null,
        capabilities: data.capabilities,
        metadata: data.metadata
      });
      await storage.createAuditLog({
        action: "agent.registered",
        resource: "agent",
        resourceId: agent.id,
        orgId: data.orgId,
        metadataJson: { agentId: agent.agentId }
      });
      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      res.json({
        agent: { id: agent.id, agentId: agent.agentId, name: agent.name, orgId: agent.orgId },
        token
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Agent registration error:", error);
      res.status(500).json({ message: "Agent registration failed" });
    }
  });
  app.post("/api/auth/agent/login", async (req, res) => {
    try {
      const data = agentLoginSchema.parse(req.body);
      const agent = await storage.getAgentByAgentId(data.agentId);
      if (!agent) {
        return res.status(401).json({ message: "Invalid agent ID or credential" });
      }
      if (!agent.isActive) {
        return res.status(401).json({ message: "Agent is inactive" });
      }
      const validCredential = await bcrypt.compare(data.credential, agent.credentialHash);
      if (!validCredential) {
        return res.status(401).json({ message: "Invalid agent ID or credential" });
      }
      await storage.createAuditLog({
        action: "agent.login",
        resource: "agent",
        resourceId: agent.id,
        orgId: agent.orgId,
        metadataJson: { agentId: agent.agentId }
      });
      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        agent: {
          id: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities
        },
        token
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Agent login error:", error);
      res.status(500).json({ message: "Agent login failed" });
    }
  });
  app.get("/api/auth/agent/me", authMiddleware, async (req, res) => {
    if (!req.agent) {
      return res.status(403).json({ message: "This endpoint is for agents only" });
    }
    const agent = await storage.getAgent(req.agent.id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }
    res.json({
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        name: agent.name,
        orgId: agent.orgId,
        capabilities: agent.capabilities,
        metadata: agent.metadata,
        lastSeenAt: agent.lastSeenAt,
        createdAt: agent.createdAt
      }
    });
  });
  app.post("/api/auth/agent/refresh", authMiddleware, async (req, res) => {
    if (!req.agent) {
      return res.status(403).json({ message: "This endpoint is for agents only" });
    }
    try {
      const agent = await storage.getAgent(req.agent.id);
      if (!agent) {
        return res.status(401).json({ message: "Agent not found" });
      }
      if (!agent.isActive) {
        return res.status(401).json({ message: "Agent is inactive" });
      }
      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        agent: { id: agent.id, agentId: agent.agentId, name: agent.name },
        token
      });
    } catch (error) {
      console.error("Agent token refresh error:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });
  app.post("/api/auth/refresh", authMiddleware, async (req, res) => {
    try {
      const isProduction = process.env.NODE_ENV === "production";
      if (req.agent) {
        const agent = await storage.getAgent(req.agent.id);
        if (!agent || !agent.isActive) {
          return res.status(401).json({ message: "Agent not found or inactive" });
        }
        const token2 = signAgentToken(agent);
        res.cookie("token", token2, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1e3
        });
        return res.json({
          type: "agent",
          agent: { id: agent.id, agentId: agent.agentId, name: agent.name },
          token: token2
        });
      }
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const token = signToken(user);
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        type: "user",
        user: { id: user.id, email: user.email, name: user.name },
        token
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });
  app.post("/api/auth/user/refresh", authMiddleware, async (req, res) => {
    if (!req.user) {
      return res.status(403).json({ message: "This endpoint is for users only" });
    }
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const token = signToken(user);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        token
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });
  app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      const emailEnabled = isEmailEnabled();
      if (!emailEnabled) {
        console.log("Password reset requested but email is not configured");
        return res.json({
          message: "Password reset is not available at this time. Please contact your administrator.",
          emailEnabled: false
        });
      }
      const user = await storage.getUserByEmail(data.email);
      if (user) {
        const resetToken = crypto2.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
        await storage.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt
        });
        const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.name);
        await storage.createAuditLog({
          userId: user.id,
          action: "user.forgot_password",
          resource: "user",
          metadataJson: { email: user.email, emailSent, emailEnabled }
        });
      }
      res.json({ message: "If an account exists, a reset link has been sent" });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Request failed" });
    }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }
      if (/* @__PURE__ */ new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "This reset link has expired" });
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await storage.updateUser(resetToken.userId, { passwordHash });
      await storage.markPasswordResetTokenUsed(token);
      await storage.deleteSessionsByUser(resetToken.userId);
      await storage.createAuditLog({
        userId: resetToken.userId,
        action: "user.password_reset",
        resource: "user",
        metadataJson: {}
      });
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
  app.get("/api/users/me", authMiddleware, async (req, res) => {
    const enrichedUser = await storage.getEnrichedUser(req.user.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(enrichedUser);
  });
  app.patch("/api/users/me", authMiddleware, async (req, res) => {
    try {
      const { name, email } = req.body;
      const updates = {};
      if (name) updates.name = name;
      if (email) {
        const existing = await storage.getUserByEmail(email);
        if (existing && existing.id !== req.user.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = email;
      }
      const user = await storage.updateUser(req.user.id, updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.name });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  app.post("/api/users/me/password", authMiddleware, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await storage.updateUser(user.id, { passwordHash });
      await storage.createAuditLog({
        userId: user.id,
        action: "user.password_changed",
        resource: "user"
      });
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
  app.get("/api/dashboard", authMiddleware, async (req, res) => {
    try {
      const memberships2 = await storage.getMembershipsByUser(req.user.id);
      const organizations2 = await Promise.all(
        memberships2.map(async (m) => {
          const org = await storage.getOrganization(m.orgId);
          if (!org) return null;
          const members = await storage.getMembershipsByOrg(m.orgId);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          return {
            ...org,
            memberCount: members.length,
            role: m.role,
            planName: plan?.name
          };
        })
      );
      res.json({
        organizations: organizations2.filter(Boolean),
        recentActivity: []
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });
  app.get("/api/orgs", authMiddleware, async (req, res) => {
    try {
      const memberships2 = await storage.getMembershipsByUser(req.user.id);
      const organizations2 = await Promise.all(
        memberships2.map(async (m) => {
          const org = await storage.getOrganization(m.orgId);
          if (!org) return null;
          const members = await storage.getMembershipsByOrg(m.orgId);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          return {
            ...org,
            memberCount: members.length,
            role: m.role,
            planName: plan?.name
          };
        })
      );
      res.json({ organizations: organizations2.filter(Boolean) });
    } catch (error) {
      console.error("Get orgs error:", error);
      res.status(500).json({ message: "Failed to load organizations" });
    }
  });
  app.post("/api/orgs", authMiddleware, async (req, res) => {
    try {
      const data = createOrgSchema.parse(req.body);
      const existingOrg = await storage.getOrganizationBySlug(data.slug);
      if (existingOrg) {
        return res.status(400).json({ message: "Organization slug already in use" });
      }
      let freePlan = await storage.getPlanByName("free");
      if (!freePlan) {
        freePlan = await storage.createPlan({
          name: "free",
          featuresJson: ["basic_access"],
          limitsJson: { members: 5, api_calls: 1e3 },
          priceCents: 0
        });
      }
      const org = await storage.createOrganization({
        name: data.name,
        slug: data.slug,
        planId: freePlan.id
      });
      await storage.createMembership({
        userId: req.user.id,
        orgId: org.id,
        role: "admin"
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: org.id,
        action: "org.created",
        resource: "organization",
        metadataJson: { name: org.name, slug: org.slug }
      });
      res.json(org);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create org error:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });
  app.get("/api/orgs/:id", authMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganization(getParam(req.params, "id"));
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, org.id);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const members = await storage.getMembershipsByOrg(org.id);
      const entitlements2 = await storage.getEntitlementsByOrg(org.id);
      const plan = org.planId ? await storage.getPlan(org.planId) : null;
      res.json({
        organization: { ...org, plan },
        members,
        entitlements: entitlements2
      });
    } catch (error) {
      console.error("Get org error:", error);
      res.status(500).json({ message: "Failed to load organization" });
    }
  });
  app.post("/api/orgs/:id/members/invite", authMiddleware, async (req, res) => {
    try {
      const data = inviteMemberSchema.parse(req.body);
      const orgId = getParam(req.params, "id");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can invite members" });
      }
      const invitedUser = await storage.getUserByEmail(data.email);
      if (!invitedUser) {
        return res.status(400).json({ message: "User not found. They need to register first." });
      }
      const existingMembership = await storage.getMembershipByUserAndOrg(invitedUser.id, orgId);
      if (existingMembership) {
        return res.status(400).json({ message: "User is already a member" });
      }
      const newMembership = await storage.createMembership({
        userId: invitedUser.id,
        orgId,
        role: data.role
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "member.invited",
        resource: "membership",
        metadataJson: { invitedEmail: data.email, role: data.role }
      });
      res.json(newMembership);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Invite member error:", error);
      res.status(500).json({ message: "Failed to invite member" });
    }
  });
  app.patch("/api/orgs/:orgId/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const memberId = getParam(req.params, "memberId");
      const { role } = req.body;
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can update roles" });
      }
      const targetMembership = await storage.getMembership(memberId);
      if (!targetMembership || targetMembership.orgId !== orgId) {
        return res.status(404).json({ message: "Member not found" });
      }
      const updated = await storage.updateMembership(memberId, { role });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "member.role_updated",
        resource: "membership",
        metadataJson: { memberId, newRole: role }
      });
      res.json(updated);
    } catch (error) {
      console.error("Update member error:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  });
  app.delete("/api/orgs/:orgId/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const memberId = getParam(req.params, "memberId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can remove members" });
      }
      const targetMembership = await storage.getMembership(memberId);
      if (!targetMembership || targetMembership.orgId !== orgId) {
        return res.status(404).json({ message: "Member not found" });
      }
      await storage.deleteMembership(memberId);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "member.removed",
        resource: "membership",
        metadataJson: { memberId }
      });
      res.json({ message: "Member removed" });
    } catch (error) {
      console.error("Remove member error:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });
  app.get("/api/entitlements/:orgId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entitlements2 = await storage.getEntitlementsByOrg(orgId);
      res.json({ entitlements: entitlements2 });
    } catch (error) {
      console.error("Get entitlements error:", error);
      res.status(500).json({ message: "Failed to load entitlements" });
    }
  });
  app.get("/api/license/:orgId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const plan = org.planId ? await storage.getPlan(org.planId) : null;
      res.json({
        organization: org.name,
        plan: plan?.name || "free",
        features: plan?.featuresJson || [],
        limits: plan?.limitsJson || {},
        status: "active"
      });
    } catch (error) {
      console.error("Get license error:", error);
      res.status(500).json({ message: "Failed to load license" });
    }
  });
  app.get("/api/admin/plans", authMiddleware, async (req, res) => {
    try {
      const plans2 = await storage.getAllPlans();
      res.json(plans2);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ message: "Failed to load plans" });
    }
  });
  app.get("/api/orgs/:orgId/projects", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const projects2 = await storage.getProjectsByOrg(orgId);
      res.json({ projects: projects2 });
    } catch (error) {
      console.error("Get projects error:", error);
      res.status(500).json({ message: "Failed to load projects" });
    }
  });
  app.post("/api/orgs/:orgId/projects", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const data = createProjectSchema.parse(req.body);
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const project = await storage.createProject({
        orgId,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        status: "active"
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "project.created",
        resource: "project",
        resourceId: project.id,
        metadataJson: { name: project.name, slug: project.slug }
      });
      res.json(project);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create project error:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });
  app.get("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const applications2 = await storage.getApplicationsByProject(project.id);
      const services2 = await storage.getServicesByProject(project.id);
      const entitlements2 = await storage.getScopedEntitlementsByScope("project", project.id);
      res.json({ project, applications: applications2, services: services2, entitlements: entitlements2 });
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ message: "Failed to load project" });
    }
  });
  app.patch("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const { name, description, status } = req.body;
      const updated = await storage.updateProject(project.id, { name, description, status });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "project.updated",
        resource: "project",
        resourceId: project.id
      });
      res.json(updated);
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });
  app.delete("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete projects" });
      }
      await storage.deleteProject(project.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "project.deleted",
        resource: "project",
        resourceId: project.id
      });
      res.json({ message: "Project deleted" });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });
  app.get("/api/projects/:projectId/applications", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const applications2 = await storage.getApplicationsByProject(project.id);
      res.json({ applications: applications2 });
    } catch (error) {
      console.error("Get applications error:", error);
      res.status(500).json({ message: "Failed to load applications" });
    }
  });
  app.post("/api/projects/:projectId/applications", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const data = createApplicationSchema.parse(req.body);
      const application = await storage.createApplication({
        projectId: project.id,
        orgId: project.orgId,
        name: data.name,
        slug: data.slug,
        environment: data.environment,
        appType: data.appType,
        repoUrl: data.repoUrl || null
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "application.created",
        resource: "application",
        resourceId: application.id,
        metadataJson: { name: application.name, projectId: project.id }
      });
      res.json(application);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create application error:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });
  app.get("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const services2 = await storage.getServicesByApplication(app2.id);
      const entitlements2 = await storage.getScopedEntitlementsByScope("application", app2.id);
      res.json({ application: app2, services: services2, entitlements: entitlements2 });
    } catch (error) {
      console.error("Get application error:", error);
      res.status(500).json({ message: "Failed to load application" });
    }
  });
  app.patch("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const { name, environment, appType, repoUrl } = req.body;
      const updated = await storage.updateApplication(app2.id, { name, environment, appType, repoUrl });
      res.json(updated);
    } catch (error) {
      console.error("Update application error:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });
  app.delete("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete applications" });
      }
      await storage.deleteApplication(app2.id);
      res.json({ message: "Application deleted" });
    } catch (error) {
      console.error("Delete application error:", error);
      res.status(500).json({ message: "Failed to delete application" });
    }
  });
  app.get("/api/projects/:projectId/services", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const services2 = await storage.getServicesByProject(project.id);
      res.json({ services: services2 });
    } catch (error) {
      console.error("Get services error:", error);
      res.status(500).json({ message: "Failed to load services" });
    }
  });
  app.post("/api/projects/:projectId/services", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const data = createServiceSchema.parse(req.body);
      const service = await storage.createService({
        projectId: project.id,
        orgId: project.orgId,
        name: data.name,
        serviceType: data.serviceType,
        provider: data.provider || null,
        endpointUrl: data.endpointUrl || null,
        externalId: data.externalId || null,
        status: "active"
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "service.created",
        resource: "service",
        resourceId: service.id,
        metadataJson: { name: service.name, type: service.serviceType, projectId: project.id }
      });
      res.json(service);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create service error:", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });
  app.get("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, service.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entitlements2 = await storage.getScopedEntitlementsByScope("service", service.id);
      res.json({ service, entitlements: entitlements2 });
    } catch (error) {
      console.error("Get service error:", error);
      res.status(500).json({ message: "Failed to load service" });
    }
  });
  app.patch("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, service.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const { name, serviceType, provider, endpointUrl, externalId, status } = req.body;
      const updated = await storage.updateService(service.id, { name, serviceType, provider, endpointUrl, externalId, status });
      res.json(updated);
    } catch (error) {
      console.error("Update service error:", error);
      res.status(500).json({ message: "Failed to update service" });
    }
  });
  app.delete("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, service.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete services" });
      }
      await storage.deleteService(service.id);
      res.json({ message: "Service deleted" });
    } catch (error) {
      console.error("Delete service error:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });
  app.post("/api/applications/:appId/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!app2 || !service) {
        return res.status(404).json({ message: "Application or service not found" });
      }
      if (app2.orgId !== service.orgId) {
        return res.status(400).json({ message: "Application and service must belong to the same organization" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const link = await storage.linkApplicationService(app2.id, service.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: app2.orgId,
        action: "application.service_linked",
        resource: "application_service",
        metadataJson: { applicationId: app2.id, serviceId: service.id }
      });
      res.json(link);
    } catch (error) {
      console.error("Link service error:", error);
      res.status(500).json({ message: "Failed to link service" });
    }
  });
  app.delete("/api/applications/:appId/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      await storage.unlinkApplicationService(getParam(req.params, "appId"), getParam(req.params, "serviceId"));
      res.json({ message: "Service unlinked" });
    } catch (error) {
      console.error("Unlink service error:", error);
      res.status(500).json({ message: "Failed to unlink service" });
    }
  });
  app.get("/api/scoped-entitlements/:scopeType/:scopeId", authMiddleware, async (req, res) => {
    try {
      const scopeType = getParam(req.params, "scopeType");
      const scopeId = getParam(req.params, "scopeId");
      const validScopeType = scopeTypeEnum.parse(scopeType);
      let orgId = null;
      switch (validScopeType) {
        case "org":
          orgId = scopeId;
          break;
        case "project": {
          const project = await storage.getProject(scopeId);
          if (!project) return res.status(404).json({ message: "Project not found" });
          orgId = project.orgId;
          break;
        }
        case "application": {
          const app2 = await storage.getApplication(scopeId);
          if (!app2) return res.status(404).json({ message: "Application not found" });
          orgId = app2.orgId;
          break;
        }
        case "service": {
          const service = await storage.getService(scopeId);
          if (!service) return res.status(404).json({ message: "Service not found" });
          orgId = service.orgId;
          break;
        }
      }
      if (!orgId) {
        return res.status(400).json({ message: "Invalid scope" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entitlements2 = await storage.getScopedEntitlementsByScope(validScopeType, scopeId);
      res.json({ entitlements: entitlements2 });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Invalid scope type" });
      }
      console.error("Get scoped entitlements error:", error);
      res.status(500).json({ message: "Failed to load entitlements" });
    }
  });
  app.post("/api/scoped-entitlements", authMiddleware, async (req, res) => {
    try {
      const data = createScopedEntitlementSchema.parse(req.body);
      let orgId = null;
      switch (data.scopeType) {
        case "org":
          orgId = data.scopeId;
          break;
        case "project": {
          const project = await storage.getProject(data.scopeId);
          if (!project) return res.status(404).json({ message: "Project not found" });
          orgId = project.orgId;
          break;
        }
        case "application": {
          const app2 = await storage.getApplication(data.scopeId);
          if (!app2) return res.status(404).json({ message: "Application not found" });
          orgId = app2.orgId;
          break;
        }
        case "service": {
          const service = await storage.getService(data.scopeId);
          if (!service) return res.status(404).json({ message: "Service not found" });
          orgId = service.orgId;
          break;
        }
      }
      if (!orgId) {
        return res.status(400).json({ message: "Invalid scope" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }
      const entitlement = await storage.createScopedEntitlement({
        orgId,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        featureKey: data.featureKey,
        quota: data.quota ?? 0,
        enabled: data.enabled,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "entitlement.created",
        resource: "scoped_entitlement",
        resourceId: entitlement.id,
        metadataJson: { scopeType: data.scopeType, scopeId: data.scopeId, featureKey: data.featureKey }
      });
      res.json(entitlement);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to create entitlement" });
    }
  });
  app.patch("/api/scoped-entitlements/:id", authMiddleware, async (req, res) => {
    try {
      const entitlement = await storage.getScopedEntitlement(getParam(req.params, "id"));
      if (!entitlement) {
        return res.status(404).json({ message: "Entitlement not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, entitlement.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }
      const { quota, consumed, enabled, expiresAt } = req.body;
      const updated = await storage.updateScopedEntitlement(entitlement.id, {
        quota,
        consumed,
        enabled,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });
      res.json(updated);
    } catch (error) {
      console.error("Update scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to update entitlement" });
    }
  });
  app.delete("/api/scoped-entitlements/:id", authMiddleware, async (req, res) => {
    try {
      const entitlement = await storage.getScopedEntitlement(getParam(req.params, "id"));
      if (!entitlement) {
        return res.status(404).json({ message: "Entitlement not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, entitlement.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }
      await storage.deleteScopedEntitlement(entitlement.id);
      res.json({ message: "Entitlement deleted" });
    } catch (error) {
      console.error("Delete scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to delete entitlement" });
    }
  });
  function generateApiKeyPrefix() {
    return crypto2.randomBytes(4).toString("hex");
  }
  function generateApiKey() {
    const prefix = generateApiKeyPrefix();
    const suffix = crypto2.randomBytes(28).toString("hex");
    return { key: `sk_${prefix}${suffix}`, prefix: `sk_${prefix}` };
  }
  async function hashApiKey(key) {
    return crypto2.createHash("sha256").update(key).digest("hex");
  }
  app.post("/api/api-keys", authMiddleware, async (req, res) => {
    try {
      const data = createApiKeySchema.parse(req.body);
      if (data.orgId) {
        const membership = await storage.getMembershipByUserAndOrg(req.user.id, data.orgId);
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({
            message: "Only organization admins can create API keys scoped to an organization"
          });
        }
      }
      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);
      const apiKey = await storage.createApiKey({
        name: data.name,
        keyHash,
        keyPrefix: prefix,
        orgId: data.orgId || null,
        createdBy: req.user.id,
        scopes: data.scopes || [],
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: data.orgId || null,
        action: "api_key.created",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: data.name, keyPrefix: prefix, scopes: data.scopes }
      });
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        key,
        // Only returned on creation
        keyPrefix: apiKey.keyPrefix,
        orgId: apiKey.orgId,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        _warning: "Store this key securely. It will not be shown again."
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create API key error:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });
  app.get("/api/api-keys", authMiddleware, async (req, res) => {
    try {
      const apiKeys2 = await storage.getApiKeysByUser(req.user.id);
      res.json(apiKeys2.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        orgId: k.orgId,
        scopes: k.scopes,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt
      })));
    } catch (error) {
      console.error("List API keys error:", error);
      res.status(500).json({ message: "Failed to list API keys" });
    }
  });
  app.get("/api/api-keys/:id", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (apiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        orgId: apiKey.orgId,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        revokedAt: apiKey.revokedAt,
        createdAt: apiKey.createdAt
      });
    } catch (error) {
      console.error("Get API key error:", error);
      res.status(500).json({ message: "Failed to get API key" });
    }
  });
  app.post("/api/api-keys/:id/revoke", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (apiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (apiKey.revokedAt) {
        return res.status(400).json({ message: "API key is already revoked" });
      }
      await storage.revokeApiKey(apiKey.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: apiKey.orgId,
        action: "api_key.revoked",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: apiKey.name, keyPrefix: apiKey.keyPrefix }
      });
      res.json({ message: "API key revoked successfully" });
    } catch (error) {
      console.error("Revoke API key error:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });
  app.post("/api/api-keys/:id/rotate", authMiddleware, async (req, res) => {
    try {
      const oldApiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!oldApiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (oldApiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (oldApiKey.revokedAt) {
        return res.status(400).json({ message: "Cannot rotate a revoked API key" });
      }
      await storage.revokeApiKey(oldApiKey.id);
      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);
      const newApiKey = await storage.createApiKey({
        name: oldApiKey.name,
        keyHash,
        keyPrefix: prefix,
        orgId: oldApiKey.orgId,
        createdBy: req.user.id,
        scopes: oldApiKey.scopes || [],
        expiresAt: oldApiKey.expiresAt
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: oldApiKey.orgId,
        action: "api_key.rotated",
        resource: "api_key",
        resourceId: newApiKey.id,
        metadataJson: {
          oldKeyId: oldApiKey.id,
          newKeyPrefix: prefix,
          name: oldApiKey.name
        }
      });
      res.json({
        id: newApiKey.id,
        name: newApiKey.name,
        key,
        // Only returned on creation
        keyPrefix: newApiKey.keyPrefix,
        orgId: newApiKey.orgId,
        scopes: newApiKey.scopes,
        expiresAt: newApiKey.expiresAt,
        createdAt: newApiKey.createdAt,
        _warning: "Store this key securely. It will not be shown again.",
        rotatedFrom: oldApiKey.id
      });
    } catch (error) {
      console.error("Rotate API key error:", error);
      res.status(500).json({ message: "Failed to rotate API key" });
    }
  });
  app.delete("/api/api-keys/:id", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (apiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteApiKey(apiKey.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: apiKey.orgId,
        action: "api_key.deleted",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: apiKey.name, keyPrefix: apiKey.keyPrefix }
      });
      res.json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error("Delete API key error:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });
  app.get("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });
  app.get("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}`;
    app._router.handle(req, res, next);
  });
  app.delete("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}`;
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/keys/:id/revoke", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}/revoke`;
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/keys/:id/rotate", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}/rotate`;
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/verify-api-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string") {
        return res.json({ valid: false, error: "API key is required" });
      }
      const keyHash = await hashApiKey(apiKey);
      const storedKey = await storage.getApiKeyByHash(keyHash);
      if (!storedKey) {
        return res.json({ valid: false, error: "Invalid API key" });
      }
      if (storedKey.revokedAt) {
        return res.json({ valid: false, error: "API key has been revoked" });
      }
      if (storedKey.expiresAt && /* @__PURE__ */ new Date() > storedKey.expiresAt) {
        return res.json({ valid: false, error: "API key has expired" });
      }
      await storage.updateApiKeyLastUsed(storedKey.id);
      const creator = await storage.getEnrichedUser(storedKey.createdBy);
      res.json({
        valid: true,
        keyId: storedKey.id,
        name: storedKey.name,
        orgId: storedKey.orgId,
        scopes: storedKey.scopes,
        createdBy: storedKey.createdBy,
        creator: creator ? {
          id: creator.id,
          email: creator.email,
          name: creator.name,
          isSuperAdmin: creator.isSuperAdmin,
          organizations: creator.organizations,
          entitlements: creator.entitlements,
          roles: creator.roles
        } : null
      });
    } catch (error) {
      console.error("Verify API key error:", error);
      res.json({ valid: false, error: "Verification failed" });
    }
  });
  app.get("/api/admin/users", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
      })));
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app.patch("/api/admin/users/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updateUserAdminSchema.parse(req.body);
      const targetUser = await storage.getUser(getParam(req.params, "id"));
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (getParam(req.params, "id") === req.user.id && data.isSuperAdmin === false) {
        return res.status(400).json({ message: "Cannot remove super admin status from yourself" });
      }
      const updates = {};
      if (data.name !== void 0) updates.name = data.name;
      if (data.email !== void 0) {
        const existing = await storage.getUserByEmail(data.email);
        if (existing && existing.id !== getParam(req.params, "id")) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = data.email;
      }
      if (data.isSuperAdmin !== void 0) updates.isSuperAdmin = data.isSuperAdmin;
      const user = await storage.updateUser(getParam(req.params, "id"), updates);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user.updated",
        resource: "user",
        resourceId: getParam(req.params, "id"),
        metadataJson: updates
      });
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  app.delete("/api/admin/users/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const targetUser = await storage.getUser(getParam(req.params, "id"));
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (getParam(req.params, "id") === req.user.id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }
      await storage.deleteSessionsByUser(getParam(req.params, "id"));
      await storage.deleteUser(getParam(req.params, "id"));
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user.deleted",
        resource: "user",
        resourceId: getParam(req.params, "id"),
        metadataJson: { email: targetUser.email }
      });
      res.json({ message: "User deleted" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });
  app.get("/api/admin/orgs", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const orgsWithDetails = await Promise.all(
        allOrgs.map(async (org) => {
          const members = await storage.getMembershipsByOrg(org.id);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          return {
            ...org,
            memberCount: members.length,
            planName: plan?.name
          };
        })
      );
      res.json(orgsWithDetails);
    } catch (error) {
      console.error("Get all orgs error:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });
  app.patch("/api/admin/orgs/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updateOrgAdminSchema.parse(req.body);
      const org = await storage.getOrganization(getParam(req.params, "id"));
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const updates = {};
      if (data.name !== void 0) updates.name = data.name;
      if (data.slug !== void 0) {
        const existing = await storage.getOrganizationBySlug(data.slug);
        if (existing && existing.id !== getParam(req.params, "id")) {
          return res.status(400).json({ message: "Slug already in use" });
        }
        updates.slug = data.slug;
      }
      if (data.planId !== void 0) updates.planId = data.planId;
      const updated = await storage.updateOrganization(getParam(req.params, "id"), updates);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.org.updated",
        resource: "organization",
        resourceId: getParam(req.params, "id"),
        metadataJson: updates
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update org error:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });
  app.delete("/api/admin/orgs/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const org = await storage.getOrganization(getParam(req.params, "id"));
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      await storage.deleteOrganization(getParam(req.params, "id"));
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.org.deleted",
        resource: "organization",
        resourceId: getParam(req.params, "id"),
        metadataJson: { name: org.name, slug: org.slug }
      });
      res.json({ message: "Organization deleted" });
    } catch (error) {
      console.error("Delete org error:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });
  app.get("/api/admin/audit-logs", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allLogs = await storage.getAllAuditLogs();
      res.json(allLogs);
    } catch (error) {
      console.error("Get all audit logs error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });
  app.post("/api/admin/plans", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = createPlanAdminSchema.parse(req.body);
      const existingPlan = await storage.getPlanByName(data.name);
      if (existingPlan) {
        return res.status(400).json({ message: "Plan with this name already exists" });
      }
      const plan = await storage.createPlan({
        name: data.name,
        featuresJson: data.featuresJson || [],
        limitsJson: data.limitsJson || {},
        priceCents: data.priceCents || 0
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.plan.created",
        resource: "plan",
        resourceId: plan.id,
        metadataJson: { name: data.name }
      });
      res.json(plan);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create plan error:", error);
      res.status(500).json({ message: "Failed to create plan" });
    }
  });
  app.patch("/api/admin/plans/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updatePlanAdminSchema.parse(req.body);
      const plan = await storage.getPlan(getParam(req.params, "id"));
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (data.name && data.name !== plan.name) {
        const existingPlan = await storage.getPlanByName(data.name);
        if (existingPlan) {
          return res.status(400).json({ message: "Plan with this name already exists" });
        }
      }
      const updated = await storage.updatePlan(getParam(req.params, "id"), {
        name: data.name,
        featuresJson: data.featuresJson,
        limitsJson: data.limitsJson,
        priceCents: data.priceCents
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.plan.updated",
        resource: "plan",
        resourceId: getParam(req.params, "id"),
        metadataJson: { name: data.name }
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update plan error:", error);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });
  app.get("/api/admin/users/:userId/entitlements", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const entitlements2 = await storage.getUserEntitlements(userId);
      res.json({ entitlements: entitlements2 });
    } catch (error) {
      console.error("Get user entitlements error:", error);
      res.status(500).json({ message: "Failed to load user entitlements" });
    }
  });
  app.post("/api/admin/users/:userId/entitlements", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const { entitlementKey } = req.body;
      if (!entitlementKey || typeof entitlementKey !== "string") {
        return res.status(400).json({ message: "entitlementKey is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const existingEntitlements = await storage.getUserEntitlementKeys(userId);
      if (existingEntitlements.includes(entitlementKey)) {
        return res.status(400).json({ message: "User already has this entitlement" });
      }
      const entitlement = await storage.createUserEntitlement({
        userId,
        entitlementKey,
        grantedBy: req.user.id
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_entitlement.granted",
        resource: "user_entitlement",
        resourceId: entitlement.id,
        metadataJson: { targetUserId: userId, entitlementKey }
      });
      res.json(entitlement);
    } catch (error) {
      console.error("Grant user entitlement error:", error);
      res.status(500).json({ message: "Failed to grant entitlement" });
    }
  });
  app.delete("/api/admin/users/:userId/entitlements/:entitlementKey", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const entitlementKey = getParam(req.params, "entitlementKey");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.deleteUserEntitlementByKey(userId, entitlementKey);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_entitlement.revoked",
        resource: "user_entitlement",
        metadataJson: { targetUserId: userId, entitlementKey }
      });
      res.json({ message: "Entitlement revoked" });
    } catch (error) {
      console.error("Revoke user entitlement error:", error);
      res.status(500).json({ message: "Failed to revoke entitlement" });
    }
  });
  app.get("/api/admin/users/:userId/roles", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const roles = await storage.getUserRoles(userId);
      res.json({ roles });
    } catch (error) {
      console.error("Get user roles error:", error);
      res.status(500).json({ message: "Failed to load user roles" });
    }
  });
  app.post("/api/admin/users/:userId/roles", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const { roleKey } = req.body;
      if (!roleKey || typeof roleKey !== "string") {
        return res.status(400).json({ message: "roleKey is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const existingRoles = await storage.getUserRoleKeys(userId);
      if (existingRoles.includes(roleKey)) {
        return res.status(400).json({ message: "User already has this role" });
      }
      const role = await storage.createUserRole({
        userId,
        roleKey,
        grantedBy: req.user.id
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_role.granted",
        resource: "user_role",
        resourceId: role.id,
        metadataJson: { targetUserId: userId, roleKey }
      });
      res.json(role);
    } catch (error) {
      console.error("Grant user role error:", error);
      res.status(500).json({ message: "Failed to grant role" });
    }
  });
  app.delete("/api/admin/users/:userId/roles/:roleKey", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const roleKey = getParam(req.params, "roleKey");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.deleteUserRoleByKey(userId, roleKey);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_role.revoked",
        resource: "user_role",
        metadataJson: { targetUserId: userId, roleKey }
      });
      res.json({ message: "Role revoked" });
    } catch (error) {
      console.error("Revoke user role error:", error);
      res.status(500).json({ message: "Failed to revoke role" });
    }
  });
  app.post("/api/credentials", authMiddleware, async (req, res) => {
    try {
      const data = createUserCredentialSchema.parse(req.body);
      const encryptedCredential = encryptSecret(data.apiKey);
      const prefix = data.apiKey.slice(0, Math.min(8, data.apiKey.length));
      const orgId = req.headers["x-org-id"];
      const credential = await storage.createUserCredential({
        userId: req.user.id,
        orgId: orgId || null,
        provider: data.provider,
        name: data.name,
        credentialEncrypted: encryptedCredential,
        credentialPrefix: prefix,
        isOrgWide: data.isOrgWide,
        metadata: data.metadata
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: orgId || null,
        action: "credential.created",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: data.provider, name: data.name }
      });
      res.json({
        id: credential.id,
        provider: credential.provider,
        name: credential.name,
        credentialPrefix: credential.credentialPrefix,
        isOrgWide: credential.isOrgWide,
        createdAt: credential.createdAt
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create credential error:", error);
      res.status(500).json({ message: "Failed to store credential" });
    }
  });
  app.get("/api/credentials", authMiddleware, async (req, res) => {
    try {
      const credentials = await storage.getUserCredentialsByUser(req.user.id);
      res.json(credentials.map((c) => ({
        id: c.id,
        provider: c.provider,
        name: c.name,
        credentialPrefix: c.credentialPrefix,
        isOrgWide: c.isOrgWide,
        lastUsedAt: c.lastUsedAt,
        createdAt: c.createdAt
      })));
    } catch (error) {
      console.error("List credentials error:", error);
      res.status(500).json({ message: "Failed to list credentials" });
    }
  });
  app.delete("/api/credentials/:id", authMiddleware, async (req, res) => {
    try {
      const credential = await storage.getUserCredential(getParam(req.params, "id"));
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      if (credential.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteUserCredential(credential.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: credential.orgId,
        action: "credential.deleted",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: credential.provider, name: credential.name }
      });
      res.json({ message: "Credential deleted successfully" });
    } catch (error) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });
  app.get("/api/debug/credentials", async (req, res) => {
    if (process.env.NODE_ENV !== "development" && process.env.IDENTITY_USE_MEMORY_DB !== "true") {
      return res.status(404).json({ message: "Not found" });
    }
    const superAdminCreds = await storage.getUserCredentialsByUser("650e8400-e29b-41d4-a716-446655440000");
    const orgCreds = await storage.getUserCredentialsByOrg("550e8400-e29b-41d4-a716-446655440000");
    const mapCred = (c) => ({
      id: c.id,
      userId: c.userId,
      orgId: c.orgId,
      provider: c.provider,
      isOrgWide: c.isOrgWide,
      prefix: c.credentialPrefix
    });
    res.json({
      superAdminCredentials: superAdminCreds.map(mapCred),
      orgCredentials: orgCreds.map(mapCred)
    });
  });
  app.get("/api/internal/credentials/:userId/:provider", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ message: "Invalid token" });
      }
      const serviceId = req.headers["x-service-id"];
      const isService = serviceId && ["integrations", "assistants", "runtime"].includes(serviceId);
      if (!isService && payload.sub !== getParam(req.params, "userId")) {
        return res.status(403).json({ message: "Access denied" });
      }
      const userId = getParam(req.params, "userId");
      const provider = getParam(req.params, "provider");
      const orgId = req.headers["x-org-id"];
      console.log(`[identity] Internal credential lookup - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
      const credential = await storage.getCredentialForUserOrOrg(userId, orgId || null, provider);
      console.log(`[identity] Credential lookup result: ${credential ? `found (id: ${credential.id})` : "not found"}`);
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      const apiKey = decryptSecret(credential.credentialEncrypted);
      await storage.updateUserCredentialLastUsed(credential.id);
      const isProxy = credential.isOrgWide && credential.userId !== userId;
      res.json({
        apiKey,
        metadata: credential.metadata,
        // Proxy info for usage tracking
        credentialId: credential.id,
        isProxy,
        ownerId: credential.userId,
        // Who owns this credential
        isOrgWide: credential.isOrgWide
      });
    } catch (error) {
      console.error("Internal credential lookup error:", error);
      res.status(500).json({ message: "Failed to retrieve credential" });
    }
  });
  app.post("/api/internal/credentials/oauth", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const {
        userId,
        orgId,
        provider,
        accessToken,
        refreshToken,
        expiresAt,
        oauthUserId,
        oauthUserEmail,
        oauthUserName
      } = req.body;
      if (!userId || !provider || !accessToken) {
        return res.status(400).json({ message: "Missing required fields: userId, provider, accessToken" });
      }
      const encryptedAccessToken = encryptSecret(accessToken);
      const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null;
      const prefix = accessToken.slice(0, Math.min(8, accessToken.length));
      const existingCredential = await storage.getCredentialForUserOrOrg(userId, orgId || null, provider);
      let credential;
      if (existingCredential) {
        credential = await storage.updateUserCredential(existingCredential.id, {
          credentialEncrypted: encryptedAccessToken,
          credentialPrefix: prefix,
          credentialType: "oauth_token",
          refreshTokenEncrypted: encryptedRefreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          oauthUserId: oauthUserId || null,
          oauthUserEmail: oauthUserEmail || null,
          oauthUserName: oauthUserName || null
        });
        credential = { ...existingCredential, ...credential };
      } else {
        credential = await storage.createUserCredential({
          userId,
          orgId: orgId || null,
          provider,
          name: `${provider} OAuth`,
          credentialEncrypted: encryptedAccessToken,
          credentialPrefix: prefix,
          isOrgWide: false,
          metadata: {},
          credentialType: "oauth_token",
          refreshTokenEncrypted: encryptedRefreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          oauthUserId: oauthUserId || null,
          oauthUserEmail: oauthUserEmail || null,
          oauthUserName: oauthUserName || null
        });
      }
      await storage.createAuditLog({
        userId,
        orgId: orgId || null,
        action: existingCredential ? "oauth.token_refreshed" : "oauth.token_stored",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider, oauthUserId, oauthUserEmail }
      });
      res.json({
        credentialId: credential.id,
        provider: credential.provider,
        expiresAt: expiresAt || null
      });
    } catch (error) {
      console.error("Store OAuth token error:", error);
      res.status(500).json({ message: "Failed to store OAuth token" });
    }
  });
  app.get("/api/internal/credentials/by-id/:credentialId", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const credential = await storage.getUserCredential(getParam(req.params, "credentialId"));
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      const apiKey = decryptSecret(credential.credentialEncrypted);
      res.json({
        apiKey,
        metadata: credential.metadata,
        credentialId: credential.id,
        isProxy: false,
        ownerId: credential.userId,
        isOrgWide: credential.isOrgWide
      });
    } catch (error) {
      console.error("Get credential by ID error:", error);
      res.status(500).json({ message: "Failed to retrieve credential" });
    }
  });
  app.delete("/api/internal/credentials/:credentialId", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      const requestUserId = req.headers["x-user-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const credential = await storage.getUserCredential(getParam(req.params, "credentialId"));
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      if (requestUserId && credential.userId !== requestUserId) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteUserCredential(credential.id);
      await storage.createAuditLog({
        userId: requestUserId || credential.userId,
        orgId: credential.orgId,
        action: "credential.deleted",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: credential.provider, name: credential.name }
      });
      res.json({ success: true, message: "Credential deleted" });
    } catch (error) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });
  app.get("/api/entities/:id", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      if (entity.orgId && req.user && !req.user.isSuperAdmin) {
        const membership = await storage.getMembershipByUserAndOrg(req.user.id, entity.orgId);
        if (!membership) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      res.json(entity);
    } catch (error) {
      console.error("Get entity error:", error);
      res.status(500).json({ message: "Failed to fetch entity" });
    }
  });
  app.get("/api/entities", authMiddleware, async (req, res) => {
    try {
      const { type, orgId, slug, status } = req.query;
      let allowedOrgIds;
      if (req.user && !req.user.isSuperAdmin) {
        const memberships2 = await storage.getMembershipsByUser(req.user.id);
        allowedOrgIds = memberships2.map((m) => m.orgId);
      }
      const entities2 = await storage.listEntities({
        type,
        orgId,
        slug,
        status,
        allowedOrgIds
      });
      res.json({ entities: entities2, count: entities2.length });
    } catch (error) {
      console.error("List entities error:", error);
      res.status(500).json({ message: "Failed to list entities" });
    }
  });
  app.post("/api/entities/resolve", authMiddleware, async (req, res) => {
    try {
      const { address, orgId } = req.body;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Address is required" });
      }
      const contextOrgId = orgId || req.headers["x-org-id"];
      const result = await storage.resolveEntityAddress(address, contextOrgId);
      if (!result || result.length === 0) {
        return res.status(404).json({
          message: "Entity not found",
          address,
          suggestions: await storage.getSimilarEntities(address, contextOrgId)
        });
      }
      res.json({
        resolved: result.length === 1 ? result[0] : result,
        count: result.length,
        address
      });
    } catch (error) {
      console.error("Resolve entity error:", error);
      res.status(500).json({ message: "Failed to resolve entity" });
    }
  });
  app.post("/api/entities", authMiddleware, async (req, res) => {
    try {
      const { type, slug, displayName, instanceId, orgId, networkId, capabilities, tags, sourceTable, sourceId, metadata } = req.body;
      if (!type || !slug || !displayName) {
        return res.status(400).json({ message: "type, slug, and displayName are required" });
      }
      const existing = await storage.getEntityBySlugOrgInstance(slug, orgId, instanceId);
      if (existing) {
        return res.status(409).json({
          message: "Entity with this slug already exists",
          existingId: existing.id
        });
      }
      const entity = await storage.createEntity({
        type,
        slug,
        displayName,
        instanceId,
        orgId,
        networkId,
        capabilities: capabilities || [],
        tags: tags || [],
        sourceTable,
        sourceId,
        metadata: metadata || {},
        status: "active"
      });
      await storage.createEntityAlias({
        entityId: entity.id,
        aliasType: "slug",
        aliasValue: slug,
        orgId,
        priority: 100
      });
      if (type && slug) {
        await storage.createEntityAlias({
          entityId: entity.id,
          aliasType: "qualified",
          aliasValue: `${type}:${slug}`,
          orgId,
          priority: 90
        });
      }
      res.status(201).json(entity);
    } catch (error) {
      console.error("Create entity error:", error);
      res.status(500).json({ message: "Failed to create entity" });
    }
  });
  app.patch("/api/entities/:id", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      if (entity.orgId && req.user && !req.user.isSuperAdmin) {
        const membership = await storage.getMembershipByUserAndOrg(req.user.id, entity.orgId);
        if (!membership || membership.role === "viewer") {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const { displayName, capabilities, tags, status, metadata } = req.body;
      const updates = {};
      if (displayName !== void 0) updates.displayName = displayName;
      if (capabilities !== void 0) updates.capabilities = capabilities;
      if (tags !== void 0) updates.tags = tags;
      if (status !== void 0) updates.status = status;
      if (metadata !== void 0) updates.metadata = metadata;
      const updated = await storage.updateEntity(getParam(req.params, "id"), updates);
      res.json(updated);
    } catch (error) {
      console.error("Update entity error:", error);
      res.status(500).json({ message: "Failed to update entity" });
    }
  });
  app.post("/api/entities/:id/bind", authMiddleware, async (req, res) => {
    try {
      const { nodeId } = req.body;
      if (!nodeId) {
        return res.status(400).json({ message: "nodeId is required" });
      }
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      const updated = await storage.bindEntityToNode(getParam(req.params, "id"), nodeId);
      res.json(updated);
    } catch (error) {
      console.error("Bind entity error:", error);
      res.status(500).json({ message: "Failed to bind entity" });
    }
  });
  app.post("/api/entities/:id/unbind", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      const updated = await storage.unbindEntityFromNode(getParam(req.params, "id"));
      res.json(updated);
    } catch (error) {
      console.error("Unbind entity error:", error);
      res.status(500).json({ message: "Failed to unbind entity" });
    }
  });
  app.get("/api/entities/by-node/:nodeId", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntityByNodeId(getParam(req.params, "nodeId"));
      if (!entity) {
        return res.status(404).json({ message: "No entity bound to this node" });
      }
      res.json(entity);
    } catch (error) {
      console.error("Get entity by node error:", error);
      res.status(500).json({ message: "Failed to fetch entity" });
    }
  });
  app.post("/api/entities/sync", authMiddleware, superAdminMiddleware, async (req, res) => {
    try {
      const { source } = req.body;
      const results = { users: 0, agents: 0 };
      if (source === "users" || source === "all") {
        const users2 = await storage.getAllUsers();
        for (const user of users2) {
          const existing = await storage.getEntityBySourceId("users", user.id);
          if (!existing) {
            await storage.createEntity({
              type: "user",
              slug: user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
              displayName: user.name,
              sourceTable: "users",
              sourceId: user.id,
              status: "active",
              capabilities: [],
              tags: [],
              metadata: { email: user.email }
            });
            results.users++;
          }
        }
      }
      if (source === "agents" || source === "all") {
        const agents2 = await storage.getAllAgents();
        for (const agent of agents2) {
          const existing = await storage.getEntityBySourceId("agents", agent.id);
          if (!existing) {
            const [agentType, agentKey] = agent.agentId.split(":");
            await storage.createEntity({
              type: agentType === "assistant" ? "assistant" : "service",
              slug: agentKey || agent.agentId,
              displayName: agent.name,
              orgId: agent.orgId || void 0,
              sourceTable: "agents",
              sourceId: agent.id,
              status: agent.isActive ? "active" : "inactive",
              capabilities: agent.capabilities || [],
              tags: [],
              metadata: { agentId: agent.agentId }
            });
            results.agents++;
          }
        }
      }
      res.json({
        message: "Sync completed",
        created: results
      });
    } catch (error) {
      console.error("Sync entities error:", error);
      res.status(500).json({ message: "Failed to sync entities" });
    }
  });
  app.get("/symbia-namespace", async (_req, res) => {
    res.json({
      namespace: "identity",
      version: "1.0.0",
      description: "Authentication, users, and organizations",
      properties: {
        "users.count": { type: "number", description: "Total user count" },
        "orgs.count": { type: "number", description: "Total organization count" },
        "agents.count": { type: "number", description: "Total agent count" },
        "entities.count": { type: "number", description: "Total entity count" }
      }
    });
  });
  return httpServer;
}

// ../../identity/server/src/service.ts
async function bootstrap() {
  await initSystemBootstrap();
  if (process.env.IDENTITY_SEED_DEFAULT_ADMIN !== "false") {
    try {
      await db.insert(users).values({
        id: DEFAULT_USER_IDS.SUPER_ADMIN,
        email: "dev@example.com",
        passwordHash: bcrypt2.hashSync("password123", 10),
        name: "Dev Admin",
        isSuperAdmin: true
      }).onConflictDoNothing();
      await db.insert(organizations).values({
        id: DEFAULT_ORG_IDS2.SYMBIA_LABS,
        name: "Symbia Labs",
        slug: "symbia-labs"
      }).onConflictDoNothing();
      await db.insert(memberships).values({
        userId: DEFAULT_USER_IDS.SUPER_ADMIN,
        orgId: DEFAULT_ORG_IDS2.SYMBIA_LABS,
        role: "admin"
      }).onConflictDoNothing();
      console.log("\u2713 Default admin ensured (dev@example.com / password123) in org symbia-labs");
    } catch (error) {
      console.error("Failed to ensure default admin:", error);
    }
  }
}
export {
  bootstrap,
  registerRoutes
};
