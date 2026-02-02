/**
 * Auth Enforcement Tests
 *
 * Verifies that all routes have proper authentication.
 */

import { ITT_CONFIG } from '../itt.config.js';
import { readFile, fileExists, extractRoutes, getTypeScriptFiles, pass, fail, type TestResult } from '../itt.utils.js';

// Routes that are allowed to be public
const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/health$/,
  /^\/api\/ready$/,
  /^\/api\/docs/,
  /^\/api\/openapi/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/config$/,
  /^\/docs/,
  /^\/$/,
];

/**
 * Check if a route is allowed to be public
 */
function isAllowedPublic(path: string): boolean {
  return PUBLIC_ROUTE_PATTERNS.some(pattern => pattern.test(path));
}

/**
 * Check if auth middleware is used in the service
 */
function checkAuthUsage(content: string): { usesSymbiaAuth: boolean; hasAuthMiddleware: boolean; authImports: string[] } {
  const authImports: string[] = [];

  // Check for @symbia/auth import
  const symbiaAuthMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]@symbia\/auth['"]/);
  if (symbiaAuthMatch) {
    authImports.push(...symbiaAuthMatch[1].split(',').map(s => s.trim()));
  }

  // Check for local auth import
  const localAuthMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.?\/auth/);
  if (localAuthMatch) {
    authImports.push(...localAuthMatch[1].split(',').map(s => s.trim()));
  }

  return {
    usesSymbiaAuth: content.includes('@symbia/auth'),
    hasAuthMiddleware: authImports.some(imp =>
      ['requireAuth', 'optionalAuth', 'authMiddleware', 'requireAdmin'].includes(imp)
    ),
    authImports,
  };
}

/**
 * Run auth enforcement tests
 */
export async function runAuthEnforcementTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const service of ITT_CONFIG.services) {
    const authPath = `${service}/server/src/auth.ts`;
    const routesPath = `${service}/server/src/routes.ts`;
    const indexPath = `${service}/server/src/index.ts`;

    // Test 1: Service has auth module
    if (fileExists(authPath)) {
      const authContent = readFile(authPath);
      const { usesSymbiaAuth } = checkAuthUsage(authContent);

      if (usesSymbiaAuth) {
        results.push(pass(`auth:${service}:uses-symbia-auth`, `Uses @symbia/auth`));
      } else {
        results.push(fail(`auth:${service}:uses-symbia-auth`, `Does not use @symbia/auth (custom implementation)`));
      }
    } else {
      // Identity service is special - it IS the auth provider
      if (service === 'identity') {
        results.push(pass(`auth:${service}:auth-module`, `Identity service is the auth provider`));
      } else {
        results.push(fail(`auth:${service}:auth-module`, `Missing auth.ts module`));
      }
    }

    // Test 2: Check routes have auth
    if (fileExists(routesPath)) {
      const routesContent = readFile(routesPath);
      const routes = extractRoutes(routesContent);

      let protectedCount = 0;
      let unprotectedCount = 0;

      for (const route of routes) {
        if (isAllowedPublic(route.path)) {
          results.push(pass(
            `auth:${service}:route:${route.method}:${route.path}`,
            `Public route (allowed)`
          ));
          continue;
        }

        if (route.hasAuth) {
          protectedCount++;
          results.push(pass(
            `auth:${service}:route:${route.method}:${route.path}`,
            `Route has auth middleware`
          ));
        } else {
          unprotectedCount++;
          results.push(fail(
            `auth:${service}:route:${route.method}:${route.path}`,
            `Route missing auth middleware`,
            { line: route.line }
          ));
        }
      }

      results.push(pass(
        `auth:${service}:summary`,
        `${protectedCount} protected, ${unprotectedCount} unprotected routes`
      ));
    }

    // Test 3: Check index.ts uses auth middleware globally
    if (fileExists(indexPath)) {
      const indexContent = readFile(indexPath);
      const { hasAuthMiddleware } = checkAuthUsage(indexContent);

      if (hasAuthMiddleware || indexContent.includes('authMiddleware')) {
        results.push(pass(`auth:${service}:global-middleware`, `Auth middleware applied globally`));
      } else {
        // Not necessarily a failure - auth might be per-route
        results.push(pass(`auth:${service}:global-middleware`, `Auth applied per-route (review manually)`, { warning: true }));
      }
    }
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAuthEnforcementTests().then(results => {
    console.log('\n=== Auth Enforcement Tests ===\n');
    let passed = 0;
    let failed = 0;

    for (const result of results) {
      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} ${result.name}: ${result.message}`);
      if (result.passed) passed++;
      else failed++;
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
}
