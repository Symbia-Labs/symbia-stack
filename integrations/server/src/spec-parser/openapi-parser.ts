/**
 * OpenAPI Spec Parser
 *
 * Parses OpenAPI 3.x specifications and extracts operations
 * into a normalized format for the integrations system.
 */

import YAML from "yaml";
import type {
  IntegrationOperation,
  OperationParameter,
  OpenAPIConfig,
} from "@shared/schema.js";

// OpenAPI 3.x types (simplified)
interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
}

interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  head?: OperationObject;
  options?: OperationObject;
  parameters?: ParameterObject[];
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
}

interface ParameterObject {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
}

interface RequestBodyObject {
  required?: boolean;
  description?: string;
  content: Record<string, { schema?: SchemaObject }>;
}

interface ResponseObject {
  description: string;
  content?: Record<string, { schema?: SchemaObject }>;
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: unknown[];
  $ref?: string;
  [key: string]: unknown;
}

interface SecurityScheme {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  scheme?: string;
  bearerFormat?: string;
  in?: "query" | "header" | "cookie";
  name?: string;
}

export interface ParseResult {
  success: boolean;
  operations: IntegrationOperation[];
  namespace: Record<string, unknown>;
  serverUrl?: string;
  info?: {
    title: string;
    version: string;
    description?: string;
  };
  authType?: "bearer" | "apiKey" | "basic" | "oauth2" | "none";
  error?: string;
}

/**
 * Fetch and parse an OpenAPI spec from a URL
 */
export async function fetchAndParseOpenAPI(
  config: OpenAPIConfig
): Promise<ParseResult> {
  try {
    let spec: OpenAPISpec;

    if (config.spec) {
      // Use inline spec
      spec = config.spec as unknown as OpenAPISpec;
    } else if (config.specUrl) {
      // Fetch spec from URL
      const response = await fetch(config.specUrl, {
        headers: { Accept: "application/json, application/yaml" },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return {
          success: false,
          operations: [],
          namespace: {},
          error: `Failed to fetch spec: ${response.status} ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();

      // Parse based on content type
      const isYaml = contentType.includes("yaml") ||
                     config.specUrl.endsWith(".yaml") ||
                     config.specUrl.endsWith(".yml");

      if (isYaml) {
        spec = YAML.parse(text);
      } else {
        spec = JSON.parse(text);
      }
    } else {
      return {
        success: false,
        operations: [],
        namespace: {},
        error: "No spec URL or inline spec provided",
      };
    }

    return parseOpenAPISpec(spec, config.serverUrl);
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      error: error instanceof Error ? error.message : "Failed to parse spec",
    };
  }
}

/**
 * Parse an OpenAPI spec object into operations
 */
export function parseOpenAPISpec(
  spec: OpenAPISpec,
  serverUrlOverride?: string
): ParseResult {
  const operations: IntegrationOperation[] = [];
  const namespace: Record<string, unknown> = {};

  // Determine base URL
  // If serverUrlOverride is provided and the spec has a relative base path (e.g., "/api"),
  // combine them to get the full URL
  let serverUrl: string | undefined;
  const specServerUrl = spec.servers?.[0]?.url;

  if (serverUrlOverride && specServerUrl) {
    // Check if spec's server URL is a relative path
    if (specServerUrl.startsWith("/")) {
      // Combine: override base + spec's relative path
      serverUrl = serverUrlOverride.replace(/\/$/, "") + specServerUrl;
    } else if (specServerUrl.startsWith("http")) {
      // Spec has absolute URL, use override (caller knows best)
      serverUrl = serverUrlOverride;
    } else {
      // Other relative path, combine
      serverUrl = serverUrlOverride.replace(/\/$/, "") + "/" + specServerUrl;
    }
  } else {
    serverUrl = serverUrlOverride || specServerUrl;
  }

  // Detect auth type
  let authType: ParseResult["authType"] = "none";
  if (spec.components?.securitySchemes) {
    const schemes = Object.values(spec.components.securitySchemes);
    for (const scheme of schemes) {
      if (scheme.type === "http" && scheme.scheme === "bearer") {
        authType = "bearer";
        break;
      }
      if (scheme.type === "apiKey") {
        authType = "apiKey";
        break;
      }
      if (scheme.type === "http" && scheme.scheme === "basic") {
        authType = "basic";
        break;
      }
      if (scheme.type === "oauth2") {
        authType = "oauth2";
        break;
      }
    }
  }

  // Parse each path
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods: Array<{
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
      operation: OperationObject;
    }> = [];

    if (pathItem.get) methods.push({ method: "GET", operation: pathItem.get });
    if (pathItem.post) methods.push({ method: "POST", operation: pathItem.post });
    if (pathItem.put) methods.push({ method: "PUT", operation: pathItem.put });
    if (pathItem.patch) methods.push({ method: "PATCH", operation: pathItem.patch });
    if (pathItem.delete) methods.push({ method: "DELETE", operation: pathItem.delete });
    if (pathItem.head) methods.push({ method: "HEAD", operation: pathItem.head });
    if (pathItem.options) methods.push({ method: "OPTIONS", operation: pathItem.options });

    for (const { method, operation } of methods) {
      // Generate operation ID if not provided
      const operationId = operation.operationId || generateOperationId(path, method);

      // Convert to dot-notation ID
      const id = operationIdToNamespace(operationId);

      // Parse parameters
      const parameters: OperationParameter[] = [];

      // Path-level parameters
      for (const param of pathItem.parameters || []) {
        parameters.push(convertParameter(param));
      }

      // Operation-level parameters
      for (const param of operation.parameters || []) {
        parameters.push(convertParameter(param));
      }

      // Parse request body
      let requestBody: IntegrationOperation["requestBody"];
      if (operation.requestBody) {
        const content = operation.requestBody.content;
        const jsonContent = content["application/json"];
        requestBody = {
          required: operation.requestBody.required,
          contentType: "application/json",
          schema: jsonContent?.schema as Record<string, unknown>,
        };
      }

      // Parse response schema (use 200 or 201 response)
      let responseSchema: Record<string, unknown> | undefined;
      const successResponse = operation.responses?.["200"] || operation.responses?.["201"];
      if (successResponse?.content?.["application/json"]?.schema) {
        responseSchema = successResponse.content["application/json"].schema as Record<string, unknown>;
      }

      const op: IntegrationOperation = {
        id,
        operationId,
        method,
        path,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        deprecated: operation.deprecated,
        parameters: parameters.length > 0 ? parameters : undefined,
        requestBody,
        responseSchema,
      };

      operations.push(op);

      // Build namespace tree
      buildNamespaceTree(namespace, id, op);
    }
  }

  return {
    success: true,
    operations,
    namespace,
    serverUrl,
    info: {
      title: spec.info.title,
      version: spec.info.version,
      description: spec.info.description,
    },
    authType,
  };
}

/**
 * Convert OpenAPI parameter to our format
 */
function convertParameter(param: ParameterObject): OperationParameter {
  return {
    name: param.name,
    location: param.in,
    required: param.required || false,
    description: param.description,
    schema: param.schema as Record<string, unknown>,
    example: param.example,
  };
}

/**
 * Generate operation ID from path and method
 */
function generateOperationId(path: string, method: string): string {
  // Convert /v1/chat/completions to chat_completions
  const pathPart = path
    .replace(/^\/v\d+\//, "") // Remove version prefix
    .replace(/\{[^}]+\}/g, "") // Remove path params
    .replace(/\//g, "_") // Replace slashes
    .replace(/^_|_$/g, "") // Trim underscores
    .replace(/_+/g, "_"); // Collapse multiple underscores

  return `${pathPart}_${method.toLowerCase()}`;
}

/**
 * Convert operationId to dot-notation namespace
 * e.g., "createChatCompletion" -> "chat.completion.create"
 *       "chat_completions_create" -> "chat.completions.create"
 */
function operationIdToNamespace(operationId: string): string {
  // Handle snake_case
  if (operationId.includes("_")) {
    return operationId.replace(/_/g, ".");
  }

  // Handle camelCase - split on capital letters
  const parts = operationId
    .replace(/([A-Z])/g, ".$1")
    .toLowerCase()
    .split(".")
    .filter(Boolean);

  // Reorder: move verb to end if it's first
  const verbs = ["create", "get", "list", "update", "delete", "patch", "post", "put"];
  if (parts.length > 1 && verbs.includes(parts[0])) {
    const verb = parts.shift()!;
    parts.push(verb);
  }

  return parts.join(".");
}

/**
 * Build namespace tree for quick lookup
 */
function buildNamespaceTree(
  tree: Record<string, unknown>,
  path: string,
  operation: IntegrationOperation
): void {
  const parts = path.split(".");
  let current = tree;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  // Set the leaf node
  const leaf = parts[parts.length - 1];
  current[leaf] = {
    _operation: operation.id,
    _method: operation.method,
    _path: operation.path,
  };
}

/**
 * Resolve a $ref reference in the spec
 */
function resolveRef(
  spec: OpenAPISpec,
  ref: string
): SchemaObject | undefined {
  if (!ref.startsWith("#/")) return undefined;

  const path = ref.slice(2).split("/");
  let current: unknown = spec;

  for (const part of path) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as SchemaObject;
}
