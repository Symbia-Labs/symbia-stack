/**
 * No Eval/Dynamic Execution Tests
 *
 * Verifies that code doesn't use dangerous dynamic execution patterns.
 */

import { ITT_CONFIG } from '../../itt.config.js';
import { readFile, getTypeScriptFiles, findMatchesWithLines, pass, fail, type TestResult } from '../../itt.utils.js';

// Dangerous patterns
const DANGEROUS_PATTERNS = [
  { name: 'eval', pattern: /\beval\s*\(/g, reason: 'eval() executes arbitrary code' },
  { name: 'Function', pattern: /new\s+Function\s*\(/g, reason: 'new Function() creates code from strings' },
  { name: 'setTimeout-string', pattern: /setTimeout\s*\(\s*['"`][^'"`]+['"`]/g, reason: 'setTimeout with string executes code' },
  { name: 'setInterval-string', pattern: /setInterval\s*\(\s*['"`][^'"`]+['"`]/g, reason: 'setInterval with string executes code' },
  { name: 'document.write', pattern: /document\.write\s*\(/g, reason: 'document.write can inject scripts' },
  { name: 'innerHTML', pattern: /\.innerHTML\s*=/g, reason: 'innerHTML can inject scripts (use textContent)' },
];

// Patterns that are OK in certain contexts
const ALLOWED_CONTEXTS = [
  /\/\/ safe:/i,
  /\/\/ eslint-disable/,
  /\.test\./,
  /\.spec\./,
  /__tests__/,
];

/**
 * Check if a line is in an allowed context
 */
function isAllowedContext(file: string, line: string): boolean {
  if (file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')) {
    return true;
  }
  return ALLOWED_CONTEXTS.some(pattern => pattern.test(line));
}

/**
 * Run no-eval tests
 */
export async function runNoEvalTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const allDirs = [
    ...ITT_CONFIG.services.map(s => `${s}/server/src`),
    ...ITT_CONFIG.packages.map(p => `${p}/src`),
  ];

  let issuesFound = 0;

  for (const dir of allDirs) {
    const files = getTypeScriptFiles(dir);

    for (const file of files) {
      const content = readFile(file);
      const lines = content.split('\n');

      for (const { name, pattern, reason } of DANGEROUS_PATTERNS) {
        const matches = findMatchesWithLines(content, pattern);

        for (const match of matches) {
          const line = lines[match.line - 1] || '';

          if (isAllowedContext(file, line)) {
            results.push(pass(
              `obfuscation:${file}:${name}:line${match.line}`,
              `${name} found but in allowed context`
            ));
          } else {
            issuesFound++;
            results.push(fail(
              `obfuscation:${file}:${name}:line${match.line}`,
              `${reason}`,
              { line: match.line, code: line.trim().substring(0, 60) }
            ));
          }
        }
      }
    }
  }

  // Summary
  if (issuesFound === 0) {
    results.push(pass('obfuscation:eval:summary', 'No dangerous dynamic execution patterns found'));
  } else {
    results.push(fail('obfuscation:eval:summary', `Found ${issuesFound} dynamic execution issues`));
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runNoEvalTests().then(results => {
    console.log('\n=== No Eval Tests ===\n');

    const failures = results.filter(r => !r.passed);
    for (const result of failures) {
      console.log(`✗ ${result.name}: ${result.message}`);
      if (result.details) {
        console.log(`   ${JSON.stringify(result.details)}`);
      }
    }

    const summary = results.find(r => r.name.includes(':summary'));
    if (summary) {
      console.log(`\n${summary.passed ? '✓' : '✗'} ${summary.message}`);
    }

    process.exit(failures.length > 0 ? 1 : 0);
  });
}
