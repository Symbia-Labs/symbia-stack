/**
 * Complexity Tests
 *
 * Verifies that code complexity stays within acceptable limits.
 */

import { ITT_CONFIG } from '../../itt.config.js';
import { readFile, getTypeScriptFiles, extractFunctions, calculateComplexity, pass, fail, type TestResult } from '../../itt.utils.js';

/**
 * Run complexity tests
 */
export async function runComplexityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const allDirs = [
    ...ITT_CONFIG.services.map(s => `${s}/server/src`),
    ...ITT_CONFIG.packages.map(p => `${p}/src`),
  ];

  let totalFunctions = 0;
  let complexFunctions = 0;
  let longFunctions = 0;

  for (const dir of allDirs) {
    const files = getTypeScriptFiles(dir);

    for (const file of files) {
      const content = readFile(file);
      const functions = extractFunctions(content);

      for (const func of functions) {
        totalFunctions++;
        const complexity = calculateComplexity(func.body);

        // Check cyclomatic complexity
        if (complexity > ITT_CONFIG.thresholds.maxCyclomaticComplexity) {
          complexFunctions++;
          results.push(fail(
            `complexity:${file}:${func.name}:cyclomatic`,
            `Cyclomatic complexity ${complexity} exceeds threshold ${ITT_CONFIG.thresholds.maxCyclomaticComplexity}`,
            { complexity, lines: func.lines }
          ));
        }

        // Check function length
        if (func.lines > ITT_CONFIG.thresholds.maxFunctionLines) {
          longFunctions++;
          results.push(fail(
            `complexity:${file}:${func.name}:length`,
            `Function is ${func.lines} lines (max: ${ITT_CONFIG.thresholds.maxFunctionLines})`,
            { lines: func.lines }
          ));
        }
      }
    }
  }

  // Summary
  results.push(pass(
    'complexity:summary',
    `Analyzed ${totalFunctions} functions: ${complexFunctions} too complex, ${longFunctions} too long`
  ));

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComplexityTests().then(results => {
    console.log('\n=== Complexity Tests ===\n');

    const failures = results.filter(r => !r.passed);
    for (const result of failures) {
      console.log(`✗ ${result.name}: ${result.message}`);
    }

    const summary = results.find(r => r.name === 'complexity:summary');
    if (summary) {
      console.log(`\n${summary.message}`);
    }

    console.log(`\nResults: ${failures.length} issues found`);
    process.exit(failures.length > 0 ? 1 : 0);
  });
}
