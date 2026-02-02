/**
 * User Journey Tests
 *
 * Verifies that user actions can be traced through the system.
 */

import { ITT_CONFIG } from '../../itt.config.js';
import { readFile, fileExists, getTypeScriptFiles, pass, fail, type TestResult } from '../../itt.utils.js';

// Patterns indicating user journey tracking
const JOURNEY_PATTERNS = {
  userId: [
    /userId/,
    /user\.id/,
    /req\.user\.id/,
    /authContext\.actorId/,
  ],
  sessionId: [
    /sessionId/,
    /session\.id/,
    /req\.sessionID/,
  ],
  actionLogging: [
    /telemetry\.(event|metric|log)/,
    /console\.(log|info).*action/i,
    /logger\.(info|debug).*user/i,
    /audit/i,
  ],
  userContext: [
    /userPrincipal/,
    /authContext/,
    /req\.user/,
  ],
};

/**
 * Check if a service tracks user journeys
 */
function checkJourneyTracking(dir: string): {
  hasUserContext: boolean;
  hasActionLogging: boolean;
  hasSessionTracking: boolean;
} {
  const files = getTypeScriptFiles(dir);
  let hasUserContext = false;
  let hasActionLogging = false;
  let hasSessionTracking = false;

  for (const file of files) {
    const content = readFile(file);

    if (JOURNEY_PATTERNS.userId.some(p => p.test(content)) ||
        JOURNEY_PATTERNS.userContext.some(p => p.test(content))) {
      hasUserContext = true;
    }

    if (JOURNEY_PATTERNS.actionLogging.some(p => p.test(content))) {
      hasActionLogging = true;
    }

    if (JOURNEY_PATTERNS.sessionId.some(p => p.test(content))) {
      hasSessionTracking = true;
    }
  }

  return { hasUserContext, hasActionLogging, hasSessionTracking };
}

/**
 * Check if logging service can reconstruct journeys
 */
function checkLoggingCapabilities(): boolean {
  const loggingRoutes = 'logging/server/src/routes.ts';
  if (!fileExists(loggingRoutes)) return false;

  const content = readFile(loggingRoutes);

  // Check for query capabilities
  const queryPatterns = [
    /\/query/,
    /\/search/,
    /\/logs/,
    /userId.*filter/i,
    /sessionId.*filter/i,
  ];

  return queryPatterns.some(p => p.test(content));
}

/**
 * Run user journey tests
 */
export async function runUserJourneyTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const service of ITT_CONFIG.services) {
    const serverDir = `${service}/server/src`;
    const { hasUserContext, hasActionLogging, hasSessionTracking } = checkJourneyTracking(serverDir);

    // User context
    if (hasUserContext) {
      results.push(pass(
        `journey:${service}:user-context`,
        `Tracks user context`
      ));
    } else {
      results.push(fail(
        `journey:${service}:user-context`,
        `No user context tracking found`
      ));
    }

    // Action logging
    if (hasActionLogging) {
      results.push(pass(
        `journey:${service}:action-logging`,
        `Logs user actions`
      ));
    } else {
      results.push(fail(
        `journey:${service}:action-logging`,
        `No action logging found`
      ));
    }

    // Session tracking (optional for some services)
    if (hasSessionTracking) {
      results.push(pass(
        `journey:${service}:session`,
        `Tracks session IDs`
      ));
    }
  }

  // Check logging service query capabilities
  if (checkLoggingCapabilities()) {
    results.push(pass(
      'journey:logging:query',
      `Logging service supports journey queries`
    ));
  } else {
    results.push(fail(
      'journey:logging:query',
      `Logging service missing journey query capabilities`
    ));
  }

  // Check for @symbia/logging-client usage
  for (const service of ITT_CONFIG.services) {
    const files = getTypeScriptFiles(`${service}/server/src`);
    let usesLoggingClient = false;

    for (const file of files) {
      const content = readFile(file);
      if (content.includes('@symbia/logging-client')) {
        usesLoggingClient = true;
        break;
      }
    }

    if (usesLoggingClient) {
      results.push(pass(
        `journey:${service}:logging-client`,
        `Uses @symbia/logging-client for telemetry`
      ));
    }
  }

  // Summary
  const failures = results.filter(r => !r.passed);
  results.push(pass(
    'journey:summary',
    `User journey tracking: ${results.length - failures.length} checks passed`
  ));

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runUserJourneyTests().then(results => {
    console.log('\n=== User Journey Tests ===\n');

    for (const result of results) {
      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} ${result.name}: ${result.message}`);
    }

    const failures = results.filter(r => !r.passed);
    console.log(`\nResults: ${results.length - failures.length} passed, ${failures.length} failed`);
    process.exit(failures.length > 0 ? 1 : 0);
  });
}
