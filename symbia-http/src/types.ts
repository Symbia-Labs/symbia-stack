import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import type { Server as SocketIOServer, ServerOptions as SocketIOServerOptions } from "socket.io";
import type { TelemetryClient } from "@symbia/logging-client";

/**
 * Scope headers extracted from incoming requests
 */
export interface ScopeHeaders {
  orgId: string | null;
  serviceId: string | null;
  env: string | null;
  dataClass: string | null;
  policyRef: string | null;
}

/**
 * CORS configuration options
 */
export interface CorsConfig {
  /**
   * Allowed origins (supports wildcards like *.replit.app)
   */
  origins?: string[];

  /**
   * Paths that allow public CORS access
   */
  publicPaths?: string[];

  /**
   * Allow localhost in development
   * @default true
   */
  allowLocalhost?: boolean;
}

/**
 * Session configuration options
 */
export interface SessionConfig {
  /**
   * Session secret for signing cookies
   */
  secret?: string;

  /**
   * Enable session middleware
   * @default false
   */
  enabled?: boolean;

  /**
   * Custom session store (defaults to MemoryStore)
   */
  store?: any;
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  /**
   * Telemetry client instance
   */
  client: TelemetryClient;

  /**
   * Paths to exclude from telemetry
   */
  excludePaths?: string[];
}

/**
 * Database instance interface for graceful shutdown
 */
export interface DatabaseShutdownHook {
  /**
   * Whether using in-memory database
   */
  isMemory: boolean;

  /**
   * Export the in-memory database to a file
   */
  exportToFile: (filePath: string) => boolean;

  /**
   * Close the database connection
   */
  close: () => Promise<void>;
}

/**
 * Socket.IO configuration options
 */
export interface SocketConfig {
  /**
   * Enable Socket.IO server
   * @default false
   */
  enabled: boolean;

  /**
   * Socket.IO server options (passed to new Server())
   * CORS is automatically configured from the main cors config
   */
  options?: Partial<SocketIOServerOptions>;

  /**
   * Setup function for Socket.IO event handlers
   * Called after the Socket.IO server is created
   */
  setupHandlers?: (io: SocketIOServer) => void | Promise<void>;
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  /**
   * Service identifier
   */
  serviceId: string;

  /**
   * Port to listen on
   * @default process.env.PORT || 5000
   */
  port?: number;

  /**
   * Host to bind to
   * @default process.env.HOST || "0.0.0.0"
   */
  host?: string;

  /**
   * CORS configuration
   */
  cors?: CorsConfig;

  /**
   * Socket.IO configuration for WebSocket support
   */
  socket?: SocketConfig;

  /**
   * Session configuration
   */
  session?: SessionConfig;

  /**
   * Telemetry configuration
   */
  telemetry?: TelemetryConfig;

  /**
   * Enable request/response logging
   * @default true
   */
  enableLogging?: boolean;

  /**
   * Enable SDN observability middleware for HTTP request/response tracking
   * When enabled, HTTP traffic is emitted through the SDN for real-time visibility
   * @default true
   */
  enableObservability?: boolean;

  /**
   * Custom middleware to run after standard setup
   */
  middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;

  /**
   * Vite setup function for development
   */
  setupVite?: (server: Server, app: Express) => Promise<void>;

  /**
   * Static file serving function for production
   */
  serveStatic?: (app: Express) => void;

  /**
   * Custom route registration
   */
  registerRoutes?: (server: Server, app: Express) => Promise<void> | void;

  /**
   * Health check configuration for k8s probes
   * Set to false to disable all health endpoints
   * @default { enabled: true, enableLiveness: true, enableReadiness: true }
   */
  health?: HealthConfig | false;

  /**
   * Graceful shutdown configuration
   */
  shutdown?: ShutdownConfig;

  /**
   * Trust proxy headers
   * @default 1
   */
  trustProxy?: number | boolean;

  /**
   * Database instance for graceful shutdown handling
   * When provided, the server will export in-memory database before shutdown
   */
  database?: DatabaseShutdownHook;

  /**
   * Path to export in-memory database on shutdown
   * Can also be set via DB_EXPORT_PATH environment variable
   * @example ".local-pids/run-123/logging-db.json"
   */
  dbExportPath?: string;
}

/**
 * Health check result for k8s probes
 */
export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks?: Record<string, {
    status: 'ok' | 'unhealthy';
    message?: string;
    latencyMs?: number;
  }>;
}

/**
 * Graceful shutdown configuration
 */
export interface ShutdownConfig {
  /**
   * Grace period in ms before forcefully closing connections
   * @default 30000 (30 seconds)
   */
  gracePeriodMs?: number;

  /**
   * Time to wait after marking as not ready before starting shutdown
   * Allows k8s to stop routing traffic
   * @default 5000 (5 seconds)
   */
  preShutdownDelayMs?: number;

  /**
   * Custom shutdown hooks to run during graceful shutdown
   */
  hooks?: Array<() => Promise<void> | void>;
}

/**
 * Health check configuration for k8s readiness/liveness probes
 */
export interface HealthConfig {
  /**
   * Enable basic health endpoint at /health
   * @default true
   */
  enabled?: boolean;

  /**
   * Enable k8s-style liveness probe at /health/live
   * @default true
   */
  enableLiveness?: boolean;

  /**
   * Enable k8s-style readiness probe at /health/ready
   * @default true
   */
  enableReadiness?: boolean;

  /**
   * Custom readiness check function
   * Return false or throw to indicate not ready
   */
  readinessCheck?: () => Promise<boolean> | boolean;

  /**
   * Custom liveness check function
   * Return false or throw to indicate unhealthy
   */
  livenessCheck?: () => Promise<boolean> | boolean;
}

/**
 * Server instance returned by createServer
 */
export interface ServerInstance {
  app: Express;
  httpServer: Server;
  /**
   * Socket.IO server instance (only present if socket.enabled is true)
   */
  io?: SocketIOServer;
  telemetry?: TelemetryClient;
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
  /**
   * Whether the server is ready to accept traffic
   */
  isReady: () => boolean;
  /**
   * Set server readiness state
   */
  setReady: (ready: boolean) => void;
}
