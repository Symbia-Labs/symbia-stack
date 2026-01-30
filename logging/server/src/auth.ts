import type { Request, Response, NextFunction } from "express";
import type { Session, SessionData } from "express-session";
import { storage } from "./storage";
import { createHash, randomBytes } from "crypto";
import { resolveServiceUrl, ServiceId } from "@symbia/sys";

declare module "express" {
  interface Request {
    session: Session & Partial<SessionData> & {
      userId?: string;
      username?: string;
    };
  }
}

export type AuthType = "jwt" | "apiKey" | "session" | "anonymous";

export type AuthContext = {
  authType: AuthType;
  orgId: string;
  serviceId: string;
  env: string;
  dataClass: string;
  policyRef: string;
  actorId: string;
  entitlements: string[];
  roles: string[];
  isSuperAdmin: boolean;
};

type ApiKeyScope = {
  orgId: string;
  serviceId: string;
  env: string;
};

export type IdentityIntrospection = {
  active: boolean;
  sub?: string;
  email?: string;
  name?: string;
  isSuperAdmin?: boolean;
  organizations?: Array<{ id: string; name?: string; slug?: string; role?: string }>;
  entitlements?: string[];
  roles?: string[];
};

declare module "express-serve-static-core" {
  interface Request {
    authContext?: AuthContext;
  }
}

const AUTH_MODE = (process.env.LOGGING_AUTH_MODE ||
  (process.env.NODE_ENV === "production" ? "required" : "optional")) as
  | "required"
  | "optional"
  | "off";

const IDENTITY_SERVICE_URL = `${resolveServiceUrl(ServiceId.IDENTITY)}/api`;

const DEFAULT_ORG_ID = process.env.LOGGING_DEFAULT_ORG_ID || "symbia-dev";
const DEFAULT_SERVICE_ID = process.env.LOGGING_DEFAULT_SERVICE_ID || "logging-service";
const DEFAULT_ENV = process.env.LOGGING_DEFAULT_ENV || (process.env.NODE_ENV === "production" ? "prod" : "dev");
const DEFAULT_DATA_CLASS = process.env.LOGGING_DEFAULT_DATA_CLASS || "none";
const DEFAULT_POLICY_REF = process.env.LOGGING_DEFAULT_POLICY_REF || "policy/default";
const AUTH_SHARED_SECRET = process.env.AUTH_SHARED_SECRET || "";

const DATA_CLASS_VALUES = new Set(["none", "pii", "phi", "secret"]);

const PUBLIC_API_PATHS = new Set([
  "/api/openapi.json",
  "/api/docs/openapi.json",
  "/api/auth/config",
  "/api/auth/login",
  "/api/auth/session",
]);
const PUBLIC_DOC_PATHS = ["/docs"];
const INGEST_ONLY_PATHS = new Set([
  "/api/logs/ingest",
  "/api/metrics/ingest",
  "/api/traces/ingest",
  "/api/objects/ingest",
  "/api/ingest",
]);
const SHARED_SECRET_PATHS = new Set([
  "/api/logs/streams",
  "/api/metrics",
  "/api/objects/streams",
  ...Array.from(INGEST_ONLY_PATHS),
]);

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const secret = randomBytes(32).toString("hex");
  const prefix = "slk_" + secret.slice(0, 8);
  const key = "slk_" + secret;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

function getHeader(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return value ? value.trim() : undefined;
}

function parseApiKeyConfig(raw: string): Map<string, ApiKeyScope> {
  const map = new Map<string, ApiKeyScope>();
  if (!raw) return map;
  for (const entry of raw.split(",").map((value) => value.trim()).filter(Boolean)) {
    const parts = entry.split(":");
    const key = parts[0];
    if (!key) continue;
    const orgId = parts[1] || DEFAULT_ORG_ID;
    const serviceId = parts[2] || DEFAULT_SERVICE_ID;
    const env = parts[3] || DEFAULT_ENV;
    map.set(key, { orgId, serviceId, env });
  }
  return map;
}

const API_KEYS = parseApiKeyConfig(process.env.LOGGING_API_KEYS || "");

export async function introspectToken(token: string): Promise<IdentityIntrospection | null> {
  try {
    const response = await fetch(`${IDENTITY_SERVICE_URL}/auth/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;
    return (await response.json()) as IdentityIntrospection;
  } catch {
    return null;
  }
}

function resolveOrgId(introspection: IdentityIntrospection, requestedOrgId?: string): string | null {
  const orgs = introspection.organizations || [];
  if (requestedOrgId) {
    if (introspection.isSuperAdmin) return requestedOrgId;
    if (orgs.some((org) => org.id === requestedOrgId)) return requestedOrgId;
    return null;
  }
  if (DEFAULT_ORG_ID) {
    if (introspection.isSuperAdmin) return DEFAULT_ORG_ID;
    if (orgs.some((org) => org.id === DEFAULT_ORG_ID)) return DEFAULT_ORG_ID;
    // In development mode, allow access to default org for seeded demo data
    if (AUTH_MODE === "optional") return DEFAULT_ORG_ID;
  }
  if (orgs.length === 1) return orgs[0].id;
  return null;
}

function resolveServiceId(requestedServiceId?: string): string | null {
  if (requestedServiceId) return requestedServiceId;
  if (DEFAULT_SERVICE_ID) return DEFAULT_SERVICE_ID;
  return null;
}

function normalizeDataClass(value?: string): string {
  if (!value) return DEFAULT_DATA_CLASS;
  const normalized = value.toLowerCase();
  return DATA_CLASS_VALUES.has(normalized) ? normalized : DEFAULT_DATA_CLASS;
}

function buildContextFromDefaults(): AuthContext {
  return {
    authType: "anonymous",
    orgId: DEFAULT_ORG_ID,
    serviceId: DEFAULT_SERVICE_ID,
    env: DEFAULT_ENV,
    dataClass: DEFAULT_DATA_CLASS,
    policyRef: DEFAULT_POLICY_REF,
    actorId: "anonymous",
    entitlements: [],
    roles: [],
    isSuperAdmin: false,
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  if (req.method === "OPTIONS" || PUBLIC_API_PATHS.has(req.path)) {
    return next();
  }

  if (PUBLIC_DOC_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const bearer = getHeader(req, "authorization");
  const apiKey = getHeader(req, "x-api-key");
  const requestedOrgId = getHeader(req, "x-org-id");
  const requestedServiceId = getHeader(req, "x-service-id");
  const requestedEnv = getHeader(req, "x-env") || getHeader(req, "x-environment");
  const requestedDataClass = getHeader(req, "x-data-class");
  const requestedPolicyRef = getHeader(req, "x-policy-ref");

  if (req.session?.userId) {
    const identityUser = req.session.identityUser;
    const userOrgs = identityUser?.organizations || [];
    const isSuperAdmin = identityUser?.isSuperAdmin || false;
    
    // Resolve org: prefer header, then user's first org, then default
    let sessionOrgId = requestedOrgId;
    if (!sessionOrgId && userOrgs.length > 0) {
      sessionOrgId = userOrgs[0].id;
    }
    if (!sessionOrgId) {
      sessionOrgId = DEFAULT_ORG_ID;
    }
    
    // Validate org access (super admins can access any org)
    if (!isSuperAdmin && requestedOrgId && !userOrgs.some((org: any) => org.id === requestedOrgId)) {
      return res.status(403).json({ error: "Access denied to requested organization" });
    }

    req.authContext = {
      authType: "session",
      orgId: sessionOrgId,
      serviceId: requestedServiceId || DEFAULT_SERVICE_ID,
      env: requestedEnv || DEFAULT_ENV,
      dataClass: normalizeDataClass(requestedDataClass),
      policyRef: requestedPolicyRef || DEFAULT_POLICY_REF,
      actorId: req.session.userId,
      entitlements: identityUser?.entitlements || ["admin"],
      roles: identityUser?.roles || ["admin"],
      isSuperAdmin,
    };
    return next();
  }

  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice("bearer ".length).trim();
    if (AUTH_SHARED_SECRET && token === AUTH_SHARED_SECRET) {
      if (req.method !== "POST" || !SHARED_SECRET_PATHS.has(req.path)) {
        return res.status(403).json({ error: "Shared secret restricted to telemetry ingest" });
      }

      req.authContext = {
        authType: "apiKey",
        orgId: requestedOrgId || DEFAULT_ORG_ID,
        serviceId: requestedServiceId || DEFAULT_SERVICE_ID,
        env: requestedEnv || DEFAULT_ENV,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || DEFAULT_POLICY_REF,
        actorId: "telemetry-shared-secret",
        entitlements: ["telemetry:ingest"],
        roles: [],
        isSuperAdmin: false,
      };
      return next();
    }

    const introspection = await introspectToken(token);
    if (!introspection || !introspection.active) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const orgId = resolveOrgId(introspection, requestedOrgId);
    if (!orgId) {
      return res.status(400).json({ error: "Organization selection required" });
    }

    const serviceId = resolveServiceId(requestedServiceId);
    if (!serviceId) {
      return res.status(400).json({ error: "Service ID required" });
    }

    req.authContext = {
      authType: "jwt",
      orgId,
      serviceId,
      env: requestedEnv || DEFAULT_ENV,
      dataClass: normalizeDataClass(requestedDataClass),
      policyRef: requestedPolicyRef || DEFAULT_POLICY_REF,
      actorId: introspection.sub || "unknown",
      entitlements: introspection.entitlements || [],
      roles: introspection.roles || [],
      isSuperAdmin: Boolean(introspection.isSuperAdmin),
    };
    return next();
  }

  if (apiKey) {
    const envScope = API_KEYS.get(apiKey);
    if (envScope) {
      req.authContext = {
        authType: "apiKey",
        orgId: envScope.orgId,
        serviceId: envScope.serviceId,
        env: envScope.env,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || DEFAULT_POLICY_REF,
        actorId: "api-key",
        entitlements: [],
        roles: [],
        isSuperAdmin: false,
      };
      return next();
    }

    const storedKey = await storage.validateApiKey(apiKey);
    if (storedKey) {
      await storage.updateApiKeyLastUsed(storedKey.id);
      req.authContext = {
        authType: "apiKey",
        orgId: storedKey.orgId || DEFAULT_ORG_ID,
        serviceId: storedKey.serviceId || DEFAULT_SERVICE_ID,
        env: storedKey.env || DEFAULT_ENV,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || DEFAULT_POLICY_REF,
        actorId: `apikey:${storedKey.id}`,
        entitlements: storedKey.scopes || [],
        roles: [],
        isSuperAdmin: false,
      };
      return next();
    }

    return res.status(401).json({ error: "Invalid API key" });
  }

  if (AUTH_MODE === "off" || AUTH_MODE === "optional") {
    req.authContext = buildContextFromDefaults();
    return next();
  }

  return res.status(401).json({ error: "Authentication required" });
}

export function requireAuthContext(req: Request): AuthContext {
  if (!req.authContext) {
    const error = new Error("Auth context unavailable");
    (error as any).status = 401;
    throw error;
  }
  return req.authContext;
}
