/**
 * MCP Server Connector
 *
 * Connects to MCP (Model Context Protocol) servers and discovers
 * available tools, resources, and prompts.
 */

import { spawn, type ChildProcess } from "child_process";
import type {
  IntegrationOperation,
  MCPConfig,
  OperationParameter,
} from "@shared/schema.js";

// MCP Protocol types
interface MCPCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

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

interface MCPMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPParseResult {
  success: boolean;
  operations: IntegrationOperation[];
  namespace: Record<string, unknown>;
  capabilities: MCPCapabilities;
  error?: string;
}

/**
 * Connect to an MCP server and discover its capabilities
 */
export async function discoverMCPServer(
  config: MCPConfig
): Promise<MCPParseResult> {
  if (config.transport === "stdio") {
    return discoverStdioServer(config);
  } else if (config.transport === "http" || config.transport === "websocket") {
    return discoverHttpServer(config);
  }

  return {
    success: false,
    operations: [],
    namespace: {},
    capabilities: {},
    error: `Unsupported transport: ${config.transport}`,
  };
}

/**
 * Discover tools from a stdio-based MCP server
 */
async function discoverStdioServer(
  config: MCPConfig
): Promise<MCPParseResult> {
  if (!config.command) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: "No command specified for stdio transport",
    };
  }

  let process: ChildProcess | null = null;
  let messageId = 0;
  const pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  try {
    // Spawn the MCP server process
    process = spawn(config.command, config.args || [], {
      env: { ...globalThis.process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!process.stdin || !process.stdout) {
      throw new Error("Failed to create process pipes");
    }

    // Set up message handling
    let buffer = "";
    process.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();

      // Parse complete messages
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message: MCPMessage = JSON.parse(line);
          if (message.id !== undefined && pendingRequests.has(message.id)) {
            const pending = pendingRequests.get(message.id)!;
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        } catch {
          // Skip malformed messages
        }
      }
    });

    // Helper to send request and wait for response
    const sendRequest = <T>(method: string, params?: unknown): Promise<T> => {
      return new Promise((resolve, reject) => {
        const id = ++messageId;
        const timeout = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }, 10000);

        pendingRequests.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result as T);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });

        const message: MCPMessage = {
          jsonrpc: "2.0",
          id,
          method,
          params,
        };

        process!.stdin!.write(JSON.stringify(message) + "\n");
      });
    };

    // Initialize connection
    const initResult = await sendRequest<{
      protocolVersion: string;
      capabilities: MCPCapabilities;
      serverInfo?: { name: string; version: string };
    }>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbia-integrations", version: "1.0.0" },
    });

    const capabilities = initResult.capabilities;
    const operations: IntegrationOperation[] = [];
    const namespace: Record<string, unknown> = {};

    // Discover tools
    if (capabilities.tools) {
      const toolsResult = await sendRequest<{ tools: MCPTool[] }>("tools/list");
      for (const tool of toolsResult.tools || []) {
        const op = mcpToolToOperation(tool);
        operations.push(op);
        buildMCPNamespace(namespace, tool.name, op);
      }
    }

    // Discover resources
    if (capabilities.resources) {
      const resourcesResult = await sendRequest<{ resources: MCPResource[] }>("resources/list");
      for (const resource of resourcesResult.resources || []) {
        const op = mcpResourceToOperation(resource);
        operations.push(op);
        buildMCPNamespace(namespace, `resource.${resource.name}`, op);
      }
    }

    // Discover prompts
    if (capabilities.prompts) {
      const promptsResult = await sendRequest<{ prompts: MCPPrompt[] }>("prompts/list");
      for (const prompt of promptsResult.prompts || []) {
        const op = mcpPromptToOperation(prompt);
        operations.push(op);
        buildMCPNamespace(namespace, `prompt.${prompt.name}`, op);
      }
    }

    return {
      success: true,
      operations,
      namespace,
      capabilities,
    };
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: error instanceof Error ? error.message : "Failed to connect to MCP server",
    };
  } finally {
    // Clean up
    if (process) {
      process.kill();
    }
  }
}

/**
 * Discover tools from an HTTP/WebSocket MCP server
 */
async function discoverHttpServer(
  config: MCPConfig
): Promise<MCPParseResult> {
  if (!config.serverUrl) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: "No server URL specified for HTTP transport",
    };
  }

  try {
    // For HTTP transport, we make JSON-RPC calls over HTTP
    const sendRequest = async <T>(method: string, params?: unknown): Promise<T> => {
      const response = await fetch(config.serverUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as MCPMessage;
      if (result.error) {
        throw new Error(result.error.message);
      }

      return result.result as T;
    };

    // Initialize
    const initResult = await sendRequest<{
      protocolVersion: string;
      capabilities: MCPCapabilities;
    }>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbia-integrations", version: "1.0.0" },
    });

    const capabilities = initResult.capabilities;
    const operations: IntegrationOperation[] = [];
    const namespace: Record<string, unknown> = {};

    // Discover tools
    if (capabilities.tools) {
      const toolsResult = await sendRequest<{ tools: MCPTool[] }>("tools/list");
      for (const tool of toolsResult.tools || []) {
        const op = mcpToolToOperation(tool);
        operations.push(op);
        buildMCPNamespace(namespace, tool.name, op);
      }
    }

    return {
      success: true,
      operations,
      namespace,
      capabilities,
    };
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: error instanceof Error ? error.message : "Failed to connect to MCP server",
    };
  }
}

/**
 * Convert MCP tool to IntegrationOperation
 */
function mcpToolToOperation(tool: MCPTool): IntegrationOperation {
  const parameters: OperationParameter[] = [];

  // Convert inputSchema properties to parameters
  if (tool.inputSchema.properties) {
    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
      parameters.push({
        name,
        location: "body",
        required: tool.inputSchema.required?.includes(name) || false,
        description: schema.description,
        schema: schema as unknown as Record<string, unknown>,
      });
    }
  }

  return {
    id: `tool.${tool.name}`,
    summary: tool.description,
    description: tool.description,
    parameters: parameters.length > 0 ? parameters : undefined,
    mcpTool: {
      name: tool.name,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    },
  };
}

/**
 * Convert MCP resource to IntegrationOperation
 */
function mcpResourceToOperation(resource: MCPResource): IntegrationOperation {
  return {
    id: `resource.${resource.name}`,
    summary: resource.description || `Read ${resource.name}`,
    description: resource.description,
    parameters: [
      {
        name: "uri",
        location: "body",
        required: true,
        description: "Resource URI",
        schema: { type: "string", default: resource.uri },
      },
    ],
  };
}

/**
 * Convert MCP prompt to IntegrationOperation
 */
function mcpPromptToOperation(prompt: MCPPrompt): IntegrationOperation {
  const parameters: OperationParameter[] = (prompt.arguments || []).map(arg => ({
    name: arg.name,
    location: "body",
    required: arg.required || false,
    description: arg.description,
    schema: { type: "string" },
  }));

  return {
    id: `prompt.${prompt.name}`,
    summary: prompt.description || `Get ${prompt.name} prompt`,
    description: prompt.description,
    parameters: parameters.length > 0 ? parameters : undefined,
  };
}

/**
 * Build namespace tree for MCP operations
 */
function buildMCPNamespace(
  tree: Record<string, unknown>,
  path: string,
  operation: IntegrationOperation
): void {
  // Convert tool name to path (e.g., "read_file" -> "read.file")
  const normalizedPath = path.replace(/_/g, ".");
  const parts = normalizedPath.split(".");
  let current = tree;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const leaf = parts[parts.length - 1];
  current[leaf] = {
    _operation: operation.id,
    _mcp: true,
  };
}
