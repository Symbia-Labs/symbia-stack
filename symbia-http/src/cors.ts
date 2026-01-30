import type { Request, Response, NextFunction } from "express";
import type { CorsConfig } from "./types.js";

/**
 * Check if origin matches a pattern (supports wildcards)
 */
function matchesOrigin(origin: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === origin) return true;

  // Handle wildcard patterns like *.replit.app or *.replit.dev
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // Remove the *, keep the .domain.com
    try {
      const url = new URL(origin);
      return url.hostname.endsWith(suffix);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Check if origin is localhost/127.0.0.1
 */
function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Build CORS options object for Socket.IO or other libraries
 * Returns an options object compatible with socket.io cors config
 */
export function buildCorsOptions(config: CorsConfig = {}): {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
  methods: string[];
  credentials: boolean;
  allowedHeaders: string[];
} {
  const {
    origins = [],
    allowLocalhost = true,
  } = config;

  const corsOriginConfig = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "";
  const corsOrigins = origins.length > 0
    ? origins
    : corsOriginConfig
      ? corsOriginConfig.split(",").map((origin) => origin.trim().replace(/\/$/, ""))
      : [];

  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.log("[CORS] buildCorsOptions configured with:", {
      origins: corsOrigins,
      allowLocalhost,
      nodeEnv: process.env.NODE_ENV,
    });
  }

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        if (isDev) console.log("[CORS] No origin header, allowing");
        callback(null, true);
        return;
      }
      const normalizedOrigin = origin.replace(/\/$/, "");
      const allowAnyOrigin = corsOrigins.length === 0 && process.env.NODE_ENV !== "production";
      const allowLocal = allowLocalhost && process.env.NODE_ENV !== "production" && isLocalOrigin(normalizedOrigin);
      const allowListed = corsOrigins.some((pattern) => matchesOrigin(normalizedOrigin, pattern));

      if (isDev) {
        console.log("[CORS] Socket origin check:", {
          origin: normalizedOrigin,
          allowAnyOrigin,
          allowLocal,
          allowListed,
          result: allowAnyOrigin || allowLocal || allowListed ? "ALLOWED" : "DENIED",
        });
      }

      if (allowAnyOrigin || allowLocal || allowListed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-Org-Id",
      "X-Service-Id",
      "X-Env",
      "X-Environment",
      "X-Data-Class",
      "X-Policy-Ref",
    ],
  };
}

/**
 * Create CORS middleware
 */
export function createCorsMiddleware(config: CorsConfig = {}) {
  const {
    origins = [],
    publicPaths = [],
    allowLocalhost = true,
  } = config;

  // Parse origins from environment variable if not provided
  const corsOriginConfig = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "";
  const corsOrigins = origins.length > 0
    ? origins
    : corsOriginConfig
      ? corsOriginConfig.split(",").map((origin) => origin.trim().replace(/\/$/, ""))
      : [];

  const publicCorsPathsSet = new Set(publicPaths);

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const isPublicCorsPath = publicCorsPathsSet.has(req.path);
    const isPublicCorsRequest = isPublicCorsPath && (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS");

    if (origin) {
      const normalizedOrigin = origin.replace(/\/$/, "");
      const allowAnyOrigin = corsOrigins.length === 0 && process.env.NODE_ENV !== "production";
      const allowLocal = allowLocalhost && process.env.NODE_ENV !== "production" && isLocalOrigin(normalizedOrigin);
      const allowListed = corsOrigins.some((pattern) => matchesOrigin(normalizedOrigin, pattern));

      if (allowAnyOrigin || allowLocal || allowListed) {
        res.header("Access-Control-Allow-Origin", normalizedOrigin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        res.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref",
        );
        res.header("Access-Control-Max-Age", "86400");
      } else if (isPublicCorsRequest) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref",
        );
        res.header("Access-Control-Max-Age", "86400");
      }
    } else if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref",
      );
      res.header("Access-Control-Max-Age", "86400");
    }

    if (req.method === "OPTIONS") {
      if (origin && corsOrigins.length > 0) {
        const normalizedOrigin = origin.replace(/\/$/, "");
        const allowListed = corsOrigins.some((pattern) => matchesOrigin(normalizedOrigin, pattern));
        if (!allowListed && !isPublicCorsPath) {
          return res.sendStatus(403);
        }
      }
      if (origin && corsOrigins.length === 0 && process.env.NODE_ENV === "production" && !isPublicCorsPath) {
        return res.sendStatus(403);
      }
      return res.sendStatus(200);
    }

    next();
  };
}
