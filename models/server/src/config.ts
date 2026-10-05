/**
 * Configuration for the Models Service
 */

export const config = {
  // Server
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",

  // Service URLs
  identityServiceUrl:
    process.env.IDENTITY_SERVICE_URL || "http://localhost:5001",
  catalogServiceUrl:
    process.env.CATALOG_SERVICE_URL || "http://localhost:5003",
  /**
   * Integrations holds the credentials, and keeps holding them.
   *
   * Ruling 12 Aug: this service brokers model exchanges; it does NOT become a
   * second vault. Remote execution is delegated so secret handling stays in one
   * place. This URL is for asking integrations what it can reach and, from
   * stage 1, for handing it calls to run.
   */
  integrationsServiceUrl:
    process.env.INTEGRATIONS_SERVICE_URL || "http://localhost:5007",

  // Models storage
  modelsPath: process.env.MODELS_PATH || "./data/models",

  // Model loading
  maxLoadedModels: parseInt(process.env.MAX_LOADED_MODELS || "2", 10),
  idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS || "300000", 10), // 5 minutes
  defaultGpuLayers: parseInt(process.env.DEFAULT_GPU_LAYERS || "0", 10),
  defaultThreads: parseInt(process.env.DEFAULT_THREADS || "4", 10),

  // No third-party credential lives here. `huggingfaceToken` sat in this
  // config from February to 15 Aug 2026 with zero readers — a vault slot in
  // the one service the 12 Aug ruling says must never become a second
  // vault. Credentials for gated repos belong to integrations; the pull
  // path forwards the caller's bearer and integrations attaches the key.

  // Provider name for catalog registration
  providerName: "symbia-labs",
} as const;

export type Config = typeof config;
