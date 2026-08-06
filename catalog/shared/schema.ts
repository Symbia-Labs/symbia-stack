import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Resource statuses
export const resourceStatuses = ["draft", "published", "deprecated"] as const;
export type ResourceStatus = (typeof resourceStatuses)[number];

// Resource types
export const resourceTypes = ["context", "integration", "graph", "assistant", "component", "app"] as const;
export type ResourceType = (typeof resourceTypes)[number];

// Component manifest — for resources of type 'component'.
// Declares the typed input/output ports a runtime component exposes and the
// capability required to execute it, so a graph node referencing this component
// can be validated against a contract at load time (runtime roadmap Phase 1).
export type ComponentImplKind =
  | "builtin"        // compiled implementation shipped in the runtime bundle
  | "expression"     // sandboxed JS expression
  | "wasm"           // WebAssembly module
  | "integration"    // delegates to an Integrations/MCP operation
  | "remote-service";// delegates to an external service
export interface ComponentPort {
  name: string;
  schema?: Record<string, unknown>; // JSON Schema for the port payload (optional)
  required?: boolean;
}
export interface ComponentManifest {
  key: string;                    // e.g. "symbia.state.join"
  version: string;                // semver
  implementation: ComponentImplKind;
  inputs: ComponentPort[];
  outputs: ComponentPort[];
  capability?: string;            // capability/gate required to execute
  description?: string;
}
export const componentPortSchema = z.object({
  name: z.string().min(1),
  schema: z.record(z.unknown()).optional(),
  required: z.boolean().optional(),
});
export const componentManifestSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  implementation: z.enum(["builtin", "expression", "wasm", "integration", "remote-service"]),
  inputs: z.array(componentPortSchema).default([]),
  outputs: z.array(componentPortSchema).default([]),
  capability: z.string().optional(),
  description: z.string().optional(),
});

// App manifest — for resources of type 'app'. See docs/APP-MODEL.md.
//
// An app is the delta over the bare platform: a declared, versioned bundle of
// configuration and customization, built to solve one problem, publishable and
// deployable onto any Symbia stack, always executing within the Symbia runtime
// network. The platform itself is NOT an app — it is the substrate.
//
// The artifact/installation split matters here: this manifest describes the
// ARTIFACT. Anything specific to one deployment — org, config values, secrets,
// running executions, operator state, derived series — belongs to the
// installation and must not appear in it. Baking an org id or a metric
// namespace into the manifest is how an app stops being portable.
export interface AppSurfaces {
  ingress?: string[];        // graph names accepting external delivery
  metrics?: string[];        // metric series this app derives
  ui?: string | null;        // path the app's built UI is served from; null = none
}
export interface AppConfigField {
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
  default?: unknown;
}
export interface AppManifest {
  key: string;                    // e.g. "apps/control-center"
  version: string;                // semver
  description?: string;
  // What the platform must provide for this app to install at all. Checked at
  // install time and refused if unmet — the same idea as load-time component
  // resolution (runtime Phase 1), applied to a whole app. Without this an app
  // silently inherits platform defaults and breaks elsewhere: on 6 Aug 2026 the
  // energy pipeline assumed keyField defaulted to "point" and derived null on a
  // stack where it did not.
  requires?: {
    platform?: string;            // semver range
    components?: string[];        // e.g. "symbia.state.join@^1.2.0"
    services?: string[];          // platform services the app calls
  };
  // What the app carries. Definitions travel with the artifact; an app that
  // only references resources cannot be deployed anywhere else.
  provides?: {
    graphs?: string[];
    components?: string[];
    ingresses?: string[];
  };
  surfaces?: AppSurfaces;
  // Schema only. Values are supplied per installation.
  config?: Record<string, AppConfigField>;
  // Isolation is the default. An app that needs to read across other apps —
  // an operator console is the honest example — must say so, and the grant is
  // then visible and auditable in the registry rather than assumed.
  privilege?: {
    crossAppRead?: boolean;
    crossOrgRead?: boolean;
    reason?: string;
  };
  // Named, with reasons. An app that cannot say what it left outside the
  // platform has not drawn a boundary, it has just stopped writing things down.
  outside?: { what: string; why: string }[];
  // Reserved: apps do not yet act. Ingress is gated on org membership, which
  // cannot separate two apps in the same org.
  principal?: string | null;
}

export const appConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
});
export const appManifestSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  requires: z.object({
    platform: z.string().optional(),
    components: z.array(z.string()).default([]),
    services: z.array(z.string()).default([]),
  }).optional(),
  provides: z.object({
    graphs: z.array(z.string()).default([]),
    components: z.array(z.string()).default([]),
    ingresses: z.array(z.string()).default([]),
  }).optional(),
  surfaces: z.object({
    ingress: z.array(z.string()).default([]),
    metrics: z.array(z.string()).default([]),
    // Nullable as well as optional, matching `principal`. An explicit null is
    // a statement — "this app was considered for a UI and has none" — which is
    // worth more than an absent key, and the schema should not force an author
    // to say it by omission.
    ui: z.string().nullable().optional(),
  }).optional(),
  config: z.record(appConfigFieldSchema).optional(),
  privilege: z.object({
    crossAppRead: z.boolean().optional(),
    crossOrgRead: z.boolean().optional(),
    reason: z.string().optional(),
  }).optional(),
  outside: z.array(z.object({
    what: z.string().min(1),
    why: z.string().min(1),
  })).default([]),
  principal: z.string().nullable().optional(),
}).superRefine((manifest, ctx) => {
  // A privilege granted without a stated reason is exactly the kind of
  // exception that becomes invisible six months later.
  const p = manifest.privilege;
  if ((p?.crossAppRead || p?.crossOrgRead) && !p?.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["privilege", "reason"],
      message: "privilege.reason is required when requesting crossAppRead or crossOrgRead",
    });
  }
});

// Assistant configuration - for resources of type 'assistant'
export interface AssistantConfig {
  principalId: string;
  principalType: "assistant";
  capabilities: string[];
  webhooks?: {
    message?: string;
    control?: string;
  };
  endpoints?: {
    [key: string]: string;
  };
  serviceConfig?: {
    loggingEndpoint?: string;
    identityEndpoint?: string;
    catalogEndpoint?: string;
    [key: string]: unknown;
  };
  modelConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

// Visibility levels
export const visibilityLevels = ["public", "org", "private"] as const;
export type VisibilityLevel = (typeof visibilityLevels)[number];

// Access policy actions
export const accessPolicyActions = ["read", "write", "publish", "sign", "certify", "delete"] as const;
export type AccessPolicyAction = (typeof accessPolicyActions)[number];

// Access policy type - stored per resource
export interface AccessPolicy {
  visibility: VisibilityLevel;
  actions: {
    [K in AccessPolicyAction]?: {
      anyOf: string[];
    };
  };
}

// Default access policy for new resources (private - only admins can access)
export const defaultAccessPolicy: AccessPolicy = {
  visibility: "private",
  actions: {
    read: { anyOf: ["role:admin", "cap:registry.write"] },
    write: { anyOf: ["cap:registry.write", "role:admin"] },
    publish: { anyOf: ["cap:registry.publish", "role:publisher", "role:admin"] },
    sign: { anyOf: ["cap:registry.sign", "role:admin"] },
    certify: { anyOf: ["cap:registry.certify", "role:admin"] },
    delete: { anyOf: ["role:admin"] },
  },
};

// Public access policy for bootstrap/published resources
export const publicAccessPolicy: AccessPolicy = {
  visibility: "public",
  actions: {
    read: { anyOf: ["public"] },
    write: { anyOf: ["cap:registry.write", "role:admin"] },
    publish: { anyOf: ["cap:registry.publish", "role:publisher", "role:admin"] },
    sign: { anyOf: ["cap:registry.sign", "role:admin"] },
    certify: { anyOf: ["cap:registry.certify", "role:admin"] },
    delete: { anyOf: ["role:admin"] },
  },
};

// Resources table - main registry entries
export const resources = pgTable("resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 255 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull().$type<ResourceType>(),
  status: varchar("status", { length: 50 }).notNull().default("draft").$type<ResourceStatus>(),
  isBootstrap: boolean("is_bootstrap").notNull().default(false),
  tags: text("tags").array(),
  orgId: varchar("org_id", { length: 255 }),
  accessPolicy: jsonb("access_policy").$type<AccessPolicy>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  currentVersion: integer("current_version").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("idx_resources_type").on(table.type),
  orgIdIdx: index("idx_resources_org_id").on(table.orgId),
  typeOrgIdx: index("idx_resources_type_org").on(table.type, table.orgId),
  statusIdx: index("idx_resources_status").on(table.status),
  bootstrapIdx: index("idx_resources_bootstrap").on(table.isBootstrap),
  updatedIdx: index("idx_resources_updated").on(table.updatedAt),
}));

// Resource versions table - version history
export const resourceVersions = pgTable("resource_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>(),
  changelog: text("changelog"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 255 }),
}, (table) => ({
  resourceVersionIdx: index("idx_resource_versions_resource_version").on(table.resourceId, table.version),
}));

// Artifacts table - binary/file attachments
export const artifacts = pgTable("artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  versionId: varchar("version_id").references(() => resourceVersions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: varchar("mime_type", { length: 255 }),
  size: integer("size"),
  checksum: varchar("checksum", { length: 255 }),
  storageUrl: text("storage_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  resourceIdx: index("idx_artifacts_resource_id").on(table.resourceId),
}));

// Signatures table - cryptographic signatures
export const signatures = pgTable("signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  versionId: varchar("version_id").references(() => resourceVersions.id, { onDelete: "cascade" }),
  signerId: varchar("signer_id", { length: 255 }).notNull(),
  signerName: text("signer_name"),
  algorithm: varchar("algorithm", { length: 50 }),
  signature: text("signature").notNull(),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
}, (table) => ({
  resourceIdx: index("idx_signatures_resource_id").on(table.resourceId),
}));

// Certifications table - formal certifications/approvals
export const certifications = pgTable("certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  versionId: varchar("version_id").references(() => resourceVersions.id, { onDelete: "cascade" }),
  certifierId: varchar("certifier_id", { length: 255 }).notNull(),
  certifierName: text("certifier_name"),
  certificationType: varchar("certification_type", { length: 100 }),
  notes: text("notes"),
  certifiedAt: timestamp("certified_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  resourceIdx: index("idx_certifications_resource_id").on(table.resourceId),
}));

// Entitlements table - access control
export const entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  principalId: varchar("principal_id", { length: 255 }).notNull(),
  principalType: varchar("principal_type", { length: 50 }).notNull(),
  permission: varchar("permission", { length: 50 }).notNull(),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  grantedBy: varchar("granted_by", { length: 255 }),
}, (table) => ({
  resourceIdx: index("idx_entitlements_resource_id").on(table.resourceId),
  principalIdx: index("idx_entitlements_principal").on(table.principalId),
}));

// System settings table - for tracking bootstrap state and other flags
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// API Keys table - for programmatic access
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdByName: text("created_by_name"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  activeIdx: index("idx_api_keys_active").on(table.isActive),
  createdByIdx: index("idx_api_keys_created_by").on(table.createdBy),
}));

// Relations
export const resourcesRelations = relations(resources, ({ many }) => ({
  versions: many(resourceVersions),
  artifacts: many(artifacts),
  signatures: many(signatures),
  certifications: many(certifications),
  entitlements: many(entitlements),
}));

export const resourceVersionsRelations = relations(resourceVersions, ({ one, many }) => ({
  resource: one(resources, {
    fields: [resourceVersions.resourceId],
    references: [resources.id],
  }),
  artifacts: many(artifacts),
  signatures: many(signatures),
  certifications: many(certifications),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  resource: one(resources, {
    fields: [artifacts.resourceId],
    references: [resources.id],
  }),
  version: one(resourceVersions, {
    fields: [artifacts.versionId],
    references: [resourceVersions.id],
  }),
}));

export const signaturesRelations = relations(signatures, ({ one }) => ({
  resource: one(resources, {
    fields: [signatures.resourceId],
    references: [resources.id],
  }),
  version: one(resourceVersions, {
    fields: [signatures.versionId],
    references: [resourceVersions.id],
  }),
}));

export const certificationsRelations = relations(certifications, ({ one }) => ({
  resource: one(resources, {
    fields: [certifications.resourceId],
    references: [resources.id],
  }),
  version: one(resourceVersions, {
    fields: [certifications.versionId],
    references: [resourceVersions.id],
  }),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  resource: one(resources, {
    fields: [entitlements.resourceId],
    references: [resources.id],
  }),
}));

// Insert schemas
export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentVersion: true,
});

export const insertResourceVersionSchema = createInsertSchema(resourceVersions).omit({
  id: true,
  createdAt: true,
});

export const insertArtifactSchema = createInsertSchema(artifacts).omit({
  id: true,
  createdAt: true,
});

export const insertSignatureSchema = createInsertSchema(signatures).omit({
  id: true,
  signedAt: true,
});

export const insertCertificationSchema = createInsertSchema(certifications).omit({
  id: true,
  certifiedAt: true,
});

export const insertEntitlementSchema = createInsertSchema(entitlements).omit({
  id: true,
  grantedAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

// Types
export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;

export type ResourceVersion = typeof resourceVersions.$inferSelect;
export type InsertResourceVersion = z.infer<typeof insertResourceVersionSchema>;

export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;

export type Signature = typeof signatures.$inferSelect;
export type InsertSignature = z.infer<typeof insertSignatureSchema>;

export type Certification = typeof certifications.$inferSelect;
export type InsertCertification = z.infer<typeof insertCertificationSchema>;

export type Entitlement = typeof entitlements.$inferSelect;
export type InsertEntitlement = z.infer<typeof insertEntitlementSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;
