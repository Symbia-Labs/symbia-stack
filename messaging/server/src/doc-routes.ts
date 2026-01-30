import type { Express } from "express";
import { registerDocRoutes } from "@symbia/md";
import { openApiSpec } from "./openapi.js";

/**
 * Register all documentation routes following the standardized Symbia pattern
 */
export function setupDocRoutes(app: Express) {
  registerDocRoutes(app as any, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false,
  });
}
