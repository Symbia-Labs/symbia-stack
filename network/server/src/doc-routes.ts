import type { Express, Response } from "express";
import fs from "fs";
import path from "path";
import { apiDocumentation } from "./openapi.js";

// Resolve docs root for static files (generated at build time)
const docsRoot = path.resolve(process.cwd(), "docs");

/**
 * Helper to send a documentation file with proper content type
 */
function sendDocFile(res: Response, filename: string, contentType: string) {
  const filePath = path.join(docsRoot, filename);
  if (fs.existsSync(filePath)) {
    res.type(contentType).sendFile(filePath);
  } else {
    // Fallback to dynamic generation if static files not found (dev mode)
    res.status(404).json({ error: "Document not found. Run build to generate docs." });
  }
}

/**
 * Register all documentation routes following the standard pattern
 * - Serves static files generated at build time
 * - Falls back to dynamic generation in development
 */
export function registerDocRoutes(app: Express) {
  // OpenAPI JSON endpoints
  app.get("/docs/openapi.json", (_req, res) => {
    const filePath = path.join(docsRoot, "openapi.json");
    if (fs.existsSync(filePath)) {
      res.type("application/json").sendFile(filePath);
    } else {
      // Fallback to in-memory spec
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

  // LLM documentation endpoints
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
}
