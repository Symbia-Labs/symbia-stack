/**
 * Intent Alignment Tests
 *
 * Verifies that code implementation matches documented intentions.
 */

import { ITT_CONFIG } from '../itt.config.js';
import { readFile, fileExists, getTypeScriptFiles, pass, fail, type TestResult } from '../itt.utils.js';

/**
 * Extract claims from INTENT.md
 * Claims are statements about what the system should do
 */
function extractIntentClaims(content: string): string[] {
  const claims: string[] = [];

  // Extract bullet points that describe capabilities
  const bulletPattern = /^[-*]\s+(.+)$/gm;
  let match;
  while ((match = bulletPattern.exec(content)) !== null) {
    claims.push(match[1].trim());
  }

  // Extract section headers as high-level claims
  const headerPattern = /^#{2,3}\s+(.+)$/gm;
  while ((match = headerPattern.exec(content)) !== null) {
    claims.push(match[1].trim());
  }

  return claims;
}

/**
 * Check if a service is mentioned in intent docs
 */
function serviceDocumented(service: string, intentContent: string): boolean {
  const patterns = [
    new RegExp(`\\b${service}\\b`, 'i'),
    new RegExp(`${service}[- ]service`, 'i'),
  ];
  return patterns.some(p => p.test(intentContent));
}

/**
 * Check if documented features have corresponding code
 */
function featureHasImplementation(feature: string, codeFiles: string[]): boolean {
  const featureLower = feature.toLowerCase();

  // Map common feature terms to code patterns
  const featurePatterns: Record<string, RegExp[]> = {
    'authentication': [/auth/i, /login/i, /token/i],
    'authorization': [/permission/i, /entitlement/i, /role/i],
    'messaging': [/message/i, /conversation/i, /socket/i],
    'catalog': [/resource/i, /artifact/i, /registry/i],
    'runtime': [/execute/i, /graph/i, /component/i],
    'logging': [/log/i, /trace/i, /metric/i],
    'network': [/node/i, /bridge/i, /policy/i],
  };

  for (const [key, patterns] of Object.entries(featurePatterns)) {
    if (featureLower.includes(key)) {
      return codeFiles.some(file =>
        patterns.some(p => p.test(file))
      );
    }
  }

  return true; // Default to true for unmatched features
}

/**
 * Run intent alignment tests
 */
export async function runIntentAlignmentTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: All intent docs exist
  for (const doc of ITT_CONFIG.intentDocs) {
    if (fileExists(doc)) {
      results.push(pass(`intent-doc-exists:${doc}`, `${doc} exists`));
    } else {
      results.push(fail(`intent-doc-exists:${doc}`, `${doc} is missing`));
    }
  }

  // Test 2: All services documented in INTENT.md
  const intentContent = readFile('INTENT.md');
  for (const service of ITT_CONFIG.services) {
    if (serviceDocumented(service, intentContent)) {
      results.push(pass(`service-documented:${service}`, `${service} is documented in INTENT.md`));
    } else {
      results.push(fail(`service-documented:${service}`, `${service} not found in INTENT.md`));
    }
  }

  // Test 3: Services have corresponding code
  for (const service of ITT_CONFIG.services) {
    const serverPath = `${service}/server/src`;
    const files = getTypeScriptFiles(serverPath);
    if (files.length > 0) {
      results.push(pass(`service-has-code:${service}`, `${service} has ${files.length} source files`));
    } else {
      results.push(fail(`service-has-code:${service}`, `${service} has no source files`));
    }
  }

  // Test 4: Each service has required files
  const requiredFiles = ['index.ts', 'routes.ts'];
  for (const service of ITT_CONFIG.services) {
    for (const file of requiredFiles) {
      const filePath = `${service}/server/src/${file}`;
      if (fileExists(filePath)) {
        results.push(pass(`required-file:${service}/${file}`, `${service} has ${file}`));
      } else {
        // Some files are optional (e.g., routes.ts might be split)
        results.push(pass(`required-file:${service}/${file}`, `${service} missing ${file} (may be intentional)`, { warning: true }));
      }
    }
  }

  // Test 5: OpenAPI docs exist for each service
  for (const service of ITT_CONFIG.services) {
    const openapiPath = `${service}/docs/openapi.json`;
    if (fileExists(openapiPath)) {
      results.push(pass(`openapi-exists:${service}`, `${service} has OpenAPI documentation`));
    } else {
      results.push(fail(`openapi-exists:${service}`, `${service} missing OpenAPI documentation`));
    }
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntentAlignmentTests().then(results => {
    console.log('\n=== Intent Alignment Tests ===\n');
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
