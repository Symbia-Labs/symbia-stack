/**
 * MCP Executor
 *
 * Executes MCP (Model Context Protocol) operations against connected servers.
 * Manages connection pooling for stdio-based servers and HTTP clients.
 */

import { spawn, type ChildProcess } from "child_process";
import type { MCPConfig } from "@shared/schema.js";
import { IntegrationError } from "../errors.js";
import type {
  IntegrationExecutor,
  ExecuteOperationRequest,
  ExecuteOperationResponse,
  OperationType,
  MCPContent,
} from "./types.js";

// =============================================================================
// MCP Protocol Types
// =============================================================================

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

interface MCPToolCallResult {
  content: MCPContent[];
  isError?: boolean;
}

interface MCPResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

interface MCPPromptGetResult {
  description?: string;
  messages: Array<{
    role: "user" | "assistant";
    content: MCPContent;
  }>;
}

// =============================================================================
// Connection Pool
// =============================================================================

interface MCPConnection {
  config: MCPConfig;
  process?: ChildProcess;
  messageId: number;
  pendingRequests: Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
  buffer: string;
  lastUsed: number;
  isConnected: boolean;
}

class MCPConnectionPool {
  private connections = new Map<string, MCPConnection>();
  private readonly maxIdleMs = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup idle connections every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Get or create a connection to an MCP server
   */
  async getConnection(serverKey: string, config: MCPConfig): Promise<MCPConnection> {
    let conn = this.connections.get(serverKey);

    if (conn && conn.isConnected) {
      conn.lastUsed = Date.now();
      return conn;
    }

    // Create new connection
    conn = await this.createConnection(serverKey, config);
    this.connections.set(serverKey, conn);
    return conn;
  }

  /**
   * Create a new MCP connection
   */
  private async createConnection(serverKey: string, config: MCPConfig): Promise<MCPConnection> {
    const conn: MCPConnection = {
      config,
      messageId: 0,
      pendingRequests: new Map(),
      buffer: "",
      lastUsed: Date.now(),
      isConnected: false,
    };

    if (config.transport === "stdio") {
      await this.connectStdio(conn);
    } else if (config.transport === "http" || config.transport === "websocket") {
      // HTTP connections are stateless, mark as connected
      conn.isConnected = true;
    }

    return conn;
  }

  /**
   * Connect to a stdio-based MCP server
   */
  private async connectStdio(conn: MCPConnection): Promise<void> {
    if (!conn.config.command) {
      throw new IntegrationError({
        message: "No command specified for stdio MCP server",
        category: "validation",
      });
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(conn.config.command!, conn.config.args || [], {
        env: { ...process.env, ...conn.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!proc.stdin || !proc.stdout) {
        reject(new IntegrationError({
          message: "Failed to create MCP process pipes",
          category: "internal",
        }));
        return;
      }

      conn.process = proc;

      // Handle stdout data
      proc.stdout.on("data", (data: Buffer) => {
        conn.buffer += data.toString();
        this.processBuffer(conn);
      });

      // Handle stderr for logging
      proc.stderr?.on("data", (data: Buffer) => {
        console.warn(`[mcp] stderr: ${data.toString()}`);
      });

      // Handle process exit
      proc.on("exit", (code) => {
        console.log(`[mcp] Process exited with code ${code}`);
        conn.isConnected = false;
        // Reject all pending requests
        for (const pending of conn.pendingRequests.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new IntegrationError({
            message: "MCP server disconnected",
            category: "network",
          }));
        }
        conn.pendingRequests.clear();
      });

      proc.on("error", (err) => {
        console.error(`[mcp] Process error:`, err);
        conn.isConnected = false;
        reject(new IntegrationError({
          message: `Failed to start MCP server: ${err.message}`,
          category: "network",
          cause: err,
        }));
      });

      // Initialize the connection
      this.sendRequest(conn, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "symbia-integrations", version: "1.0.0" },
      })
        .then(() => {
          conn.isConnected = true;
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Process incoming data buffer for complete messages
   */
  private processBuffer(conn: MCPConnection): void {
    const lines = conn.buffer.split("\n");
    conn.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message: MCPMessage = JSON.parse(line);
        if (message.id !== undefined && conn.pendingRequests.has(message.id)) {
          const pending = conn.pendingRequests.get(message.id)!;
          conn.pendingRequests.delete(message.id);
          clearTimeout(pending.timeout);

          if (message.error) {
            pending.reject(new IntegrationError({
              message: message.error.message,
              category: "provider",
              upstream: { code: String(message.error.code), message: message.error.message },
            }));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
        // Skip malformed messages
      }
    }
  }

  /**
   * Send a request to the MCP server
   */
  async sendRequest<T>(conn: MCPConnection, method: string, params?: unknown): Promise<T> {
    if (conn.config.transport === "http" || conn.config.transport === "websocket") {
      return this.sendHttpRequest(conn, method, params);
    }

    return this.sendStdioRequest(conn, method, params);
  }

  /**
   * Send request over stdio
   */
  private sendStdioRequest<T>(conn: MCPConnection, method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!conn.process?.stdin) {
        reject(new IntegrationError({
          message: "MCP connection not established",
          category: "network",
        }));
        return;
      }

      const id = ++conn.messageId;
      const timeoutMs = 30_000; // 30 second timeout

      const timeout = setTimeout(() => {
        conn.pendingRequests.delete(id);
        reject(new IntegrationError({
          message: `MCP request timed out: ${method}`,
          category: "timeout",
        }));
      }, timeoutMs);

      conn.pendingRequests.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timeout,
      });

      const message: MCPMessage = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      conn.process.stdin.write(JSON.stringify(message) + "\n");
    });
  }

  /**
   * Send request over HTTP
   */
  private async sendHttpRequest<T>(conn: MCPConnection, method: string, params?: unknown): Promise<T> {
    if (!conn.config.serverUrl) {
      throw new IntegrationError({
        message: "No server URL for HTTP MCP server",
        category: "validation",
      });
    }

    const response = await fetch(conn.config.serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new IntegrationError({
        message: `MCP HTTP error: ${response.status} ${response.statusText}`,
        category: "provider",
        upstream: { statusCode: response.status },
      });
    }

    const result = await response.json() as MCPMessage;
    if (result.error) {
      throw new IntegrationError({
        message: result.error.message,
        category: "provider",
        upstream: { code: String(result.error.code), message: result.error.message },
      });
    }

    return result.result as T;
  }

  /**
   * Close a connection
   */
  close(serverKey: string): void {
    const conn = this.connections.get(serverKey);
    if (conn?.process) {
      conn.process.kill();
    }
    this.connections.delete(serverKey);
  }

  /**
   * Cleanup idle connections
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, conn] of this.connections) {
      if (now - conn.lastUsed > this.maxIdleMs) {
        console.log(`[mcp] Closing idle connection: ${key}`);
        this.close(key);
      }
    }
  }

  /**
   * Shutdown all connections
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
    for (const key of this.connections.keys()) {
      this.close(key);
    }
  }
}

// =============================================================================
// MCP Executor
// =============================================================================

export class MCPExecutor implements IntegrationExecutor {
  readonly supportedTypes: OperationType[] = ["mcp-tool", "mcp-resource", "mcp-prompt"];
  private pool = new MCPConnectionPool();
  private serverConfigs = new Map<string, MCPConfig>();

  /**
   * Register an MCP server configuration
   */
  registerServer(serverKey: string, config: MCPConfig): void {
    this.serverConfigs.set(serverKey, config);
  }

  /**
   * Check if this executor can handle an operation type
   */
  canHandle(operationType: OperationType): boolean {
    return this.supportedTypes.includes(operationType);
  }

  /**
   * Execute an MCP operation
   */
  async execute(request: ExecuteOperationRequest): Promise<ExecuteOperationResponse> {
    const { operation, integrationKey, params, context } = request;

    // Get server config
    const config = this.serverConfigs.get(integrationKey);
    if (!config) {
      throw new IntegrationError({
        message: `MCP server not registered: ${integrationKey}`,
        category: "not_found",
      });
    }

    // Get or create connection
    const conn = await this.pool.getConnection(integrationKey, config);

    // Route to appropriate handler
    if (operation.mcpTool) {
      return this.executeTool(conn, operation.mcpTool.name, params);
    }

    if (operation.id.startsWith("resource.")) {
      const uri = params.uri as string;
      return this.readResource(conn, uri);
    }

    if (operation.id.startsWith("prompt.")) {
      const promptName = operation.id.replace("prompt.", "");
      return this.getPrompt(conn, promptName, params);
    }

    throw new IntegrationError({
      message: `Unknown MCP operation type: ${operation.id}`,
      category: "validation",
    });
  }

  /**
   * Execute an MCP tool
   */
  private async executeTool(
    conn: MCPConnection,
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ExecuteOperationResponse> {
    const result = await this.pool.sendRequest<MCPToolCallResult>(
      conn,
      "tools/call",
      { name: toolName, arguments: params }
    );

    return {
      type: "mcp-tool",
      data: {
        content: result.content,
        isError: result.isError,
      },
    };
  }

  /**
   * Read an MCP resource
   */
  private async readResource(
    conn: MCPConnection,
    uri: string
  ): Promise<ExecuteOperationResponse> {
    const result = await this.pool.sendRequest<MCPResourceReadResult>(
      conn,
      "resources/read",
      { uri }
    );

    return {
      type: "mcp-resource",
      data: {
        contents: result.contents,
      },
    };
  }

  /**
   * Get an MCP prompt
   */
  private async getPrompt(
    conn: MCPConnection,
    promptName: string,
    params: Record<string, unknown>
  ): Promise<ExecuteOperationResponse> {
    const result = await this.pool.sendRequest<MCPPromptGetResult>(
      conn,
      "prompts/get",
      { name: promptName, arguments: params }
    );

    return {
      type: "mcp-prompt",
      data: {
        description: result.description,
        messages: result.messages,
      },
    };
  }

  /**
   * Shutdown the executor
   */
  shutdown(): void {
    this.pool.shutdown();
  }
}

// Singleton instance
export const mcpExecutor = new MCPExecutor();
