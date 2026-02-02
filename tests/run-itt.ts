#!/usr/bin/env npx tsx
/**
 * ITT Test Runner
 *
 * Runs Intentions, Trust, and Transparency tests.
 *
 * Usage:
 *   npx tsx tests/run-itt.ts [category]
 *
 * Categories:
 *   all          - Run all tests (default)
 *   intentions   - Run intent alignment tests
 *   trust        - Run trust tests
 *   transparency - Run transparency tests
 */

import type { TestResult } from './itt.utils.js';

// Import test modules
import { runIntentAlignmentTests } from './intentions/intent-alignment.test.js';
import { runApiContractTests } from './intentions/api-contract.test.js';
import { runAuthEnforcementTests } from './trust/auth-enforcement.test.js';
import { runSecretHandlingTests } from './trust/secret-handling.test.js';
import { runRLSIsolationTests } from './trust/rls-isolation.test.js';
import { runComplexityTests } from './transparency/readability/complexity.test.js';
import { runNamingTests } from './transparency/readability/naming.test.js';
import { runNoEvalTests } from './transparency/obfuscation/no-eval.test.js';
import { runNoEncodedLogicTests } from './transparency/obfuscation/no-encoded-logic.test.js';
import { runCorrelationIdTests } from './transparency/session-telemetry/correlation-ids.test.js';
import { runUserJourneyTests } from './transparency/session-telemetry/user-journey.test.js';

interface TestSuite {
  name: string;
  category: 'intentions' | 'trust' | 'transparency';
  run: () => Promise<TestResult[]>;
}

const TEST_SUITES: TestSuite[] = [
  // Intentions
  { name: 'Intent Alignment', category: 'intentions', run: runIntentAlignmentTests },
  { name: 'API Contract', category: 'intentions', run: runApiContractTests },

  // Trust
  { name: 'Auth Enforcement', category: 'trust', run: runAuthEnforcementTests },
  { name: 'Secret Handling', category: 'trust', run: runSecretHandlingTests },
  { name: 'RLS Isolation', category: 'trust', run: runRLSIsolationTests },

  // Transparency
  { name: 'Complexity', category: 'transparency', run: runComplexityTests },
  { name: 'Naming', category: 'transparency', run: runNamingTests },
  { name: 'No Eval', category: 'transparency', run: runNoEvalTests },
  { name: 'No Encoded Logic', category: 'transparency', run: runNoEncodedLogicTests },
  { name: 'Correlation IDs', category: 'transparency', run: runCorrelationIdTests },
  { name: 'User Journey', category: 'transparency', run: runUserJourneyTests },
];

function printBanner(text: string) {
  const line = '='.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(`${line}\n`);
}

function printSummary(category: string, results: TestResult[]) {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const icon = failed === 0 ? '✓' : '✗';

  console.log(`${icon} ${category}: ${passed} passed, ${failed} failed`);
}

async function runCategory(category: string): Promise<{ passed: number; failed: number }> {
  const suites = category === 'all'
    ? TEST_SUITES
    : TEST_SUITES.filter(s => s.category === category);

  if (suites.length === 0) {
    console.error(`Unknown category: ${category}`);
    console.error('Valid categories: all, intentions, trust, transparency');
    process.exit(1);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    console.log(`\n--- ${suite.name} ---\n`);

    try {
      const results = await suite.run();

      // Print failures only (summaries handled below)
      const failures = results.filter(r => !r.passed && !r.name.includes(':summary'));
      for (const result of failures.slice(0, 10)) {
        console.log(`  ✗ ${result.name}`);
        console.log(`    ${result.message}`);
      }

      if (failures.length > 10) {
        console.log(`  ... and ${failures.length - 10} more failures`);
      }

      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;

      console.log(`\n  Summary: ${passed} passed, ${failed} failed`);

      totalPassed += passed;
      totalFailed += failed;
    } catch (error) {
      console.error(`  Error running ${suite.name}:`, error);
      totalFailed++;
    }
  }

  return { passed: totalPassed, failed: totalFailed };
}

async function main() {
  const category = process.argv[2] || 'all';

  printBanner(`ITT Testing Framework - ${category.toUpperCase()}`);

  console.log('Categories being tested:');
  if (category === 'all' || category === 'intentions') {
    console.log('  📋 Intentions - Does code match documented intent?');
  }
  if (category === 'all' || category === 'trust') {
    console.log('  🔐 Trust - Can the system be trusted?');
  }
  if (category === 'all' || category === 'transparency') {
    console.log('  👁️  Transparency - Can we observe what\'s happening?');
  }

  const { passed, failed } = await runCategory(category);

  printBanner('Final Results');

  console.log(`Total: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Review the issues above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
