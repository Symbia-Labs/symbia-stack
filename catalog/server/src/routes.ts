import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { insertResourceSchema, resourceTypes, resourceStatuses, visibilityLevels, defaultAccessPolicy, type AccessPolicy, type Resource } from "@shared/schema";
import { z } from "zod";
import { openApiSpec } from "./openapi";
import { authMiddleware, optionalAuthMiddleware, requireSuperAdmin, generateApiKey } from "./auth";
import { getIdentityServiceUrl, getUserOrganizations } from "./identity";
import { canPerformAction, filterResourcesByReadAccess, getPublicReadPolicy } from "./entitlements";
import { writeRateLimiter, searchRateLimiter, uploadRateLimiter, RATE_LIMITS } from "./rate-limit";
import { artifactStorage } from "./artifact-storage";
import { buildBootstrapSummary } from "./bootstrap-summary";

const accessPolicySchema = z.object({
  visibility: z.enum(visibilityLevels),
  actions: z.record(z.object({
    anyOf: z.array(z.string()),
  })).optional(),
}).optional();

const updateResourceSchema = z.object({
  key: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(resourceTypes).optional(),
  status: z.enum(resourceStatuses).optional(),
  isBootstrap: z.boolean().optional(),
  tags: z.array(z.string()).nullable().optional(),
  orgId: z.string().nullable().optional(),
  accessPolicy: accessPolicySchema,
  metadata: z.record(z.unknown()).nullable().optional(),
});

const createResourceSchema = z.object({
  key: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  type: z.enum(resourceTypes),
  isBootstrap: z.boolean().optional(),
  tags: z.array(z.string()).nullable().optional(),
  orgId: z.string().nullable().optional(),
  accessPolicy: accessPolicySchema,
  metadata: z.record(z.unknown()).nullable().optional(),
});

const createGraphSchema = z.object({
  key: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  orgId: z.string().min(1),
  tags: z.array(z.string()).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const updateGraphSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const createContextSchema = z.object({
  key: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  orgId: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const updateContextSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // CORS middleware - allow all standard methods for browser clients
  // Supports both token-based and cookie-based (credentials) auth
  // For credentialed requests, only allowed origins can access the API
  const corsOriginConfig = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '';
  const allowedOrigins = corsOriginConfig
    ? corsOriginConfig.split(',').map(o => o.trim().replace(/\/$/, ''))
    : [];

  function matchesOrigin(origin: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === origin) return true;
    if (pattern.startsWith('*.')) {
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

  function isLocalOrigin(origin: string): boolean {
    try {
      const url = new URL(origin);
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }
  
  // Extract origin (scheme+host) from identity service URL for CORS matching
  const identityServiceUrl = getIdentityServiceUrl();
  if (identityServiceUrl) {
    try {
      const url = new URL(identityServiceUrl);
      const identityOrigin = url.origin; // Just scheme+host, no path
      if (!allowedOrigins.includes(identityOrigin)) {
        allowedOrigins.push(identityOrigin);
      }
    } catch (e) {
      console.warn('Failed to parse identity service URL for CORS:', e);
    }
  }
  
  const PUBLIC_CORS_PATHS = new Set([
    "/api/bootstrap",
    "/api/bootstrap/summary",
    "/api/openapi.json",
    "/openapi.json",
    "/llm.txt",
    "/llms.txt",
    "/llms-full.txt",
    "/docs/openapi.json",
    "/docs/llms.txt",
    "/docs/llms-full.txt",
  ]);

  // Use process.cwd() for production compatibility - docs are in docs/ directory
  const docsRoot = path.resolve(process.cwd(), "docs");
  const sendDocFile = (res: Response, filename: string, contentType: string) => {
    const filePath = path.join(docsRoot, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.type(contentType).sendFile(filePath);
  };

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isPublicCorsPath = PUBLIC_CORS_PATHS.has(req.path);
    const isPublicCorsRequest = isPublicCorsPath && (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS');

    if (origin) {
      const normalizedOrigin = origin.replace(/\/$/, '');
      const allowAnyOrigin = allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production';
      const allowLocal = process.env.NODE_ENV !== 'production' && isLocalOrigin(normalizedOrigin);
      const allowListed = allowedOrigins.some(pattern => matchesOrigin(normalizedOrigin, pattern));

      if (allowAnyOrigin || allowLocal || allowListed) {
        // Credentialed CORS for allowed origins only
        res.header("Access-Control-Allow-Origin", normalizedOrigin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref");
        res.header("Access-Control-Max-Age", "86400");
      } else if (isPublicCorsRequest) {
        // Public bootstrap endpoints can be accessed from any origin without credentials
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref");
        res.header("Access-Control-Max-Age", "86400");
      }
    } else if (!origin) {
      // For non-browser requests (curl, etc.) without origin header
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref");
      res.header("Access-Control-Max-Age", "86400");
    }
    // For disallowed origins: no CORS headers - browser will block the request
    
    if (req.method === "OPTIONS") {
      // Preflight: return 200 for allowed origins, 403 for disallowed
      if (origin && allowedOrigins.length > 0) {
        const normalizedOrigin = origin.replace(/\/$/, '');
        const allowListed = allowedOrigins.some(pattern => matchesOrigin(normalizedOrigin, pattern));
        if (!allowListed && !isPublicCorsPath) {
          return res.sendStatus(403);
        }
      }
      if (origin && allowedOrigins.length === 0 && process.env.NODE_ENV === 'production' && !isPublicCorsPath) {
        return res.sendStatus(403);
      }
      return res.sendStatus(200);
    }
    next();
  });

  // Public endpoints
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

  const filterPublicResources = (resources: Resource[]): Resource[] => {
    return resources.filter(resource => {
      const policy = resource.accessPolicy || defaultAccessPolicy;
      const readPolicy = policy.actions?.read?.anyOf || ['public'];
      return readPolicy.includes('public') && resource.status === 'published';
    });
  };

  // Service discovery endpoint (standardized across all services)
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "catalog",
      version: "1.0.0",
      description: "Resource catalog for graphs, components, executors, and contexts",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
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
        bootstrapSummary: "/api/bootstrap/summary",
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)",
      ],
    });
  });

  // Bootstrap resources endpoint (returns catalog resources marked as bootstrap)
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

  // Auth config endpoint (public - tells frontend where to authenticate)
  app.get("/api/auth/config", (req, res) => {
    res.json({
      identityServiceUrl: getIdentityServiceUrl(),
      loginUrl: `${getIdentityServiceUrl()}/login`,
      logoutUrl: `${getIdentityServiceUrl()}/api/auth/logout`,
    });
  });

  // Get current user (requires auth)
  app.get("/api/auth/me", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const orgs = await getUserOrganizations(req.token!);
      res.json({
        user: req.user,
        organizations: orgs,
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });

  // Stats endpoint (protected)
  app.get("/api/stats", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Resources CRUD (protected with entitlement checks)
  app.get("/api/resources", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      console.log("[Resources] GET /api/resources query:", req.query);
      const allResources = await storage.getResources();
      let accessibleResources = filterResourcesByReadAccess(allResources, req.user);
      console.log("[Resources] Total accessible:", accessibleResources.length);

      // Filter by type if specified
      const typeFilter = req.query.type as string | undefined;
      console.log("[Resources] Type filter:", typeFilter);
      if (typeFilter) {
        accessibleResources = accessibleResources.filter(r => r.type === typeFilter);
        console.log("[Resources] After type filter:", accessibleResources.length);
      }

      // Filter by status if specified
      const statusFilter = req.query.status as string | undefined;
      if (statusFilter) {
        accessibleResources = accessibleResources.filter(r => r.status === statusFilter);
        console.log("[Resources] After status filter:", accessibleResources.length);
      }

      res.json(accessibleResources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.get("/api/resources/:id", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      if (!canPerformAction(req.user, resource, 'read')) {
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
      if (!req.user?.isSuperAdmin && !canPerformAction(req.user, { accessPolicy: defaultAccessPolicy } as any, 'write')) {
        return res.status(403).json({ error: "You don't have permission to create resources" });
      }

      const validatedData = createResourceSchema.parse(req.body);
      
      const existing = await storage.getResourceByKey(validatedData.key);
      if (existing) {
        return res.status(400).json({ error: "A resource with this key already exists" });
      }

      const resourceData = {
        ...validatedData,
        accessPolicy: validatedData.accessPolicy || defaultAccessPolicy,
      };

      const resource = await storage.createResource(resourceData as any);
      res.status(201).json(resource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });

  app.patch("/api/resources/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      if (!canPerformAction(req.user, resource, 'write')) {
        return res.status(403).json({ error: "You don't have permission to edit this resource" });
      }

      const validatedData = updateResourceSchema.parse(req.body);

      if (validatedData.key && validatedData.key !== resource.key) {
        const existing = await storage.getResourceByKey(validatedData.key);
        if (existing) {
          return res.status(400).json({ error: "A resource with this key already exists" });
        }
      }

      const updated = await storage.updateResource(req.params.id, validatedData as any);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  app.delete("/api/resources/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      if (!canPerformAction(req.user, resource, 'delete')) {
        return res.status(403).json({ error: "You don't have permission to delete this resource" });
      }

      const deleted = await storage.deleteResource(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  // Bulk operations schema
  const bulkActionSchema = z.object({
    ids: z.array(z.string()).min(1).max(100),
    action: z.enum(["publish", "delete", "updateStatus", "addTags", "removeTags"]),
    payload: z.object({
      status: z.enum(resourceStatuses).optional(),
      tags: z.array(z.string()).optional(),
    }).optional(),
  });

  // Bulk operations endpoint
  app.post("/api/resources/bulk", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const validated = bulkActionSchema.parse(req.body);
      const { ids, action, payload } = validated;

      const results: Array<{ id: string; status: "success" | "failed"; error?: string }> = [];

      for (const id of ids) {
        try {
          const resource = await storage.getResource(id);
          
          if (!resource) {
            results.push({ id, status: "failed", error: "Resource not found" });
            continue;
          }

          // Check permissions based on action
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
              const newTags = Array.from(new Set([...currentTags, ...payload.tags]));
              await storage.updateResource(id, { tags: newTags });
              results.push({ id, status: "success" });
              break;

            case "removeTags":
              if (!payload?.tags || payload.tags.length === 0) {
                results.push({ id, status: "failed", error: "Tags are required" });
                break;
              }
              const filteredTags = (resource.tags || []).filter(t => !payload.tags!.includes(t));
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

      const successCount = results.filter(r => r.status === "success").length;
      const failureCount = results.filter(r => r.status === "failed").length;

      res.json({
        summary: {
          total: ids.length,
          succeeded: successCount,
          failed: failureCount,
        },
        results,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error performing bulk operation:", error);
      res.status(500).json({ error: "Failed to perform bulk operation" });
    }
  });

  // Publish resource
  app.post("/api/resources/:id/publish", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      if (!canPerformAction(req.user, resource, 'publish')) {
        return res.status(403).json({ error: "You don't have permission to publish this resource" });
      }

      const version = await storage.publishVersion(req.params.id);
      res.json(version);
    } catch (error) {
      console.error("Error publishing resource:", error);
      res.status(500).json({ error: "Failed to publish resource" });
    }
  });

  // Resource versions
  app.get("/api/resources/:id/versions", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const versions = await storage.getResourceVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      console.error("Error fetching versions:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });

  // All versions
  app.get("/api/versions", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const versions = await storage.getVersions();
      res.json(versions);
    } catch (error) {
      console.error("Error fetching versions:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });

  // Resource artifacts
  app.get("/api/resources/:id/artifacts", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resourceArtifacts = await storage.getResourceArtifacts(req.params.id);
      res.json(resourceArtifacts);
    } catch (error) {
      console.error("Error fetching artifacts:", error);
      res.status(500).json({ error: "Failed to fetch artifacts" });
    }
  });

  // Resource signatures
  app.get("/api/resources/:id/signatures", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resourceSignatures = await storage.getResourceSignatures(req.params.id);
      res.json(resourceSignatures);
    } catch (error) {
      console.error("Error fetching signatures:", error);
      res.status(500).json({ error: "Failed to fetch signatures" });
    }
  });

  // Resource certifications
  app.get("/api/resources/:id/certifications", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resourceCertifications = await storage.getResourceCertifications(req.params.id);
      res.json(resourceCertifications);
    } catch (error) {
      console.error("Error fetching certifications:", error);
      res.status(500).json({ error: "Failed to fetch certifications" });
    }
  });

  // Search endpoint
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

  // Natural language search endpoint (uses same logic for now)
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

  // API Key management (super admin only)
  app.get("/api/api-keys", authMiddleware, requireSuperAdmin, searchRateLimiter, async (req, res) => {
    try {
      const keys = await storage.getApiKeys();
      // Don't expose the full hash, just return metadata
      const safeKeys = keys.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        createdBy: k.createdBy,
        createdByName: k.createdByName,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        isActive: k.isActive,
        createdAt: k.createdAt,
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
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Name is required" });
      }

      const { key, prefix, hash } = generateApiKey();
      
      const apiKey = await storage.createApiKey({
        name: name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        createdBy: req.user!.id,
        createdByName: req.user!.name,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      });

      // Return the full key only once - it won't be retrievable after this
      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        key: key, // Full key - show only once!
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/api-keys/:id", authMiddleware, requireSuperAdmin, writeRateLimiter, async (req, res) => {
    try {
      const deleted = await storage.deleteApiKey(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "API key not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // Normalized /api/auth/keys aliases (matches logging/identity pattern)
  app.get("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });

  app.post("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });

  app.delete("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${req.params.id}`;
    app._router.handle(req, res, next);
  });

  // ==================== GRAPH CONVENIENCE ENDPOINTS ====================
  
  // List graphs (optionally filter by org)
  app.get("/api/graphs", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const { orgId } = req.query;
      let graphs;
      if (orgId && typeof orgId === 'string') {
        graphs = await storage.getResourcesByTypeAndOrg('graph', orgId);
      } else {
        graphs = await storage.getResourcesByType('graph');
      }
      const accessibleGraphs = filterResourcesByReadAccess(graphs, req.user);
      res.json(accessibleGraphs);
    } catch (error) {
      console.error("Error fetching graphs:", error);
      res.status(500).json({ error: "Failed to fetch graphs" });
    }
  });

  // Get graph by ID
  app.get("/api/graphs/:id", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const graph = await storage.getResource(req.params.id);
      if (!graph || graph.type !== 'graph') {
        return res.status(404).json({ error: "Graph not found" });
      }
      if (!canPerformAction(req.user, graph, 'read')) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(graph);
    } catch (error) {
      console.error("Error fetching graph:", error);
      res.status(500).json({ error: "Failed to fetch graph" });
    }
  });

  // Create graph (with org scoping and validation)
  app.post("/api/graphs", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const validatedData = createGraphSchema.parse(req.body);
      
      // Verify org membership for non-super-admins
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

      // Set org-scoped access policy with proper entitlement keys
      const orgAccessPolicy = {
        visibility: 'org' as const,
        actions: {
          read: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
          write: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
          delete: { anyOf: [`role:admin:${validatedData.orgId}`] },
        },
      };

      const resourceData = {
        key: validatedData.key,
        name: validatedData.name,
        description: validatedData.description,
        type: 'graph' as const,
        orgId: validatedData.orgId,
        tags: validatedData.tags,
        metadata: validatedData.metadata,
        accessPolicy: orgAccessPolicy,
      };

      const graph = await storage.createResource(resourceData as any);
      res.status(201).json(graph);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error creating graph:", error);
      res.status(500).json({ error: "Failed to create graph" });
    }
  });

  // Update graph
  app.patch("/api/graphs/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const graph = await storage.getResource(req.params.id);
      if (!graph || graph.type !== 'graph') {
        return res.status(404).json({ error: "Graph not found" });
      }

      if (!canPerformAction(req.user, graph, 'write')) {
        return res.status(403).json({ error: "You don't have permission to edit this graph" });
      }

      const validatedData = updateGraphSchema.parse(req.body);
      
      const updateData: any = {};
      if (validatedData.name) updateData.name = validatedData.name;
      if (validatedData.description !== undefined) updateData.description = validatedData.description;
      if (validatedData.tags) updateData.tags = validatedData.tags;
      if (validatedData.metadata) updateData.metadata = validatedData.metadata;

      const updated = await storage.updateResource(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error updating graph:", error);
      res.status(500).json({ error: "Failed to update graph" });
    }
  });

  // Delete graph
  app.delete("/api/graphs/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const graph = await storage.getResource(req.params.id);
      if (!graph || graph.type !== 'graph') {
        return res.status(404).json({ error: "Graph not found" });
      }

      if (!canPerformAction(req.user, graph, 'delete')) {
        return res.status(403).json({ error: "You don't have permission to delete this graph" });
      }

      await storage.deleteResource(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting graph:", error);
      res.status(500).json({ error: "Failed to delete graph" });
    }
  });

  // ==================== CONTEXT ENDPOINTS ====================

  // List contexts
  app.get("/api/contexts", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const { orgId } = req.query;
      let contexts;
      if (orgId && typeof orgId === 'string') {
        contexts = await storage.getResourcesByTypeAndOrg('context', orgId);
      } else {
        contexts = await storage.getResourcesByType('context');
      }
      const accessibleContexts = filterResourcesByReadAccess(contexts, req.user);
      res.json(accessibleContexts);
    } catch (error) {
      console.error("Error fetching contexts:", error);
      res.status(500).json({ error: "Failed to fetch contexts" });
    }
  });

  // Get context by ID
  app.get("/api/contexts/:id", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const context = await storage.getResource(req.params.id);
      if (!context || context.type !== 'context') {
        return res.status(404).json({ error: "Context not found" });
      }
      if (!canPerformAction(req.user, context, 'read')) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(context);
    } catch (error) {
      console.error("Error fetching context:", error);
      res.status(500).json({ error: "Failed to fetch context" });
    }
  });

  // Create context
  app.post("/api/contexts", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const validatedData = createContextSchema.parse(req.body);
      
      // Verify org membership if orgId is provided
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

      // Set access policy based on orgId
      let accessPolicy;
      if (validatedData.orgId) {
        accessPolicy = {
          visibility: 'org' as const,
          actions: {
            read: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
            write: { anyOf: [`org:${validatedData.orgId}`, `role:member:${validatedData.orgId}`, `role:admin:${validatedData.orgId}`] },
            delete: { anyOf: [`role:admin:${validatedData.orgId}`] },
          },
        };
      } else {
        accessPolicy = defaultAccessPolicy;
      }

      const resourceData = {
        key: validatedData.key,
        name: validatedData.name,
        description: validatedData.description,
        type: 'context' as const,
        orgId: validatedData.orgId,
        tags: validatedData.tags,
        metadata: validatedData.metadata,
        accessPolicy,
      };

      const context = await storage.createResource(resourceData as any);
      res.status(201).json(context);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error creating context:", error);
      res.status(500).json({ error: "Failed to create context" });
    }
  });

  // Update context
  app.patch("/api/contexts/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const context = await storage.getResource(req.params.id);
      if (!context || context.type !== 'context') {
        return res.status(404).json({ error: "Context not found" });
      }

      if (!canPerformAction(req.user, context, 'write')) {
        return res.status(403).json({ error: "You don't have permission to edit this context" });
      }

      const validatedData = updateContextSchema.parse(req.body);
      const updated = await storage.updateResource(req.params.id, validatedData as any);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error updating context:", error);
      res.status(500).json({ error: "Failed to update context" });
    }
  });

  // Delete context
  app.delete("/api/contexts/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const context = await storage.getResource(req.params.id);
      if (!context || context.type !== 'context') {
        return res.status(404).json({ error: "Context not found" });
      }

      if (!canPerformAction(req.user, context, 'delete')) {
        return res.status(403).json({ error: "You don't have permission to delete this context" });
      }

      await storage.deleteResource(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting context:", error);
      res.status(500).json({ error: "Failed to delete context" });
    }
  });

  // ==================== ARTIFACT ENDPOINTS ====================

  // Upload artifact
  app.post("/api/resources/:id/artifacts", authMiddleware, uploadRateLimiter, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      if (!canPerformAction(req.user, resource, 'write')) {
        return res.status(403).json({ error: "You don't have permission to upload artifacts" });
      }

      const { name, type, content } = req.body;
      if (!name || !type || !content) {
        return res.status(400).json({ error: "name, type, and content are required" });
      }

      const buffer = Buffer.from(content, 'base64');
      const validation = artifactStorage.validateFile(buffer.length, type);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const storageUrl = await artifactStorage.save(req.params.id, name, buffer);
      
      const artifact = await storage.createArtifact({
        resourceId: req.params.id,
        name,
        mimeType: type,
        size: buffer.length,
        checksum: require('crypto').createHash('sha256').update(buffer).digest('hex'),
        storageUrl,
      });

      res.status(201).json(artifact);
    } catch (error) {
      console.error("Error uploading artifact:", error);
      res.status(500).json({ error: "Failed to upload artifact" });
    }
  });

  // Download artifact
  app.get("/api/artifacts/:id/download", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const artifact = await storage.getArtifact(req.params.id);
      if (!artifact) {
        return res.status(404).json({ error: "Artifact not found" });
      }

      const resource = await storage.getResource(artifact.resourceId);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      if (!canPerformAction(req.user, resource, 'read')) {
        return res.status(403).json({ error: "Access denied" });
      }

      const data = await artifactStorage.load(artifact.storageUrl || '');
      res.setHeader('Content-Type', artifact.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}"`);
      res.send(data);
    } catch (error) {
      console.error("Error downloading artifact:", error);
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });

  // Delete artifact
  app.delete("/api/artifacts/:id", authMiddleware, writeRateLimiter, async (req, res) => {
    try {
      const artifact = await storage.getArtifact(req.params.id);
      if (!artifact) {
        return res.status(404).json({ error: "Artifact not found" });
      }

      const resource = await storage.getResource(artifact.resourceId);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      if (!canPerformAction(req.user, resource, 'delete')) {
        return res.status(403).json({ error: "You don't have permission to delete artifacts" });
      }

      await artifactStorage.delete(artifact.storageUrl || '');
      await storage.deleteArtifact(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting artifact:", error);
      res.status(500).json({ error: "Failed to delete artifact" });
    }
  });

  // Rate limit info endpoint
  app.get("/api/rate-limits", authMiddleware, (req, res) => {
    res.json({
      windowMs: RATE_LIMITS.windowMs,
      limits: {
        write: RATE_LIMITS.writeMaxRequests,
        search: RATE_LIMITS.searchMaxRequests,
        upload: RATE_LIMITS.uploadMaxRequests,
      },
    });
  });

  // Symbia namespace endpoint - exposes catalog as @catalog.* references
  // Requires authentication - exposes all catalog resources
  app.get("/symbia-namespace", authMiddleware, searchRateLimiter, async (req, res) => {
    try {
      const resources = await storage.getResources();
      res.json({
        namespace: "catalog",
        version: "1.0.0",
        resources: resources.map(r => ({
          type: r.type,
          key: r.key,
          name: r.name,
          description: r.description,
          status: r.status,
          tags: r.tags,
          metadata: r.metadata,
        })),
      });
    } catch (error) {
      console.error("Error fetching namespace:", error);
      res.status(500).json({ error: "Failed to fetch namespace" });
    }
  });

  return httpServer;
}
