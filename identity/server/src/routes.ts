import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { sendPasswordResetEmail } from "./email";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  registerSchema, loginSchema, forgotPasswordSchema,
  createOrgSchema, inviteMemberSchema,
  createProjectSchema, createApplicationSchema, createServiceSchema,
  createScopedEntitlementSchema, scopeTypeEnum, type ScopeType,
  createApiKeySchema,
  agentRegisterSchema, agentLoginSchema,
  createUserCredentialSchema
} from "@shared/schema";

// Admin validation schemas
const updateUserAdminSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  isSuperAdmin: z.boolean().optional(),
});

const updateOrgAdminSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  planId: z.string().nullable().optional(),
});

const createPlanAdminSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  featuresJson: z.array(z.string()).optional(),
  limitsJson: z.record(z.string(), z.number()).optional(),
  priceCents: z.number().int().min(0).optional(),
});

const updatePlanAdminSchema = z.object({
  name: z.string().min(1).optional(),
  featuresJson: z.array(z.string()).optional(),
  limitsJson: z.record(z.string(), z.number()).optional(),
  priceCents: z.number().int().min(0).optional(),
});
import { apiDocumentation } from "./openapi";
import { registerDocRoutes } from "./doc-routes";

// SESSION_SECRET is required - no fallback to prevent insecure defaults
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
const JWT_SECRET: string = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

// Principal types: user (human) or agent (AI/bot)
type PrincipalType = 'user' | 'agent';

interface JWTPayload {
  sub: string;           // Principal ID (user.id or agent.id)
  type: PrincipalType;   // 'user' or 'agent'
  email?: string;        // Only for users
  agentId?: string;      // Only for agents (e.g., "assistant:onboarding")
  name: string;
  orgId?: string;        // Optional org context
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        isSuperAdmin: boolean;
      };
      agent?: {
        id: string;
        agentId: string;
        name: string;
        orgId?: string;
        capabilities: string[];
      };
      principal?: {
        id: string;
        type: PrincipalType;
        name: string;
      };
    }
  }
}

// Sign token for human user (backward compatible)
function signToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign(
    { sub: user.id, type: 'user' as PrincipalType, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Sign token for agent (parallel to user)
function signAgentToken(agent: { id: string; agentId: string; name: string; orgId?: string | null }): string {
  return jwt.sign(
    { sub: agent.id, type: 'agent' as PrincipalType, agentId: agent.agentId, name: agent.name, orgId: agent.orgId || undefined },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    // Default to 'user' type for backward compatibility with existing tokens
    if (!payload.type) {
      payload.type = 'user';
    }
    return payload;
  } catch {
    return null;
  }
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Handle both user and agent principals
  if (payload.type === 'agent') {
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
      orgId: agent.orgId || undefined,
      capabilities: (agent.capabilities as string[]) || []
    };
    req.principal = { id: agent.id, type: 'agent', name: agent.name };
    // Update last seen
    storage.updateAgentLastSeen(agent.id).catch(() => {});
  } else {
    // Default: user type
    const user = await storage.getUser(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.user = { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
    req.principal = { id: user.id, type: 'user', name: user.name };
  }

  next();
}

async function superAdminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ 
      message: "Super admin access required",
      code: "SUPERADMIN_REQUIRED",
      hint: "This action requires super admin privileges. Contact your system administrator."
    });
  }
  next();
}

// Rate limiting for sensitive operations
// In-memory store for rate limiting (resets on server restart)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const SUPERADMIN_RATE_LIMIT = 30; // 30 requests per minute for superadmin actions
const AUTH_RATE_LIMIT = 10; // 10 requests per minute for auth actions

function createRateLimitMiddleware(limit: number, windowMs: number = RATE_LIMIT_WINDOW_MS) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}_${req.path}`;
    const now = Date.now();
    
    const entry = rateLimitStore.get(key);
    
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    
    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter,
      });
    }
    
    entry.count++;
    next();
  };
}

const superAdminRateLimit = createRateLimitMiddleware(SUPERADMIN_RATE_LIMIT);
const authRateLimit = createRateLimitMiddleware(AUTH_RATE_LIMIT);

// Check if email is configured
function isEmailEnabled(): boolean {
  // Check for EMAIL_ENABLED explicit flag first
  if (process.env.EMAIL_ENABLED === 'false') return false;
  if (process.env.EMAIL_ENABLED === 'true') return true;
  
  // Auto-detect based on Replit connector availability
  const hasConnector = !!(process.env.REPLIT_CONNECTORS_HOSTNAME && 
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
  
  return hasConnector;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const cookieParser = await import("cookie-parser");
  app.use(cookieParser.default());

  // Register documentation routes (serves static files from build)
  registerDocRoutes(app);

  // Standard health endpoint (simple, fast)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "identity" });
  });

  // Health/Readiness endpoint with database connectivity check
  // Note: /health in index.ts is for autoscale probes (no DB check)
  // This endpoint provides full system health including DB status
  app.get("/health/ready", async (req, res) => {
    const healthCheck: {
      status: "ok" | "degraded" | "error";
      timestamp: string;
      database: { connected: boolean; latencyMs?: number; error?: string };
      email: { enabled: boolean };
      version: string;
    } = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: { connected: false },
      email: { enabled: isEmailEnabled() },
      version: "1.0.0",
    };

    try {
      // Check database connectivity with a simple query
      const start = Date.now();
      await storage.getAllPlans(); // Simple query to check DB
      const latencyMs = Date.now() - start;
      healthCheck.database = { connected: true, latencyMs };
    } catch (error: any) {
      healthCheck.status = "error";
      healthCheck.database = { 
        connected: false, 
        error: error.message || "Database connection failed" 
      };
    }

    const statusCode = healthCheck.status === "ok" ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  });

  // Service discovery endpoint (standardized across all services)
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "identity",
      version: "1.0.0",
      description: "Authentication, authorization, and identity management service",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
        openapiDirect: "/api/docs/openapi.json",
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
        admin: "/api/admin",
      },
      authentication: [
        "Bearer token (JWT)",
        "Session cookie (token)",
      ],
      jwks: "/.well-known/jwks.json",
    });
  });

  // Stats endpoint for platform health monitoring
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // Auth config endpoint - tells clients how to authenticate
  app.get("/api/auth/config", (_req, res) => {
    const baseUrl = process.env.IDENTITY_BASE_URL || "";
    res.json({
      identityServiceUrl: baseUrl,
      loginUrl: `${baseUrl}/login`,
      logoutUrl: `${baseUrl}/api/auth/logout`,
    });
  });

  // Get current principal (user or agent) - unified endpoint
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    if (req.agent) {
      // Agent principal
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
          capabilities: agent.capabilities,
        }
      });
    }
    // User principal
    const enrichedUser = await storage.getEnrichedUser(req.user!.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      type: "user",
      user: enrichedUser,
      organizations: enrichedUser.organizations || [],
    });
  });

  // User-specific me endpoint
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
      organizations: enrichedUser.organizations || [],
    });
  });

  // API Documentation (public endpoints)
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

  // LLM agent discovery files
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
    
    // Generate llms-full.txt dynamically from OpenAPI spec
    const doc = apiDocumentation as any;
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

    // Group endpoints by tag
    const endpointsByTag: Record<string, string[]> = {};
    
    for (const [path, methods] of Object.entries(doc.paths || {})) {
      for (const [method, details] of Object.entries(methods as any)) {
        const d = details as any;
        const tag = d.tags?.[0] || "Other";
        if (!endpointsByTag[tag]) {
          endpointsByTag[tag] = [];
        }
        
        let endpoint = `### ${method.toUpperCase()} ${path}\n\n`;
        endpoint += `${d.summary || ""}\n\n`;
        
        if (d.description) {
          endpoint += `${d.description}\n\n`;
        }
        
        // Request body
        if (d.requestBody?.content?.["application/json"]?.schema) {
          const schema = d.requestBody.content["application/json"].schema;
          endpoint += `**Request Body:**\n\`\`\`json\n`;
          if (schema.properties) {
            const example: Record<string, any> = {};
            for (const [prop, propSchema] of Object.entries(schema.properties as any)) {
              const ps = propSchema as any;
              if (ps.type === "string") example[prop] = ps.example || "string";
              else if (ps.type === "integer" || ps.type === "number") example[prop] = ps.example || 0;
              else if (ps.type === "boolean") example[prop] = ps.example || false;
              else if (ps.type === "array") example[prop] = [];
              else example[prop] = ps.example || null;
            }
            endpoint += JSON.stringify(example, null, 2);
          }
          endpoint += `\n\`\`\`\n\n`;
        }
        
        // Responses
        if (d.responses) {
          endpoint += `**Responses:**\n`;
          for (const [code, resp] of Object.entries(d.responses as any)) {
            const r = resp as any;
            endpoint += `- \`${code}\`: ${r.description || ""}\n`;
          }
          endpoint += `\n`;
        }
        
        endpointsByTag[tag].push(endpoint);
      }
    }
    
    // Output by tag
    for (const [tag, endpoints] of Object.entries(endpointsByTag)) {
      content += `## ${tag}\n\n`;
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

  // JWKS endpoint for JWT verification by external services
  // Note: Currently using HS256 symmetric key, so JWKS returns algorithm info only
  // For full JWKS support, migrate to RS256 with asymmetric keys
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

  // Token introspection endpoint for service-to-service auth validation
  // Follows RFC 7662 token introspection pattern
  // Supports both user and agent tokens
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

      // Handle agent tokens
      if (payload.type === 'agent') {
        const agent = await storage.getAgent(payload.sub);
        if (!agent || !agent.isActive) {
          return res.json({ active: false });
        }

        return res.json({
          active: true,
          type: 'agent',
          sub: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities || [],
          token_type: "Bearer",
          iat: (payload as any).iat,
          exp: (payload as any).exp
        });
      }

      // Handle user tokens (default)
      const enrichedUser = await storage.getEnrichedUser(payload.sub);
      if (!enrichedUser) {
        return res.json({ active: false });
      }

      // Return RFC 7662 compliant response with extended user data
      res.json({
        active: true,
        type: 'user',
        sub: enrichedUser.id,
        email: enrichedUser.email,
        name: enrichedUser.name,
        isSuperAdmin: enrichedUser.isSuperAdmin,
        organizations: enrichedUser.organizations,
        entitlements: enrichedUser.entitlements,
        roles: enrichedUser.roles,
        token_type: "Bearer",
        iat: (payload as any).iat,
        exp: (payload as any).exp
      });
    } catch (error) {
      console.error("Introspection error:", error);
      res.json({ active: false });
    }
  });

  // ============================================================================
  // USER AUTH ROUTES
  // ============================================================================

  // User registration
  app.post("/api/auth/user/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        name: data.name,
      });

      await storage.createAuditLog({
        userId: user.id,
        action: "user.registered",
        resource: "user",
        metadataJson: { email: user.email },
      });

      const token = signToken(user);
      // Use SameSite=None + Secure in production for cross-origin support
      // Use SameSite=Lax in development for local HTTP access
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Return token in body for cross-origin apps that can't use cookies
      res.json({ 
        user: { id: user.id, email: user.email, name: user.name },
        token 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // User login
  app.post("/api/auth/user/login", async (req, res) => {
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
        metadataJson: { email: user.email },
      });

      const token = signToken(user);
      // Use SameSite=None + Secure in production for cross-origin support
      // Use SameSite=Lax in development for local HTTP access
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // Get user's organizations
      const memberships = await storage.getMembershipsByUser(user.id);
      const organizations = [];
      for (const membership of memberships) {
        const org = await storage.getOrganization(membership.orgId);
        if (org) {
          organizations.push({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: membership.role,
          });
        }
      }

      // Return token in body for cross-origin apps that can't use cookies
      res.json({
        user: { id: user.id, email: user.email, name: user.name, organizations },
        token
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout (works for both users and agents)
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
  });

  // ============================================================================
  // AGENT AUTH ROUTES (parallel to user auth - agents and humans are peers)
  // ============================================================================

  // Agent registration (parallel to POST /api/auth/user/register)
  app.post("/api/auth/agent/register", async (req, res) => {
    try {
      const data = agentRegisterSchema.parse(req.body);

      const existingAgent = await storage.getAgentByAgentId(data.agentId);
      if (existingAgent) {
        return res.status(400).json({ message: "Agent ID already in use" });
      }

      // Verify org exists if provided
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
        metadata: data.metadata,
      });

      await storage.createAuditLog({
        action: "agent.registered",
        resource: "agent",
        resourceId: agent.id,
        orgId: data.orgId,
        metadataJson: { agentId: agent.agentId },
      });

      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({
        agent: { id: agent.id, agentId: agent.agentId, name: agent.name, orgId: agent.orgId },
        token
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Agent registration error:", error);
      res.status(500).json({ message: "Agent registration failed" });
    }
  });

  // Agent login (parallel to POST /api/auth/user/login)
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
        metadataJson: { agentId: agent.agentId },
      });

      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Agent login error:", error);
      res.status(500).json({ message: "Agent login failed" });
    }
  });

  // Get current agent (parallel to GET /api/auth/user/me)
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

  // Agent token refresh (parallel to POST /api/auth/refresh)
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
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

  // ============================================================================
  // END AGENT AUTH ROUTES
  // ============================================================================

  // Unified refresh endpoint (works for both users and agents)
  app.post("/api/auth/refresh", authMiddleware, async (req, res) => {
    try {
      const isProduction = process.env.NODE_ENV === "production";

      if (req.agent) {
        // Agent refresh
        const agent = await storage.getAgent(req.agent.id);
        if (!agent || !agent.isActive) {
          return res.status(401).json({ message: "Agent not found or inactive" });
        }
        const token = signAgentToken(agent);
        res.cookie("token", token, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return res.json({
          type: "agent",
          agent: { id: agent.id, agentId: agent.agentId, name: agent.name },
          token
        });
      }

      // User refresh
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const token = signToken(user);
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

  // User-specific refresh endpoint
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
        maxAge: 7 * 24 * 60 * 60 * 1000,
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
      
      // Check if email is configured
      const emailEnabled = isEmailEnabled();
      
      if (!emailEnabled) {
        // Return a helpful response when email is not configured
        console.log("Password reset requested but email is not configured");
        return res.json({ 
          message: "Password reset is not available at this time. Please contact your administrator.",
          emailEnabled: false,
        });
      }
      
      const user = await storage.getUserByEmail(data.email);
      
      // Always return success to prevent email enumeration
      if (user) {
        // Generate secure reset token
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        
        await storage.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt,
        });
        
        // Send email
        const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.name);
        
        await storage.createAuditLog({
          userId: user.id,
          action: "user.forgot_password",
          resource: "user",
          metadataJson: { email: user.email, emailSent, emailEnabled },
        });
      }

      res.json({ message: "If an account exists, a reset link has been sent" });
    } catch (error) {
      if (error instanceof z.ZodError) {
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

      // Verify the reset token
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      
      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }
      
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "This reset link has expired" });
      }
      
      // Update the user's password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await storage.updateUser(resetToken.userId, { passwordHash });
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(token);
      
      // Clear any existing sessions for security
      await storage.deleteSessionsByUser(resetToken.userId);
      
      await storage.createAuditLog({
        userId: resetToken.userId,
        action: "user.password_reset",
        resource: "user",
        metadataJson: {},
      });

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // User routes
  app.get("/api/users/me", authMiddleware, async (req, res) => {
    const enrichedUser = await storage.getEnrichedUser(req.user!.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(enrichedUser);
  });

  app.patch("/api/users/me", authMiddleware, async (req, res) => {
    try {
      const { name, email } = req.body;
      const updates: { name?: string; email?: string } = {};
      
      if (name) updates.name = name;
      if (email) {
        const existing = await storage.getUserByEmail(email);
        if (existing && existing.id !== req.user!.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = email;
      }

      const user = await storage.updateUser(req.user!.id, updates);
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
      
      const user = await storage.getUser(req.user!.id);
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
        resource: "user",
      });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Dashboard
  app.get("/api/dashboard", authMiddleware, async (req, res) => {
    try {
      const memberships = await storage.getMembershipsByUser(req.user!.id);
      const organizations = await Promise.all(
        memberships.map(async (m) => {
          const org = await storage.getOrganization(m.orgId);
          if (!org) return null;
          
          const members = await storage.getMembershipsByOrg(m.orgId);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          
          return {
            ...org,
            memberCount: members.length,
            role: m.role,
            planName: plan?.name,
          };
        })
      );

      res.json({
        organizations: organizations.filter(Boolean),
        recentActivity: [],
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  // Organizations
  app.get("/api/orgs", authMiddleware, async (req, res) => {
    try {
      const memberships = await storage.getMembershipsByUser(req.user!.id);
      const organizations = await Promise.all(
        memberships.map(async (m) => {
          const org = await storage.getOrganization(m.orgId);
          if (!org) return null;
          
          const members = await storage.getMembershipsByOrg(m.orgId);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          
          return {
            ...org,
            memberCount: members.length,
            role: m.role,
            planName: plan?.name,
          };
        })
      );

      res.json({ organizations: organizations.filter(Boolean) });
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

      // Get or create free plan
      let freePlan = await storage.getPlanByName("free");
      if (!freePlan) {
        freePlan = await storage.createPlan({
          name: "free",
          featuresJson: ["basic_access"],
          limitsJson: { members: 5, api_calls: 1000 },
          priceCents: 0,
        });
      }

      const org = await storage.createOrganization({
        name: data.name,
        slug: data.slug,
        planId: freePlan.id,
      });

      // Add creator as admin
      await storage.createMembership({
        userId: req.user!.id,
        orgId: org.id,
        role: "admin",
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: org.id,
        action: "org.created",
        resource: "organization",
        metadataJson: { name: org.name, slug: org.slug },
      });

      res.json(org);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create org error:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.get("/api/orgs/:id", authMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganization(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, org.id);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const members = await storage.getMembershipsByOrg(org.id);
      const entitlements = await storage.getEntitlementsByOrg(org.id);
      const plan = org.planId ? await storage.getPlan(org.planId) : null;

      res.json({
        organization: { ...org, plan },
        members,
        entitlements,
      });
    } catch (error) {
      console.error("Get org error:", error);
      res.status(500).json({ message: "Failed to load organization" });
    }
  });

  // Member management
  app.post("/api/orgs/:id/members/invite", authMiddleware, async (req, res) => {
    try {
      const data = inviteMemberSchema.parse(req.body);
      const orgId = req.params.id;

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
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
        role: data.role,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId,
        action: "member.invited",
        resource: "membership",
        metadataJson: { invitedEmail: data.email, role: data.role },
      });

      res.json(newMembership);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Invite member error:", error);
      res.status(500).json({ message: "Failed to invite member" });
    }
  });

  app.patch("/api/orgs/:orgId/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const { orgId, memberId } = req.params;
      const { role } = req.body;

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can update roles" });
      }

      const targetMembership = await storage.getMembership(memberId);
      if (!targetMembership || targetMembership.orgId !== orgId) {
        return res.status(404).json({ message: "Member not found" });
      }

      const updated = await storage.updateMembership(memberId, { role });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId,
        action: "member.role_updated",
        resource: "membership",
        metadataJson: { memberId, newRole: role },
      });

      res.json(updated);
    } catch (error) {
      console.error("Update member error:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  });

  app.delete("/api/orgs/:orgId/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const { orgId, memberId } = req.params;

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can remove members" });
      }

      const targetMembership = await storage.getMembership(memberId);
      if (!targetMembership || targetMembership.orgId !== orgId) {
        return res.status(404).json({ message: "Member not found" });
      }

      await storage.deleteMembership(memberId);

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId,
        action: "member.removed",
        resource: "membership",
        metadataJson: { memberId },
      });

      res.json({ message: "Member removed" });
    } catch (error) {
      console.error("Remove member error:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // Entitlements
  app.get("/api/entitlements/:orgId", authMiddleware, async (req, res) => {
    try {
      const { orgId } = req.params;

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const entitlements = await storage.getEntitlementsByOrg(orgId);
      res.json({ entitlements });
    } catch (error) {
      console.error("Get entitlements error:", error);
      res.status(500).json({ message: "Failed to load entitlements" });
    }
  });

  // License
  app.get("/api/license/:orgId", authMiddleware, async (req, res) => {
    try {
      const { orgId } = req.params;

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
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
        status: "active",
      });
    } catch (error) {
      console.error("Get license error:", error);
      res.status(500).json({ message: "Failed to load license" });
    }
  });

  // Admin - Plans (returns array directly)
  app.get("/api/admin/plans", authMiddleware, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ message: "Failed to load plans" });
    }
  });

  // Projects
  app.get("/api/orgs/:orgId/projects", authMiddleware, async (req, res) => {
    try {
      const { orgId } = req.params;
      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const projects = await storage.getProjectsByOrg(orgId);
      res.json({ projects });
    } catch (error) {
      console.error("Get projects error:", error);
      res.status(500).json({ message: "Failed to load projects" });
    }
  });

  app.post("/api/orgs/:orgId/projects", authMiddleware, async (req, res) => {
    try {
      const { orgId } = req.params;
      const data = createProjectSchema.parse(req.body);

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const project = await storage.createProject({
        orgId,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        status: "active",
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId,
        action: "project.created",
        resource: "project",
        resourceId: project.id,
        metadataJson: { name: project.name, slug: project.slug },
      });

      res.json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create project error:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.get("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const applications = await storage.getApplicationsByProject(project.id);
      const services = await storage.getServicesByProject(project.id);
      const entitlements = await storage.getScopedEntitlementsByScope("project", project.id);

      res.json({ project, applications, services, entitlements });
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ message: "Failed to load project" });
    }
  });

  app.patch("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const { name, description, status } = req.body;
      const updated = await storage.updateProject(project.id, { name, description, status });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: project.orgId,
        action: "project.updated",
        resource: "project",
        resourceId: project.id,
      });

      res.json(updated);
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete projects" });
      }

      await storage.deleteProject(project.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: project.orgId,
        action: "project.deleted",
        resource: "project",
        resourceId: project.id,
      });

      res.json({ message: "Project deleted" });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Applications
  app.get("/api/projects/:projectId/applications", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const applications = await storage.getApplicationsByProject(project.id);
      res.json({ applications });
    } catch (error) {
      console.error("Get applications error:", error);
      res.status(500).json({ message: "Failed to load applications" });
    }
  });

  app.post("/api/projects/:projectId/applications", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
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
        repoUrl: data.repoUrl || null,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: project.orgId,
        action: "application.created",
        resource: "application",
        resourceId: application.id,
        metadataJson: { name: application.name, projectId: project.id },
      });

      res.json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create application error:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });

  app.get("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app = await storage.getApplication(req.params.appId);
      if (!app) {
        return res.status(404).json({ message: "Application not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, app.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const services = await storage.getServicesByApplication(app.id);
      const entitlements = await storage.getScopedEntitlementsByScope("application", app.id);

      res.json({ application: app, services, entitlements });
    } catch (error) {
      console.error("Get application error:", error);
      res.status(500).json({ message: "Failed to load application" });
    }
  });

  app.patch("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app = await storage.getApplication(req.params.appId);
      if (!app) {
        return res.status(404).json({ message: "Application not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, app.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const { name, environment, appType, repoUrl } = req.body;
      const updated = await storage.updateApplication(app.id, { name, environment, appType, repoUrl });

      res.json(updated);
    } catch (error) {
      console.error("Update application error:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  app.delete("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app = await storage.getApplication(req.params.appId);
      if (!app) {
        return res.status(404).json({ message: "Application not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, app.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete applications" });
      }

      await storage.deleteApplication(app.id);
      res.json({ message: "Application deleted" });
    } catch (error) {
      console.error("Delete application error:", error);
      res.status(500).json({ message: "Failed to delete application" });
    }
  });

  // Services
  app.get("/api/projects/:projectId/services", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const services = await storage.getServicesByProject(project.id);
      res.json({ services });
    } catch (error) {
      console.error("Get services error:", error);
      res.status(500).json({ message: "Failed to load services" });
    }
  });

  app.post("/api/projects/:projectId/services", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, project.orgId);
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
        status: "active",
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: project.orgId,
        action: "service.created",
        resource: "service",
        resourceId: service.id,
        metadataJson: { name: service.name, type: service.serviceType, projectId: project.id },
      });

      res.json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create service error:", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.get("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(req.params.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, service.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const entitlements = await storage.getScopedEntitlementsByScope("service", service.id);

      res.json({ service, entitlements });
    } catch (error) {
      console.error("Get service error:", error);
      res.status(500).json({ message: "Failed to load service" });
    }
  });

  app.patch("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(req.params.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, service.orgId);
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
      const service = await storage.getService(req.params.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, service.orgId);
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

  // Application-Service linking
  app.post("/api/applications/:appId/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const app = await storage.getApplication(req.params.appId);
      const service = await storage.getService(req.params.serviceId);

      if (!app || !service) {
        return res.status(404).json({ message: "Application or service not found" });
      }

      if (app.orgId !== service.orgId) {
        return res.status(400).json({ message: "Application and service must belong to the same organization" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, app.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const link = await storage.linkApplicationService(app.id, service.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: app.orgId,
        action: "application.service_linked",
        resource: "application_service",
        metadataJson: { applicationId: app.id, serviceId: service.id },
      });

      res.json(link);
    } catch (error) {
      console.error("Link service error:", error);
      res.status(500).json({ message: "Failed to link service" });
    }
  });

  app.delete("/api/applications/:appId/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const app = await storage.getApplication(req.params.appId);
      if (!app) {
        return res.status(404).json({ message: "Application not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, app.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      await storage.unlinkApplicationService(req.params.appId, req.params.serviceId);
      res.json({ message: "Service unlinked" });
    } catch (error) {
      console.error("Unlink service error:", error);
      res.status(500).json({ message: "Failed to unlink service" });
    }
  });

  // Scoped Entitlements
  app.get("/api/scoped-entitlements/:scopeType/:scopeId", authMiddleware, async (req, res) => {
    try {
      const { scopeType, scopeId } = req.params;
      const validScopeType = scopeTypeEnum.parse(scopeType) as ScopeType;

      // Verify access based on scope type
      let orgId: string | null = null;
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
          const app = await storage.getApplication(scopeId);
          if (!app) return res.status(404).json({ message: "Application not found" });
          orgId = app.orgId;
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

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const entitlements = await storage.getScopedEntitlementsByScope(validScopeType, scopeId);
      res.json({ entitlements });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid scope type" });
      }
      console.error("Get scoped entitlements error:", error);
      res.status(500).json({ message: "Failed to load entitlements" });
    }
  });

  app.post("/api/scoped-entitlements", authMiddleware, async (req, res) => {
    try {
      const data = createScopedEntitlementSchema.parse(req.body);

      // Verify access based on scope type
      let orgId: string | null = null;
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
          const app = await storage.getApplication(data.scopeId);
          if (!app) return res.status(404).json({ message: "Application not found" });
          orgId = app.orgId;
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

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, orgId);
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
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId,
        action: "entitlement.created",
        resource: "scoped_entitlement",
        resourceId: entitlement.id,
        metadataJson: { scopeType: data.scopeType, scopeId: data.scopeId, featureKey: data.featureKey },
      });

      res.json(entitlement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to create entitlement" });
    }
  });

  app.patch("/api/scoped-entitlements/:id", authMiddleware, async (req, res) => {
    try {
      const entitlement = await storage.getScopedEntitlement(req.params.id);
      if (!entitlement) {
        return res.status(404).json({ message: "Entitlement not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, entitlement.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }

      const { quota, consumed, enabled, expiresAt } = req.body;
      const updated = await storage.updateScopedEntitlement(entitlement.id, {
        quota,
        consumed,
        enabled,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Update scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to update entitlement" });
    }
  });

  app.delete("/api/scoped-entitlements/:id", authMiddleware, async (req, res) => {
    try {
      const entitlement = await storage.getScopedEntitlement(req.params.id);
      if (!entitlement) {
        return res.status(404).json({ message: "Entitlement not found" });
      }

      const membership = await storage.getMembershipByUserAndOrg(req.user!.id, entitlement.orgId);
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

  // ==================== API KEY MANAGEMENT ====================

  // Generate API key prefix (first 8 chars for identification)
  function generateApiKeyPrefix(): string {
    return crypto.randomBytes(4).toString("hex");
  }

  // Generate full API key (32 bytes = 64 hex chars)
  function generateApiKey(): { key: string; prefix: string } {
    const prefix = generateApiKeyPrefix();
    const suffix = crypto.randomBytes(28).toString("hex");
    return { key: `sk_${prefix}${suffix}`, prefix: `sk_${prefix}` };
  }

  // Hash API key for storage
  async function hashApiKey(key: string): Promise<string> {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  // Mint a new API key (authenticated users)
  app.post("/api/api-keys", authMiddleware, async (req, res) => {
    try {
      const data = createApiKeySchema.parse(req.body);

      // If orgId is specified, verify user has admin access to the org
      if (data.orgId) {
        const membership = await storage.getMembershipByUserAndOrg(req.user!.id, data.orgId);
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
        createdBy: req.user!.id,
        scopes: data.scopes || [],
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: data.orgId || null,
        action: "api_key.created",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: data.name, keyPrefix: prefix, scopes: data.scopes },
      });

      // Return the full key only once - it cannot be retrieved later
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        key, // Only returned on creation
        keyPrefix: apiKey.keyPrefix,
        orgId: apiKey.orgId,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        _warning: "Store this key securely. It will not be shown again."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create API key error:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  // List API keys for current user
  app.get("/api/api-keys", authMiddleware, async (req, res) => {
    try {
      const apiKeys = await storage.getApiKeysByUser(req.user!.id);
      
      // Never return the key hash
      res.json(apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        orgId: k.orgId,
        scopes: k.scopes,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })));
    } catch (error) {
      console.error("List API keys error:", error);
      res.status(500).json({ message: "Failed to list API keys" });
    }
  });

  // Get single API key details
  app.get("/api/api-keys/:id", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }

      // Only the creator or super admin can view the key
      if (apiKey.createdBy !== req.user!.id && !req.user!.isSuperAdmin) {
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
        createdAt: apiKey.createdAt,
      });
    } catch (error) {
      console.error("Get API key error:", error);
      res.status(500).json({ message: "Failed to get API key" });
    }
  });

  // Revoke an API key
  app.post("/api/api-keys/:id/revoke", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }

      // Only the creator or super admin can revoke
      if (apiKey.createdBy !== req.user!.id && !req.user!.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (apiKey.revokedAt) {
        return res.status(400).json({ message: "API key is already revoked" });
      }

      await storage.revokeApiKey(apiKey.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: apiKey.orgId,
        action: "api_key.revoked",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      });

      res.json({ message: "API key revoked successfully" });
    } catch (error) {
      console.error("Revoke API key error:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // Rotate an API key (revoke old, create new with same settings)
  app.post("/api/api-keys/:id/rotate", authMiddleware, async (req, res) => {
    try {
      const oldApiKey = await storage.getApiKey(req.params.id);
      if (!oldApiKey) {
        return res.status(404).json({ message: "API key not found" });
      }

      // Only the creator or super admin can rotate
      if (oldApiKey.createdBy !== req.user!.id && !req.user!.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (oldApiKey.revokedAt) {
        return res.status(400).json({ message: "Cannot rotate a revoked API key" });
      }

      // Revoke the old key
      await storage.revokeApiKey(oldApiKey.id);

      // Create new key with same settings
      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);

      const newApiKey = await storage.createApiKey({
        name: oldApiKey.name,
        keyHash,
        keyPrefix: prefix,
        orgId: oldApiKey.orgId,
        createdBy: req.user!.id,
        scopes: oldApiKey.scopes || [],
        expiresAt: oldApiKey.expiresAt,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: oldApiKey.orgId,
        action: "api_key.rotated",
        resource: "api_key",
        resourceId: newApiKey.id,
        metadataJson: { 
          oldKeyId: oldApiKey.id, 
          newKeyPrefix: prefix,
          name: oldApiKey.name 
        },
      });

      res.json({
        id: newApiKey.id,
        name: newApiKey.name,
        key, // Only returned on creation
        keyPrefix: newApiKey.keyPrefix,
        orgId: newApiKey.orgId,
        scopes: newApiKey.scopes,
        expiresAt: newApiKey.expiresAt,
        createdAt: newApiKey.createdAt,
        _warning: "Store this key securely. It will not be shown again.",
        rotatedFrom: oldApiKey.id,
      });
    } catch (error) {
      console.error("Rotate API key error:", error);
      res.status(500).json({ message: "Failed to rotate API key" });
    }
  });

  // Delete an API key permanently
  app.delete("/api/api-keys/:id", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }

      // Only the creator or super admin can delete
      if (apiKey.createdBy !== req.user!.id && !req.user!.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteApiKey(apiKey.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: apiKey.orgId,
        action: "api_key.deleted",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      });

      res.json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error("Delete API key error:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  // Normalized /api/auth/keys aliases (matches logging service pattern)
  app.get("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });

  app.post("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });

  app.get("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${req.params.id}`;
    app._router.handle(req, res, next);
  });

  app.delete("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${req.params.id}`;
    app._router.handle(req, res, next);
  });

  app.post("/api/auth/keys/:id/revoke", (req, res, next) => {
    req.url = `/api/api-keys/${req.params.id}/revoke`;
    app._router.handle(req, res, next);
  });

  app.post("/api/auth/keys/:id/rotate", (req, res, next) => {
    req.url = `/api/api-keys/${req.params.id}/rotate`;
    app._router.handle(req, res, next);
  });

  // Verify an API key (for service-to-service authentication)
  // This is a public endpoint that services call to validate API keys
  app.post("/api/auth/verify-api-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey || typeof apiKey !== "string") {
        return res.json({ valid: false, error: "API key is required" });
      }

      // Hash the provided key to look it up
      const keyHash = await hashApiKey(apiKey);
      const storedKey = await storage.getApiKeyByHash(keyHash);

      if (!storedKey) {
        return res.json({ valid: false, error: "Invalid API key" });
      }

      // Check if revoked
      if (storedKey.revokedAt) {
        return res.json({ valid: false, error: "API key has been revoked" });
      }

      // Check if expired
      if (storedKey.expiresAt && new Date() > storedKey.expiresAt) {
        return res.json({ valid: false, error: "API key has expired" });
      }

      // Update last used timestamp
      await storage.updateApiKeyLastUsed(storedKey.id);

      // Get the creator's enriched data for permissions
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
          roles: creator.roles,
        } : null,
      });
    } catch (error) {
      console.error("Verify API key error:", error);
      res.json({ valid: false, error: "Verification failed" });
    }
  });

  // ==================== SUPER ADMIN ROUTES ====================
  // All superadmin routes have rate limiting and detailed audit logging
  
  // Get all users (super admin only)
  app.get("/api/admin/users", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })));
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user (super admin only)
  app.patch("/api/admin/users/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updateUserAdminSchema.parse(req.body);
      const targetUser = await storage.getUser(req.params.id);
      
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent removing super admin from self
      if (req.params.id === req.user!.id && data.isSuperAdmin === false) {
        return res.status(400).json({ message: "Cannot remove super admin status from yourself" });
      }

      const updates: { name?: string; email?: string; isSuperAdmin?: boolean } = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.email !== undefined) {
        const existing = await storage.getUserByEmail(data.email);
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = data.email;
      }
      if (data.isSuperAdmin !== undefined) updates.isSuperAdmin = data.isSuperAdmin;

      const user = await storage.updateUser(req.params.id, updates);
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.user.updated",
        resource: "user",
        resourceId: req.params.id,
        metadataJson: updates,
      });

      res.json({
        id: user!.id,
        email: user!.email,
        name: user!.name,
        isSuperAdmin: user!.isSuperAdmin,
        createdAt: user!.createdAt,
        updatedAt: user!.updatedAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Delete user (super admin only)
  app.delete("/api/admin/users/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent deleting self
      if (req.params.id === req.user!.id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }

      // Delete user sessions first
      await storage.deleteSessionsByUser(req.params.id);
      
      // User deletion will cascade to memberships due to schema constraints
      await storage.deleteUser(req.params.id);
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.user.deleted",
        resource: "user",
        resourceId: req.params.id,
        metadataJson: { email: targetUser.email },
      });

      res.json({ message: "User deleted" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Get all organizations (super admin only)
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
            planName: plan?.name,
          };
        })
      );
      res.json(orgsWithDetails);
    } catch (error) {
      console.error("Get all orgs error:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  // Update organization (super admin only)
  app.patch("/api/admin/orgs/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updateOrgAdminSchema.parse(req.body);
      const org = await storage.getOrganization(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const updates: { name?: string; slug?: string; planId?: string | null } = {};
      
      if (data.name !== undefined) updates.name = data.name;
      if (data.slug !== undefined) {
        const existing = await storage.getOrganizationBySlug(data.slug);
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ message: "Slug already in use" });
        }
        updates.slug = data.slug;
      }
      if (data.planId !== undefined) updates.planId = data.planId;

      const updated = await storage.updateOrganization(req.params.id, updates);
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.org.updated",
        resource: "organization",
        resourceId: req.params.id,
        metadataJson: updates,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update org error:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Delete organization (super admin only)
  app.delete("/api/admin/orgs/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const org = await storage.getOrganization(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      await storage.deleteOrganization(req.params.id);
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.org.deleted",
        resource: "organization",
        resourceId: req.params.id,
        metadataJson: { name: org.name, slug: org.slug },
      });

      res.json({ message: "Organization deleted" });
    } catch (error) {
      console.error("Delete org error:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  // Get all audit logs (super admin only)
  app.get("/api/admin/audit-logs", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allLogs = await storage.getAllAuditLogs();
      res.json(allLogs);
    } catch (error) {
      console.error("Get all audit logs error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Create plan (super admin only)
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
        priceCents: data.priceCents || 0,
      });
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.plan.created",
        resource: "plan",
        resourceId: plan.id,
        metadataJson: { name: data.name },
      });

      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create plan error:", error);
      res.status(500).json({ message: "Failed to create plan" });
    }
  });

  // Update plan (super admin only)
  app.patch("/api/admin/plans/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updatePlanAdminSchema.parse(req.body);
      const plan = await storage.getPlan(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      if (data.name && data.name !== plan.name) {
        const existingPlan = await storage.getPlanByName(data.name);
        if (existingPlan) {
          return res.status(400).json({ message: "Plan with this name already exists" });
        }
      }

      const updated = await storage.updatePlan(req.params.id, {
        name: data.name,
        featuresJson: data.featuresJson,
        limitsJson: data.limitsJson,
        priceCents: data.priceCents,
      });
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.plan.updated",
        resource: "plan",
        resourceId: req.params.id,
        metadataJson: { name: data.name },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update plan error:", error);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  // User Entitlements Management (super admin only)
  app.get("/api/admin/users/:userId/entitlements", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const entitlements = await storage.getUserEntitlements(userId);
      res.json({ entitlements });
    } catch (error) {
      console.error("Get user entitlements error:", error);
      res.status(500).json({ message: "Failed to load user entitlements" });
    }
  });

  app.post("/api/admin/users/:userId/entitlements", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const { userId } = req.params;
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
        grantedBy: req.user!.id,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.user_entitlement.granted",
        resource: "user_entitlement",
        resourceId: entitlement.id,
        metadataJson: { targetUserId: userId, entitlementKey },
      });

      res.json(entitlement);
    } catch (error) {
      console.error("Grant user entitlement error:", error);
      res.status(500).json({ message: "Failed to grant entitlement" });
    }
  });

  app.delete("/api/admin/users/:userId/entitlements/:entitlementKey", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const { userId, entitlementKey } = req.params;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.deleteUserEntitlementByKey(userId, entitlementKey);

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.user_entitlement.revoked",
        resource: "user_entitlement",
        metadataJson: { targetUserId: userId, entitlementKey },
      });

      res.json({ message: "Entitlement revoked" });
    } catch (error) {
      console.error("Revoke user entitlement error:", error);
      res.status(500).json({ message: "Failed to revoke entitlement" });
    }
  });

  // User Roles Management (super admin only)
  app.get("/api/admin/users/:userId/roles", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const { userId } = req.params;
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
      const { userId } = req.params;
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
        grantedBy: req.user!.id,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.user_role.granted",
        resource: "user_role",
        resourceId: role.id,
        metadataJson: { targetUserId: userId, roleKey },
      });

      res.json(role);
    } catch (error) {
      console.error("Grant user role error:", error);
      res.status(500).json({ message: "Failed to grant role" });
    }
  });

  app.delete("/api/admin/users/:userId/roles/:roleKey", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const { userId, roleKey } = req.params;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.deleteUserRoleByKey(userId, roleKey);

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "admin.user_role.revoked",
        resource: "user_role",
        metadataJson: { targetUserId: userId, roleKey },
      });

      res.json({ message: "Role revoked" });
    } catch (error) {
      console.error("Revoke user role error:", error);
      res.status(500).json({ message: "Failed to revoke role" });
    }
  });

  // ==========================================================================
  // User Credentials (Third-Party API Keys for Integrations)
  // ==========================================================================

  // Create a new credential (store third-party API key)
  app.post("/api/credentials", authMiddleware, async (req, res) => {
    try {
      const data = createUserCredentialSchema.parse(req.body);

      // Simple encryption using AES-256-GCM - must match key used in index.ts seeding
      const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!";
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey.padEnd(32).slice(0, 32)), iv);
      let encrypted = cipher.update(data.apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      const encryptedCredential = `${iv.toString('hex')}:${authTag}:${encrypted}`;

      // Get prefix for identification (e.g., "sk-proj-..." -> "sk-proj-")
      const prefix = data.apiKey.slice(0, Math.min(8, data.apiKey.length));

      // Get user's org context from header or membership
      const orgId = req.headers['x-org-id'] as string | undefined;

      const credential = await storage.createUserCredential({
        userId: req.user!.id,
        orgId: orgId || null,
        provider: data.provider,
        name: data.name,
        credentialEncrypted: encryptedCredential,
        credentialPrefix: prefix,
        isOrgWide: data.isOrgWide,
        metadata: data.metadata,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: orgId || null,
        action: "credential.created",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: data.provider, name: data.name },
      });

      res.json({
        id: credential.id,
        provider: credential.provider,
        name: credential.name,
        credentialPrefix: credential.credentialPrefix,
        isOrgWide: credential.isOrgWide,
        createdAt: credential.createdAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create credential error:", error);
      res.status(500).json({ message: "Failed to store credential" });
    }
  });

  // List user's credentials (metadata only, no secrets)
  app.get("/api/credentials", authMiddleware, async (req, res) => {
    try {
      const credentials = await storage.getUserCredentialsByUser(req.user!.id);

      res.json(credentials.map(c => ({
        id: c.id,
        provider: c.provider,
        name: c.name,
        credentialPrefix: c.credentialPrefix,
        isOrgWide: c.isOrgWide,
        lastUsedAt: c.lastUsedAt,
        createdAt: c.createdAt,
      })));
    } catch (error) {
      console.error("List credentials error:", error);
      res.status(500).json({ message: "Failed to list credentials" });
    }
  });

  // Delete a credential
  app.delete("/api/credentials/:id", authMiddleware, async (req, res) => {
    try {
      const credential = await storage.getUserCredential(req.params.id);
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }

      // Only owner can delete
      if (credential.userId !== req.user!.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteUserCredential(credential.id);

      await storage.createAuditLog({
        userId: req.user!.id,
        orgId: credential.orgId,
        action: "credential.deleted",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: credential.provider, name: credential.name },
      });

      res.json({ message: "Credential deleted successfully" });
    } catch (error) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });

  // Debug endpoint to list all credentials (dev only)
  app.get("/api/debug/credentials", async (req, res) => {
    if (process.env.NODE_ENV !== "development" && process.env.IDENTITY_USE_MEMORY_DB !== "true") {
      return res.status(404).json({ message: "Not found" });
    }

    const superAdminCreds = await storage.getUserCredentialsByUser("650e8400-e29b-41d4-a716-446655440000");
    const orgCreds = await storage.getUserCredentialsByOrg("550e8400-e29b-41d4-a716-446655440000");

    const mapCred = (c: { id: string; userId: string; orgId: string | null; provider: string; isOrgWide: boolean; credentialPrefix: string | null }) => ({
      id: c.id,
      userId: c.userId,
      orgId: c.orgId,
      provider: c.provider,
      isOrgWide: c.isOrgWide,
      prefix: c.credentialPrefix,
    });

    res.json({
      superAdminCredentials: superAdminCreds.map(mapCred),
      orgCredentials: orgCreds.map(mapCred),
    });
  });

  // Internal endpoint for Integrations service to fetch credentials
  // This requires service-to-service authentication
  app.get("/api/internal/credentials/:userId/:provider", async (req, res) => {
    try {
      // Verify service-to-service auth via token introspection
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Check if caller has permission (same user or service)
      const serviceId = req.headers['x-service-id'] as string;
      const isService = serviceId && ['integrations', 'assistants', 'runtime'].includes(serviceId);

      if (!isService && payload.sub !== req.params.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { userId, provider } = req.params;
      const orgId = req.headers['x-org-id'] as string | undefined;

      console.log(`[identity] Internal credential lookup - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);

      // Find credential for this user/provider, falling back to org-wide credentials
      const credential = await storage.getCredentialForUserOrOrg(userId, orgId || null, provider);
      console.log(`[identity] Credential lookup result: ${credential ? `found (id: ${credential.id})` : 'not found'}`);

      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }

      // Decrypt the credential - must use same key as encryption in index.ts
      const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!";
      const parts = credential.credentialEncrypted.split(':');
      if (parts.length !== 3) {
        return res.status(500).json({ message: "Invalid credential format" });
      }

      const [ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey.padEnd(32).slice(0, 32)), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      const apiKey = decrypted.toString('utf8');

      // Update last used timestamp
      await storage.updateUserCredentialLastUsed(credential.id);

      // Determine if this is a proxy (org-wide) credential
      const isProxy = credential.isOrgWide && credential.userId !== userId;

      res.json({
        apiKey,
        metadata: credential.metadata,
        // Proxy info for usage tracking
        credentialId: credential.id,
        isProxy,
        ownerId: credential.userId,  // Who owns this credential
        isOrgWide: credential.isOrgWide,
      });
    } catch (error) {
      console.error("Internal credential lookup error:", error);
      res.status(500).json({ message: "Failed to retrieve credential" });
    }
  });

  // Internal endpoint for Integrations service to store OAuth tokens
  // This is called by the Integrations service after successful OAuth flow
  app.post("/api/internal/credentials/oauth", async (req, res) => {
    try {
      // Verify service-to-service auth
      const serviceId = req.headers['x-service-id'] as string;
      if (!serviceId || !['integrations', 'assistants', 'runtime'].includes(serviceId)) {
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
        oauthUserName,
      } = req.body;

      if (!userId || !provider || !accessToken) {
        return res.status(400).json({ message: "Missing required fields: userId, provider, accessToken" });
      }

      // Encrypt the access token
      const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!";
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey.padEnd(32).slice(0, 32)), iv);
      let encrypted = cipher.update(accessToken, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      const encryptedAccessToken = `${iv.toString('hex')}:${authTag}:${encrypted}`;

      // Encrypt the refresh token if provided
      let encryptedRefreshToken: string | null = null;
      if (refreshToken) {
        const refreshIv = crypto.randomBytes(16);
        const refreshCipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey.padEnd(32).slice(0, 32)), refreshIv);
        let refreshEncrypted = refreshCipher.update(refreshToken, 'utf8', 'hex');
        refreshEncrypted += refreshCipher.final('hex');
        const refreshAuthTag = refreshCipher.getAuthTag().toString('hex');
        encryptedRefreshToken = `${refreshIv.toString('hex')}:${refreshAuthTag}:${refreshEncrypted}`;
      }

      // Get prefix for display
      const prefix = accessToken.slice(0, Math.min(8, accessToken.length));

      // Check if credential already exists for this user/provider
      const existingCredential = await storage.getCredentialForUserOrOrg(userId, orgId || null, provider);

      let credential;
      if (existingCredential) {
        // Update existing credential
        credential = await storage.updateUserCredential(existingCredential.id, {
          credentialEncrypted: encryptedAccessToken,
          credentialPrefix: prefix,
          credentialType: "oauth_token",
          refreshTokenEncrypted: encryptedRefreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          oauthUserId: oauthUserId || null,
          oauthUserEmail: oauthUserEmail || null,
          oauthUserName: oauthUserName || null,
        });
        credential = { ...existingCredential, ...credential };
      } else {
        // Create new credential
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
          oauthUserName: oauthUserName || null,
        });
      }

      await storage.createAuditLog({
        userId,
        orgId: orgId || null,
        action: existingCredential ? "oauth.token_refreshed" : "oauth.token_stored",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider, oauthUserId, oauthUserEmail },
      });

      res.json({
        credentialId: credential.id,
        provider: credential.provider,
        expiresAt: expiresAt || null,
      });
    } catch (error) {
      console.error("Store OAuth token error:", error);
      res.status(500).json({ message: "Failed to store OAuth token" });
    }
  });

  // Internal endpoint to get credential by ID (for service-to-service)
  app.get("/api/internal/credentials/by-id/:credentialId", async (req, res) => {
    try {
      // Verify service-to-service auth
      const serviceId = req.headers['x-service-id'] as string;
      if (!serviceId || !['integrations', 'assistants', 'runtime'].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }

      const credential = await storage.getUserCredential(req.params.credentialId);
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }

      // Decrypt the credential
      const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!";
      const parts = credential.credentialEncrypted.split(':');
      if (parts.length !== 3) {
        return res.status(500).json({ message: "Invalid credential format" });
      }

      const [ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey.padEnd(32).slice(0, 32)), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      const apiKey = decrypted.toString('utf8');

      res.json({
        apiKey,
        metadata: credential.metadata,
        credentialId: credential.id,
        isProxy: false,
        ownerId: credential.userId,
        isOrgWide: credential.isOrgWide,
      });
    } catch (error) {
      console.error("Get credential by ID error:", error);
      res.status(500).json({ message: "Failed to retrieve credential" });
    }
  });

  // Internal endpoint to delete credential (for service-to-service)
  app.delete("/api/internal/credentials/:credentialId", async (req, res) => {
    try {
      // Verify service-to-service auth
      const serviceId = req.headers['x-service-id'] as string;
      const requestUserId = req.headers['x-user-id'] as string;

      if (!serviceId || !['integrations', 'assistants', 'runtime'].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }

      const credential = await storage.getUserCredential(req.params.credentialId);
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }

      // Verify user owns this credential
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
        metadataJson: { provider: credential.provider, name: credential.name },
      });

      res.json({ success: true, message: "Credential deleted" });
    } catch (error) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });

  // ==================== ENTITY DIRECTORY ROUTES ====================
  // Entity Directory provides UUID-based addressing for all principals
  // This enables @mention resolution, multi-instance support, and federation

  // Get entity by ID
  app.get("/api/entities/:id", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      // Check access: must be in same org or super admin
      if (entity.orgId && req.user && !req.user.isSuperAdmin) {
        const membership = await storage.getMembership(req.user.id, entity.orgId);
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

  // List entities (with optional filters)
  app.get("/api/entities", authMiddleware, async (req, res) => {
    try {
      const { type, orgId, slug, status } = req.query;

      // Get org context - user can only see entities in their orgs (or all if super admin)
      let allowedOrgIds: string[] | undefined;
      if (req.user && !req.user.isSuperAdmin) {
        const memberships = await storage.getMembershipsByUser(req.user.id);
        allowedOrgIds = memberships.map(m => m.orgId);
      }

      const entities = await storage.listEntities({
        type: type as string | undefined,
        orgId: orgId as string | undefined,
        slug: slug as string | undefined,
        status: status as string | undefined,
        allowedOrgIds,
      });

      res.json({ entities, count: entities.length });
    } catch (error) {
      console.error("List entities error:", error);
      res.status(500).json({ message: "Failed to list entities" });
    }
  });

  // Resolve entity address to entity UUID(s)
  // Supports: @slug, slug#instance, type:slug, ent_uuid
  app.post("/api/entities/resolve", authMiddleware, async (req, res) => {
    try {
      const { address, orgId } = req.body;

      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Address is required" });
      }

      // Use org context from request body or header
      const contextOrgId = orgId || req.headers["x-org-id"] as string;

      // Resolve the address
      const result = await storage.resolveEntityAddress(address, contextOrgId);

      if (!result || result.length === 0) {
        return res.status(404).json({
          message: "Entity not found",
          address,
          suggestions: await storage.getSimilarEntities(address, contextOrgId),
        });
      }

      // Return single entity or array depending on result
      res.json({
        resolved: result.length === 1 ? result[0] : result,
        count: result.length,
        address,
      });
    } catch (error) {
      console.error("Resolve entity error:", error);
      res.status(500).json({ message: "Failed to resolve entity" });
    }
  });

  // Create a new entity
  app.post("/api/entities", authMiddleware, async (req, res) => {
    try {
      const { type, slug, displayName, instanceId, orgId, networkId, capabilities, tags, sourceTable, sourceId, metadata } = req.body;

      // Validate required fields
      if (!type || !slug || !displayName) {
        return res.status(400).json({ message: "type, slug, and displayName are required" });
      }

      // Check for existing entity with same slug/org/instance
      const existing = await storage.getEntityBySlugOrgInstance(slug, orgId, instanceId);
      if (existing) {
        return res.status(409).json({
          message: "Entity with this slug already exists",
          existingId: existing.id,
        });
      }

      // Create the entity
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
        status: "active",
      });

      // Create default aliases
      await storage.createEntityAlias({
        entityId: entity.id,
        aliasType: "slug",
        aliasValue: slug,
        orgId,
        priority: 100,
      });

      // If it's a qualified type, create qualified alias
      if (type && slug) {
        await storage.createEntityAlias({
          entityId: entity.id,
          aliasType: "qualified",
          aliasValue: `${type}:${slug}`,
          orgId,
          priority: 90,
        });
      }

      res.status(201).json(entity);
    } catch (error) {
      console.error("Create entity error:", error);
      res.status(500).json({ message: "Failed to create entity" });
    }
  });

  // Update entity
  app.patch("/api/entities/:id", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      // Check access
      if (entity.orgId && req.user && !req.user.isSuperAdmin) {
        const membership = await storage.getMembership(req.user.id, entity.orgId);
        if (!membership || membership.role === "viewer") {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const { displayName, capabilities, tags, status, metadata } = req.body;
      const updates: Record<string, unknown> = {};

      if (displayName !== undefined) updates.displayName = displayName;
      if (capabilities !== undefined) updates.capabilities = capabilities;
      if (tags !== undefined) updates.tags = tags;
      if (status !== undefined) updates.status = status;
      if (metadata !== undefined) updates.metadata = metadata;

      const updated = await storage.updateEntity(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Update entity error:", error);
      res.status(500).json({ message: "Failed to update entity" });
    }
  });

  // Bind entity to network node
  app.post("/api/entities/:id/bind", authMiddleware, async (req, res) => {
    try {
      const { nodeId } = req.body;

      if (!nodeId) {
        return res.status(400).json({ message: "nodeId is required" });
      }

      const entity = await storage.getEntity(req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      const updated = await storage.bindEntityToNode(req.params.id, nodeId);
      res.json(updated);
    } catch (error) {
      console.error("Bind entity error:", error);
      res.status(500).json({ message: "Failed to bind entity" });
    }
  });

  // Unbind entity from network node
  app.post("/api/entities/:id/unbind", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }

      const updated = await storage.unbindEntityFromNode(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Unbind entity error:", error);
      res.status(500).json({ message: "Failed to unbind entity" });
    }
  });

  // Get entity by bound node ID
  app.get("/api/entities/by-node/:nodeId", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntityByNodeId(req.params.nodeId);
      if (!entity) {
        return res.status(404).json({ message: "No entity bound to this node" });
      }
      res.json(entity);
    } catch (error) {
      console.error("Get entity by node error:", error);
      res.status(500).json({ message: "Failed to fetch entity" });
    }
  });

  // Sync entities from users/agents tables
  // This creates/updates entity records for existing principals
  app.post("/api/entities/sync", authMiddleware, superAdminMiddleware, async (req, res) => {
    try {
      const { source } = req.body; // 'users', 'agents', or 'all'
      const results = { users: 0, agents: 0 };

      if (source === "users" || source === "all") {
        const users = await storage.getAllUsers();
        for (const user of users) {
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
              metadata: { email: user.email },
            });
            results.users++;
          }
        }
      }

      if (source === "agents" || source === "all") {
        const agents = await storage.getAllAgents();
        for (const agent of agents) {
          const existing = await storage.getEntityBySourceId("agents", agent.id);
          if (!existing) {
            // Parse agent type and key from agentId (e.g., "assistant:log-analyst")
            const [agentType, agentKey] = agent.agentId.split(":");
            await storage.createEntity({
              type: agentType === "assistant" ? "assistant" : "service",
              slug: agentKey || agent.agentId,
              displayName: agent.name,
              orgId: agent.orgId || undefined,
              sourceTable: "agents",
              sourceId: agent.id,
              status: agent.isActive ? "active" : "inactive",
              capabilities: (agent.capabilities as string[]) || [],
              tags: [],
              metadata: { agentId: agent.agentId },
            });
            results.agents++;
          }
        }
      }

      res.json({
        message: "Sync completed",
        created: results,
      });
    } catch (error) {
      console.error("Sync entities error:", error);
      res.status(500).json({ message: "Failed to sync entities" });
    }
  });

  // Symbia namespace endpoint - exposes identity as @identity.* references
  app.get("/symbia-namespace", async (_req, res) => {
    res.json({
      namespace: "identity",
      version: "1.0.0",
      description: "Authentication, users, and organizations",
      properties: {
        "users.count": { type: "number", description: "Total user count" },
        "orgs.count": { type: "number", description: "Total organization count" },
        "agents.count": { type: "number", description: "Total agent count" },
        "entities.count": { type: "number", description: "Total entity count" },
      },
    });
  });

  return httpServer;
}
