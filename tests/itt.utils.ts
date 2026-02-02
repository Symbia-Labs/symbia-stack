/**
 * ITT Testing Utilities
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { ITT_CONFIG } from './itt.config.js';

const ROOT_DIR = join(import.meta.dirname, '..');

/**
 * Get all TypeScript files in a directory recursively
 */
export function getTypeScriptFiles(dir: string, exclude: string[] = ['node_modules', 'dist', '.test.', '.spec.']): string[] {
  const files: string[] = [];
  const fullPath = join(ROOT_DIR, dir);

  if (!existsSync(fullPath)) return files;

  function walk(currentPath: string) {
    const entries = readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      const relativePath = relative(ROOT_DIR, entryPath);

      if (exclude.some(ex => relativePath.includes(ex))) continue;

      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(relativePath);
      }
    }
  }

  walk(fullPath);
  return files;
}

/**
 * Read file contents
 */
export function readFile(relativePath: string): string {
  const fullPath = join(ROOT_DIR, relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8');
}

/**
 * Check if file exists
 */
export function fileExists(relativePath: string): boolean {
  return existsSync(join(ROOT_DIR, relativePath));
}

/**
 * Count pattern matches in content
 */
export function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(new RegExp(pattern, 'g'));
  return matches?.length ?? 0;
}

/**
 * Find all matches with line numbers
 */
export function findMatchesWithLines(content: string, pattern: RegExp): Array<{ line: number; match: string }> {
  const lines = content.split('\n');
  const results: Array<{ line: number; match: string }> = [];

  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (match) {
      results.push({ line: index + 1, match: match[0] });
    }
  });

  return results;
}

/**
 * Calculate cyclomatic complexity (simplified)
 * Counts decision points: if, else, for, while, case, catch, &&, ||, ?:
 */
export function calculateComplexity(content: string): number {
  const decisionPoints = [
    /\bif\s*\(/g,
    /\belse\b/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bcase\s+/g,
    /\bcatch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?[^:]+:/g,
  ];

  let complexity = 1; // Base complexity
  for (const pattern of decisionPoints) {
    complexity += countMatches(content, pattern);
  }
  return complexity;
}

/**
 * Extract function bodies from TypeScript
 */
export function extractFunctions(content: string): Array<{ name: string; body: string; lines: number }> {
  const functions: Array<{ name: string; body: string; lines: number }> = [];

  // Match function declarations and arrow functions
  const funcPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>\s*\{/g,
    /(\w+)\s*:\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>\s*\{/g,
  ];

  for (const pattern of funcPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const startIndex = match.index + match[0].length - 1;
      const body = extractBracedBlock(content, startIndex);
      if (body) {
        functions.push({
          name,
          body,
          lines: body.split('\n').length,
        });
      }
    }
  }

  return functions;
}

/**
 * Extract content within braces, handling nesting
 */
function extractBracedBlock(content: string, startIndex: number): string | null {
  if (content[startIndex] !== '{') return null;

  let depth = 1;
  let i = startIndex + 1;

  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') depth--;
    i++;
  }

  return content.slice(startIndex, i);
}

/**
 * Check if a route handler has auth middleware
 */
export function hasAuthMiddleware(routeDefinition: string): boolean {
  return ITT_CONFIG.thresholds.requiredAuthMiddleware.some(mw => routeDefinition.includes(mw));
}

/**
 * Extract route definitions from a routes file
 */
export function extractRoutes(content: string): Array<{ method: string; path: string; hasAuth: boolean; line: number }> {
  const routes: Array<{ method: string; path: string; hasAuth: boolean; line: number }> = [];
  const lines = content.split('\n');

  const routePattern = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i;

  lines.forEach((line, index) => {
    const match = line.match(routePattern);
    if (match) {
      // Look ahead a few lines for the full route definition
      const contextLines = lines.slice(index, index + 5).join('\n');
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        hasAuth: hasAuthMiddleware(contextLines),
        line: index + 1,
      });
    }
  });

  return routes;
}

/**
 * Test result structure
 */
export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

/**
 * Create a passing test result
 */
export function pass(name: string, message: string, details?: unknown): TestResult {
  return { name, passed: true, message, details };
}

/**
 * Create a failing test result
 */
export function fail(name: string, message: string, details?: unknown): TestResult {
  return { name, passed: false, message, details };
}
