import { resolveServiceUrl, ServiceId, fetchBootstrapConfig, clearBootstrapCache, type BootstrapConfig } from "@symbia/sys";
import type { TelemetryAuthMode, TelemetryConfig } from "./types.js";

/**
 * Environment variable configuration with fallback chains
 * Uses @symbia/sys for service URL resolution (checks LOGGING_SERVICE_URL, then defaults)
 */
const RAW_ENDPOINT =
  process.env.TELEMETRY_ENDPOINT ||
  process.env.LOGGING_ENDPOINT ||
  process.env.LOGGING_BASE_URL ||
  resolveServiceUrl(ServiceId.LOGGING);

const EXPLICIT_ENABLED = process.env.TELEMETRY_ENABLED;
const RESOLVED_ENABLED = EXPLICIT_ENABLED
  ? EXPLICIT_ENABLED === "true"
  : Boolean(RAW_ENDPOINT);

const RESOLVED_API_KEY =
  process.env.TELEMETRY_API_KEY || process.env.LOGGING_API_KEY || "";

const RESOLVED_BEARER =
  process.env.TELEMETRY_BEARER || process.env.LOGGING_BEARER || "";

const EXPLICIT_AUTH_MODE = process.env
  .TELEMETRY_AUTH_MODE as TelemetryAuthMode | undefined;
const FALLBACK_AUTH_MODE = process.env
  .LOGGING_AUTH_MODE as TelemetryAuthMode | undefined;

// Default to "system" auth mode for automatic service-to-service auth
const RESOLVED_AUTH_MODE: TelemetryAuthMode =
  EXPLICIT_AUTH_MODE ||
  FALLBACK_AUTH_MODE ||
  (RESOLVED_API_KEY ? "apiKey" : RESOLVED_BEARER ? "bearer" : "system");

// Cached system bootstrap config
let systemBootstrap: BootstrapConfig | null = null;
let bootstrapInitialized = false;

/**
 * Initialize system bootstrap for telemetry
 * Called automatically on first request when auth mode is "system"
 */
export async function initSystemAuth(): Promise<BootstrapConfig | null> {
  if (bootstrapInitialized && systemBootstrap) {
    return systemBootstrap;
  }

  systemBootstrap = await fetchBootstrapConfig();
  bootstrapInitialized = true;
  return systemBootstrap;
}

/**
 * Clear system bootstrap cache
 * Call this on 401 to force re-fetch
 */
export function clearSystemAuth(): void {
  systemBootstrap = null;
  bootstrapInitialized = false;
  clearBootstrapCache();
}

/**
 * Get current system bootstrap config (if available)
 */
export function getSystemAuth(): BootstrapConfig | null {
  return systemBootstrap;
}

/**
 * Default telemetry configuration from environment variables
 * Can be overridden by passing config to createTelemetryClient()
 */
export const DEFAULT_CONFIG: Omit<TelemetryConfig, "serviceId"> = {
  enabled: RESOLVED_ENABLED,
  endpoint: RAW_ENDPOINT,
  authMode: RESOLVED_AUTH_MODE,
  apiKey: RESOLVED_API_KEY,
  bearer: RESOLVED_BEARER,
  orgId: process.env.TELEMETRY_ORG_ID || process.env.LOGGING_ORG_ID || "",
  env:
    process.env.TELEMETRY_ENV ||
    process.env.LOGGING_ENV ||
    process.env.NODE_ENV ||
    "dev",
  dataClass:
    process.env.TELEMETRY_DATA_CLASS ||
    process.env.LOGGING_DATA_CLASS ||
    "none",
  policyRef:
    process.env.TELEMETRY_POLICY_REF ||
    process.env.LOGGING_POLICY_REF ||
    "policy/default",
  maxBatch: Number.parseInt(process.env.TELEMETRY_MAX_BATCH || "50", 10),
  flushMs: Number.parseInt(process.env.TELEMETRY_FLUSH_MS || "1000", 10),
  retry: Number.parseInt(process.env.TELEMETRY_RETRY || "3", 10),
  maxQueue: Number.parseInt(process.env.TELEMETRY_MAX_QUEUE || "1000", 10),
};

/**
 * Normalize endpoint URL
 * - Remove trailing slashes
 * - Ensure /api suffix
 */
export function normalizeEndpoint(endpoint: string): string {
  if (!endpoint) return "";
  const trimmed = endpoint.replace(/\/$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

/**
 * Build HTTP headers for telemetry requests
 */
export function getHeaders(config: TelemetryConfig): Record<string, string> {
  // For system auth, use bootstrap config for org/service IDs
  const bootstrap = config.authMode === "system" ? getSystemAuth() : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Org-Id": bootstrap?.orgId || config.orgId,
    "X-Service-Id": config.serviceId,
    "X-Env": config.env,
    "X-Data-Class": config.dataClass,
    "X-Policy-Ref": config.policyRef,
  };

  if (config.authMode === "apiKey" && config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  if (config.authMode === "bearer" && config.bearer) {
    headers["Authorization"] = `Bearer ${config.bearer}`;
  }

  if (config.authMode === "system" && bootstrap?.secret) {
    headers["Authorization"] = `Bearer ${bootstrap.secret}`;
  }

  return headers;
}

/**
 * Get current timestamp in ISO format
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Build base metadata for telemetry entries
 */
export function buildBaseMetadata(
  config: TelemetryConfig
): Record<string, unknown> {
  return {
    orgId: config.orgId,
    serviceId: config.serviceId,
    env: config.env,
  };
}

/**
 * Clamp queue size by removing oldest entries
 */
export function clampQueue(queue: Array<unknown>, maxQueue: number): void {
  while (queue.length > maxQueue) {
    queue.shift();
  }
}
