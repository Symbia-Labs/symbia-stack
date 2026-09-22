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
export declare function matchGlob(relativePath: string, pattern: string): boolean;
export declare function isPathBlocked(relativePath: string, blockedPaths: string[]): boolean;
export declare function isPathAllowed(relativePath: string, policy: Pick<PathPolicy, "paths" | "blockedPaths">): boolean;
/**
 * Resolve a path safely within a workspace root (sync, no symlink defense).
 * Returns null if the path would escape the workspace.
 */
export declare function resolveSafePath(rootPath: string, targetPath: string): string | null;
/** Get the relative path from workspace root */
export declare function getRelativePath(rootPath: string, absolutePath: string): string;
export interface PathValidationResult {
    valid: boolean;
    absolutePath?: string;
    relativePath?: string;
    error?: string;
}
/** Validate a path for a specific operation (runtime's contract). */
export declare function validatePath(rootPath: string, targetPath: string, operation: "read" | "write" | "execute", permissions: PathPolicy): PathValidationResult;
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
export declare function resolveConfinedPath(rootPath: string, targetPath: string | undefined, policy?: Pick<PathPolicy, "paths" | "blockedPaths">): Promise<string>;
//# sourceMappingURL=index.d.ts.map