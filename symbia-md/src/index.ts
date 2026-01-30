/**
 * @symbia/docs - Shared documentation generation utilities for Symbia services
 *
 * This package provides standardized documentation generation for all Symbia microservices.
 * It handles:
 * - Build-time generation of OpenAPI specs, llms.txt, and llms-full.txt
 * - Runtime serving of documentation with static/dynamic fallback
 * - Consistent documentation patterns across all services
 *
 * @example
 * ```typescript
 * // In your build script (scripts/build.ts):
 * import { generateDocs } from '@symbia/docs';
 * import { openApiSpec } from '../server/src/openapi.js';
 *
 * await generateDocs({
 *   spec: openApiSpec,
 *   serviceName: 'My Service',
 *   serviceDescription: 'Description of my service',
 *   overviewPoints: [
 *     'Feature 1',
 *     'Feature 2'
 *   ]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // In your server routes (server/src/doc-routes.ts):
 * import { registerDocRoutes } from '@symbia/docs';
 * import { openApiSpec } from './openapi.js';
 *
 * export function setupDocRoutes(app: Express) {
 *   registerDocRoutes(app, {
 *     spec: openApiSpec,
 *     includeWellKnown: true
 *   });
 * }
 * ```
 */

export * from "./types.js";
export * from "./generators.js";
export * from "./routes.js";
export * from "./build.js";
