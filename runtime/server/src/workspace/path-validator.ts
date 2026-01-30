/**
 * Path Validator
 *
 * Security utilities for validating file paths within workspaces.
 */

import * as path from 'path';
import type { CodePermissions } from '../types/code-tools.js';

/**
 * Resolve a path safely within a workspace root.
 * Returns null if the path would escape the workspace.
 */
export function resolveSafePath(rootPath: string, targetPath: string): string | null {
  // Normalize both paths
  const normalizedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(rootPath, targetPath);

  // Check if resolved path is within root
  if (!resolvedTarget.startsWith(normalizedRoot + path.sep) && resolvedTarget !== normalizedRoot) {
    return null;
  }

  return resolvedTarget;
}

/**
 * Get the relative path from workspace root
 */
export function getRelativePath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath);
}

/**
 * Check if a path matches any of the blocked patterns
 */
export function isPathBlocked(relativePath: string, blockedPaths: string[]): boolean {
  for (const pattern of blockedPaths) {
    if (matchGlob(relativePath, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path is allowed by the permissions
 */
export function isPathAllowed(relativePath: string, permissions: CodePermissions): boolean {
  // First check if blocked
  if (isPathBlocked(relativePath, permissions.blockedPaths)) {
    return false;
  }

  // Then check if it matches any allowed pattern
  if (permissions.paths.length === 0) {
    return true; // No restrictions
  }

  for (const pattern of permissions.paths) {
    if (matchGlob(relativePath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob matching (supports * and **)
 */
export function matchGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')  // Temporarily replace **
    .replace(/\*/g, '[^/]*')            // * matches anything except /
    .replace(/\?/g, '[^/]')             // ? matches single char except /
    .replace(/{{GLOBSTAR}}/g, '.*');    // ** matches anything including /

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Validate a path for a specific operation
 */
export interface PathValidationResult {
  valid: boolean;
  absolutePath?: string;
  relativePath?: string;
  error?: string;
}

export function validatePath(
  rootPath: string,
  targetPath: string,
  operation: 'read' | 'write' | 'execute',
  permissions: CodePermissions
): PathValidationResult {
  // Check operation permission
  if (!permissions[operation]) {
    return {
      valid: false,
      error: `Operation '${operation}' is not permitted in this workspace`,
    };
  }

  // Resolve safe path
  const absolutePath = resolveSafePath(rootPath, targetPath);
  if (!absolutePath) {
    return {
      valid: false,
      error: 'Path escapes workspace root',
    };
  }

  const relativePath = getRelativePath(rootPath, absolutePath);

  // Check path permissions
  if (!isPathAllowed(relativePath, permissions)) {
    return {
      valid: false,
      error: `Path '${relativePath}' is not allowed by workspace permissions`,
    };
  }

  return {
    valid: true,
    absolutePath,
    relativePath,
  };
}
