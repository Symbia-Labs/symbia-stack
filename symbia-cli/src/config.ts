import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import { ServiceLocalEndpoints, ServiceId } from '@symbia/sys';

// Map from our short service keys to actual ServiceId values
export const ServiceKeyToId = {
  IDENTITY: ServiceId.IDENTITY,
  CATALOG: ServiceId.CATALOG,
  LOGGING: ServiceId.LOGGING,
  MESSAGING: ServiceId.MESSAGING,
  ASSISTANTS: ServiceId.ASSISTANTS,
  NETWORK: ServiceId.NETWORK,
  SERVER: ServiceId.SERVER,
} as const;

export type ServiceKey = keyof typeof ServiceKeyToId;

export interface CliContext {
  name: string;
  endpoint: string;  // Base URL (e.g., http://localhost or https://api.symbia.io)
  org?: string;
}

export interface CliConfig {
  'current-context': string;
  contexts: Record<string, CliContext>;
}

export interface Credentials {
  token?: string;
  refreshToken?: string;
  expiresAt?: number;
  apiKey?: string;
}

const CONFIG_DIR = join(homedir(), '.symbia');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

const DEFAULT_CONFIG: CliConfig = {
  'current-context': 'local',
  contexts: {
    local: {
      name: 'local',
      endpoint: 'http://localhost',
      org: undefined,
    },
  },
};

export function loadConfig(): CliConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return parse(content) as CliConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: CliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, stringify(config), { mode: 0o600 });
}

export function getCurrentContext(): CliContext {
  const config = loadConfig();
  const contextName = config['current-context'];
  return config.contexts[contextName] || DEFAULT_CONFIG.contexts.local;
}

export function setCurrentContext(name: string): boolean {
  const config = loadConfig();
  if (!config.contexts[name]) {
    return false;
  }
  config['current-context'] = name;
  saveConfig(config);
  return true;
}

export function addContext(context: CliContext): void {
  const config = loadConfig();
  config.contexts[context.name] = context;
  saveConfig(config);
}

export function removeContext(name: string): boolean {
  const config = loadConfig();
  if (!config.contexts[name]) {
    return false;
  }
  if (config['current-context'] === name) {
    return false; // Can't remove active context
  }
  delete config.contexts[name];
  saveConfig(config);
  return true;
}

export function listContexts(): CliContext[] {
  const config = loadConfig();
  return Object.values(config.contexts);
}

// Credentials management
export function loadCredentials(): Credentials {
  ensureConfigDir();

  if (!existsSync(CREDENTIALS_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(content) as Credentials;
  } catch {
    return {};
  }
}

export function saveCredentials(credentials: Credentials): void {
  ensureConfigDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

export function clearCredentials(): void {
  saveCredentials({});
}

export function getToken(): string | undefined {
  const creds = loadCredentials();

  // Check if token is expired
  if (creds.expiresAt && Date.now() > creds.expiresAt) {
    return undefined;
  }

  return creds.token;
}

export function getApiKey(): string | undefined {
  return loadCredentials().apiKey;
}

// Service endpoint resolution
export function getServiceEndpoint(service: ServiceKey): string {
  const context = getCurrentContext();
  const baseUrl = context.endpoint;

  // Map from short key to actual service ID
  const serviceId = ServiceKeyToId[service];

  // Extract port from local endpoints
  const localEndpoint = ServiceLocalEndpoints[serviceId];
  const port = new URL(localEndpoint).port;

  // If using localhost, use the specific port
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    return `${baseUrl}:${port}`;
  }

  // For production, assume services are behind a gateway with paths
  // e.g., https://api.symbia.io/identity, https://api.symbia.io/catalog
  const serviceName = service.toLowerCase().replace('_', '-');
  return `${baseUrl}/${serviceName}`;
}

/**
 * Get the full config object
 */
export function getConfig(): CliConfig {
  return loadConfig();
}

/**
 * Get config for a specific context by name
 */
export function getContextConfig(name: string): CliContext | undefined {
  const config = loadConfig();
  return config.contexts[name];
}

/**
 * Get the current context name
 */
export function getCurrentContextName(): string {
  const config = loadConfig();
  return config['current-context'];
}
