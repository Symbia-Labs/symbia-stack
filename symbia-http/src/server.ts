import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import MemoryStore from "memorystore";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { resolveServicePort } from "@symbia/sys";
import { loadServiceIdentity, describeServiceIdentity, type ServiceIdentity } from "@symbia/crypto";
import { observabilityMiddleware, initServiceRelay, shutdownRelay, installFetchTracePropagation } from "@symbia/relay";
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
    serveStatic,
    registerRoutes,
    health: healthConfig = {},
    trustProxy = 1,
    database,
    dbExportPath = process.env.DB_EXPORT_PATH,
  } = config;

  // Set when the service's keypair loads; absent if it could not be read.
  let identity: ServiceIdentity | undefined;

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

  // Body parsing with raw body support.
  //
  // An EXPLICIT limit, because the implicit one was 100kb and nobody chose it.
  // Measured 7 Aug 2026: a spyglass capture on a devicePixelRatio-3 display is
  // a 780x780 PNG, roughly 400kb as base64, and POST /api/integrations/execute
  // returned 413. Vision was impossible on any HiDPI screen and the only
  // evidence was a bare "Gateway returned 413" in the chat composer.
  //
  // Images are a legitimate payload now that image.description exists, so the
  // limit is set deliberately and generously rather than left to a default
  // chosen for a web form in 2014. It is still a limit: an unbounded body is a
  // way to run a service out of memory from outside.
  app.use(
    express.json({
      limit: config.bodyLimit ?? "12mb",
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
    // Stamp outbound fetch with this service's id and the current trace BEFORE
    // any route can run. Every service-to-service call then carries who called
    // and what request it belongs to, without a single call site changing.
    // SERVICE_ID is set here because the middleware reads it from env to avoid
    // taking a config argument it would then have to thread everywhere.
    process.env.SERVICE_ID = process.env.SERVICE_ID || String(serviceId);
    installFetchTracePropagation(String(serviceId));

    // Stage 0 of docs/2026-08-10-envelope-signatures-proposal.md.
    //
    // Every service boots through this function, so the key is loaded once here
    // rather than copied into ten services — a shared concern with N
    // implementations is not shared, and authMiddleware has already been forked
    // three ways in this codebase to prove it.
    //
    // Nothing is signed yet. This exists so that when envelopes start carrying
    // signatures there is already a durable identity to sign with, and so the
    // operational question — does the key survive a restart — gets answered
    // before the cryptographic one.
    try {
      identity = loadServiceIdentity({ role: String(serviceId) });
      log(describeServiceIdentity(identity));
      if (identity.created) {
        // Worth saying out loud: if this appears on every boot, the key is not
        // being persisted and the service is a different identity each time.
        log(`Identity key written to ${identity.keyPath} — mount this path to keep it across restarts`);
      }
    } catch (err) {
      // A missing identity must not stop a service from serving. It is recorded
      // as absent rather than substituted with something that looks equivalent.
      log(`Identity unavailable, continuing without one: ${err instanceof Error ? err.message : err}`);
    }

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
        const relay = await initServiceRelay({
          serviceId,
          // No serviceName. The relay defaults to serviceDisplayName(id),
          // which is the one place that decides how a service is spelled.
          // This line used to derive its own — lowercase, hyphens to spaces —
          // and raced four services that hardcoded theirs in Title Case.
          capabilities: ['obs.http.emit'],
        });
        // Report what actually happened.
        //
        // This line was unconditional and read "SDN relay connected for
        // observability" — printed two lines below the relay's own
        // "Could not connect to network service", on every service that had
        // failed. A startup log that contradicts itself within three lines is
        // worse than no log: the one that sounds like a pass is the one people
        // read and stop at.
        if (relay?.isReady()) {
          log("SDN relay connected for observability");
        } else {
          log(
            "SDN relay NOT connected — observability events will be dropped until the network service is reachable"
          );
        }
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
    // Present only when a key actually loaded. Absent is a state, not a
    // failure to hide.
    identity,
    io,
    telemetry: telemetry?.client,
    start,
    shutdown,
    isReady: () => serverReady,
    setReady: (ready: boolean) => { serverReady = ready; },
  };
}
