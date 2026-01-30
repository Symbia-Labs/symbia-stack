/**
 * Spec Parser Module
 *
 * Parses OpenAPI and MCP specs to discover integration operations.
 */

export { fetchAndParseOpenAPI, parseOpenAPISpec } from "./openapi-parser.js";
export type { ParseResult } from "./openapi-parser.js";

export { discoverMCPServer } from "./mcp-connector.js";
export type { MCPParseResult } from "./mcp-connector.js";

export {
  integrationRegistry,
  initializeBuiltinIntegrations,
} from "./integration-registry.js";
