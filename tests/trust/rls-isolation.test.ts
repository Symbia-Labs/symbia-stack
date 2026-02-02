/**
 * RLS Isolation Tests
 *
 * Verifies that Row Level Security is properly configured.
 */

import { ITT_CONFIG } from '../itt.config.js';
import { readFile, fileExists, getTypeScriptFiles, pass, fail, type TestResult } from '../itt.utils.js';

/**
 * Check if a service uses RLS
 */
function checkRLSUsage(dir: string): { usesRLS: boolean; hasSetContext: boolean; hasPolicies: boolean } {
  const files = getTypeScriptFiles(dir);
  let usesRLS = false;
  let hasSetContext = false;
  let hasPolicies = false;

  for (const file of files) {
    const content = readFile(file);

    // Check for RLS imports
    if (content.includes('setRLSContext') || content.includes('@symbia/db')) {
      usesRLS = true;
    }

    // Check for setRLSContext usage
    if (content.includes('setRLSContext(')) {
      hasSetContext = true;
    }

    // Check for policy definitions
    if (content.includes('CREATE POLICY') || content.includes('rls_policy')) {
      hasPolicies = true;
    }
  }

  // Also check migrations for RLS policies
  const migrationsDir = dir.replace('/src', '/migrations');
  if (fileExists(migrationsDir)) {
    const migrationFiles = getTypeScriptFiles(migrationsDir.replace('/server', ''));
    for (const file of migrationFiles) {
      const content = readFile(file);
      if (content.includes('CREATE POLICY') || content.includes('ENABLE ROW LEVEL SECURITY')) {
        hasPolicies = true;
      }
    }
  }

  return { usesRLS, hasSetContext, hasPolicies };
}

/**
 * Check database queries include org context
 */
function checkQueriesHaveOrgContext(content: string): Array<{ line: number; query: string }> {
  const issues: Array<{ line: number; query: string }> = [];
  const lines = content.split('\n');

  // Look for SQL queries without org_id filter
  const queryPatterns = [
    /\.query\s*\(\s*['"`]SELECT/i,
    /\.execute\s*\(\s*['"`]SELECT/i,
    /db\.select\s*\(/,
  ];

  lines.forEach((line, index) => {
    for (const pattern of queryPatterns) {
      if (pattern.test(line)) {
        // Check if the query context includes org filtering
        const contextLines = lines.slice(index, index + 5).join(' ');
        if (!contextLines.includes('org_id') && !contextLines.includes('orgId')) {
          // Could be a table without org scope - check if it's likely org-scoped
          if (contextLines.includes('FROM') && !contextLines.includes('system_') && !contextLines.includes('public.')) {
            issues.push({
              line: index + 1,
              query: line.trim().substring(0, 80),
            });
          }
        }
      }
    }
  });

  return issues;
}

/**
 * Run RLS isolation tests
 */
export async function runRLSIsolationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Services that should have RLS (have databases)
  const dbServices = ['catalog', 'logging', 'messaging', 'assistants', 'integrations'];

  for (const service of ITT_CONFIG.services) {
    const serverDir = `${service}/server/src`;

    if (!dbServices.includes(service)) {
      results.push(pass(`rls:${service}:na`, `Service does not use database`));
      continue;
    }

    // Check RLS usage
    const { usesRLS, hasSetContext, hasPolicies } = checkRLSUsage(serverDir);

    if (usesRLS) {
      results.push(pass(`rls:${service}:imports`, `Uses @symbia/db RLS utilities`));
    } else {
      results.push(fail(`rls:${service}:imports`, `Does not import RLS utilities`));
    }

    if (hasSetContext) {
      results.push(pass(`rls:${service}:context`, `Sets RLS context on requests`));
    } else {
      results.push(fail(`rls:${service}:context`, `Missing setRLSContext call`));
    }

    // Check for migration files with RLS policies
    const migrationPath = `${service}/server/migrations`;
    if (fileExists(migrationPath)) {
      results.push(pass(`rls:${service}:migrations`, `Has migrations directory`));

      // Check for RLS policy file
      const rlsFile = `${migrationPath}/0001_rls_policies.sql`;
      if (fileExists(rlsFile)) {
        results.push(pass(`rls:${service}:policies`, `Has RLS policy migration`));
      } else {
        results.push(fail(`rls:${service}:policies`, `Missing RLS policy migration`));
      }
    } else {
      results.push(fail(`rls:${service}:migrations`, `No migrations directory`));
    }

    // Check auth middleware sets RLS context
    const authPath = `${service}/server/src/auth.ts`;
    if (fileExists(authPath)) {
      const authContent = readFile(authPath);
      if (authContent.includes('setRLSContext')) {
        results.push(pass(`rls:${service}:auth-integration`, `Auth middleware sets RLS context`));
      } else {
        results.push(fail(`rls:${service}:auth-integration`, `Auth middleware does not set RLS context`));
      }
    }
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRLSIsolationTests().then(results => {
    console.log('\n=== RLS Isolation Tests ===\n');
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
