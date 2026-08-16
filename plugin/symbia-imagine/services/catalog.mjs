var __defProp = Object.defineProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../catalog/server/src/db.ts
import { initializeDatabase, setSessionContext, clearSessionContext } from "@symbia/db";

// ../../catalog/shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accessPolicyActions: () => accessPolicyActions,
  apiKeys: () => apiKeys,
  appConfigFieldSchema: () => appConfigFieldSchema,
  appManifestSchema: () => appManifestSchema,
  artifacts: () => artifacts,
  artifactsRelations: () => artifactsRelations,
  certifications: () => certifications,
  certificationsRelations: () => certificationsRelations,
  componentConfigFieldSchema: () => componentConfigFieldSchema,
  componentManifestSchema: () => componentManifestSchema,
  componentPortSchema: () => componentPortSchema,
  defaultAccessPolicy: () => defaultAccessPolicy,
  entitlements: () => entitlements,
  entitlementsRelations: () => entitlementsRelations,
  insertApiKeySchema: () => insertApiKeySchema,
  insertArtifactSchema: () => insertArtifactSchema,
  insertCertificationSchema: () => insertCertificationSchema,
  insertEntitlementSchema: () => insertEntitlementSchema,
  insertResourceSchema: () => insertResourceSchema,
  insertResourceVersionSchema: () => insertResourceVersionSchema,
  insertSignatureSchema: () => insertSignatureSchema,
  portLanes: () => portLanes,
  publicAccessPolicy: () => publicAccessPolicy,
  receiptKinds: () => receiptKinds,
  resourceStatuses: () => resourceStatuses,
  resourceTypes: () => resourceTypes,
  resourceVersions: () => resourceVersions,
  resourceVersionsRelations: () => resourceVersionsRelations,
  resources: () => resources,
  resourcesRelations: () => resourcesRelations,
  signatures: () => signatures,
  signaturesRelations: () => signaturesRelations,
  systemSettings: () => systemSettings,
  visibilityLevels: () => visibilityLevels
});
import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var resourceStatuses = ["draft", "published", "deprecated"];
var resourceTypes = ["context", "integration", "graph", "assistant", "component", "app", "model"];
var portLanes = ["inherit", "canonical", "apocryphal", "conditional"];
var receiptKinds = ["recipe", "witness", "none"];
var componentPortSchema = z.object({
  name: z.string().min(1),
  schema: z.record(z.unknown()).optional(),
  required: z.boolean().optional(),
  lane: z.enum(portLanes).optional(),
  laneNote: z.string().optional(),
  receipt: z.enum(receiptKinds).optional()
});
var componentConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().min(1)
});
var componentManifestSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  implementation: z.enum(["builtin", "expression", "wasm", "integration", "remote-service"]),
  inputs: z.array(componentPortSchema).default([]),
  outputs: z.array(componentPortSchema).default([]),
  // Deliberately NOT .default({}) — that would erase the difference between a
  // component that takes no config and one that has never declared its config.
  config: z.record(componentConfigFieldSchema).optional(),
  capability: z.string().optional(),
  description: z.string().optional()
});
var appConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
  default: z.unknown().optional()
});
var appManifestSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  requires: z.object({
    platform: z.string().optional(),
    components: z.array(z.string()).default([]),
    services: z.array(z.string()).default([])
  }).optional(),
  provides: z.object({
    graphs: z.array(z.string()).default([]),
    components: z.array(z.string()).default([]),
    ingresses: z.array(z.string()).default([])
  }).optional(),
  surfaces: z.object({
    ingress: z.array(z.string()).default([]),
    metrics: z.array(z.string()).default([]),
    // Nullable as well as optional, matching `principal`. An explicit null is
    // a statement — "this app was considered for a UI and has none" — which is
    // worth more than an absent key, and the schema should not force an author
    // to say it by omission.
    ui: z.string().nullable().optional()
  }).optional(),
  config: z.record(appConfigFieldSchema).optional(),
  privilege: z.object({
    crossAppRead: z.boolean().optional(),
    crossOrgRead: z.boolean().optional(),
    reason: z.string().optional()
  }).optional(),
  outside: z.array(z.object({
    what: z.string().min(1),
    why: z.string().min(1)
  })).default([]),
  principal: z.string().nullable().optional()
}).superRefine((manifest, ctx) => {
  const p = manifest.privilege;
  if ((p?.crossAppRead || p?.crossOrgRead) && !p?.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["privilege", "reason"],
      message: "privilege.reason is required when requesting crossAppRead or crossOrgRead"
    });
  }
});
var visibilityLevels = ["public", "org", "private"];
var accessPolicyActions = ["read", "write", "publish", "sign", "certify", "delete"];
var defaultAccessPolicy = {
  visibility: "private",
  actions: {
    read: { anyOf: ["role:admin", "cap:registry.write"] },
    write: { anyOf: ["cap:registry.write", "role:admin"] },
    publish: { anyOf: ["cap:registry.publish", "role:publisher", "role:admin"] },
    sign: { anyOf: ["cap:registry.sign", "role:admin"] },
    certify: { anyOf: ["cap:registry.certify", "role:admin"] },
    delete: { anyOf: ["role:admin"] }
  }
};
var publicAccessPolicy = {
  visibility: "public",
  actions: {
    read: { anyOf: ["public"] },
    write: { anyOf: ["cap:registry.write", "role:admin"] },
    publish: { anyOf: ["cap:registry.publish", "role:publisher", "role:admin"] },
    sign: { anyOf: ["cap:registry.sign", "role:admin"] },
    certify: { anyOf: ["cap:registry.certify", "role:admin"] },
    delete: { anyOf: ["role:admin"] }
  }
};
var resources = pgTable("resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 255 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull().$type(),
  status: varchar("status", { length: 50 }).notNull().default("draft").$type(),
  isBootstrap: boolean("is_bootstrap").notNull().default(false),
  // WHO WROTE THIS. Server-owned, never accepted from a request body.
  //
  // isBootstrap answers "did this come from a bootstrap file", which is NOT
  // the same question as "did this session make it". Measured 16 Aug: a
  // sealed imagine bundle carried 18 artifacts for a session that authored
  // 2, because the runtime registers 16 component manifests through this
  // API at boot and those are ordinary writes. Nothing recorded the author,
  // so nothing could tell them apart.
  createdBy: varchar("created_by", { length: 255 }),
  tags: text("tags").array(),
  orgId: varchar("org_id", { length: 255 }),
  accessPolicy: jsonb("access_policy").$type(),
  metadata: jsonb("metadata").$type(),
  currentVersion: integer("current_version").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  typeIdx: index("idx_resources_type").on(table.type),
  orgIdIdx: index("idx_resources_org_id").on(table.orgId),
  typeOrgIdx: index("idx_resources_type_org").on(table.type, table.orgId),
  statusIdx: index("idx_resources_status").on(table.status),
  bootstrapIdx: index("idx_resources_bootstrap").on(table.isBootstrap),
  updatedIdx: index("idx_resources_updated").on(table.updatedAt)
}));
var resourceVersions = pgTable("resource_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: jsonb("content").$type(),
  changelog: text("changelog"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 })
}, (table) => ({
  resourceVersionIdx: index("idx_resource_versions_resource_version").on(table.resourceId, table.version)
}));
var artifacts = pgTable("artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  versionId: varchar("version_id").references(() => resourceVersions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: varchar("mime_type", { length: 255 }),
  size: integer("size"),
  checksum: varchar("checksum", { length: 255 }),
  storageUrl: text("storage_url"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  resourceIdx: index("idx_artifacts_resource_id").on(table.resourceId)
}));
var signatures = pgTable("signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  versionId: varchar("version_id").references(() => resourceVersions.id, { onDelete: "cascade" }),
  signerId: varchar("signer_id", { length: 255 }).notNull(),
  signerName: text("signer_name"),
  algorithm: varchar("algorithm", { length: 50 }),
  signature: text("signature").notNull(),
  signedAt: timestamp("signed_at").defaultNow().notNull()
}, (table) => ({
  resourceIdx: index("idx_signatures_resource_id").on(table.resourceId)
}));
var certifications = pgTable("certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  versionId: varchar("version_id").references(() => resourceVersions.id, { onDelete: "cascade" }),
  certifierId: varchar("certifier_id", { length: 255 }).notNull(),
  certifierName: text("certifier_name"),
  certificationType: varchar("certification_type", { length: 100 }),
  notes: text("notes"),
  certifiedAt: timestamp("certified_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at")
}, (table) => ({
  resourceIdx: index("idx_certifications_resource_id").on(table.resourceId)
}));
var entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  principalId: varchar("principal_id", { length: 255 }).notNull(),
  principalType: varchar("principal_type", { length: 50 }).notNull(),
  permission: varchar("permission", { length: 50 }).notNull(),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  grantedBy: varchar("granted_by", { length: 255 })
}, (table) => ({
  resourceIdx: index("idx_entitlements_resource_id").on(table.resourceId),
  principalIdx: index("idx_entitlements_principal").on(table.principalId)
}));
var systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdByName: text("created_by_name"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  activeIdx: index("idx_api_keys_active").on(table.isActive),
  createdByIdx: index("idx_api_keys_created_by").on(table.createdBy)
}));
var resourcesRelations = relations(resources, ({ many }) => ({
  versions: many(resourceVersions),
  artifacts: many(artifacts),
  signatures: many(signatures),
  certifications: many(certifications),
  entitlements: many(entitlements)
}));
var resourceVersionsRelations = relations(resourceVersions, ({ one, many }) => ({
  resource: one(resources, {
    fields: [resourceVersions.resourceId],
    references: [resources.id]
  }),
  artifacts: many(artifacts),
  signatures: many(signatures),
  certifications: many(certifications)
}));
var artifactsRelations = relations(artifacts, ({ one }) => ({
  resource: one(resources, {
    fields: [artifacts.resourceId],
    references: [resources.id]
  }),
  version: one(resourceVersions, {
    fields: [artifacts.versionId],
    references: [resourceVersions.id]
  })
}));
var signaturesRelations = relations(signatures, ({ one }) => ({
  resource: one(resources, {
    fields: [signatures.resourceId],
    references: [resources.id]
  }),
  version: one(resourceVersions, {
    fields: [signatures.versionId],
    references: [resourceVersions.id]
  })
}));
var certificationsRelations = relations(certifications, ({ one }) => ({
  resource: one(resources, {
    fields: [certifications.resourceId],
    references: [resources.id]
  }),
  version: one(resourceVersions, {
    fields: [certifications.versionId],
    references: [resourceVersions.id]
  })
}));
var entitlementsRelations = relations(entitlements, ({ one }) => ({
  resource: one(resources, {
    fields: [entitlements.resourceId],
    references: [resources.id]
  })
}));
var insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentVersion: true
});
var insertResourceVersionSchema = createInsertSchema(resourceVersions).omit({
  id: true,
  createdAt: true
});
var insertArtifactSchema = createInsertSchema(artifacts).omit({
  id: true,
  createdAt: true
});
var insertSignatureSchema = createInsertSchema(signatures).omit({
  id: true,
  signedAt: true
});
var insertCertificationSchema = createInsertSchema(certifications).omit({
  id: true,
  certifiedAt: true
});
var insertEntitlementSchema = createInsertSchema(entitlements).omit({
  id: true,
  grantedAt: true
});
var insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true
});

// ../../catalog/server/src/memory-schema.ts
var MEMORY_SCHEMA_SQL = `
CREATE TABLE "resources" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(255) NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "type" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "is_bootstrap" boolean NOT NULL DEFAULT false,
  "created_by" varchar(255),
  "tags" text[],
  "org_id" varchar(255),
  "access_policy" jsonb,
  "metadata" jsonb,
  "current_version" integer DEFAULT 1,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "resource_versions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "content" jsonb,
  "changelog" text,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" varchar(255)
);

CREATE TABLE "artifacts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version_id" varchar REFERENCES "resource_versions"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "mime_type" varchar(255),
  "size" integer,
  "checksum" varchar(255),
  "storage_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "signatures" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version_id" varchar REFERENCES "resource_versions"("id") ON DELETE CASCADE,
  "signer_id" varchar(255) NOT NULL,
  "signer_name" text,
  "algorithm" varchar(50),
  "signature" text NOT NULL,
  "signed_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version_id" varchar REFERENCES "resource_versions"("id") ON DELETE CASCADE,
  "certifier_id" varchar(255) NOT NULL,
  "certifier_name" text,
  "certification_type" varchar(100),
  "notes" text,
  "certified_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp
);

CREATE TABLE "entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "principal_id" varchar(255) NOT NULL,
  "principal_type" varchar(50) NOT NULL,
  "permission" varchar(50) NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL,
  "granted_by" varchar(255)
);

CREATE TABLE "api_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "key_prefix" varchar(8) NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "created_by_name" text,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "system_settings" (
  "key" varchar(255) PRIMARY KEY,
  "value" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for resources table
CREATE INDEX idx_resources_type ON "resources"("type");
CREATE INDEX idx_resources_org_id ON "resources"("org_id");
CREATE INDEX idx_resources_type_org ON "resources"("type", "org_id");
CREATE INDEX idx_resources_status ON "resources"("status");
CREATE INDEX idx_resources_bootstrap ON "resources"("is_bootstrap");
CREATE INDEX idx_resources_updated ON "resources"("updated_at");

-- Indexes for child tables
CREATE INDEX idx_resource_versions_resource_version ON "resource_versions"("resource_id", "version");
CREATE INDEX idx_artifacts_resource_id ON "artifacts"("resource_id");
CREATE INDEX idx_signatures_resource_id ON "signatures"("resource_id");
CREATE INDEX idx_certifications_resource_id ON "certifications"("resource_id");
CREATE INDEX idx_entitlements_resource_id ON "entitlements"("resource_id");
CREATE INDEX idx_entitlements_principal ON "entitlements"("principal_id");

-- Indexes for api_keys table
CREATE INDEX idx_api_keys_active ON "api_keys"("is_active");
CREATE INDEX idx_api_keys_created_by ON "api_keys"("created_by");
`;

// ../../catalog/server/src/db.ts
var database = initializeDatabase({
  serviceId: "catalog-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "CATALOG_USE_MEMORY_DB"
}, schema_exports);
var { db, pool, isMemory, exportToFile, close } = database;

// ../../catalog/server/src/auth.ts
import {
  createAuthMiddleware,
  hashApiKey,
  generateApiKey as generateApiKeyBase
} from "@symbia/auth";

// ../../catalog/server/src/config.ts
import dotenv from "dotenv";
import { resolveServicePort, resolveServiceUrl, ServiceId } from "@symbia/sys";
dotenv.config();
var config = {
  port: resolveServicePort(ServiceId.CATALOG),
  databaseUrl: process.env.DATABASE_URL || "",
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.CATALOG,
  serviceName: process.env.SERVICE_NAME || "Symbia Catalog",
  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitReadMax: parseInt(process.env.RATE_LIMIT_READ_MAX || "1000", 10),
  rateLimitWriteMax: parseInt(process.env.RATE_LIMIT_WRITE_MAX || "100", 10),
  // CORS
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean)
};

// ../../catalog/server/src/storage.ts
import { eq, desc, and, or, ilike, sql as sql2 } from "drizzle-orm";
var DatabaseStorage = class {
  // Resources
  async getResources() {
    return db.select().from(resources).orderBy(desc(resources.updatedAt));
  }
  async getResource(id) {
    const [resource] = await db.select().from(resources).where(eq(resources.id, id));
    return resource || void 0;
  }
  async getResourceByKey(key) {
    const [resource] = await db.select().from(resources).where(eq(resources.key, key));
    return resource || void 0;
  }
  async getResourcesByType(type) {
    return db.select().from(resources).where(eq(resources.type, type)).orderBy(desc(resources.updatedAt));
  }
  async getResourcesByTypeAndOrg(type, orgId) {
    return db.select().from(resources).where(
      and(eq(resources.type, type), eq(resources.orgId, orgId))
    ).orderBy(desc(resources.updatedAt));
  }
  async getBootstrapResources() {
    return db.select().from(resources).where(and(eq(resources.isBootstrap, true), eq(resources.status, "published")));
  }
  async createResource(resource) {
    const [created] = await db.insert(resources).values(resource).returning();
    return created;
  }
  async updateResource(id, resource) {
    const [updated] = await db.update(resources).set({ ...resource, updatedAt: /* @__PURE__ */ new Date() }).where(eq(resources.id, id)).returning();
    return updated || void 0;
  }
  async deleteResource(id) {
    const result = await db.delete(resources).where(eq(resources.id, id)).returning();
    return result.length > 0;
  }
  async searchResources(query, type, status) {
    const searchPattern = `%${query}%`;
    let conditions = or(
      ilike(resources.name, searchPattern),
      ilike(resources.key, searchPattern),
      ilike(resources.description, searchPattern)
    );
    if (type) {
      conditions = and(conditions, eq(resources.type, type));
    }
    if (status) {
      conditions = and(conditions, eq(resources.status, status));
    }
    return db.select().from(resources).where(conditions).orderBy(desc(resources.updatedAt));
  }
  // Versions
  async getVersions() {
    return db.select().from(resourceVersions).orderBy(desc(resourceVersions.createdAt));
  }
  async getResourceVersions(resourceId) {
    return db.select().from(resourceVersions).where(eq(resourceVersions.resourceId, resourceId)).orderBy(desc(resourceVersions.version));
  }
  async createVersion(version) {
    const [created] = await db.insert(resourceVersions).values(version).returning();
    return created;
  }
  async publishVersion(resourceId) {
    const resource = await this.getResource(resourceId);
    if (!resource) {
      throw new Error("Resource not found");
    }
    const newVersion = (resource.currentVersion ?? 0) + 1;
    await db.update(resources).set({
      status: "published",
      currentVersion: newVersion,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(resources.id, resourceId));
    const [version] = await db.insert(resourceVersions).values({
      resourceId,
      version: newVersion,
      publishedAt: /* @__PURE__ */ new Date(),
      changelog: `Published version ${newVersion}`
    }).returning();
    return version;
  }
  // Artifacts
  async getResourceArtifacts(resourceId) {
    return db.select().from(artifacts).where(eq(artifacts.resourceId, resourceId));
  }
  async createArtifact(artifact) {
    const [created] = await db.insert(artifacts).values(artifact).returning();
    return created;
  }
  async getArtifact(id) {
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, id));
    return artifact || void 0;
  }
  async deleteArtifact(id) {
    const result = await db.delete(artifacts).where(eq(artifacts.id, id)).returning();
    return result.length > 0;
  }
  // Signatures
  async getResourceSignatures(resourceId) {
    return db.select().from(signatures).where(eq(signatures.resourceId, resourceId));
  }
  async createSignature(signature) {
    const [created] = await db.insert(signatures).values(signature).returning();
    return created;
  }
  // Certifications
  async getResourceCertifications(resourceId) {
    return db.select().from(certifications).where(eq(certifications.resourceId, resourceId));
  }
  async createCertification(certification) {
    const [created] = await db.insert(certifications).values(certification).returning();
    return created;
  }
  // Entitlements
  async getResourceEntitlements(resourceId) {
    return db.select().from(entitlements).where(eq(entitlements.resourceId, resourceId));
  }
  async createEntitlement(entitlement) {
    const [created] = await db.insert(entitlements).values(entitlement).returning();
    return created;
  }
  // Stats
  async getStats() {
    const [resourceCount] = await db.select({ count: sql2`count(*)::int` }).from(resources);
    const [publishedCount] = await db.select({ count: sql2`count(*)::int` }).from(resources).where(eq(resources.status, "published"));
    const [bootstrapCount] = await db.select({ count: sql2`count(*)::int` }).from(resources).where(eq(resources.isBootstrap, true));
    const [assistantCount] = await db.select({ count: sql2`count(*)::int` }).from(resources).where(eq(resources.type, "assistant"));
    const [contextCount] = await db.select({ count: sql2`count(*)::int` }).from(resources).where(eq(resources.type, "context"));
    const [integrationCount] = await db.select({ count: sql2`count(*)::int` }).from(resources).where(
      and(
        eq(resources.type, "integration"),
        sql2`${resources.key} LIKE '%/config'`
      )
    );
    const [graphCount] = await db.select({ count: sql2`count(*)::int` }).from(resources).where(eq(resources.type, "graph"));
    return {
      totalResources: resourceCount?.count ?? 0,
      publishedVersions: publishedCount?.count ?? 0,
      bootstrapEntries: bootstrapCount?.count ?? 0,
      totalAssistants: assistantCount?.count ?? 0,
      totalContexts: contextCount?.count ?? 0,
      totalIntegrations: integrationCount?.count ?? 0,
      totalGraphs: graphCount?.count ?? 0
    };
  }
  // API Keys
  async getApiKeys() {
    return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  }
  async getApiKeyByHash(keyHash) {
    const [key] = await db.select().from(apiKeys).where(
      and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true))
    );
    return key || void 0;
  }
  async createApiKey(apiKey) {
    const [created] = await db.insert(apiKeys).values(apiKey).returning();
    return created;
  }
  async updateApiKeyLastUsed(id) {
    await db.update(apiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id));
  }
  async deleteApiKey(id) {
    const result = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();
    return result.length > 0;
  }
};
var storage = new DatabaseStorage();

// ../../catalog/server/src/auth.ts
import { runWithRLSContext } from "@symbia/db";
function generateApiKey() {
  return generateApiKeyBase("sos");
}
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["catalog:admin", "cap:catalog.admin"],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Catalog Auth] ${message}`)
});
var {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient
} = auth;
async function authMiddleware(req, res, next) {
  let user = await getCurrentUser(req) ?? void 0;
  if (!user) {
    const serviceAuth = req.headers["x-service-auth"];
    const expectedServiceToken = process.env.CATALOG_INTERNAL_SERVICE_TOKEN;
    const serviceAuthOk = expectedServiceToken ? serviceAuth === expectedServiceToken : serviceAuth === "internal";
    if (serviceAuthOk) {
      user = {
        id: "service:internal",
        email: "service@internal",
        name: "Internal Service",
        type: "agent",
        isSuperAdmin: true,
        organizations: [],
        entitlements: ["cap:catalog.admin", "cap:registry.write", "cap:registry.publish"],
        roles: []
      };
    }
  }
  if (!user) {
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader) {
      const keyHash = hashApiKey(apiKeyHeader);
      const localKey = await storage.getApiKeyByHash(keyHash);
      if (localKey && (!localKey.expiresAt || new Date(localKey.expiresAt) >= /* @__PURE__ */ new Date())) {
        storage.updateApiKeyLastUsed(localKey.id).catch(() => {
        });
        user = {
          id: `api-key:${localKey.id}`,
          email: "api-key@system",
          name: localKey.name,
          type: "agent",
          isSuperAdmin: true,
          organizations: [],
          entitlements: ["cap:catalog.admin", "cap:registry.write", "cap:registry.publish"],
          roles: []
        };
      }
    }
  }
  req.user = user;
  try {
    runWithRLSContext(
      {
        orgId: user?.organizations?.[0]?.id ?? "",
        userId: user?.id ?? "anonymous",
        isSuperAdmin: user?.isSuperAdmin,
        capabilities: user?.entitlements,
        serviceId: "catalog"
      },
      () => next()
    );
  } catch (error) {
    console.error("[Catalog Auth] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish request security context" });
    }
  }
}
function requirePrincipal(req, res) {
  if (req.user) return true;
  res.status(401).json({
    error: "Not authenticated",
    detail: "No principal on this request. A token was absent, expired, or issued by a different host \u2014 which is a different thing from lacking permission. Authenticate and retry."
  });
  return false;
}

// ../../catalog/server/src/service.ts
import { eq as eq2 } from "drizzle-orm";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, readdirSync } from "fs";

// ../../catalog/server/src/routes.ts
import fs2 from "fs";
import path2 from "path";
import { z as z2 } from "zod";

// ../../catalog/server/src/openapi.ts
var openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Object Service API",
    description: "Registry service for managing resources, versions, and artifacts with CRUD operations, versioning, search capabilities, and a public bootstrap endpoint for system initialization. Uses allowlist-based access control with entitlements.\n\n**Scope Headers (optional)**: X-Org-Id, X-Service-Id, X-Env, X-Data-Class, X-Policy-Ref.\n\n**CORS**: All API endpoints support CORS with methods GET, POST, PUT, PATCH, DELETE, OPTIONS and headers Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Data-Class, X-Policy-Ref. Credentialed requests (cookies) only allowed from origins in CORS_ALLOWED_ORIGINS. Disallowed origins receive 403 on preflight. Identity Service origin is always allowed.\n\n**Resource Types**: context, integration, graph, assistant, component. All types support identical CRUD operations and versioning workflows. Resources of type 'component' must include a manifest (typed input/output ports and required capability) under metadata.manifest.\n\n**Authentication**: Bearer token (JWT), API key (X-API-Key header), or session cookie (symbia_session).",
    version: "1.0.0",
    contact: {
      name: "Symbia Object Service"
    }
  },
  servers: [
    {
      url: "/api",
      description: "API Server"
    }
  ],
  tags: [
    { name: "Resources", description: "Resource management operations" },
    { name: "Versions", description: "Version management operations" },
    { name: "Search", description: "Search operations" },
    { name: "Bootstrap", description: "System initialization (public)" },
    { name: "Stats", description: "Dashboard statistics" },
    { name: "Authentication", description: "Authentication endpoints" },
    { name: "Graphs", description: "Convenience endpoints for graph resources with org scoping" },
    { name: "Contexts", description: "Context resource management" },
    { name: "Artifacts", description: "Artifact upload and download" },
    { name: "RateLimits", description: "Rate limit information" }
  ],
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] },
    { cookieAuth: [] }
  ],
  paths: {
    "/resources": {
      get: {
        tags: ["Resources"],
        summary: "List all resources",
        description: "Retrieve a list of all resources with optional filtering",
        parameters: [
          {
            name: "type",
            in: "query",
            description: "Filter by resource type",
            schema: {
              type: "string",
              enum: ["context", "integration", "graph", "assistant", "component"]
            }
          },
          {
            name: "status",
            in: "query",
            description: "Filter by resource status",
            schema: {
              type: "string",
              enum: ["draft", "published", "deprecated"]
            }
          }
        ],
        responses: {
          "200": {
            description: "List of resources",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Resource" }
                }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Resources"],
        summary: "Create a new resource",
        description: "Create a new resource in draft status",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateResource" }
            }
          }
        },
        responses: {
          "201": {
            description: "Resource created successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Resource" }
              }
            }
          },
          "400": {
            description: "Validation error or duplicate key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/{id}": {
      get: {
        tags: ["Resources"],
        summary: "Get a resource by ID",
        description: "Retrieve a single resource by its unique identifier",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Resource details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Resource" }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Resources"],
        summary: "Update a resource",
        description: "Update an existing resource's properties",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateResource" }
            }
          }
        },
        responses: {
          "200": {
            description: "Resource updated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Resource" }
              }
            }
          },
          "400": {
            description: "Validation error or duplicate key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Resources"],
        summary: "Delete a resource",
        description: "Permanently delete a resource and all its versions",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "204": {
            description: "Resource deleted successfully"
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/{id}/publish": {
      post: {
        tags: ["Resources", "Versions"],
        summary: "Publish a resource",
        description: "Create a new version and publish the resource. Changes status to 'published' and increments version number.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  changelog: {
                    type: "string",
                    description: "Description of changes in this version"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Resource published successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    resource: { $ref: "#/components/schemas/Resource" },
                    version: { $ref: "#/components/schemas/ResourceVersion" }
                  }
                }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/bulk": {
      post: {
        tags: ["Resources"],
        summary: "Perform bulk operations on resources",
        description: "Execute bulk actions on multiple resources at once. Supports publish, delete, status update, and tag management. Returns per-item results with success/failure status. Failed items remain selected for retry.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["ids", "action"],
                properties: {
                  ids: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    maxItems: 100,
                    description: "Array of resource IDs to operate on (max 100)"
                  },
                  action: {
                    type: "string",
                    enum: ["publish", "delete", "updateStatus", "addTags", "removeTags"],
                    description: "The bulk action to perform"
                  },
                  payload: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["draft", "published", "deprecated"],
                        description: "New status for updateStatus action"
                      },
                      tags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Tags to add or remove"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Bulk operation completed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: {
                      type: "object",
                      properties: {
                        total: { type: "integer", description: "Total items processed" },
                        succeeded: { type: "integer", description: "Number of successful operations" },
                        failed: { type: "integer", description: "Number of failed operations" }
                      }
                    },
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "Resource ID" },
                          status: { type: "string", enum: ["success", "failed"] },
                          error: { type: "string", description: "Error message if failed" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/{id}/versions": {
      get: {
        tags: ["Versions"],
        summary: "Get resource versions",
        description: "Retrieve all versions of a specific resource",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "List of versions",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ResourceVersion" }
                }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/search": {
      post: {
        tags: ["Search"],
        summary: "Search resources",
        description: "Search resources using keyword or natural language queries",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: {
                    type: "string",
                    description: "Search query string"
                  },
                  mode: {
                    type: "string",
                    enum: ["keyword", "natural"],
                    default: "keyword",
                    description: "Search mode"
                  },
                  type: {
                    type: "string",
                    enum: ["context", "integration", "graph", "assistant", "component"],
                    description: "Filter by resource type"
                  },
                  status: {
                    type: "string",
                    enum: ["draft", "published", "deprecated"],
                    description: "Filter by resource status"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Resource" }
                }
              }
            }
          },
          "400": {
            description: "Invalid search query",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/bootstrap": {
      get: {
        tags: ["Bootstrap"],
        summary: "Get bootstrap resources",
        description: "Public endpoint that returns all published resources with public read access, marked for system initialization (isBootstrap: true). No authentication required.",
        security: [],
        responses: {
          "200": {
            description: "List of bootstrap resources",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Resource" }
                }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/bootstrap/summary": {
      get: {
        tags: ["Bootstrap"],
        summary: "Get bootstrap summary",
        description: "Public endpoint that returns aggregated counts for bootstrap resources (components + contexts) grouped by category and intention group. No authentication required.",
        security: [],
        responses: {
          "200": {
            description: "Bootstrap summary payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BootstrapSummary" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/stats": {
      get: {
        tags: ["Stats"],
        summary: "Get dashboard statistics",
        description: "Retrieve aggregate statistics about resources, versions, and bootstrap entries",
        responses: {
          "200": {
            description: "Dashboard statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Stats" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/graphs": {
      get: {
        tags: ["Graphs"],
        summary: "List graph resources",
        description: "List all graph resources with optional org filtering. Rate limited.",
        parameters: [
          {
            name: "orgId",
            in: "query",
            description: "Filter by organization ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "List of graph resources",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Resource" } }
              }
            }
          }
        }
      },
      post: {
        tags: ["Graphs"],
        summary: "Create a graph resource",
        description: "Create a new graph with org scoping and payload validation. Rate limited (30 writes/min).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateGraph" }
            }
          }
        },
        responses: {
          "201": { description: "Graph created successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Permission denied", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/graphs/{id}": {
      get: {
        tags: ["Graphs"],
        summary: "Get graph by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Graph resource", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "404": { description: "Graph not found" }
        }
      },
      patch: {
        tags: ["Graphs"],
        summary: "Update a graph",
        description: "Update graph name, description, tags, or payload. Rate limited.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateGraph" } } }
        },
        responses: {
          "200": { description: "Graph updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "404": { description: "Graph not found" },
          "429": { description: "Rate limit exceeded" }
        }
      },
      delete: {
        tags: ["Graphs"],
        summary: "Delete a graph",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Graph deleted" },
          "404": { description: "Graph not found" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/contexts": {
      get: {
        tags: ["Contexts"],
        summary: "List context resources",
        description: "List all context resources with optional org filtering.",
        parameters: [{ name: "orgId", in: "query", schema: { type: "string" } }],
        responses: {
          "200": { description: "List of contexts", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Resource" } } } } }
        }
      },
      post: {
        tags: ["Contexts"],
        summary: "Create a context",
        description: "Create a new context resource. Rate limited.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateContext" } } } },
        responses: {
          "201": { description: "Context created", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "400": { description: "Validation error" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/contexts/{id}": {
      get: {
        tags: ["Contexts"],
        summary: "Get context by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Context resource", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "404": { description: "Context not found" }
        }
      },
      patch: {
        tags: ["Contexts"],
        summary: "Update a context",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateContext" } } } },
        responses: {
          "200": { description: "Context updated" },
          "404": { description: "Context not found" },
          "429": { description: "Rate limit exceeded" }
        }
      },
      delete: {
        tags: ["Contexts"],
        summary: "Delete a context",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Context deleted" },
          "404": { description: "Context not found" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/resources/{id}/artifacts": {
      post: {
        tags: ["Artifacts"],
        summary: "Upload artifact",
        description: "Upload an artifact to a resource. Max 50MB, restricted MIME types. Rate limited (10 uploads/min).",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Resource ID" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "type", "content"],
                properties: {
                  name: { type: "string", description: "Artifact filename" },
                  type: { type: "string", description: "MIME type" },
                  content: { type: "string", description: "Base64-encoded file content" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Artifact uploaded", content: { "application/json": { schema: { $ref: "#/components/schemas/Artifact" } } } },
          "400": { description: "Invalid file size or type" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/artifacts/{id}/download": {
      get: {
        tags: ["Artifacts"],
        summary: "Download artifact",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Artifact file content" },
          "404": { description: "Artifact not found" }
        }
      }
    },
    "/artifacts/{id}": {
      delete: {
        tags: ["Artifacts"],
        summary: "Delete artifact",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Artifact deleted" },
          "404": { description: "Artifact not found" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/rate-limits": {
      get: {
        tags: ["RateLimits"],
        summary: "Get current rate limits",
        description: "Returns the configured rate limit values for write, search, and upload operations.",
        responses: {
          "200": {
            description: "Rate limit configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    windowMs: { type: "integer", description: "Rate limit window in milliseconds" },
                    limits: {
                      type: "object",
                      properties: {
                        write: { type: "integer", description: "Max write requests per window" },
                        search: { type: "integer", description: "Max search requests per window" },
                        upload: { type: "integer", description: "Max upload requests per window" }
                      }
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
  components: {
    schemas: {
      Resource: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique identifier" },
          key: { type: "string", description: "Unique key for the resource" },
          name: { type: "string", description: "Display name" },
          description: { type: "string", nullable: true, description: "Resource description" },
          type: {
            type: "string",
            enum: ["context", "integration", "graph", "assistant", "component"],
            description: "Resource type. Use 'graph' for workflow/pipeline definitions."
          },
          status: {
            type: "string",
            enum: ["draft", "published", "deprecated"],
            description: "Current status"
          },
          currentVersion: { type: "integer", description: "Current version number" },
          tags: { type: "array", items: { type: "string" }, nullable: true, description: "Tags for categorization" },
          isBootstrap: { type: "boolean", description: "Whether this resource is used for system initialization" },
          orgId: { type: "string", nullable: true, description: "Organization identifier" },
          accessPolicy: { $ref: "#/components/schemas/AccessPolicy", description: "Access control policy for the resource" },
          metadata: { type: "object", nullable: true, description: "Additional metadata" },
          createdAt: { type: "string", format: "date-time", description: "Creation timestamp" },
          updatedAt: { type: "string", format: "date-time", description: "Last update timestamp" }
        }
      },
      CreateResource: {
        type: "object",
        required: ["key", "name", "type"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key for the resource" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true, description: "Resource description" },
          type: {
            type: "string",
            enum: ["context", "integration", "graph", "assistant", "component"],
            description: "Resource type. Use 'graph' for workflow/pipeline definitions."
          },
          tags: { type: "array", items: { type: "string" }, nullable: true, description: "Tags for categorization" },
          isBootstrap: { type: "boolean", default: false, description: "Whether this resource is used for system initialization" },
          orgId: { type: "string", nullable: true, description: "Organization identifier" },
          accessPolicy: { $ref: "#/components/schemas/AccessPolicy", description: "Access control policy. Defaults to private visibility if not specified." },
          metadata: { type: "object", nullable: true, description: "Additional metadata" }
        }
      },
      UpdateResource: {
        type: "object",
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key for the resource" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true, description: "Resource description" },
          type: {
            type: "string",
            enum: ["context", "integration", "graph", "assistant", "component"],
            description: "Resource type. Use 'graph' for workflow/pipeline definitions."
          },
          status: {
            type: "string",
            enum: ["draft", "published", "deprecated"],
            description: "Current status"
          },
          tags: { type: "array", items: { type: "string" }, nullable: true, description: "Tags for categorization" },
          isBootstrap: { type: "boolean", description: "Whether this resource is used for system initialization" },
          orgId: { type: "string", nullable: true, description: "Organization identifier" },
          accessPolicy: { $ref: "#/components/schemas/AccessPolicy", description: "Access control policy" },
          metadata: { type: "object", nullable: true, description: "Additional metadata" }
        }
      },
      ResourceVersion: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique identifier" },
          resourceId: { type: "string", description: "Parent resource ID" },
          version: { type: "integer", description: "Version number" },
          changelog: { type: "string", nullable: true, description: "Description of changes" },
          publishedAt: { type: "string", format: "date-time", description: "Publication timestamp" },
          publishedBy: { type: "string", nullable: true, description: "Publisher identifier" }
        }
      },
      BootstrapSummaryCategory: {
        type: "object",
        properties: {
          id: { type: "string", description: "Category identifier" },
          label: { type: "string", description: "Display label" },
          count: { type: "integer", description: "Number of resources in this category" }
        }
      },
      BootstrapSummaryGroup: {
        type: "object",
        properties: {
          id: { type: "string", description: "Group identifier (from group:* tags)" },
          label: { type: "string", description: "Display label" },
          count: { type: "integer", description: "Number of component resources in this group" },
          categories: {
            type: "array",
            items: { $ref: "#/components/schemas/BootstrapSummaryCategory" }
          }
        }
      },
      BootstrapSummary: {
        type: "object",
        properties: {
          generatedAt: { type: "string", format: "date-time", description: "Summary generation timestamp" },
          components: {
            type: "object",
            properties: {
              total: { type: "integer", description: "Total component resources" },
              groups: {
                type: "array",
                items: { $ref: "#/components/schemas/BootstrapSummaryGroup" }
              }
            }
          },
          contexts: {
            type: "object",
            properties: {
              total: { type: "integer", description: "Total context resources" },
              categories: {
                type: "array",
                items: { $ref: "#/components/schemas/BootstrapSummaryCategory" }
              }
            }
          }
        }
      },
      Stats: {
        type: "object",
        properties: {
          totalResources: { type: "integer", description: "Total number of resources" },
          publishedVersions: { type: "integer", description: "Total number of published versions" },
          bootstrapEntries: { type: "integer", description: "Number of bootstrap resources" }
        }
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string", description: "Error message" },
          details: { type: "array", items: { type: "object" }, description: "Validation error details" }
        }
      },
      AccessPolicy: {
        type: "object",
        description: "Access control policy defining visibility and per-action entitlement requirements",
        properties: {
          visibility: {
            type: "string",
            enum: ["public", "org", "private"],
            description: "Visibility level: public (anyone can read), org (org members only), private (admins only)"
          },
          actions: {
            type: "object",
            description: "Per-action entitlement requirements",
            properties: {
              read: { $ref: "#/components/schemas/ActionPolicy" },
              write: { $ref: "#/components/schemas/ActionPolicy" },
              publish: { $ref: "#/components/schemas/ActionPolicy" },
              sign: { $ref: "#/components/schemas/ActionPolicy" },
              certify: { $ref: "#/components/schemas/ActionPolicy" },
              delete: { $ref: "#/components/schemas/ActionPolicy" }
            }
          }
        }
      },
      ActionPolicy: {
        type: "object",
        description: "Entitlement requirements for a specific action",
        properties: {
          anyOf: {
            type: "array",
            items: { type: "string" },
            description: "List of entitlement keys. User must have at least one to perform the action. Keys: public, authenticated, role:admin, role:publisher, cap:registry.write/publish/sign/certify, org:<orgId>, role:admin:<orgId>"
          }
        }
      },
      CreateGraph: {
        type: "object",
        required: ["key", "name", "orgId"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true },
          orgId: { type: "string", description: "Required organization ID for graph scoping" },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true, description: "Graph metadata" }
        }
      },
      UpdateGraph: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true, description: "Graph metadata" }
        }
      },
      CreateContext: {
        type: "object",
        required: ["key", "name"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true },
          orgId: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true }
        }
      },
      UpdateContext: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true }
        }
      },
      Artifact: {
        type: "object",
        properties: {
          id: { type: "string" },
          resourceId: { type: "string" },
          versionId: { type: "string", nullable: true },
          name: { type: "string" },
          mimeType: { type: "string", nullable: true },
          size: { type: "integer", nullable: true },
          checksum: { type: "string", nullable: true },
          storageUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from Symbia Identity Service. Obtain by authenticating at the Identity Service login endpoint."
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key for programmatic access. Generate via the dashboard API Keys section."
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "symbia_session",
        description: "Symbia Identity session cookie. Set automatically after login via the Identity Service."
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
if (openApiSpec.paths) {
  Object.values(openApiSpec.paths).forEach((pathItem) => {
    const existing = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    const merged = [...scopeParameters, ...existing.filter((param) => !scopeRefs.has(param?.$ref))];
    pathItem.parameters = merged;
  });
}
{
  const __autoDocumentedPaths = {
    "/api-keys/{id}": {
      "delete": {
        "tags": [
          "Api Keys"
        ],
        "summary": "Delete api keys",
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
      }
    },
    "/api-keys": {
      "get": {
        "tags": [
          "Api Keys"
        ],
        "summary": "List api keys",
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
          "Api Keys"
        ],
        "summary": "Create api keys",
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
    "/resources/{id}/artifacts": {
      "get": {
        "tags": [
          "Resources"
        ],
        "summary": "List artifacts",
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
    "/resources/{id}/certifications": {
      "get": {
        "tags": [
          "Resources"
        ],
        "summary": "List certifications",
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
    "/resources/{id}/signatures": {
      "get": {
        "tags": [
          "Resources"
        ],
        "summary": "List signatures",
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
    "/versions": {
      "get": {
        "tags": [
          "Versions"
        ],
        "summary": "List versions",
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
    "/nl/search": {
      "post": {
        "tags": [
          "Nl"
        ],
        "summary": "Create search",
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
  const __paths = openApiSpec.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../catalog/server/src/identity.ts
import { resolveServiceUrl as resolveServiceUrl2, ServiceId as ServiceId2 } from "@symbia/sys";
var IDENTITY_SERVICE_URL = resolveServiceUrl2(ServiceId2.IDENTITY);
async function getUserOrganizations(token) {
  try {
    const response = await fetch(`${IDENTITY_SERVICE_URL}/api/orgs`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.organizations || [];
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return [];
  }
}
function getIdentityServiceUrl() {
  return IDENTITY_SERVICE_URL;
}

// ../../catalog/server/src/entitlements.ts
import { Capabilities, Roles, buildEntitlements } from "@symbia/sys";
function getPrincipalEntitlements(user) {
  if (!user) {
    return ["public"];
  }
  const baseEntitlements = buildEntitlements({
    isSuperAdmin: user.isSuperAdmin,
    entitlements: user.entitlements,
    roles: user.roles,
    organizations: user.organizations
  });
  if (user.isSuperAdmin) {
    baseEntitlements.push(
      Roles.PUBLISHER,
      "role:reviewer",
      Capabilities.REGISTRY_WRITE,
      Capabilities.REGISTRY_PUBLISH,
      Capabilities.REGISTRY_SIGN,
      Capabilities.REGISTRY_CERTIFY,
      Capabilities.CATALOG_ADMIN
    );
  }
  return Array.from(new Set(baseEntitlements));
}
function checkEntitlement(principalEntitlements, requiredAnyOf) {
  return requiredAnyOf.some((required) => principalEntitlements.includes(required));
}
function canPerformAction(user, resource, action) {
  if (user?.isSuperAdmin) {
    return true;
  }
  const policy = resource.accessPolicy || defaultAccessPolicy;
  const principalEntitlements = getPrincipalEntitlements(user);
  if (policy.visibility === "org" && resource.orgId) {
    const hasOrgAccess = principalEntitlements.includes(`org:${resource.orgId}`);
    if (!hasOrgAccess && action === "read") {
      return false;
    }
  }
  if (policy.visibility === "private") {
    if (!user) return false;
  }
  const actionPolicy = policy.actions[action];
  if (!actionPolicy || !actionPolicy.anyOf) {
    return user?.isSuperAdmin ?? false;
  }
  return checkEntitlement(principalEntitlements, actionPolicy.anyOf);
}
function filterResourcesByReadAccess(resources2, user) {
  return resources2.filter((resource) => canPerformAction(user, resource, "read"));
}

// ../../catalog/server/src/rate-limit.ts
var stores = /* @__PURE__ */ new Map();
function createRateLimiter(name, getWindowMs2, getMaxRequests, message) {
  if (!stores.has(name)) {
    stores.set(name, {});
  }
  return (req, res, next) => {
    const store = stores.get(name);
    const key = req.user?.id || req.ip || "anonymous";
    const now = Date.now();
    const windowMs = getWindowMs2();
    const maxRequests = getMaxRequests();
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      return next();
    }
    store[key].count++;
    if (store[key].count > maxRequests) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1e3);
      res.setHeader("Retry-After", retryAfter);
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(store[key].resetTime / 1e3));
      return res.status(429).json({ error: message });
    }
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", maxRequests - store[key].count);
    res.setHeader("X-RateLimit-Reset", Math.ceil(store[key].resetTime / 1e3));
    next();
  };
}
var getWindowMs = () => parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
var getWriteMax = () => parseInt(process.env.RATE_LIMIT_WRITE_MAX || "30", 10);
var getSearchMax = () => parseInt(process.env.RATE_LIMIT_SEARCH_MAX || "60", 10);
var getUploadMax = () => parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || "10", 10);
var RATE_LIMITS = {
  get windowMs() {
    return getWindowMs();
  },
  get writeMaxRequests() {
    return getWriteMax();
  },
  get searchMaxRequests() {
    return getSearchMax();
  },
  get uploadMaxRequests() {
    return getUploadMax();
  }
};
var writeRateLimiter = createRateLimiter(
  "write",
  getWindowMs,
  getWriteMax,
  "Too many write requests, please try again later"
);
var searchRateLimiter = createRateLimiter(
  "search",
  getWindowMs,
  getSearchMax,
  "Too many search requests, please try again later"
);
var uploadRateLimiter = createRateLimiter(
  "upload",
  getWindowMs,
  getUploadMax,
  "Too many upload requests, please try again later"
);

// ../../catalog/server/src/artifact-storage.ts
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
var DEFAULT_CONFIG = {
  type: "filesystem",
  basePath: "./artifacts",
  maxFileSizeMB: parseInt(process.env.ARTIFACT_MAX_SIZE_MB || "50", 10),
  allowedMimeTypes: [
    "application/json",
    "application/octet-stream",
    "application/zip",
    "application/gzip",
    "application/x-tar",
    "text/plain",
    "text/yaml",
    "application/x-yaml",
    "text/javascript",
    "application/javascript",
    "image/png",
    "image/jpeg",
    "image/svg+xml"
  ]
};
var ArtifactStorage = class {
  config;
  constructor(config2) {
    this.config = { ...DEFAULT_CONFIG, ...config2 };
  }
  get maxFileSizeBytes() {
    return this.config.maxFileSizeMB * 1024 * 1024;
  }
  get allowedMimeTypes() {
    return this.config.allowedMimeTypes;
  }
  validateFile(size, mimeType) {
    if (size > this.maxFileSizeBytes) {
      return { valid: false, error: `File exceeds maximum size of ${this.config.maxFileSizeMB}MB` };
    }
    if (!this.config.allowedMimeTypes.includes(mimeType)) {
      return { valid: false, error: `File type ${mimeType} is not allowed` };
    }
    return { valid: true };
  }
  async save(resourceId, filename, data) {
    if (this.config.type === "s3") {
      return this.saveToS3(resourceId, filename, data);
    }
    return this.saveToFilesystem(resourceId, filename, data);
  }
  async load(storagePath) {
    if (this.config.type === "s3") {
      return this.loadFromS3(storagePath);
    }
    return this.loadFromFilesystem(storagePath);
  }
  async delete(storagePath) {
    if (this.config.type === "s3") {
      return this.deleteFromS3(storagePath);
    }
    return this.deleteFromFilesystem(storagePath);
  }
  async saveToFilesystem(resourceId, filename, data) {
    const baseDir = this.config.basePath;
    const resourceDir = path.join(baseDir, resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 8);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);
    const storedFilename = `${basename}-${hash}${ext}`;
    const filePath = path.join(resourceDir, storedFilename);
    await fs.writeFile(filePath, data);
    return filePath;
  }
  async loadFromFilesystem(storagePath) {
    return fs.readFile(storagePath);
  }
  async deleteFromFilesystem(storagePath) {
    try {
      await fs.unlink(storagePath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  async saveToS3(_resourceId, _filename, _data) {
    throw new Error("S3 storage not implemented. Configure AWS SDK and implement S3 operations.");
  }
  async loadFromS3(_storagePath) {
    throw new Error("S3 storage not implemented. Configure AWS SDK and implement S3 operations.");
  }
  async deleteFromS3(_storagePath) {
    throw new Error("S3 storage not implemented. Configure AWS SDK and implement S3 operations.");
  }
};
var artifactStorage = new ArtifactStorage();

// ../../catalog/server/src/bootstrap-summary.ts
var CONTEXT_LABELS = {
  architecture: "Architecture",
  domain: "Domains",
  identity: "Identity",
  industry: "Industries",
  mission: "Mission",
  persona: "Personas",
  use_case: "Use Cases",
  workspace: "Workspace"
};
var ACRONYMS = /* @__PURE__ */ new Set([
  "AI",
  "API",
  "CSV",
  "DNS",
  "HTTP",
  "HTTPS",
  "IO",
  "IT",
  "JSON",
  "MCP",
  "MQTT",
  "OT",
  "PII",
  "RAG",
  "S3",
  "SQL",
  "TCP",
  "UDP",
  "URI",
  "URL",
  "UUID",
  "XML",
  "YAML"
]);
function humanize(value) {
  return value.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
}
function formatToken(word) {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}
function titleize(text2) {
  return humanize(text2).split(" ").filter(Boolean).map((word) => formatToken(word)).join(" ").trim();
}
function getContextCategoryId(resource) {
  const metadata = resource.metadata;
  const metaKind = metadata?.kind;
  if (typeof metaKind === "string" && metaKind.trim()) {
    return metaKind.trim();
  }
  const key = resource.key || "";
  const parts = key.split("/");
  return parts.length > 1 ? parts[1] : parts[0] || "context";
}
function compareByCountThenLabel(a, b) {
  if (b.count !== a.count) return b.count - a.count;
  return a.label.localeCompare(b.label);
}
function buildBootstrapSummary(resources2) {
  const contextResources = resources2.filter((r) => r.type === "context");
  const graphResources = resources2.filter((r) => r.type === "graph");
  const integrationResources = resources2.filter((r) => r.type === "integration");
  const assistantResources = resources2.filter((r) => r.type === "assistant");
  const contextCategoryMap = /* @__PURE__ */ new Map();
  for (const resource of contextResources) {
    const categoryId = getContextCategoryId(resource);
    const label = CONTEXT_LABELS[categoryId] || titleize(categoryId);
    const existing = contextCategoryMap.get(categoryId);
    if (existing) {
      existing.count += 1;
    } else {
      contextCategoryMap.set(categoryId, { id: categoryId, label, count: 1 });
    }
  }
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    contexts: {
      total: contextResources.length,
      categories: Array.from(contextCategoryMap.values()).sort(compareByCountThenLabel)
    },
    graphs: {
      total: graphResources.length
    },
    integrations: {
      total: integrationResources.length
    },
    assistants: {
      total: assistantResources.length
    }
  };
}

// ../../catalog/server/src/app-requires.ts
import { ServiceId as ServiceId3 } from "@symbia/sys";
var PLATFORM_VERSION = process.env.SYMBIA_PLATFORM_VERSION || "1.1.1";
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return { ok: false, reason: `unparseable version "${version}"` };
  const r = range.trim();
  if (r === "*" || r === "") return { ok: true };
  const op = /^(>=|<=|>|<|\^|~|=)?\s*(.+)$/.exec(r);
  if (!op) return { ok: false, reason: `unparseable range "${range}"` };
  const target = parseVersion(op[2]);
  if (!target) return { ok: false, reason: `unparseable range "${range}"` };
  const cmp = compare(v, target);
  switch (op[1]) {
    case ">=":
      return { ok: cmp >= 0 };
    case ">":
      return { ok: cmp > 0 };
    case "<=":
      return { ok: cmp <= 0 };
    case "<":
      return { ok: cmp < 0 };
    case "^":
      if (target[0] > 0) return { ok: v[0] === target[0] && cmp >= 0 };
      if (target[1] > 0) return { ok: v[0] === 0 && v[1] === target[1] && cmp >= 0 };
      return { ok: cmp === 0 };
    case "~":
      return { ok: v[0] === target[0] && v[1] === target[1] && cmp >= 0 };
    case "=":
    case void 0:
      return { ok: cmp === 0 };
    default:
      return { ok: false, reason: `unsupported range operator in "${range}"` };
  }
}
async function checkAppRequires(manifest) {
  const failures = [];
  const requires = manifest.requires;
  if (!requires) return failures;
  if (requires.platform) {
    const result = satisfies(PLATFORM_VERSION, requires.platform);
    if (!result.ok) {
      failures.push({
        kind: "platform",
        requirement: requires.platform,
        reason: result.reason ?? `platform is ${PLATFORM_VERSION}, which does not satisfy ${requires.platform}`
      });
    }
  }
  const requiredComponents = requires.components ?? [];
  if (requiredComponents.length > 0) {
    const registered = await storage.getResourcesByType("component");
    const byKey = /* @__PURE__ */ new Map();
    for (const r of registered) {
      const m = r.metadata?.manifest;
      if (m?.key) byKey.set(m.key, m);
    }
    for (const spec of requiredComponents) {
      const at = spec.lastIndexOf("@");
      const key = at > 0 ? spec.slice(0, at) : spec;
      const range = at > 0 ? spec.slice(at + 1) : "*";
      const found = byKey.get(key);
      if (!found) {
        failures.push({
          kind: "component",
          requirement: spec,
          reason: `no component manifest registered for "${key}"`
        });
        continue;
      }
      const result = satisfies(found.version, range);
      if (!result.ok) {
        failures.push({
          kind: "component",
          requirement: spec,
          reason: result.reason ?? `registered version ${found.version} does not satisfy ${range}`
        });
      }
    }
  }
  const knownServices = new Set(Object.values(ServiceId3));
  for (const service of requires.services ?? []) {
    if (!knownServices.has(service)) {
      failures.push({
        kind: "service",
        requirement: service,
        reason: `"${service}" is not a service this platform provides`
      });
    }
  }
  return failures;
}

// ../../catalog/server/src/routes.ts
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var accessPolicySchema = z2.object({
  visibility: z2.enum(visibilityLevels),
  actions: z2.record(z2.object({
    anyOf: z2.array(z2.string())
  })).optional()
}).optional();
var updateResourceSchema = z2.object({
  key: z2.string().min(1).max(255).optional(),
  name: z2.string().min(1).max(255).optional(),
  description: z2.string().nullable().optional(),
  type: z2.enum(resourceTypes).optional(),
  status: z2.enum(resourceStatuses).optional(),
  /**
   * SERVER-OWNED. Not accepted from a caller.
   *
   * This flag is the authored/seeded boundary: a sealed imagine bundle
   * exports rows where `isBootstrap === false`, so a client that can set
   * it can hide its own artifacts from a bundle or smuggle seeded ones
   * in. Measured 16 Aug (security MAP, S11): `isBootstrap: true` supplied
   * on create persisted. A provenance boundary the caller controls is not
   * a boundary. Seeding sets it directly through storage, not this route.
   */
  tags: z2.array(z2.string()).nullable().optional(),
  orgId: z2.string().nullable().optional(),
  accessPolicy: accessPolicySchema,
  metadata: z2.record(z2.unknown()).nullable().optional()
});
var createResourceSchema = z2.object({
  key: z2.string().min(1).max(255),
  name: z2.string().min(1).max(255),
  description: z2.string().nullable().optional(),
  type: z2.enum(resourceTypes),
  status: z2.enum(resourceStatuses).optional(),
  /**
   * SERVER-OWNED. Not accepted from a caller.
   *
   * This flag is the authored/seeded boundary: a sealed imagine bundle
   * exports rows where `isBootstrap === false`, so a client that can set
   * it can hide its own artifacts from a bundle or smuggle seeded ones
   * in. Measured 16 Aug (security MAP, S11): `isBootstrap: true` supplied
   * on create persisted. A provenance boundary the caller controls is not
   * a boundary. Seeding sets it directly through storage, not this route.
   */
  tags: z2.array(z2.string()).nullable().optional(),
  orgId: z2.string().nullable().optional(),
  accessPolicy: accessPolicySchema,
  metadata: z2.record(z2.unknown()).nullable().optional()
});
var createGraphSchema = z2.object({
  key: z2.string().min(1).max(255),
  name: z2.string().min(1).max(255),
  description: z2.string().nullable().optional(),
  orgId: z2.string().min(1),
  tags: z2.array(z2.string()).nullable().optional(),
  metadata: z2.record(z2.unknown()).nullable().optional()
}).strict();
var updateGraphSchema = z2.object({
  name: z2.string().min(1).max(255).optional(),
  description: z2.string().nullable().optional(),
  tags: z2.array(z2.string()).nullable().optional(),
  metadata: z2.record(z2.unknown()).nullable().optional()
}).strict();
var createContextSchema = z2.object({
  key: z2.string().min(1).max(255),
  name: z2.string().min(1).max(255),
  description: z2.string().nullable().optional(),
  orgId: z2.string().nullable().optional(),
  tags: z2.array(z2.string()).nullable().optional(),
  metadata: z2.record(z2.unknown()).nullable().optional()
});
var updateContextSchema = z2.object({
  name: z2.string().min(1).max(255).optional(),
  description: z2.string().nullable().optional(),
  tags: z2.array(z2.string()).nullable().optional(),
  metadata: z2.record(z2.unknown()).nullable().optional()
});
function registryLedger(req, action, resource) {
  const principal = req.user?.id ?? "anonymous";
  const gate = req.headers?.["x-service-auth"] ? "service" : req.user?.isSuperAdmin ? "super-admin" : "capability";
  console.info(
    JSON.stringify({
      event: "registry.ledger",
      action,
      resourceId: resource.id,
      resourceKey: resource.key,
      resourceType: resource.type,
      principal,
      gate,
      ts: (/* @__PURE__ */ new Date()).toISOString()
    })
  );
}
async function checkGraphAgainstManifests(definition, lookup) {
  const problems = [];
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  for (const node of nodes) {
    const componentKey = node?.component;
    if (typeof componentKey !== "string") continue;
    const resource = await lookup(`components/${componentKey}`);
    if (!resource) {
      problems.push({
        node: node.id ?? "(unnamed)",
        problem: `no component "${componentKey}" is registered`,
        hint: "list components with GET /api/resources?type=component"
      });
      continue;
    }
    const manifest = resource.metadata?.manifest;
    const declared = manifest?.config;
    if (!declared) continue;
    const given = node.config ?? {};
    for (const [name, field] of Object.entries(declared)) {
      if (field?.required && given[name] === void 0) {
        problems.push({
          node: node.id ?? "(unnamed)",
          problem: `${componentKey} requires config.${name}`,
          // The manifest's own words, not a paraphrase.
          hint: field.description
        });
      }
      if (field?.enum && given[name] !== void 0 && !field.enum.includes(given[name])) {
        problems.push({
          node: node.id ?? "(unnamed)",
          problem: `config.${name} must be one of: ${field.enum.join(", ")}`,
          hint: field.description
        });
      }
    }
    for (const name of Object.keys(given)) {
      if (!(name in declared)) {
        problems.push({
          node: node.id ?? "(unnamed)",
          problem: `${componentKey} declares no config.${name}`,
          hint: `it accepts: ${Object.keys(declared).join(", ") || "(nothing)"}`
        });
      }
    }
  }
  return problems;
}
function checkMapDiscipline(metadata, tags) {
  const problems = [];
  const isMap = (tags ?? []).includes("map");
  if (!isMap) return problems;
  const predictions = metadata?.predictions;
  const results = metadata?.results;
  if (predictions && typeof predictions === "object" && !results) {
    for (const [id, value] of Object.entries(predictions)) {
      const refutedBy = value?.refutedBy;
      if (typeof value === "string") {
        problems.push({
          prediction: id,
          problem: "a bare string states a claim without stating what would refute it \u2014 use { claim, refutedBy } so the measurement can be checked for discriminating power"
        });
        continue;
      }
      if (!refutedBy || String(refutedBy).trim().length < 10) {
        problems.push({
          prediction: id,
          problem: "no refutedBy: name the observation that would show this prediction is false"
        });
      }
    }
  }
  if (results && typeof results === "object") {
    for (const [id, value] of Object.entries(results)) {
      const verdict = typeof value === "string" ? value : value?.verdict;
      const observed = typeof value === "string" ? void 0 : value?.observed;
      if (typeof verdict === "string" && /^HELD/i.test(verdict.trim())) {
        if (!observed || String(observed).trim().length < 10) {
          problems.push({
            prediction: id,
            problem: "HELD with no `observed`: state what was actually measured. A verdict with nothing behind it is the failure this gate exists for"
          });
        }
      }
    }
  }
  return problems;
}
async function registerRoutes(httpServer, app) {
  const corsOriginConfig = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "";
  const allowedOrigins = corsOriginConfig ? corsOriginConfig.split(",").map((o) => o.trim().replace(/\/$/, "")) : [];
  function matchesOrigin(origin, pattern) {
    if (pattern === "*") return true;
    if (pattern === origin) return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      try {
        const url = new URL(origin);
        return url.hostname.endsWith(suffix);
      } catch {
        return false;
      }
    }
    return false;
  }
  function isLocalOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }
  const identityServiceUrl = getIdentityServiceUrl();
  if (identityServiceUrl) {
    try {
      const url = new URL(identityServiceUrl);
      const identityOrigin = url.origin;
      if (!allowedOrigins.includes(identityOrigin)) {
        allowedOrigins.push(identityOrigin);
      }
    } catch (e) {
      console.warn("Failed to parse identity service URL for CORS:", e);
    }
  }
  const PUBLIC_CORS_PATHS = /* @__PURE__ */ new Set([
    "/api/bootstrap",
    "/api/bootstrap/summary",
    "/api/openapi.json",
    "/openapi.json",
    "/llm.txt",
    "/llms.txt",
    "/llms-full.txt",
    "/docs/openapi.json",
    "/docs/llms.txt",
    "/docs/llms-full.txt"
  ]);
  const docsRoot = path2.resolve(process.cwd(), "docs");
  const sendDocFile = (res, filename, contentType) => {
    const filePath = path2.join(docsRoot, filename);
    if (!fs2.existsSync(filePath)) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.type(contentType).sendFile(filePath);
  };
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isPublicCorsPath = PUBLIC_CORS_PATHS.has(req.path);
    const isPublicCorsRequest = isPublicCorsPath && (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS");
    if (origin) {
      const normalizedOrigin = origin.replace(/\/$/, "");
      const allowAnyOrigin = allowedOrigins.length === 0 && process.env.NODE_ENV !== "production";
      const allowLocal = process.env.NODE_ENV !== "production" && isLocalOrigin(normalizedOrigin);
      const allowListed = allowedOrigins.some((pattern) => matchesOrigin(normalizedOrigin, pattern));
      if (allowAnyOrigin || allowLocal || allowListed) {
        res.header("Access-Control-Allow-Origin", normalizedOrigin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref");
        res.header("Access-Control-Max-Age", "86400");
      } else if (isPublicCorsRequest) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref");
        res.header("Access-Control-Max-Age", "86400");
      }
    } else if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref");
      res.header("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") {
      if (origin && allowedOrigins.length > 0) {
        const normalizedOrigin = origin.replace(/\/$/, "");
        const allowListed = allowedOrigins.some((pattern) => matchesOrigin(normalizedOrigin, pattern));
        if (!allowListed && !isPublicCorsPath) {
          return res.sendStatus(403);
        }
      }
      if (origin && allowedOrigins.length === 0 && process.env.NODE_ENV === "production" && !isPublicCorsPath) {
        return res.sendStatus(403);
      }
      return res.sendStatus(200);
    }
    next();
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "catalog" });
  });
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/llm.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/llms.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/llms-full.txt", (_req, res) => {
    res.redirect(302, "/docs/llms-full.txt");
  });
  app.get("/api/openapi.json", (req, res) => {
    res.json(openApiSpec);
  });
  app.get("/docs/openapi.json", (req, res) => {
    res.json(openApiSpec);
  });
  app.get("/docs/llms.txt", (req, res) => {
    sendDocFile(res, "llms.txt", "text/plain");
  });
  app.get("/docs/llms-full.txt", (req, res) => {
    sendDocFile(res, "llms-full.txt", "text/plain");
  });
  const filterPublicResources = (resources2) => {
    return resources2.filter((resource) => {
      const policy = resource.accessPolicy || defaultAccessPolicy;
      const readPolicy = policy.actions?.read?.anyOf || ["public"];
      return readPolicy.includes("public") && resource.status === "published";
    });
  };
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "catalog",
      version: "1.0.0",
      description: "Resource catalog for graphs, components, executors, and contexts",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt"
      },
      endpoints: {
        auth: "/api/auth",
        resources: "/api/resources",
        graphs: "/api/graphs",
        contexts: "/api/contexts",
        artifacts: "/api/artifacts",
        versions: "/api/versions",
        search: "/api/search",
        apiKeys: "/api/auth/keys",
        bootstrap: "/api/bootstrap",
        bootstrapSummary: "/api/bootstrap/summary"
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)"
      ]
    });
  });
  app.get("/api/bootstrap", async (req, res) => {
    try {
      const bootstrapResources = await storage.getBootstrapResources();
      const publicResources = filterPublicResources(bootstrapResources);
      res.json(publicResources);
    } catch (error) {
      console.error("Error fetching bootstrap resources:", error);
      res.status(500).json({ error: "Failed to fetch bootstrap resources" });
    }
  });
  app.get("/api/bootstrap/summary", async (req, res) => {
    try {
      const bootstrapResources = await storage.getBootstrapResources();
      const publicResources = filterPublicResources(bootstrapResources);
      const summary = buildBootstrapSummary(publicResources);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching bootstrap summary:", error);
      res.status(500).json({ error: "Failed to fetch bootstrap summary" });
    }
  });
  app.get("/api/auth/config", (req, res) => {
    res.json({
      identityServiceUrl: getIdentityServiceUrl(),
      loginUrl: `${getIdentityServiceUrl()}/login`,
      logoutUrl: `${getIdentityServiceUrl()}/api/auth/logout`
    });
  });
  app.get("/api/auth/me", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const orgs = await getUserOrganizations(req.token);
      res.json({
        user: req.user,
        organizations: orgs
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });
  app.get("/api/stats", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app.get("/api/resources", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      console.log("[Resources] GET /api/resources query:", req.query);
      const allResources = await storage.getResources();
      let accessibleResources = filterResourcesByReadAccess(allResources, req.user);
      console.log("[Resources] Total accessible:", accessibleResources.length);
      const typeFilter = req.query.type;
      console.log("[Resources] Type filter:", typeFilter);
      if (typeFilter) {
        accessibleResources = accessibleResources.filter((r) => r.type === typeFilter);
        console.log("[Resources] After type filter:", accessibleResources.length);
      }
      const statusFilter = req.query.status;
      if (statusFilter) {
        accessibleResources = accessibleResources.filter((r) => r.status === statusFilter);
        console.log("[Resources] After status filter:", accessibleResources.length);
      }
      const keyFilter = req.query.key;
      if (keyFilter) {
        accessibleResources = accessibleResources.filter((r) => r.key === keyFilter);
      }
      res.json(accessibleResources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });
  app.get("/api/resources/:id", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(getParam(req.params, "id"));
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "read")) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error fetching resource:", error);
      res.status(500).json({ error: "Failed to fetch resource" });
    }
  });
  app.post("/api/resources", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      if (!req.user?.isSuperAdmin && !canPerformAction(req.user, { accessPolicy: defaultAccessPolicy }, "write")) {
        if (!requirePrincipal(req, res)) return;
        return res.status(403).json({ error: "You don't have permission to create resources" });
      }
      const validatedData = createResourceSchema.parse(req.body);
      const keyIsModels = validatedData.key.startsWith("models/");
      if (keyIsModels !== (validatedData.type === "model")) {
        return res.status(400).json({
          error: "key-prefix and type disagree: keys under models/ must have type 'model', and type 'model' requires a models/ key"
        });
      }
      if (keyIsModels && !/^models\/[a-z0-9][\w.-]*\/.+$/.test(validatedData.key)) {
        return res.status(400).json({
          error: "model keys are models/<publisher>/<name>: publisher segment required (use 'local' when there is no upstream)"
        });
      }
      if (validatedData.type === "component") {
        const raw = validatedData.metadata ?? {};
        const manifestInput = raw.manifest ?? raw;
        const manifest = componentManifestSchema.safeParse(manifestInput);
        if (!manifest.success) {
          return res.status(400).json({
            error: "Invalid component manifest",
            details: manifest.error.errors
          });
        }
        validatedData.metadata = { ...raw, manifest: manifest.data };
      }
      {
        const mapProblems = checkMapDiscipline(
          validatedData.metadata,
          validatedData.tags
        );
        if (mapProblems.length) {
          validatedData.metadata = {
            ...validatedData.metadata ?? {},
            mapDiscipline: {
              assessed: (/* @__PURE__ */ new Date()).toISOString(),
              gaps: mapProblems,
              meaning: "These predictions or verdicts do not state, separably, what would have refuted them or what was observed. That does not make them wrong \u2014 it makes them uncheckable by anything but a reader.",
              limit: "This assessment is structural. Whether an observation bears on a refutation is a semantic judgement no write gate can make."
            }
          };
        }
      }
      if (validatedData.type === "graph") {
        const def = validatedData.metadata?.definition;
        const problems = await checkGraphAgainstManifests(def, (k) => storage.getResourceByKey(k));
        if (problems.length) {
          return res.status(400).json({
            error: "graph does not match the component manifests it references",
            problems,
            note: "Every component declares its config in a signed manifest. Read one with GET /api/resources?key=components/<component-key>."
          });
        }
      }
      if (validatedData.type === "app") {
        const raw = validatedData.metadata ?? {};
        const manifestInput = raw.manifest ?? raw;
        const manifest = appManifestSchema.safeParse(manifestInput);
        if (!manifest.success) {
          return res.status(400).json({
            error: "Invalid app manifest",
            details: manifest.error.errors
          });
        }
        const unmet = await checkAppRequires(manifest.data);
        if (unmet.length > 0) {
          return res.status(409).json({
            error: "App requirements not met by this platform",
            platformVersion: PLATFORM_VERSION,
            unmet
          });
        }
        validatedData.metadata = { ...raw, manifest: manifest.data };
      }
      const existing = await storage.getResourceByKey(validatedData.key);
      if (existing) {
        return res.status(400).json({ error: "A resource with this key already exists" });
      }
      const resourceData = {
        ...validatedData,
        accessPolicy: validatedData.accessPolicy || defaultAccessPolicy
      };
      const resource = await storage.createResource({
        ...resourceData,
        createdBy: req.user?.id ?? null
      });
      registryLedger(req, "register", resource);
      res.status(201).json(resource);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });
  app.patch("/api/resources/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(getParam(req.params, "id"));
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "write")) {
        if (!requirePrincipal(req, res)) return;
        return res.status(403).json({ error: "You don't have permission to edit this resource" });
      }
      const validatedData = updateResourceSchema.parse(req.body);
      {
        const effKey = validatedData.key ?? resource.key;
        const effType = validatedData.type ?? resource.type;
        if (effKey.startsWith("models/") !== (effType === "model")) {
          return res.status(400).json({
            error: "key-prefix and type disagree: keys under models/ must have type 'model', and type 'model' requires a models/ key"
          });
        }
      }
      if (validatedData.key && validatedData.key !== resource.key) {
        const existing = await storage.getResourceByKey(validatedData.key);
        if (existing) {
          return res.status(400).json({ error: "A resource with this key already exists" });
        }
      }
      const effectiveType = validatedData.type ?? resource.type;
      if (validatedData.metadata !== void 0 && validatedData.metadata !== null) {
        const raw = validatedData.metadata;
        const manifestInput = raw.manifest ?? raw;
        if (effectiveType === "component") {
          const manifest = componentManifestSchema.safeParse(manifestInput);
          if (!manifest.success) {
            return res.status(400).json({
              error: "Invalid component manifest",
              details: manifest.error.errors
            });
          }
          validatedData.metadata = { ...raw, manifest: manifest.data };
        }
        if (effectiveType === "app") {
          const manifest = appManifestSchema.safeParse(manifestInput);
          if (!manifest.success) {
            return res.status(400).json({
              error: "Invalid app manifest",
              details: manifest.error.errors
            });
          }
          const unmet = await checkAppRequires(manifest.data);
          if (unmet.length > 0) {
            return res.status(409).json({
              error: "App requirements not met by this platform",
              platformVersion: PLATFORM_VERSION,
              unmet
            });
          }
          validatedData.metadata = { ...raw, manifest: manifest.data };
        }
      }
      const updated = await storage.updateResource(getParam(req.params, "id"), validatedData);
      registryLedger(req, "update", updated ?? resource);
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });
  app.delete("/api/resources/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(getParam(req.params, "id"));
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "delete")) {
        if (!requirePrincipal(req, res)) return;
        return res.status(403).json({ error: "You don't have permission to delete this resource" });
      }
      const deleted = await storage.deleteResource(getParam(req.params, "id"));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });
  const bulkActionSchema = z2.object({
    ids: z2.array(z2.string()).min(1).max(100),
    action: z2.enum(["publish", "delete", "updateStatus", "addTags", "removeTags"]),
    payload: z2.object({
      status: z2.enum(resourceStatuses).optional(),
      tags: z2.array(z2.string()).optional()
    }).optional()
  });
  app.post("/api/resources/bulk", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const validated = bulkActionSchema.parse(req.body);
      const { ids, action, payload } = validated;
      const results = [];
      for (const id of ids) {
        try {
          const resource = await storage.getResource(id);
          if (!resource) {
            results.push({ id, status: "failed", error: "Resource not found" });
            continue;
          }
          const requiredAction = action === "publish" ? "publish" : action === "delete" ? "delete" : "write";
          if (!canPerformAction(req.user, resource, requiredAction)) {
            results.push({ id, status: "failed", error: "Access denied" });
            continue;
          }
          switch (action) {
            case "publish":
              await storage.updateResource(id, { status: "published" });
              await storage.publishVersion(id);
              results.push({ id, status: "success" });
              break;
            case "delete":
              await storage.deleteResource(id);
              results.push({ id, status: "success" });
              break;
            case "updateStatus":
              if (!payload?.status) {
                results.push({ id, status: "failed", error: "Status is required" });
                break;
              }
              await storage.updateResource(id, { status: payload.status });
              results.push({ id, status: "success" });
              break;
            case "addTags":
              if (!payload?.tags || payload.tags.length === 0) {
                results.push({ id, status: "failed", error: "Tags are required" });
                break;
              }
              const currentTags = resource.tags || [];
              const newTags = Array.from(/* @__PURE__ */ new Set([...currentTags, ...payload.tags]));
              await storage.updateResource(id, { tags: newTags });
              results.push({ id, status: "success" });
              break;
            case "removeTags":
              if (!payload?.tags || payload.tags.length === 0) {
                results.push({ id, status: "failed", error: "Tags are required" });
                break;
              }
              const filteredTags = (resource.tags || []).filter((t) => !payload.tags.includes(t));
              await storage.updateResource(id, { tags: filteredTags });
              results.push({ id, status: "success" });
              break;
            default:
              results.push({ id, status: "failed", error: "Unknown action" });
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          results.push({ id, status: "failed", error: errorMessage });
        }
      }
      const successCount = results.filter((r) => r.status === "success").length;
      const failureCount = results.filter((r) => r.status === "failed").length;
      res.json({
        summary: {
          total: ids.length,
          succeeded: successCount,
          failed: failureCount
        },
        results
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error performing bulk operation:", error);
      res.status(500).json({ error: "Failed to perform bulk operation" });
    }
  });
  app.post("/api/resources/:id/publish", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(getParam(req.params, "id"));
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "publish")) {
        if (!requirePrincipal(req, res)) return;
        return res.status(403).json({ error: "You don't have permission to publish this resource" });
      }
      const version = await storage.publishVersion(getParam(req.params, "id"));
      registryLedger(req, "publish", resource);
      res.json(version);
    } catch (error) {
      console.error("Error publishing resource:", error);
      res.status(500).json({ error: "Failed to publish resource" });
    }
  });
  app.get("/api/resources/:id/versions", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const versions = await storage.getResourceVersions(getParam(req.params, "id"));
      res.json(versions);
    } catch (error) {
      console.error("Error fetching versions:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });
  app.get("/api/versions", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const versions = await storage.getVersions();
      res.json(versions);
    } catch (error) {
      console.error("Error fetching versions:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });
  app.get("/api/resources/:id/artifacts", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resourceArtifacts = await storage.getResourceArtifacts(getParam(req.params, "id"));
      res.json(resourceArtifacts);
    } catch (error) {
      console.error("Error fetching artifacts:", error);
      res.status(500).json({ error: "Failed to fetch artifacts" });
    }
  });
  app.get("/api/resources/:id/signatures", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resourceSignatures = await storage.getResourceSignatures(getParam(req.params, "id"));
      res.json(resourceSignatures);
    } catch (error) {
      console.error("Error fetching signatures:", error);
      res.status(500).json({ error: "Failed to fetch signatures" });
    }
  });
  app.get("/api/resources/:id/certifications", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resourceCertifications = await storage.getResourceCertifications(getParam(req.params, "id"));
      res.json(resourceCertifications);
    } catch (error) {
      console.error("Error fetching certifications:", error);
      res.status(500).json({ error: "Failed to fetch certifications" });
    }
  });
  app.post("/api/search", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const { query, type, status } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      const allResults = await storage.searchResources(query, type, status);
      const accessibleResults = filterResourcesByReadAccess(allResults, req.user);
      res.json(accessibleResults);
    } catch (error) {
      console.error("Error searching resources:", error);
      res.status(500).json({ error: "Failed to search resources" });
    }
  });
  app.post("/api/nl/search", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const { query, type, status } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      const allResults = await storage.searchResources(query, type, status);
      const accessibleResults = filterResourcesByReadAccess(allResults, req.user);
      res.json(accessibleResults);
    } catch (error) {
      console.error("Error searching resources:", error);
      res.status(500).json({ error: "Failed to search resources" });
    }
  });
  app.get("/api/api-keys", authMiddleware, requireSuperAdmin, searchRateLimiter, async (req, res) => {
    try {
      const keys = await storage.getApiKeys();
      const safeKeys = keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        createdBy: k.createdBy,
        createdByName: k.createdByName,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        isActive: k.isActive,
        createdAt: k.createdAt
      }));
      res.json(safeKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });
  app.post("/api/api-keys", authMiddleware, requireSuperAdmin, writeRateLimiter, async (req, res) => {
    try {
      const { name, expiresAt } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Name is required" });
      }
      const { key, prefix, hash } = generateApiKey();
      const apiKey = await storage.createApiKey({
        name: name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        createdBy: req.user.id,
        createdByName: req.user.name,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true
      });
      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        key,
        // Full key - show only once!
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });
  app.delete("/api/api-keys/:id", authMiddleware, requireSuperAdmin, writeRateLimiter, async (req, res) => {
    try {
      const deleted = await storage.deleteApiKey(getParam(req.params, "id"));
      if (!deleted) {
        return res.status(404).json({ error: "API key not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
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
  app.delete("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}`;
    app._router.handle(req, res, next);
  });
  app.get("/api/graphs", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const { orgId } = req.query;
      let graphs;
      if (orgId && typeof orgId === "string") {
        graphs = await storage.getResourcesByTypeAndOrg("graph", orgId);
      } else {
        graphs = await storage.getResourcesByType("graph");
      }
      const accessibleGraphs = filterResourcesByReadAccess(graphs, req.user);
      res.json(accessibleGraphs);
    } catch (error) {
      console.error("Error fetching graphs:", error);
      res.status(500).json({ error: "Failed to fetch graphs" });
    }
  });
  app.get("/api/graphs/:id", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const graph = await storage.getResource(getParam(req.params, "id"));
      if (!graph || graph.type !== "graph") {
        return res.status(404).json({ error: "Graph not found" });
      }
      if (!canPerformAction(req.user, graph, "read")) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(graph);
    } catch (error) {
      console.error("Error fetching graph:", error);
      res.status(500).json({ error: "Failed to fetch graph" });
    }
  });
  app.post("/api/graphs", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const validatedData = createGraphSchema.parse(req.body);
      if (!req.user?.isSuperAdmin) {
        const userOrgs = req.user?.organizations?.map((o) => o.id) || [];
        if (!userOrgs.includes(validatedData.orgId)) {
          return res.status(403).json({ error: "You can only create graphs in your own organizations" });
        }
      }
      const existing = await storage.getResourceByKey(validatedData.key);
      if (existing) {
        return res.status(400).json({ error: "A resource with this key already exists" });
      }
      const orgAccessPolicy = {
        visibility: "org",
        actions: {
          read: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
          write: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
          delete: { anyOf: [`role:admin:${validatedData.orgId}`] }
        }
      };
      const resourceData = {
        key: validatedData.key,
        name: validatedData.name,
        description: validatedData.description,
        type: "graph",
        orgId: validatedData.orgId,
        tags: validatedData.tags,
        metadata: validatedData.metadata,
        accessPolicy: orgAccessPolicy
      };
      const graph = await storage.createResource(resourceData);
      res.status(201).json(graph);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        const unknownKeys = error.errors.filter((e) => e.code === "unrecognized_keys").flatMap((e) => e.keys ?? []);
        if (unknownKeys.length > 0) {
          return res.status(400).json({
            error: `Unrecognised field(s): ${unknownKeys.join(", ")}. These are not stored.`,
            hint: unknownKeys.includes("content") ? "A graph definition belongs in metadata.definition, which is also what the control center renders from." : "Accepted fields: key, name, description, orgId, tags, metadata.",
            details: error.errors
          });
        }
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error creating graph:", error);
      res.status(500).json({ error: "Failed to create graph" });
    }
  });
  app.patch("/api/graphs/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const graph = await storage.getResource(getParam(req.params, "id"));
      if (!graph || graph.type !== "graph") {
        return res.status(404).json({ error: "Graph not found" });
      }
      if (!canPerformAction(req.user, graph, "write")) {
        return res.status(403).json({ error: "You don't have permission to edit this graph" });
      }
      const validatedData = updateGraphSchema.parse(req.body);
      const updateData = {};
      if (validatedData.name) updateData.name = validatedData.name;
      if (validatedData.description !== void 0) updateData.description = validatedData.description;
      if (validatedData.tags) updateData.tags = validatedData.tags;
      if (validatedData.metadata) updateData.metadata = validatedData.metadata;
      const updated = await storage.updateResource(getParam(req.params, "id"), updateData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error updating graph:", error);
      res.status(500).json({ error: "Failed to update graph" });
    }
  });
  app.delete("/api/graphs/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const graph = await storage.getResource(getParam(req.params, "id"));
      if (!graph || graph.type !== "graph") {
        return res.status(404).json({ error: "Graph not found" });
      }
      if (!canPerformAction(req.user, graph, "delete")) {
        return res.status(403).json({ error: "You don't have permission to delete this graph" });
      }
      await storage.deleteResource(getParam(req.params, "id"));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting graph:", error);
      res.status(500).json({ error: "Failed to delete graph" });
    }
  });
  app.get("/api/contexts", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const { orgId } = req.query;
      let contexts;
      if (orgId && typeof orgId === "string") {
        contexts = await storage.getResourcesByTypeAndOrg("context", orgId);
      } else {
        contexts = await storage.getResourcesByType("context");
      }
      const accessibleContexts = filterResourcesByReadAccess(contexts, req.user);
      res.json(accessibleContexts);
    } catch (error) {
      console.error("Error fetching contexts:", error);
      res.status(500).json({ error: "Failed to fetch contexts" });
    }
  });
  app.get("/api/contexts/:id", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const context = await storage.getResource(getParam(req.params, "id"));
      if (!context || context.type !== "context") {
        return res.status(404).json({ error: "Context not found" });
      }
      if (!canPerformAction(req.user, context, "read")) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(context);
    } catch (error) {
      console.error("Error fetching context:", error);
      res.status(500).json({ error: "Failed to fetch context" });
    }
  });
  app.post("/api/contexts", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const validatedData = createContextSchema.parse(req.body);
      if (validatedData.orgId && !req.user?.isSuperAdmin) {
        const userOrgs = req.user?.organizations?.map((o) => o.id) || [];
        if (!userOrgs.includes(validatedData.orgId)) {
          return res.status(403).json({ error: "You can only create contexts in your own organizations" });
        }
      }
      const existing = await storage.getResourceByKey(validatedData.key);
      if (existing) {
        return res.status(400).json({ error: "A resource with this key already exists" });
      }
      let accessPolicy;
      if (validatedData.orgId) {
        accessPolicy = {
          visibility: "org",
          actions: {
            read: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
            write: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
            delete: { anyOf: [`role:admin:${validatedData.orgId}`] }
          }
        };
      } else {
        accessPolicy = defaultAccessPolicy;
      }
      const resourceData = {
        key: validatedData.key,
        name: validatedData.name,
        description: validatedData.description,
        type: "context",
        orgId: validatedData.orgId,
        tags: validatedData.tags,
        metadata: validatedData.metadata,
        accessPolicy
      };
      const context = await storage.createResource(resourceData);
      res.status(201).json(context);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error creating context:", error);
      res.status(500).json({ error: "Failed to create context" });
    }
  });
  app.patch("/api/contexts/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const context = await storage.getResource(getParam(req.params, "id"));
      if (!context || context.type !== "context") {
        return res.status(404).json({ error: "Context not found" });
      }
      if (!canPerformAction(req.user, context, "write")) {
        return res.status(403).json({ error: "You don't have permission to edit this context" });
      }
      const validatedData = updateContextSchema.parse(req.body);
      const updated = await storage.updateResource(getParam(req.params, "id"), validatedData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error updating context:", error);
      res.status(500).json({ error: "Failed to update context" });
    }
  });
  app.delete("/api/contexts/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const context = await storage.getResource(getParam(req.params, "id"));
      if (!context || context.type !== "context") {
        return res.status(404).json({ error: "Context not found" });
      }
      if (!canPerformAction(req.user, context, "delete")) {
        return res.status(403).json({ error: "You don't have permission to delete this context" });
      }
      await storage.deleteResource(getParam(req.params, "id"));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting context:", error);
      res.status(500).json({ error: "Failed to delete context" });
    }
  });
  app.post("/api/resources/:id/artifacts", authMiddleware, uploadRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(getParam(req.params, "id"));
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "write")) {
        return res.status(403).json({ error: "You don't have permission to upload artifacts" });
      }
      const { name, type, content } = req.body;
      if (!name || !type || !content) {
        return res.status(400).json({ error: "name, type, and content are required" });
      }
      const buffer = Buffer.from(content, "base64");
      const validation = artifactStorage.validateFile(buffer.length, type);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      const storageUrl = await artifactStorage.save(getParam(req.params, "id"), name, buffer);
      const artifact = await storage.createArtifact({
        resourceId: getParam(req.params, "id"),
        name,
        mimeType: type,
        size: buffer.length,
        checksum: __require("crypto").createHash("sha256").update(buffer).digest("hex"),
        storageUrl
      });
      res.status(201).json(artifact);
    } catch (error) {
      console.error("Error uploading artifact:", error);
      res.status(500).json({ error: "Failed to upload artifact" });
    }
  });
  app.get("/api/artifacts/:id/download", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const artifact = await storage.getArtifact(getParam(req.params, "id"));
      if (!artifact) {
        return res.status(404).json({ error: "Artifact not found" });
      }
      const resource = await storage.getResource(artifact.resourceId);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "read")) {
        return res.status(403).json({ error: "Access denied" });
      }
      const data = await artifactStorage.load(artifact.storageUrl || "");
      res.setHeader("Content-Type", artifact.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.name}"`);
      res.send(data);
    } catch (error) {
      console.error("Error downloading artifact:", error);
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });
  app.delete("/api/artifacts/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const artifact = await storage.getArtifact(getParam(req.params, "id"));
      if (!artifact) {
        return res.status(404).json({ error: "Artifact not found" });
      }
      const resource = await storage.getResource(artifact.resourceId);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, "delete")) {
        return res.status(403).json({ error: "You don't have permission to delete artifacts" });
      }
      await artifactStorage.delete(artifact.storageUrl || "");
      await storage.deleteArtifact(getParam(req.params, "id"));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting artifact:", error);
      res.status(500).json({ error: "Failed to delete artifact" });
    }
  });
  app.get("/api/rate-limits", authMiddleware, (req, res) => {
    res.json({
      windowMs: RATE_LIMITS.windowMs,
      limits: {
        write: RATE_LIMITS.writeMaxRequests,
        search: RATE_LIMITS.searchMaxRequests,
        upload: RATE_LIMITS.uploadMaxRequests
      }
    });
  });
  app.get("/symbia-namespace", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resources2 = await storage.getResources();
      res.json({
        namespace: "catalog",
        version: "1.0.0",
        resources: resources2.map((r) => ({
          type: r.type,
          key: r.key,
          name: r.name,
          description: r.description,
          status: r.status,
          tags: r.tags,
          metadata: r.metadata
        }))
      });
    } catch (error) {
      console.error("Error fetching namespace:", error);
      res.status(500).json({ error: "Failed to fetch namespace" });
    }
  });
  return httpServer;
}

// ../../catalog/server/src/service.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var middleware = [authMiddleware];
function transformResource(resource) {
  return {
    id: resource.id,
    key: resource.key,
    name: resource.name,
    description: resource.description || null,
    type: resource.type,
    status: resource.status || "published",
    isBootstrap: resource.isBootstrap ?? true,
    tags: resource.tags || [],
    orgId: resource.orgId || null,
    accessPolicy: resource.accessPolicy || {
      visibility: "public",
      actions: {
        read: { anyOf: ["public"] },
        write: { anyOf: ["cap:registry.write", "role:admin"] },
        publish: { anyOf: ["cap:registry.publish", "role:publisher"] },
        delete: { anyOf: ["role:admin"] }
      }
    },
    metadata: resource.metadata || {},
    createdAt: resource.createdAt ? new Date(resource.createdAt) : /* @__PURE__ */ new Date(),
    updatedAt: resource.updatedAt ? new Date(resource.updatedAt) : /* @__PURE__ */ new Date()
  };
}
async function insertResources(data) {
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const transformed = batch.map(transformResource);
    await db.insert(resources).values(transformed);
    inserted += batch.length;
  }
  return inserted;
}
async function seedFromDataFiles() {
  const candidates = [
    process.env.CATALOG_DATA_DIR,
    join(__dirname, "..", "data"),
    // container: /app/dist -> /app/data
    join(__dirname, "..", "..", "data"),
    // source: server/src -> catalog/data
    join(__dirname, "data")
    // bundle at package root
  ].filter(Boolean);
  const dataDir = candidates.find((c) => existsSync(c));
  if (!dataDir) {
    console.log(`[catalog] Data directory not found. Tried: ${candidates.join(", ")}`);
    return 0;
  }
  console.log(`[catalog] Bootstrap data directory: ${dataDir}`);
  const resourceMap = /* @__PURE__ */ new Map();
  const snapshotFiles = readdirSync(dataDir).filter((f) => f.startsWith("catalog-snapshot-") && f.endsWith(".json")).sort().reverse();
  if (snapshotFiles.length > 0) {
    const snapshotPath = join(dataDir, snapshotFiles[0]);
    console.log(`[catalog] Loading snapshot: ${snapshotFiles[0]}`);
    try {
      const content = readFileSync(snapshotPath, "utf-8");
      const snapshotData = JSON.parse(content);
      if (Array.isArray(snapshotData)) {
        for (const resource of snapshotData) {
          if (resource.id) {
            resourceMap.set(resource.id, resource);
          }
        }
        console.log(`[catalog]   \u2713 Found ${snapshotData.length} resources in snapshot`);
      }
    } catch (error) {
      console.error(`[catalog] Failed to load snapshot:`, error);
    }
  }
  const bootstrapFiles = readdirSync(dataDir).filter((f) => f.endsWith("-bootstrap.json")).sort();
  for (const file of bootstrapFiles) {
    const filePath = join(dataDir, file);
    console.log(`[catalog] Loading bootstrap: ${file}`);
    try {
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      if (!Array.isArray(data)) {
        console.warn(`[catalog]   Skipping ${file}: not an array`);
        continue;
      }
      let added = 0;
      let updated = 0;
      for (const resource of data) {
        if (resource.id) {
          if (resourceMap.has(resource.id)) {
            updated++;
          } else {
            added++;
          }
          resourceMap.set(resource.id, resource);
        }
      }
      console.log(`[catalog]   \u2713 ${file}: ${added} added, ${updated} updated`);
    } catch (error) {
      console.error(`[catalog]   Failed to load ${file}:`, error);
    }
  }
  const allResources = Array.from(resourceMap.values());
  console.log(`[catalog] Inserting ${allResources.length} total resources...`);
  const inserted = await insertResources(allResources);
  return inserted;
}
var BOOTSTRAP_COMPLETED_KEY = "bootstrap_completed";
async function isBootstrapCompleted() {
  try {
    const result = await db.select().from(systemSettings).where(eq2(systemSettings.key, BOOTSTRAP_COMPLETED_KEY));
    return result.length > 0 && result[0].value === "true";
  } catch (error) {
    console.log("[catalog] Could not check bootstrap flag (table may not exist yet)");
    return false;
  }
}
async function markBootstrapCompleted() {
  try {
    await db.insert(systemSettings).values({
      key: BOOTSTRAP_COMPLETED_KEY,
      value: "true"
    }).onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: "true", updatedAt: /* @__PURE__ */ new Date() }
    });
  } catch (error) {
    console.error("[catalog] Failed to mark bootstrap as completed:", error);
  }
}
async function runFirstTimeBootstrap() {
  const completed = await isBootstrapCompleted();
  if (completed) {
    console.log("[catalog] Bootstrap already completed, skipping.");
    return;
  }
  console.log("[catalog] First run detected, loading bootstrap data...");
  try {
    const count = await seedFromDataFiles();
    if (count > 0) {
      console.log(`[catalog] \u2713 Loaded ${count} bootstrap resources`);
      await markBootstrapCompleted();
      console.log("[catalog] \u2713 Bootstrap marked as completed (will not run again)");
    } else {
      console.log("[catalog] No bootstrap data found to load");
    }
  } catch (error) {
    console.error("[catalog] Failed to run bootstrap:", error);
  }
}
async function bootstrap() {
  await runFirstTimeBootstrap();
}
export {
  authMiddleware,
  bootstrap,
  middleware,
  registerRoutes
};
