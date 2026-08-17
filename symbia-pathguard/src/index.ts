/**
 * @symbia/pathguard — the one path validator.
 *
 * History (13 Aug 2026): the runtime service had a correct validator
 * (`runtime/server/src/workspace/path-validator.ts`), the assistants engine
 * reimplemented the same concern without the validation, and the A1 fix then
 * added a third, hardened copy inline. Three implementations of one security
 * concern is the forked-concern defect this codebase keeps naming — a fix to
 * one silently does not reach the others. This package is now the single
 * home; runtime re-exports it and assistants imports it. Do not add a copy.
 *
 * Two resolution APIs, both sep-boundary safe:
 * - `resolveSafePath` — sync, returns null on escape (runtime's contract)
 * - `resolveConfinedPath` — async, throws on violation, adds symlink defense
 *   (realpath of the closest existing ancestor re-checked against the
 *   realpath'd root) and enforces blockedPaths/paths globs
 *
 * Glob semantics: `**` matches across separators, and a leading `**\/`
 * also matches ZERO segments — `**\/*` matches `file.txt` at the root.
 * (The pre-consolidation runtime copy required at least one segment, so
 * root-level files slipped past `**\/.env*`-style blocks. Merged as fixed.)
 */

import * as path from "path";
import * as fsp from "fs/promises";

/** Structural path policy — matches runtime's CodePermissions and the assistants workspace permissions. */
export interface PathPolicy {
  read?: boolean;
  write?: boolean;
  execute?: boolean;
  /** Allowed path globs; empty array = no restriction. */
  paths: string[];
  /** Blocked path globs; always win over `paths`. */
  blockedPaths: string[];
}

/** Glob matcher over workspace-relative paths (supports **, *, ?). */
export function matchGlob(relativePath: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = escaped
    .replace(/\*\*\//g, "\u0001")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*\\/)?")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${regex}$`).test(relativePath);
}

export function isPathBlocked(relativePath: string, blockedPaths: string[]): boolean {
  return blockedPaths.some((p) => matchGlob(relativePath, p));
}

export function isPathAllowed(relativePath: string, policy: Pick<PathPolicy, "paths" | "blockedPaths">): boolean {
  if (isPathBlocked(relativePath, policy.blockedPaths)) return false;
  if (policy.paths.length === 0) return true;
  return policy.paths.some((p) => matchGlob(relativePath, p));
}

/**
 * Resolve a path safely within a workspace root (sync, no symlink defense).
 * Returns null if the path would escape the workspace.
 */
export function resolveSafePath(rootPath: string, targetPath: string): string | null {
  const normalizedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(rootPath, targetPath);
  if (!resolvedTarget.startsWith(normalizedRoot + path.sep) && resolvedTarget !== normalizedRoot) {
    return null;
  }
  return resolvedTarget;
}

/** Get the relative path from workspace root */
export function getRelativePath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath);
}

export interface PathValidationResult {
  valid: boolean;
  absolutePath?: string;
  relativePath?: string;
  error?: string;
}

/** Validate a path for a specific operation (runtime's contract). */
export function validatePath(
  rootPath: string,
  targetPath: string,
  operation: "read" | "write" | "execute",
  permissions: PathPolicy
): PathValidationResult {
  if (!permissions[operation]) {
    return {
      valid: false,
      error: `Operation '${operation}' is not permitted in this workspace`,
    };
  }

  const absolutePath = resolveSafePath(rootPath, targetPath);
  if (!absolutePath) {
    return {
      valid: false,
      error: "Path escapes workspace root",
    };
  }

  const relativePath = getRelativePath(rootPath, absolutePath);

  if (!isPathAllowed(relativePath, permissions)) {
    return {
      valid: false,
      error: `Path '${relativePath}' is not allowed by workspace permissions`,
    };
  }

  return { valid: true, absolutePath, relativePath };
}

/**
 * Resolve a target path safely inside a workspace root, with symlink defense
 * and policy enforcement. Throws on any violation; returns the resolved
 * absolute path.
 *
 * - path.sep-boundary containment (a sibling directory sharing the root as a
 *   string prefix does not pass)
 * - symlink defense: the closest existing ancestor is realpath'd and the
 *   result re-checked against the realpath'd root
 * - blockedPaths / paths glob enforcement on the workspace-relative path
 */
export async function resolveConfinedPath(
  rootPath: string,
  targetPath: string | undefined,
  policy?: Pick<PathPolicy, "paths" | "blockedPaths">
): Promise<string> {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(root, targetPath ?? ".");

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Path escapes workspace");
  }

  // Symlink defense: realpath the closest existing ancestor, re-check.
  const realRoot = await fsp.realpath(root);
  let existing = resolved;
  for (;;) {
    try {
      const real = await fsp.realpath(existing);
      const remainder = path.relative(existing, resolved);
      const realResolved = remainder ? path.join(real, remainder) : real;
      if (realResolved !== realRoot && !realResolved.startsWith(realRoot + path.sep)) {
        throw new Error("Path escapes workspace (symlink)");
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        const parent = path.dirname(existing);
        if (parent === existing) break;
        existing = parent;
        continue;
      }
      throw err;
    }
  }

  if (policy) {
    const rel = path.relative(root, resolved);
    if (rel) {
      if (isPathBlocked(rel, policy.blockedPaths)) {
        throw new Error(`Path is blocked by workspace policy: ${rel}`);
      }
      if (!isPathAllowed(rel, policy)) {
        throw new Error(`Path is not in the workspace's allowed paths: ${rel}`);
      }
    }
  }

  return resolved;
}
