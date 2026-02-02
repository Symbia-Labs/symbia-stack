/**
 * Correlation ID Tests
 *
 * Verifies that request IDs propagate through the system.
 */

import { ITT_CONFIG } from '../../itt.config.js';
import { readFile, fileExists, getTypeScriptFiles, pass, fail, type TestResult } from '../../itt.utils.js';

// Patterns indicating correlation ID support
const CORRELATION_PATTERNS = {
  header: [
    /x-request-id/i,
    /x-correlation-id/i,
    /x-trace-id/i,
    /requestId/,
    /correlationId/,
    /traceId/,
  ],
  propagation: [
    /req\.id/,
    /request\.id/,
    /headers\['x-request-id'\]/i,
    /getHeader.*request.*id/i,
  ],
  logging: [
    /requestId.*log/i,
    /log.*requestId/i,
    /traceId.*console/i,
  ],
};

/**
 * Check if a service supports correlation IDs
 */
function checkCorrelationSupport(content: string): { hasHeader: boolean; hasPropagation: boolean; hasLogging: boolean } {
  const hasHeader = CORRELATION_PATTERNS.header.some(p => p.test(content));
  const hasPropagation = CORRELATION_PATTERNS.propagation.some(p => p.test(content));
  const hasLogging = CORRELATION_PATTERNS.logging.some(p => p.test(content));

  return { hasHeader, hasPropagation, hasLogging };
}

/**
 * Run correlation ID tests
 */
export async function runCorrelationIdTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const service of ITT_CONFIG.services) {
    const serverDir = `${service}/server/src`;
    const indexPath = `${service}/server/src/index.ts`;

    // Check main entry point
    if (fileExists(indexPath)) {
      const content = readFile(indexPath);
      const { hasHeader, hasPropagation } = checkCorrelationSupport(content);

      if (hasHeader || hasPropagation) {
        results.push(pass(
          `correlation:${service}:index`,
          `Main entry handles request IDs`
        ));
      } else {
        results.push(fail(
          `correlation:${service}:index`,
          `No request ID handling in index.ts`
        ));
      }
    }

    // Check if @symbia/http is used (provides correlation by default)
    const files = getTypeScriptFiles(serverDir);
    let usesSymbiaHttp = false;

    for (const file of files) {
      const content = readFile(file);
      if (content.includes('@symbia/http')) {
        usesSymbiaHttp = true;
        break;
      }
    }

    if (usesSymbiaHttp) {
      results.push(pass(
        `correlation:${service}:symbia-http`,
        `Uses @symbia/http (provides correlation by default)`
      ));
    }

    // Check telemetry integration
    const telemetryFile = `${service}/server/src/telemetry.ts`;
    if (fileExists(telemetryFile)) {
      const content = readFile(telemetryFile);
      if (CORRELATION_PATTERNS.header.some(p => p.test(content))) {
        results.push(pass(
          `correlation:${service}:telemetry`,
          `Telemetry includes correlation IDs`
        ));
      }
    }
  }

  // Check shared packages
  const httpPkg = 'symbia-http/src';
  if (fileExists(httpPkg)) {
    const files = getTypeScriptFiles(httpPkg);
    let hasMiddleware = false;

    for (const file of files) {
      const content = readFile(file);
      if (CORRELATION_PATTERNS.header.some(p => p.test(content))) {
        hasMiddleware = true;
        break;
      }
    }

    if (hasMiddleware) {
      results.push(pass(
        'correlation:symbia-http:middleware',
        '@symbia/http provides correlation ID middleware'
      ));
    }
  }

  // Summary
  const failures = results.filter(r => !r.passed);
  results.push(pass(
    'correlation:summary',
    `${results.length - failures.length} services support correlation IDs`
  ));

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCorrelationIdTests().then(results => {
    console.log('\n=== Correlation ID Tests ===\n');

    for (const result of results) {
      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} ${result.name}: ${result.message}`);
    }

    const failures = results.filter(r => !r.passed);
    console.log(`\nResults: ${results.length - failures.length} passed, ${failures.length} failed`);
    process.exit(failures.length > 0 ? 1 : 0);
  });
}
