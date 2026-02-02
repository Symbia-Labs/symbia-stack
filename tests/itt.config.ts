/**
 * ITT Testing Framework Configuration
 *
 * Intentions - Does code match documented intent?
 * Trust - Can the system be trusted to protect data?
 * Transparency - Can we observe and understand what's happening?
 */

export const ITT_CONFIG = {
  // Services to test
  services: [
    'assistants',
    'catalog',
    'identity',
    'integrations',
    'logging',
    'messaging',
    'network',
    'runtime',
  ],

  // Shared packages
  packages: [
    'symbia-auth',
    'symbia-db',
    'symbia-http',
    'symbia-id',
    'symbia-logging-client',
    'symbia-relay',
    'symbia-seed',
    'symbia-sys',
  ],

  // Intent documents
  intentDocs: ['INTENT.md', 'README.md', 'CONTRIBUTING.md'],

  // Thresholds
  thresholds: {
    // Readability
    maxCyclomaticComplexity: 20,
    maxFunctionLines: 100,
    minDocCoverage: 0.5, // 50% of public APIs documented

    // Trust
    maxSecretPatterns: 0,
    requiredAuthMiddleware: ['requireAuth', 'optionalAuth', 'authMiddleware'],

    // Transparency
    requiredTelemetryEvents: ['request', 'response', 'error'],
  },

  // Patterns to detect
  patterns: {
    secrets: [
      /password\s*[:=]\s*['"][^'"]+['"]/i,
      /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
      /secret\s*[:=]\s*['"][^'"]+['"]/i,
      /token\s*[:=]\s*['"][^'"]+['"]/i,
    ],
    obfuscation: [
      /eval\s*\(/,
      /new\s+Function\s*\(/,
      /atob\s*\(/,
      /btoa\s*\(/,
      /\\x[0-9a-f]{2}/i, // hex escapes
    ],
    dynamicExecution: [
      /eval\(/,
      /new Function\(/,
      /setTimeout\([^,]+,/,
      /setInterval\([^,]+,/,
    ],
  },
};

export type ITTConfig = typeof ITT_CONFIG;
