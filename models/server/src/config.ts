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

  // Models storage
  modelsPath: process.env.MODELS_PATH || "./data/models",

  // Model loading
  maxLoadedModels: parseInt(process.env.MAX_LOADED_MODELS || "2", 10),
  idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS || "300000", 10), // 5 minutes
  defaultGpuLayers: parseInt(process.env.DEFAULT_GPU_LAYERS || "0", 10),
  defaultThreads: parseInt(process.env.DEFAULT_THREADS || "4", 10),

  // HuggingFace
  huggingfaceToken: process.env.HUGGINGFACE_TOKEN || "",

  // Provider name for catalog registration
  providerName: "symbia-labs",
} as const;

export type Config = typeof config;
