/**
 * No Encoded/Hidden Logic Tests
 *
 * Verifies that code doesn't hide logic in encoded strings.
 */

import { ITT_CONFIG } from '../../itt.config.js';
import { readFile, getTypeScriptFiles, findMatchesWithLines, pass, fail, type TestResult } from '../../itt.utils.js';

// Patterns indicating encoded/hidden logic
const ENCODED_PATTERNS = [
  { name: 'base64-decode', pattern: /atob\s*\(/g, reason: 'atob() decodes base64 - may hide code' },
  { name: 'base64-encode', pattern: /btoa\s*\(/g, reason: 'btoa() encodes to base64 - may hide data' },
  { name: 'hex-escape', pattern: /['"`].*\\x[0-9a-f]{2}.*['"`]/gi, reason: 'Hex escapes may hide content' },
  { name: 'unicode-escape', pattern: /['"`].*\\u[0-9a-f]{4}.*['"`]/gi, reason: 'Unicode escapes may hide content' },
  { name: 'base64-string', pattern: /['"`][A-Za-z0-9+/]{50,}={0,2}['"`]/g, reason: 'Long base64-looking string' },
  { name: 'char-code', pattern: /String\.fromCharCode\s*\([^)]+\)/g, reason: 'fromCharCode may construct hidden strings' },
];

// Known safe patterns
const SAFE_PATTERNS = [
  /test/i,
  /mock/i,
  /fixture/i,
  /\.svg/,
  /\.png/,
  /\.jpg/,
  /data:image/,
  /jwt/i,
  /token/i,
];

/**
 * Check if a match is likely safe
 */
function isLikelySafe(match: string, line: string): boolean {
  return SAFE_PATTERNS.some(pattern => pattern.test(line) || pattern.test(match));
}

/**
 * Run no-encoded-logic tests
 */
export async function runNoEncodedLogicTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const allDirs = [
    ...ITT_CONFIG.services.map(s => `${s}/server/src`),
    ...ITT_CONFIG.packages.map(p => `${p}/src`),
  ];

  let issuesFound = 0;
  let filesClean = 0;

  for (const dir of allDirs) {
    const files = getTypeScriptFiles(dir);

    for (const file of files) {
      const content = readFile(file);
      const lines = content.split('\n');
      let fileHasIssues = false;

      for (const { name, pattern, reason } of ENCODED_PATTERNS) {
        const matches = findMatchesWithLines(content, pattern);

        for (const match of matches) {
          const line = lines[match.line - 1] || '';

          if (isLikelySafe(match.match, line)) {
            continue; // Skip safe patterns
          }

          fileHasIssues = true;
          issuesFound++;
          results.push(fail(
            `obfuscation:${file}:${name}:line${match.line}`,
            reason,
            { line: match.line, sample: match.match.substring(0, 40) }
          ));
        }
      }

      if (!fileHasIssues) {
        filesClean++;
      }
    }
  }

  // Summary
  if (issuesFound === 0) {
    results.push(pass('obfuscation:encoded:summary', `All ${filesClean} files are clean of encoded logic`));
  } else {
    results.push(fail('obfuscation:encoded:summary', `Found ${issuesFound} encoded logic issues`));
  }

  return results;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runNoEncodedLogicTests().then(results => {
    console.log('\n=== No Encoded Logic Tests ===\n');

    const failures = results.filter(r => !r.passed);
    for (const result of failures) {
      console.log(`✗ ${result.name}: ${result.message}`);
    }

    const summary = results.find(r => r.name.includes(':summary'));
    if (summary) {
      console.log(`\n${summary.passed ? '✓' : '✗'} ${summary.message}`);
    }

    process.exit(failures.length > 0 ? 1 : 0);
  });
}
