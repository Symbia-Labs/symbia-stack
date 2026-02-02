/**
 * Secret Handling Tests
 *
 * Verifies that secrets are not hardcoded or exposed.
 */

import { ITT_CONFIG } from '../itt.config.js';
import { readFile, getTypeScriptFiles, findMatchesWithLines, pass, fail, type TestResult } from '../itt.utils.js';

// Patterns that indicate hardcoded secrets
const SECRET_PATTERNS = [
  { name: 'password', pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/gi },
  { name: 'api_key', pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{16,}['"]/gi },
  { name: 'secret', pattern: /secret\s*[:=]\s*['"][^'"]{8,}['"]/gi },
  { name: 'token', pattern: /token\s*[:=]\s*['"][^'"]{20,}['"]/gi },
  { name: 'private_key', pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi },
  { name: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
];

// Patterns that are OK (not secrets)
const SAFE_PATTERNS = [
  /process\.env\./,
  /config\./,
  /example/i,
  /placeholder/i,
  /test/i,
  /mock/i,
  /fake/i,
  /dummy/i,
  /''/,
  /""/,
  /\$\{/,  // Template literals with variables
];

/**
 * Check if a match is likely a false positive
 */
function isSafeMatch(line: string): boolean {
  return SAFE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Check for secrets being logged
 */
function checkLoggingSecrets(content: string): Array<{ line: number; issue: string }> {
  const issues: Array<{ line: number; issue: string }> = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Check for console.log with sensitive-looking variables
    if (/console\.(log|info|debug|warn|error)\s*\(/.test(line)) {
      const sensitiveVars = ['password', 'secret', 'token', 'apiKey', 'key', 'credential'];
      for (const varName of sensitiveVars) {
        if (new RegExp(`\\b${varName}\\b`, 'i').test(line)) {
          issues.push({
            line: index + 1,
            issue: `Potentially logging sensitive variable: ${varName}`,
          });
        }
      }
    }
  });

  return issues;
}

/**
 * Run secret handling tests
 */
export async function runSecretHandlingTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test all services and packages
  const allDirs = [
    ...ITT_CONFIG.services.map(s => `${s}/server/src`),
    ...ITT_CONFIG.packages.map(p => `${p}/src`),
  ];

  for (const dir of allDirs) {
    const files = getTypeScriptFiles(dir);

    for (const file of files) {
      const content = readFile(file);
      let fileHasIssues = false;

      // Check for hardcoded secrets
      for (const { name, pattern } of SECRET_PATTERNS) {
        const matches = findMatchesWithLines(content, pattern);
        const realMatches = matches.filter(m => !isSafeMatch(m.match));

        if (realMatches.length > 0) {
          fileHasIssues = true;
          for (const match of realMatches) {
            results.push(fail(
              `secrets:${file}:${name}:line${match.line}`,
              `Potential hardcoded ${name}`,
              { line: match.line, match: match.match.substring(0, 50) + '...' }
            ));
          }
        }
      }

      // Check for secrets in logs
      const loggingIssues = checkLoggingSecrets(content);
      for (const issue of loggingIssues) {
        results.push(fail(
          `secrets:${file}:logging:line${issue.line}`,
          issue.issue,
          { line: issue.line }
        ));
        fileHasIssues = true;
      }

      if (!fileHasIssues) {
        results.push(pass(`secrets:${file}`, `No hardcoded secrets detected`));
      }
    }
  }

  // Summary
  const failures = results.filter(r => !r.passed);
  if (failures.length === 0) {
    results.push(pass('secrets:summary', 'No hardcoded secrets found in codebase'));
  } else {
    results.push(fail('secrets:summary', `Found ${failures.length} potential secret issues`));
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSecretHandlingTests().then(results => {
    console.log('\n=== Secret Handling Tests ===\n');
    let passed = 0;
    let failed = 0;

    for (const result of results) {
      if (!result.passed) {
        console.log(`✗ ${result.name}: ${result.message}`);
        failed++;
      } else if (!result.name.endsWith(':summary')) {
        passed++;
      }
    }

    // Show summary
    const summary = results.find(r => r.name === 'secrets:summary');
    if (summary) {
      console.log(`\n${summary.passed ? '✓' : '✗'} ${summary.message}`);
    }

    console.log(`\nResults: ${passed} files clean, ${failed} issues found`);
    process.exit(failed > 0 ? 1 : 0);
  });
}
