/**
 * OpenAPI 3.0.x specification types
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, PathOperation>>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  security?: Array<Record<string, string[]>>;
}

export interface PathOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: SchemaObject }>;
}

export interface Response {
  description: string;
  content?: Record<string, { schema?: SchemaObject }>;
}

export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  description?: string;
  enum?: any[];
  items?: SchemaObject;
  $ref?: string;
}

export interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
}

/**
 * Configuration for documentation generation
 */
export interface DocGenerationConfig {
  /** Service name for the documentation */
  serviceName: string;

  /** Brief service description */
  serviceDescription: string;

  /** Additional overview points to include in llms.txt */
  overviewPoints?: string[];

  /** Custom authentication notes */
  authNotes?: string[];

  /** Custom headers documentation */
  customHeaders?: Array<{
    name: string;
    description: string;
  }>;

  /** Rate limit information */
  rateLimits?: Array<{
    category: string;
    limit: string;
  }>;

  /** Additional sections for llms-full.txt */
  additionalSections?: Array<{
    title: string;
    content: string;
  }>;
}
