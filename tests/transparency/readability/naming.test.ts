/**
 * Naming Convention Tests
 *
 * Verifies that code follows consistent naming conventions.
 */

import { ITT_CONFIG } from '../../itt.config.js';
import { readFile, getTypeScriptFiles, findMatchesWithLines, pass, fail, type TestResult } from '../../itt.utils.js';

// Naming conventions
const CONVENTIONS = {
  // Variables and functions should be camelCase
  camelCase: /^[a-z][a-zA-Z0-9]*$/,

  // Constants should be UPPER_SNAKE_CASE or camelCase
  constant: /^([A-Z][A-Z0-9_]*|[a-z][a-zA-Z0-9]*)$/,

  // Types and classes should be PascalCase
  pascalCase: /^[A-Z][a-zA-Z0-9]*$/,

  // File names should be kebab-case or camelCase
  fileName: /^[a-z][a-z0-9-]*(\.[a-z]+)?$/,
};

// Patterns to extract declarations
const PATTERNS = {
  variable: /(?:const|let|var)\s+(\w+)\s*[:=]/g,
  function: /(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>)/g,
  type: /(?:type|interface|class|enum)\s+(\w+)/g,
  constant: /const\s+([A-Z_][A-Z0-9_]*)\s*=/g,
};

/**
 * Check naming convention violations
 */
function checkNamingViolations(content: string, file: string): TestResult[] {
  const results: TestResult[] = [];
  const lines = content.split('\n');

  // Check variable names
  let match;
  while ((match = PATTERNS.variable.exec(content)) !== null) {
    const name = match[1];
    // Skip if it looks like a constant or destructuring
    if (name === name.toUpperCase() || name.startsWith('_')) continue;

    if (!CONVENTIONS.camelCase.test(name)) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      results.push(fail(
        `naming:${file}:variable:${name}`,
        `Variable "${name}" should be camelCase`,
        { line: lineNum }
      ));
    }
  }

  // Check type names
  PATTERNS.type.lastIndex = 0;
  while ((match = PATTERNS.type.exec(content)) !== null) {
    const name = match[1];
    if (!CONVENTIONS.pascalCase.test(name)) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      results.push(fail(
        `naming:${file}:type:${name}`,
        `Type "${name}" should be PascalCase`,
        { line: lineNum }
      ));
    }
  }

  return results;
}

/**
 * Check file naming conventions
 */
function checkFileNames(files: string[]): TestResult[] {
  const results: TestResult[] = [];

  for (const file of files) {
    const fileName = file.split('/').pop() || '';
    const baseName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');

    // Allow index, types, config, etc.
    const exceptions = ['index', 'types', 'config', 'utils', 'helpers', 'constants'];
    if (exceptions.includes(baseName)) continue;

    // Check kebab-case (preferred) or camelCase
    const isKebab = /^[a-z][a-z0-9-]*$/.test(baseName);
    const isCamel = /^[a-z][a-zA-Z0-9]*$/.test(baseName);
    const isDotNotation = /^[a-z][a-z0-9-]*\.[a-z]+$/.test(baseName); // e.g., auth.test

    if (!isKebab && !isCamel && !isDotNotation) {
      results.push(fail(
        `naming:file:${file}`,
        `File "${fileName}" should be kebab-case or camelCase`
      ));
    }
  }

  return results;
}

/**
 * Run naming tests
 */
export async function runNamingTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const allDirs = [
    ...ITT_CONFIG.services.map(s => `${s}/server/src`),
    ...ITT_CONFIG.packages.map(p => `${p}/src`),
  ];

  let filesChecked = 0;

  for (const dir of allDirs) {
    const files = getTypeScriptFiles(dir);
    filesChecked += files.length;

    // Check file names
    results.push(...checkFileNames(files));

    // Check code naming
    for (const file of files) {
      const content = readFile(file);
      results.push(...checkNamingViolations(content, file));
    }
  }

  // Summary
  const failures = results.filter(r => !r.passed);
  results.push(pass(
    'naming:summary',
    `Checked ${filesChecked} files, found ${failures.length} naming issues`
  ));

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runNamingTests().then(results => {
    console.log('\n=== Naming Convention Tests ===\n');

    const failures = results.filter(r => !r.passed && !r.name.includes(':summary'));
    for (const result of failures.slice(0, 20)) {
      console.log(`✗ ${result.name}: ${result.message}`);
    }

    if (failures.length > 20) {
      console.log(`... and ${failures.length - 20} more`);
    }

    const summary = results.find(r => r.name === 'naming:summary');
    if (summary) {
      console.log(`\n${summary.message}`);
    }

    process.exit(failures.length > 0 ? 1 : 0);
  });
}
