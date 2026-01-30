import type { Express, Response } from "express";
import fs from "fs";
import path from "path";
import type { OpenAPISpec } from "./types.js";

/**
 * Configuration for documentation routes
 */
export interface DocRoutesConfig {
  /** OpenAPI specification object */
  spec: OpenAPISpec;

  /** Path to static docs directory (default: client/public) */
  docsRoot?: string;

  /** Whether to include .well-known routes (default: false) */
  includeWellKnown?: boolean;

  /** Custom well-known routes */
  wellKnownRoutes?: Record<string, (req: any, res: Response) => void>;
}

/**
 * Helper to send a documentation file with proper content type
 */
function sendDocFile(
  res: Response,
  docsRoot: string,
  filename: string,
  contentType: string
) {
  const filePath = path.join(docsRoot, filename);
  if (fs.existsSync(filePath)) {
    res.type(contentType).sendFile(filePath);
  } else {
    res.status(404).json({
      error: "Document not found. Run build to generate docs.",
    });
  }
}

/**
 * Register all documentation routes following the standardized pattern
 * - Serves static files generated at build time
 * - Falls back to dynamic generation in development
 */
export function registerDocRoutes(app: Express, config: DocRoutesConfig) {
  const docsRoot = path.resolve(
    process.cwd(),
    config.docsRoot || "client/public"
  );

  // Root redirect to docs
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });

  // OpenAPI JSON endpoints
  app.get("/docs/openapi.json", (_req, res) => {
    const filePath = path.join(docsRoot, "openapi.json");
    if (fs.existsSync(filePath)) {
      res.type("application/json").sendFile(filePath);
    } else {
      // Fallback to in-memory spec
      res.type("application/json").json(config.spec);
    }
  });

  app.get("/api/docs/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });

  app.get("/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });

  app.get("/api/docs", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });

  // LLM documentation endpoints
  app.get("/docs/llms.txt", (_req, res) => {
    sendDocFile(res, docsRoot, "llms.txt", "text/plain");
  });

  app.get("/llms.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });

  app.get("/llm.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });

  app.get("/docs/llms-full.txt", (_req, res) => {
    sendDocFile(res, docsRoot, "llms-full.txt", "text/plain");
  });

  app.get("/llms-full.txt", (_req, res) => {
    res.redirect(302, "/docs/llms-full.txt");
  });

  // .well-known routes (optional)
  if (config.includeWellKnown) {
    app.get("/.well-known/openapi.json", (_req, res) => {
      res.redirect(302, "/docs/openapi.json");
    });

    // Custom well-known routes
    if (config.wellKnownRoutes) {
      for (const [route, handler] of Object.entries(config.wellKnownRoutes)) {
        app.get(`/.well-known/${route}`, handler);
      }
    }
  }
}
