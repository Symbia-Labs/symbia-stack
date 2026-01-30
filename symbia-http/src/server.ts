import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import MemoryStore from "memorystore";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { resolveServicePort } from "@symbia/sys";
import { observabilityMiddleware, initServiceRelay, shutdownRelay } from "@symbia/relay";
import type { Socket } from "net";
import type { ServerConfig, ServerInstance, HealthConfig, HealthCheckResult, ShutdownConfig } from "./types.js";
import { createCorsMiddleware, buildCorsOptions } from "./cors.js";
import { createTelemetryMiddleware } from "./telemetry.js";
import { createLoggingMiddleware, log } from "./logging.js";

// Extend http.IncomingMessage to support rawBody
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

/**
 * Create and configure an Express server with standard middleware
 */
export function createSymbiaServer(config: ServerConfig): ServerInstance {
  const {
    serviceId,
    port = resolveServicePort(serviceId),
    host = process.env.HOST || "0.0.0.0",
    cors,
    socket: socketConfig,
    session: sessionConfig,
    telemetry,
    enableLogging = true,
    middleware = [],
    setupVite,
    serveStatic,
    registerRoutes,
    health: healthConfig = {},
    trustProxy = 1,
    database,
    dbExportPath = process.env.DB_EXPORT_PATH,
  } = config;

  // Parse health config
  const healthEnabled = healthConfig !== false;
  const health: HealthConfig = healthConfig === false ? {} : {
    enabled: true,
    enableLiveness: true,
    enableReadiness: true,
    ...healthConfig,
  };

  // Parse shutdown config with defaults
  const shutdownConfig: Required<ShutdownConfig> = {
    gracePeriodMs: config.shutdown?.gracePeriodMs ?? 30000,
    preShutdownDelayMs: config.shutdown?.preShutdownDelayMs ?? 5000,
    hooks: config.shutdown?.hooks ?? [],
  };

  // Server readiness state (for k8s readiness probe)
  let serverReady = false;
  let isShuttingDown = false;

  // Track active connections for graceful shutdown
  const activeConnections = new Set<Socket>();

  const app = express();
  const httpServer = createServer(app);

  // Configure HTTP timeouts to prevent hanging requests
  httpServer.timeout = 120000; // 2 minutes - overall request timeout
  httpServer.keepAliveTimeout = 65000; // 65 seconds - keep-alive timeout
  httpServer.headersTimeout = 66000; // 66 seconds - slightly longer than keepAliveTimeout

  // Create Socket.IO server if enabled
  let io: SocketIOServer | undefined;
  if (socketConfig?.enabled) {
    const corsOptions = buildCorsOptions({
      origins: cors?.origins,
      allowLocalhost: cors?.allowLocalhost,
    });
    io = new SocketIOServer(httpServer, {
      cors: corsOptions,
      ...socketConfig.options,
    });
    log("Socket.IO server created");
  }

  // Track connections for graceful shutdown
  httpServer.on("connection", (socket: Socket) => {
    activeConnections.add(socket);
    socket.on("close", () => {
      activeConnections.delete(socket);
    });
  });

  // Trust proxy headers
  app.set("trust proxy", trustProxy);

  // Default public CORS paths for documentation
  const defaultPublicPaths = [
    "/docs",
    "/docs/openapi.json",
    "/docs/llms.txt",
    "/docs/llms-full.txt",
    "/openapi.json",
    "/llm.txt",
    "/llms.txt",
    "/llms-full.txt",
    "/api/openapi.json",
    "/api/docs/openapi.json",
    "/.well-known/openapi.json",
  ];

  // Setup CORS
  app.use(createCorsMiddleware({
    origins: cors?.origins,
    publicPaths: [...defaultPublicPaths, ...(cors?.publicPaths || [])],
    allowLocalhost: cors?.allowLocalhost,
  }));

  // Body parsing with raw body support
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Session support (optional)
  if (sessionConfig?.enabled) {
    const MemoryStoreSession = MemoryStore(session);
    app.use(
      session({
        proxy: true,
        secret: sessionConfig.secret || process.env.SESSION_SECRET || `${serviceId}-dev-secret`,
        resave: false,
        saveUninitialized: false,
        store: sessionConfig.store || new MemoryStoreSession({
          checkPeriod: 86400000,
        }),
        cookie: {
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000,
          sameSite: "lax",
        },
      })
    );
  }

  // Health check endpoints (before telemetry to avoid tracking)
  if (healthEnabled && health.enabled) {
    // Basic health endpoint
    app.get("/health", (_req, res) => {
      const result: HealthCheckResult = {
        status: serverReady ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
      };
      res.status(serverReady ? 200 : 503).json(result);
    });

    // K8s liveness probe - is the process alive and not deadlocked?
    if (health.enableLiveness) {
      app.get("/health/live", async (_req, res) => {
        try {
          if (health.livenessCheck) {
            const isAlive = await health.livenessCheck();
            if (!isAlive) {
              return res.status(503).json({
                status: "unhealthy",
                timestamp: new Date().toISOString(),
              });
            }
          }
          res.status(200).json({
            status: "ok",
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          res.status(503).json({
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            checks: {
              liveness: {
                status: "unhealthy",
                message: err instanceof Error ? err.message : "Liveness check failed",
              },
            },
          });
        }
      });
    }

    // K8s readiness probe - is the service ready to accept traffic?
    if (health.enableReadiness) {
      app.get("/health/ready", async (_req, res) => {
        try {
          // Check server readiness state first
          if (!serverReady) {
            return res.status(503).json({
              status: "unhealthy",
              timestamp: new Date().toISOString(),
              checks: {
                server: { status: "unhealthy", message: "Server not ready" },
              },
            });
          }

          // Run custom readiness check if provided
          if (health.readinessCheck) {
            const isReady = await health.readinessCheck();
            if (!isReady) {
              return res.status(503).json({
                status: "unhealthy",
                timestamp: new Date().toISOString(),
                checks: {
                  readiness: { status: "unhealthy", message: "Readiness check failed" },
                },
              });
            }
          }

          res.status(200).json({
            status: "ok",
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          res.status(503).json({
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            checks: {
              readiness: {
                status: "unhealthy",
                message: err instanceof Error ? err.message : "Readiness check failed",
              },
            },
          });
        }
      });
    }
  }

  // Telemetry middleware
  if (telemetry) {
    app.use(createTelemetryMiddleware(telemetry.client, telemetry.excludePaths));
  }

  // SDN Observability middleware - emits HTTP request/response events
  const enableObservability = config.enableObservability !== false;
  if (enableObservability) {
    app.use(observabilityMiddleware({
      excludePaths: ['/health', '/health/live', '/health/ready', '/favicon.ico', ...(telemetry?.excludePaths || [])],
      slowRequestThresholdMs: 5000,
    }));
    log("SDN observability middleware enabled");
  }

  // Request/response logging
  if (enableLogging) {
    const verbose = process.env.LOG_VERBOSE === 'true' || process.env.NODE_ENV === 'development';
    app.use(createLoggingMiddleware({
      verbose,
      telemetry: telemetry?.client,
      excludePaths: telemetry?.excludePaths,
    }));
  }

  // Custom middleware
  for (const mw of middleware) {
    app.use(mw);
  }

  /**
   * Start the server
   */
  async function start(): Promise<void> {
    log(`Starting server in ${process.env.NODE_ENV || "development"} mode`);

    // Setup Socket.IO handlers if configured
    if (io && socketConfig?.setupHandlers) {
      await socketConfig.setupHandlers(io);
      log("Socket.IO handlers configured");
    }

    // Register routes
    if (registerRoutes) {
      await registerRoutes(httpServer, app);
      log("Routes registered successfully");
    }

    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      log(`Error: ${message}`);
      res.status(status).json({ message });
    });

    // Setup Vite (development) or static serving (production)
    if (process.env.NODE_ENV === "production") {
      if (serveStatic) {
        log("Setting up static file serving for production");
        serveStatic(app);
        log("Static file serving configured");
      }
    } else {
      if (setupVite) {
        await setupVite(httpServer, app);
      }
    }

    // Start listening
    const reusePort = process.platform === "linux";
    await new Promise<void>((resolve) => {
      httpServer.listen(
        {
          port,
          host,
          reusePort,
        },
        () => {
          log(`Server listening on http://${host}:${port}`);
          // Mark server as ready for k8s readiness probe
          serverReady = true;
          if (telemetry) {
            telemetry.client.event("service.started", `${serviceId} started`, {
              mode: process.env.NODE_ENV || "development",
              port,
            });
          }
          resolve();
        }
      );
    });

    // Initialize relay for SDN observability (after server is listening)
    if (enableObservability) {
      try {
        await initServiceRelay({
          serviceId,
          serviceName: serviceId.replace(/-/g, ' ').replace(/symbia/i, 'Symbia'),
          capabilities: ['obs.http.emit'],
        });
        log("SDN relay connected for observability");
      } catch (err) {
        // Relay connection failure is non-fatal - service still works
        log(`SDN relay not available: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /**
   * Shutdown the server gracefully with connection draining
   */
  async function shutdown(): Promise<void> {
    if (isShuttingDown) {
      log("Shutdown already in progress");
      return;
    }
    isShuttingDown = true;
    log("Starting graceful shutdown...");

    // Mark as not ready immediately (k8s will stop sending traffic)
    serverReady = false;

    // Wait for k8s to stop routing traffic (pre-shutdown delay)
    if (shutdownConfig.preShutdownDelayMs > 0) {
      log(`Waiting ${shutdownConfig.preShutdownDelayMs}ms for traffic to drain...`);
      await new Promise((resolve) => setTimeout(resolve, shutdownConfig.preShutdownDelayMs));
    }

    // Run custom shutdown hooks
    if (shutdownConfig.hooks.length > 0) {
      log(`Running ${shutdownConfig.hooks.length} shutdown hook(s)...`);
      for (const hook of shutdownConfig.hooks) {
        try {
          await hook();
        } catch (err) {
          log(`Shutdown hook failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    // Export in-memory database before shutdown if configured
    if (database && database.isMemory && dbExportPath) {
      log(`Exporting in-memory database to ${dbExportPath}...`);
      const exported = database.exportToFile(dbExportPath);
      if (exported) {
        log("Database export completed successfully");
      } else {
        log("Database export failed or skipped");
      }
    }

    // Flush telemetry
    if (telemetry) {
      await telemetry.client.shutdown();
    }

    // Shutdown relay connection
    await shutdownRelay();

    // Close database connection
    if (database) {
      await database.close();
    }

    // Close Socket.IO server
    if (io) {
      log("Closing Socket.IO server...");
      await new Promise<void>((resolve) => {
        io!.close(() => {
          log("Socket.IO server closed");
          resolve();
        });
      });
    }

    // Close HTTP server and wait for connections to drain
    log(`Closing server (${activeConnections.size} active connections)...`);

    await new Promise<void>((resolve) => {
      // Set up grace period timeout
      const forceCloseTimeout = setTimeout(() => {
        log(`Grace period expired, forcefully closing ${activeConnections.size} connections`);
        for (const socket of activeConnections) {
          socket.destroy();
        }
        activeConnections.clear();
      }, shutdownConfig.gracePeriodMs);

      // Stop accepting new connections and wait for existing ones to finish
      httpServer.close(() => {
        clearTimeout(forceCloseTimeout);
        log("Server shut down successfully");
        resolve();
      });

      // Set keep-alive connections to close after their current request
      for (const socket of activeConnections) {
        // End idle keep-alive connections
        socket.end();
      }
    });
  }

  // Setup shutdown handlers
  const shutdownSignals = ["SIGINT", "SIGTERM"];
  shutdownSignals.forEach((signal) => {
    process.on(signal, () => {
      shutdown().finally(() => process.exit(0));
    });
  });

  return {
    app,
    httpServer,
    io,
    telemetry: telemetry?.client,
    start,
    shutdown,
    isReady: () => serverReady,
    setReady: (ready: boolean) => { serverReady = ready; },
  };
}
