import {
  resources,
  resourceVersions,
  artifacts,
  signatures,
  certifications,
  entitlements,
  apiKeys,
  type Resource,
  type InsertResource,
  type ResourceVersion,
  type InsertResourceVersion,
  type Artifact,
  type InsertArtifact,
  type Signature,
  type InsertSignature,
  type Certification,
  type InsertCertification,
  type Entitlement,
  type InsertEntitlement,
  type ApiKey,
  type InsertApiKey,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";

export interface IStorage {
  // Resources
  getResources(): Promise<Resource[]>;
  getResourcesByType(type: string): Promise<Resource[]>;
  getResourcesByTypeAndOrg(type: string, orgId: string): Promise<Resource[]>;
  getResource(id: string): Promise<Resource | undefined>;
  getResourceByKey(key: string): Promise<Resource | undefined>;
  getBootstrapResources(): Promise<Resource[]>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: string, resource: Partial<InsertResource>): Promise<Resource | undefined>;
  deleteResource(id: string): Promise<boolean>;
  searchResources(query: string, type?: string, status?: string): Promise<Resource[]>;
  
  // Artifacts
  getArtifact(id: string): Promise<Artifact | undefined>;
  deleteArtifact(id: string): Promise<boolean>;

  // Versions
  getVersions(): Promise<ResourceVersion[]>;
  getResourceVersions(resourceId: string): Promise<ResourceVersion[]>;
  createVersion(version: InsertResourceVersion): Promise<ResourceVersion>;
  publishVersion(resourceId: string): Promise<ResourceVersion>;

  // Artifacts
  getResourceArtifacts(resourceId: string): Promise<Artifact[]>;
  createArtifact(artifact: InsertArtifact): Promise<Artifact>;

  // Signatures
  getResourceSignatures(resourceId: string): Promise<Signature[]>;
  createSignature(signature: InsertSignature): Promise<Signature>;

  // Certifications
  getResourceCertifications(resourceId: string): Promise<Certification[]>;
  createCertification(certification: InsertCertification): Promise<Certification>;

  // Entitlements
  getResourceEntitlements(resourceId: string): Promise<Entitlement[]>;
  createEntitlement(entitlement: InsertEntitlement): Promise<Entitlement>;

  // Stats
  getStats(): Promise<{
    totalResources: number;
    publishedVersions: number;
    bootstrapEntries: number;
    totalAssistants: number;
    totalContexts: number;
    totalIntegrations: number;
    totalGraphs: number;
  }>;

  // API Keys
  getApiKeys(): Promise<ApiKey[]>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKeyLastUsed(id: string): Promise<void>;
  deleteApiKey(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Resources
  async getResources(): Promise<Resource[]> {
    return db.select().from(resources).orderBy(desc(resources.updatedAt));
  }

  async getResource(id: string): Promise<Resource | undefined> {
    const [resource] = await db.select().from(resources).where(eq(resources.id, id));
    return resource || undefined;
  }

  async getResourceByKey(key: string): Promise<Resource | undefined> {
    const [resource] = await db.select().from(resources).where(eq(resources.key, key));
    return resource || undefined;
  }

  async getResourcesByType(type: string): Promise<Resource[]> {
    return db.select().from(resources).where(eq(resources.type, type as any)).orderBy(desc(resources.updatedAt));
  }

  async getResourcesByTypeAndOrg(type: string, orgId: string): Promise<Resource[]> {
    return db.select().from(resources).where(
      and(eq(resources.type, type as any), eq(resources.orgId, orgId))
    ).orderBy(desc(resources.updatedAt));
  }

  async getBootstrapResources(): Promise<Resource[]> {
    return db
      .select()
      .from(resources)
      .where(and(eq(resources.isBootstrap, true), eq(resources.status, "published")));
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [created] = await db.insert(resources).values(resource as any).returning();
    return created;
  }

  async updateResource(id: string, resource: Partial<InsertResource>): Promise<Resource | undefined> {
    const [updated] = await db
      .update(resources)
      .set({ ...(resource as any), updatedAt: new Date() })
      .where(eq(resources.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteResource(id: string): Promise<boolean> {
    const result = await db.delete(resources).where(eq(resources.id, id)).returning();
    return result.length > 0;
  }

  async searchResources(query: string, type?: string, status?: string): Promise<Resource[]> {
    const searchPattern = `%${query}%`;
    let conditions = or(
      ilike(resources.name, searchPattern),
      ilike(resources.key, searchPattern),
      ilike(resources.description, searchPattern)
    );

    if (type) {
      conditions = and(conditions, eq(resources.type, type as any));
    }
    if (status) {
      conditions = and(conditions, eq(resources.status, status as any));
    }

    return db.select().from(resources).where(conditions).orderBy(desc(resources.updatedAt));
  }

  // Versions
  async getVersions(): Promise<ResourceVersion[]> {
    return db.select().from(resourceVersions).orderBy(desc(resourceVersions.createdAt));
  }

  async getResourceVersions(resourceId: string): Promise<ResourceVersion[]> {
    return db
      .select()
      .from(resourceVersions)
      .where(eq(resourceVersions.resourceId, resourceId))
      .orderBy(desc(resourceVersions.version));
  }

  async createVersion(version: InsertResourceVersion): Promise<ResourceVersion> {
    const [created] = await db.insert(resourceVersions).values(version).returning();
    return created;
  }

  async publishVersion(resourceId: string): Promise<ResourceVersion> {
    const resource = await this.getResource(resourceId);
    if (!resource) {
      throw new Error("Resource not found");
    }

    const newVersion = (resource.currentVersion ?? 0) + 1;

    // Update the resource
    await db
      .update(resources)
      .set({
        status: "published",
        currentVersion: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, resourceId));

    // Create a new version record
    const [version] = await db
      .insert(resourceVersions)
      .values({
        resourceId,
        version: newVersion,
        publishedAt: new Date(),
        changelog: `Published version ${newVersion}`,
      })
      .returning();

    return version;
  }

  // Artifacts
  async getResourceArtifacts(resourceId: string): Promise<Artifact[]> {
    return db.select().from(artifacts).where(eq(artifacts.resourceId, resourceId));
  }

  async createArtifact(artifact: InsertArtifact): Promise<Artifact> {
    const [created] = await db.insert(artifacts).values(artifact).returning();
    return created;
  }

  async getArtifact(id: string): Promise<Artifact | undefined> {
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, id));
    return artifact || undefined;
  }

  async deleteArtifact(id: string): Promise<boolean> {
    const result = await db.delete(artifacts).where(eq(artifacts.id, id)).returning();
    return result.length > 0;
  }

  // Signatures
  async getResourceSignatures(resourceId: string): Promise<Signature[]> {
    return db.select().from(signatures).where(eq(signatures.resourceId, resourceId));
  }

  async createSignature(signature: InsertSignature): Promise<Signature> {
    const [created] = await db.insert(signatures).values(signature).returning();
    return created;
  }

  // Certifications
  async getResourceCertifications(resourceId: string): Promise<Certification[]> {
    return db.select().from(certifications).where(eq(certifications.resourceId, resourceId));
  }

  async createCertification(certification: InsertCertification): Promise<Certification> {
    const [created] = await db.insert(certifications).values(certification).returning();
    return created;
  }

  // Entitlements
  async getResourceEntitlements(resourceId: string): Promise<Entitlement[]> {
    return db.select().from(entitlements).where(eq(entitlements.resourceId, resourceId));
  }

  async createEntitlement(entitlement: InsertEntitlement): Promise<Entitlement> {
    const [created] = await db.insert(entitlements).values(entitlement).returning();
    return created;
  }

  // Stats
  async getStats(): Promise<{
    totalResources: number;
    publishedVersions: number;
    bootstrapEntries: number;
    totalAssistants: number;
    totalContexts: number;
    totalIntegrations: number;
    totalGraphs: number;
  }> {
    const [resourceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources);

    const [publishedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(eq(resources.status, 'published'));

    const [bootstrapCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(eq(resources.isBootstrap, true));

    // Type-specific counts
    const [assistantCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(eq(resources.type, 'assistant'));

    const [contextCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(eq(resources.type, 'context'));

    // Count only provider integrations (keys ending in /config), not individual models
    const [integrationCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(
        and(
          eq(resources.type, 'integration'),
          sql`${resources.key} LIKE '%/config'`
        )
      );

    const [graphCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(eq(resources.type, 'graph'));

    return {
      totalResources: resourceCount?.count ?? 0,
      publishedVersions: publishedCount?.count ?? 0,
      bootstrapEntries: bootstrapCount?.count ?? 0,
      totalAssistants: assistantCount?.count ?? 0,
      totalContexts: contextCount?.count ?? 0,
      totalIntegrations: integrationCount?.count ?? 0,
      totalGraphs: graphCount?.count ?? 0,
    };
  }

  // API Keys
  async getApiKeys(): Promise<ApiKey[]> {
    return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(
      and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true))
    );
    return key || undefined;
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys).values(apiKey).returning();
    return created;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
