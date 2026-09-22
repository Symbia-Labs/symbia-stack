import type { Express, Response } from "express";
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
 * Register all documentation routes following the standardized pattern
 * - Serves static files generated at build time
 * - Falls back to dynamic generation in development
 */
export declare function registerDocRoutes(app: Express, config: DocRoutesConfig): void;
