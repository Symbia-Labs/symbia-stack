/**
 * MCP Server
 *
 * Exposes the integrations service as an MCP server, allowing external
 * MCP clients to discover and invoke operations (LLM providers, other
 * integrations, proxied tools).
 *
 * This enables bidirectional MCP:
 * - Client mode: Connect to external MCP servers (Moltbot, filesystem, etc.)
 * - Server mode: Expose integrations capabilities to MCP clients
 *
 * Supports both stdio and HTTP transports.
 */

import type { Server } from "http";
import { integrationRegistry } from "./spec-parser/index.js";
import { executeOperation, type ExecutionContext } from "./executors/index.js";
import { IntegrationError } from "./errors.js";
import type { IntegrationOperation } from "@shared/schema.js";

// =============================================================================
// MCP Protocol Types
// =============================================================================

interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// MCP Error Codes
const MCP_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

// =============================================================================
// MCP Server Implementation
// =============================================================================

export interface MCPServerConfig {
  /** Server name reported to clients */
  name?: string;
  /** Server version */
  version?: string;
  /** Available capabilities */
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

const DEFAULT_CONFIG: Required<MCPServerConfig> = {
  name: "symbia-integrations",
  version: "1.0.0",
  capabilities: {
    tools: true,
    resources: false,
    prompts: false,
  },
};

export class MCPServer {
  private config: Required<MCPServerConfig>;
  private initialized = false;

  constructor(config: MCPServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Handle an incoming MCP request
   */
  async handleRequest(
    request: MCPRequest,
    context: { userId?: string; orgId?: string; authToken?: string }
  ): Promise<MCPResponse> {
    try {
      const result = await this.dispatch(request.method, request.params, context);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: this.formatError(error),
      };
    }
  }

  /**
   * Dispatch request to appropriate handler
   */
  private async dispatch(
    method: string,
    params: unknown,
    context: { userId?: string; orgId?: string; authToken?: string }
  ): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.handleInitialize(params);

      case "initialized":
        // Notification from client that initialization is complete
        return null;

      case "tools/list":
        return this.handleToolsList();

      case "tools/call":
        return this.handleToolsCall(params, context);

      case "resources/list":
        return this.handleResourcesList();

      case "resources/read":
        return this.handleResourcesRead(params);

      case "prompts/list":
        return this.handlePromptsList();

      case "prompts/get":
        return this.handlePromptsGet(params);

      case "ping":
        return {};

      default:
        throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: `Unknown method: ${method}` };
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(params: unknown): {
    protocolVersion: string;
    capabilities: { tools?: object; resources?: object; prompts?: object };
    serverInfo: { name: string; version: string };
  } {
    this.initialized = true;

    const capabilities: { tools?: object; resources?: object; prompts?: object } = {};
    if (this.config.capabilities.tools) {
      capabilities.tools = {};
    }
    if (this.config.capabilities.resources) {
      capabilities.resources = {};
    }
    if (this.config.capabilities.prompts) {
      capabilities.prompts = {};
    }

    return {
      protocolVersion: "2024-11-05",
      capabilities,
      serverInfo: {
        name: this.config.name,
        version: this.config.version,
      },
    };
  }

  /**
   * List available tools (integrations exposed as MCP tools)
   */
  private handleToolsList(): { tools: MCPTool[] } {
    const tools: MCPTool[] = [];

    // Get all registered integrations and their operations
    const integrations = integrationRegistry.getAll();

    for (const integration of integrations) {
      for (const op of integration.operations || []) {
        // Skip non-executable operations
        if (op.method === "GET" && !op.tags?.includes("llm")) {
          continue;
        }

        tools.push(this.operationToMCPTool(integration.key, op));
      }
    }

    return { tools };
  }

  /**
   * Convert an IntegrationOperation to an MCP tool definition
   */
  private operationToMCPTool(integrationKey: string, op: IntegrationOperation): MCPTool {
    const toolName = `${integrationKey}.${op.id}`.replace(/\./g, "_");

    const properties: Record<string, MCPPropertySchema> = {};
    const required: string[] = [];

    // Convert operation parameters to JSON Schema
    for (const param of op.parameters || []) {
      properties[param.name] = {
        type: (param.schema as any)?.type || "string",
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    // Always require model for LLM operations
    if (op.tags?.includes("llm") || op.tags?.includes("chat")) {
      if (!properties.model) {
        properties.model = { type: "string", description: "Model ID to use" };
        required.push("model");
      }
    }

    return {
      name: toolName,
      description: op.description || op.summary || `Execute ${integrationKey} ${op.id}`,
      inputSchema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  }

  /**
   * Handle tool call
   */
  private async handleToolsCall(
    params: unknown,
    context: { userId?: string; orgId?: string; authToken?: string }
  ): Promise<{ content: MCPContent[]; isError?: boolean }> {
    const { name, arguments: args } = params as { name: string; arguments?: Record<string, unknown> };

    // Parse tool name back to integration.operation
    const parts = name.split("_");
    const integrationKey = parts[0];
    const operationId = parts.slice(1).join(".");

    // Look up the operation
    const lookup = integrationRegistry.lookupOperation(`${integrationKey}.${operationId}`);
    if (!lookup) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    // Build execution context
    const execContext: ExecutionContext = {
      requestId: `mcp_${Date.now()}`,
      userId: context.userId || "mcp-client",
      orgId: context.orgId || "mcp-org",
      authToken: context.authToken || "",
      timeout: 60000,
    };

    try {
      const result = await executeOperation({
        operation: lookup.operation,
        integrationKey,
        params: args || {},
        context: execContext,
      });

      // Format result as MCP content
      return this.formatToolResult(result);
    } catch (error) {
      const message = error instanceof IntegrationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Tool execution failed";

      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  }

  /**
   * Format execution result as MCP content
   */
  private formatToolResult(result: unknown): { content: MCPContent[]; isError?: boolean } {
    const typed = result as { type: string; data: unknown };

    switch (typed.type) {
      case "llm": {
        const llm = typed.data as { content: string; model: string; usage?: unknown };
        return {
          content: [
            { type: "text", text: llm.content },
          ],
        };
      }

      case "embedding": {
        const emb = typed.data as { embeddings: number[][] };
        return {
          content: [
            { type: "text", text: JSON.stringify({ embeddings: emb.embeddings }) },
          ],
        };
      }

      case "mcp-tool": {
        const mcp = typed.data as { content: MCPContent[] };
        return { content: mcp.content };
      }

      case "moltbot-skill": {
        const skill = typed.data as { result: unknown };
        return {
          content: [
            { type: "text", text: JSON.stringify(skill.result) },
          ],
        };
      }

      default:
        return {
          content: [
            { type: "text", text: JSON.stringify(typed.data) },
          ],
        };
    }
  }

  /**
   * List resources (not currently exposed)
   */
  private handleResourcesList(): { resources: MCPResource[] } {
    return { resources: [] };
  }

  /**
   * Read a resource
   */
  private handleResourcesRead(_params: unknown): { contents: unknown[] } {
    throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: "Resources not supported" };
  }

  /**
   * List prompts (not currently exposed)
   */
  private handlePromptsList(): { prompts: MCPPrompt[] } {
    return { prompts: [] };
  }

  /**
   * Get a prompt
   */
  private handlePromptsGet(_params: unknown): unknown {
    throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: "Prompts not supported" };
  }

  /**
   * Format error for MCP response
   */
  private formatError(error: unknown): { code: number; message: string; data?: unknown } {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      return error as { code: number; message: string; data?: unknown };
    }

    if (error instanceof IntegrationError) {
      return {
        code: MCP_ERROR.INTERNAL_ERROR,
        message: error.message,
        data: { category: error.category, retryable: error.retryable },
      };
    }

    return {
      code: MCP_ERROR.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =============================================================================
// MCP Protocol Types
// =============================================================================

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

interface MCPPropertySchema {
  type: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface MCPContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: { uri: string; mimeType?: string; text?: string };
}

// =============================================================================
// Singleton & HTTP Handler
// =============================================================================

export const mcpServer = new MCPServer();

/**
 * Create an HTTP handler for MCP requests
 * Can be mounted at /mcp for HTTP transport
 */
export function createMCPHttpHandler() {
  return async (req: any, res: any) => {
    try {
      const request = req.body as MCPRequest;

      if (!request || !request.jsonrpc || !request.method) {
        res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: MCP_ERROR.INVALID_REQUEST, message: "Invalid request" },
        });
        return;
      }

      const user = req.user || {};
      const response = await mcpServer.handleRequest(request, {
        userId: user.id,
        orgId: user.orgId,
        authToken: req.token,
      });

      res.json(response);
    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: MCP_ERROR.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Internal error",
        },
      });
    }
  };
}
