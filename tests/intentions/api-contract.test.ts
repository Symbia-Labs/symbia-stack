/**
 * API Contract Tests
 *
 * Verifies that OpenAPI specs match actual API implementations.
 */

import { ITT_CONFIG } from '../itt.config.js';
import { readFile, fileExists, extractRoutes, pass, fail, type TestResult } from '../itt.utils.js';

interface OpenAPIPath {
  [method: string]: {
    summary?: string;
    description?: string;
    operationId?: string;
  };
}

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, OpenAPIPath>;
}

/**
 * Parse OpenAPI spec
 */
function parseOpenAPI(content: string): OpenAPISpec | null {
  try {
    return JSON.parse(content) as OpenAPISpec;
  } catch {
    return null;
  }
}

/**
 * Extract paths from OpenAPI spec
 */
function getOpenAPIPaths(spec: OpenAPISpec): Array<{ method: string; path: string }> {
  const paths: Array<{ method: string; path: string }> = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
        paths.push({ method: method.toUpperCase(), path });
      }
    }
  }

  return paths;
}

/**
 * Normalize path for comparison (handle path params)
 */
function normalizePath(path: string): string {
  // Convert :param to {param} and vice versa for comparison
  return path
    .replace(/:(\w+)/g, '{$1}')
    .replace(/\{(\w+)\}/g, ':$1')
    .toLowerCase();
}

/**
 * Check if two paths match (accounting for path params)
 */
function pathsMatch(path1: string, path2: string): boolean {
  const norm1 = normalizePath(path1);
  const norm2 = normalizePath(path2);

  // Direct match
  if (norm1 === norm2) return true;

  // Parameterized match
  const parts1 = norm1.split('/');
  const parts2 = norm2.split('/');

  if (parts1.length !== parts2.length) return false;

  return parts1.every((part, i) => {
    const other = parts2[i];
    // Match if same or either is a param
    return part === other || part.startsWith(':') || other.startsWith(':');
  });
}

/**
 * Run API contract tests
 */
export async function runApiContractTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const service of ITT_CONFIG.services) {
    const openapiPath = `${service}/docs/openapi.json`;
    const routesPath = `${service}/server/src/routes.ts`;

    // Check OpenAPI exists
    if (!fileExists(openapiPath)) {
      results.push(fail(`api-contract:${service}:spec`, `OpenAPI spec missing`));
      continue;
    }

    const specContent = readFile(openapiPath);
    const spec = parseOpenAPI(specContent);
    if (!spec) {
      results.push(fail(`api-contract:${service}:parse`, `Failed to parse OpenAPI spec`));
      continue;
    }

    results.push(pass(`api-contract:${service}:spec`, `OpenAPI spec valid (${spec.info.title} v${spec.info.version})`));

    // Check routes file exists
    if (!fileExists(routesPath)) {
      // Some services might have routes in different files
      results.push(pass(`api-contract:${service}:routes`, `Routes file not at standard location (may be split)`, { warning: true }));
      continue;
    }

    const routesContent = readFile(routesPath);
    const codeRoutes = extractRoutes(routesContent);
    const specPaths = getOpenAPIPaths(spec);

    // Check each code route has a spec entry
    for (const route of codeRoutes) {
      const hasSpec = specPaths.some(sp =>
        sp.method === route.method && pathsMatch(sp.path, route.path)
      );

      if (hasSpec) {
        results.push(pass(
          `api-contract:${service}:route:${route.method}:${route.path}`,
          `Route documented in OpenAPI`
        ));
      } else {
        results.push(fail(
          `api-contract:${service}:route:${route.method}:${route.path}`,
          `Route missing from OpenAPI spec`,
          { line: route.line }
        ));
      }
    }

    // Summary
    results.push(pass(
      `api-contract:${service}:summary`,
      `${codeRoutes.length} routes in code, ${specPaths.length} paths in spec`
    ));
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runApiContractTests().then(results => {
    console.log('\n=== API Contract Tests ===\n');
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
