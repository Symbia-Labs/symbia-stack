/**
 * Code Tool Invoke Action
 *
 * Action handler for invoking code tools (file operations, bash, search).
 *
 * SECURITY (13 Aug 2026 — see STATUS.md and docs/2026-08-13-adversarial-analysis.md):
 * This is NOT a sandbox. Commands and file operations run as the service
 * process with its environment. The controls here (env-flag gating, workspace
 * confinement with symlink-aware path resolution, blocked-path globs, no
 * caller-supplied roots or permission escalation) are an interim floor.
 * Real isolation (container/gVisor per workspace) is required before this is
 * enabled anywhere untrusted.
 *
 * Registration is gated: handlers are only wired when
 * ASSISTANTS_ENABLE_CODE_TOOLS=true. Bash additionally requires
 * ASSISTANTS_CODE_TOOLS_ALLOW_BASH=true.
 *
 * Inspired by OpenCode (https://github.com/opencode-ai/opencode)
 * OpenCode is licensed under the MIT License
 */

import * as nodePath from 'path';
import * as fsp from 'fs/promises';
import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';

/** Code tools are off unless explicitly enabled. */
export const CODE_TOOLS_ENABLED = process.env.ASSISTANTS_ENABLE_CODE_TOOLS === 'true';
/** Bash execution requires its own explicit opt-in on top of the above. */
const BASH_ENABLED = process.env.ASSISTANTS_CODE_TOOLS_ALLOW_BASH === 'true';

const DEFAULT_BLOCKED_PATHS = ['**/.env*', '.env*', '**/secrets/**', 'secrets/**'];

/** Glob matcher over workspace-relative paths (supports **, *, ?). */
function matchPathGlob(str: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '(?:.*\/)?')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${regex}$`).test(str);
}

function isPathBlocked(relativePath: string, blockedPaths: string[]): boolean {
  return blockedPaths.some((p) => matchPathGlob(relativePath, p));
}

function isPathAllowedByPatterns(relativePath: string, paths: string[]): boolean {
  if (paths.length === 0) return true;
  return paths.some((p) => matchPathGlob(relativePath, p));
}

/**
 * Resolve a target path safely inside a workspace.
 *
 * - path.sep-boundary containment (a sibling directory sharing the root as a
 *   string prefix does not pass)
 * - symlink defense: the closest existing ancestor is realpath'd and the
 *   result re-checked against the realpath'd root
 * - blockedPaths / paths glob enforcement on the workspace-relative path
 *
 * Throws on any violation; returns the resolved absolute path.
 */
async function resolveSafePath(workspace: WorkspaceContext, targetPath: string | undefined): Promise<string> {
  const root = nodePath.resolve(workspace.rootPath);
  const resolved = nodePath.resolve(root, targetPath ?? '.');

  if (resolved !== root && !resolved.startsWith(root + nodePath.sep)) {
    throw new Error('Path escapes workspace');
  }

  // Symlink defense: realpath the closest existing ancestor, re-check.
  const realRoot = await fsp.realpath(root);
  let existing = resolved;
  for (;;) {
    try {
      const real = await fsp.realpath(existing);
      const remainder = nodePath.relative(existing, resolved);
      const realResolved = remainder ? nodePath.join(real, remainder) : real;
      if (realResolved !== realRoot && !realResolved.startsWith(realRoot + nodePath.sep)) {
        throw new Error('Path escapes workspace (symlink)');
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        const parent = nodePath.dirname(existing);
        if (parent === existing) break;
        existing = parent;
        continue;
      }
      throw err;
    }
  }

  const rel = nodePath.relative(root, resolved);
  if (rel) {
    if (isPathBlocked(rel, workspace.permissions.blockedPaths)) {
      throw new Error(`Path is blocked by workspace policy: ${rel}`);
    }
    if (!isPathAllowedByPatterns(rel, workspace.permissions.paths)) {
      throw new Error(`Path is not in the workspace's allowed paths: ${rel}`);
    }
  }
  return resolved;
}

export type CodeToolName =
  | 'file-read'
  | 'file-write'
  | 'file-edit'
  | 'glob'
  | 'grep'
  | 'ls'
  | 'bash';

export interface CodeToolInvokeParams {
  tool: CodeToolName;
  params: Record<string, unknown>;
  workspaceId?: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  rootPath: string;
  permissions: {
    read: boolean;
    write: boolean;
    execute: boolean;
    paths: string[];
    blockedPaths: string[];
  };
}

// In-memory workspace store (would be replaced with proper persistence)
const workspaces = new Map<string, WorkspaceContext>();

export class CodeToolInvokeHandler extends BaseActionHandler {
  type = 'code.tool.invoke';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as CodeToolInvokeParams;

    try {
      // Get or find workspace
      const workspace = await this.getWorkspace(params.workspaceId, context);
      if (!workspace) {
        return this.failure('No workspace available. Create one first with workspace.create', Date.now() - start);
      }

      // Execute the tool
      const result = await this.executeTool(params.tool, params.params, workspace);

      return this.success({
        tool: params.tool,
        workspaceId: workspace.workspaceId,
        result,
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Tool execution failed: ${message}`, Date.now() - start);
    }
  }

  private async getWorkspace(
    workspaceId: string | undefined,
    context: ExecutionContext
  ): Promise<WorkspaceContext | undefined> {
    // If workspace ID provided, use it
    if (workspaceId && workspaces.has(workspaceId)) {
      return workspaces.get(workspaceId);
    }

    // Look for workspace in conversation context
    const contextWorkspaceId = context.context.workspaceId as string | undefined;
    if (contextWorkspaceId && workspaces.has(contextWorkspaceId)) {
      return workspaces.get(contextWorkspaceId);
    }

    // Find workspace by conversation ID
    for (const [id, ws] of workspaces.entries()) {
      const wsMetadata = ws as WorkspaceContext & { conversationId?: string };
      if (wsMetadata.conversationId === context.conversationId) {
        return ws;
      }
    }

    return undefined;
  }

  private async executeTool(
    tool: CodeToolName,
    params: Record<string, unknown>,
    workspace: WorkspaceContext
  ): Promise<unknown> {
    // Import tool handlers dynamically to avoid circular deps
    // In production, these would be invoked via the Runtime service

    const toolHandlers: Record<CodeToolName, (params: Record<string, unknown>, workspace: WorkspaceContext) => Promise<unknown>> = {
      'file-read': this.executeFileRead.bind(this),
      'file-write': this.executeFileWrite.bind(this),
      'file-edit': this.executeFileEdit.bind(this),
      'glob': this.executeGlob.bind(this),
      'grep': this.executeGrep.bind(this),
      'ls': this.executeLs.bind(this),
      'bash': this.executeBash.bind(this),
    };

    const handler = toolHandlers[tool];
    if (!handler) {
      throw new Error(`Unknown tool: ${tool}`);
    }

    return handler(params, workspace);
  }

  // Tool implementations that delegate to Runtime service
  // These are simplified inline versions - production would call Runtime

  private async executeFileRead(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const fs = await import('fs/promises');

    if (!workspace.permissions.read) {
      throw new Error('Read permission denied');
    }

    const filePath = params.path as string;
    const fullPath = await resolveSafePath(workspace, filePath);

    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    const offset = Math.max(0, ((params.offset as number) || 1) - 1);
    const limit = (params.limit as number) || lines.length;
    const selectedLines = lines.slice(offset, offset + limit);

    return {
      path: filePath,
      content: selectedLines.join('\n'),
      lines: selectedLines.length,
      totalLines: lines.length,
      truncated: offset + limit < lines.length,
    };
  }

  private async executeFileWrite(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!workspace.permissions.write) {
      throw new Error('Write permission denied');
    }

    const filePath = params.path as string;
    const content = params.content as string;
    const fullPath = await resolveSafePath(workspace, filePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    return {
      path: filePath,
      bytesWritten: Buffer.byteLength(content),
    };
  }

  private async executeFileEdit(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!workspace.permissions.write) {
      throw new Error('Write permission denied');
    }

    const filePath = params.path as string;
    const edits = params.edits as Array<{ oldText: string; newText: string }>;
    const fullPath = await resolveSafePath(workspace, filePath);

    let content = await fs.readFile(fullPath, 'utf-8');
    let editsApplied = 0;

    for (const edit of edits) {
      if (!content.includes(edit.oldText)) {
        throw new Error(`Text not found: "${edit.oldText.slice(0, 50)}..."`);
      }
      content = content.replace(edit.oldText, edit.newText);
      editsApplied++;
    }

    await fs.writeFile(fullPath, content, 'utf-8');

    return {
      path: filePath,
      editsApplied,
    };
  }

  private async executeGlob(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!workspace.permissions.read) {
      throw new Error('Read permission denied');
    }

    const pattern = params.pattern as string;
    const cwd = await resolveSafePath(workspace, params.cwd as string | undefined);

    const files: string[] = [];
    await this.findFilesRecursive(cwd, pattern, files, 1000, workspace);

    return {
      pattern,
      files: files.map(f => path.relative(workspace.rootPath, f)),
      truncated: files.length >= 1000,
    };
  }

  private async findFilesRecursive(dir: string, pattern: string, results: string[], maxResults: number, workspace: WorkspaceContext): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (results.length >= maxResults) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspace.rootPath, fullPath);
        if (isPathBlocked(relPath, workspace.permissions.blockedPaths)) continue;

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.findFilesRecursive(fullPath, pattern, results, maxResults, workspace);
        } else if (entry.isFile()) {
          if (this.matchGlob(entry.name, pattern)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  private matchGlob(str: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\*\*/g, '{{GLOB}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/{{GLOB}}/g, '.*');
    return new RegExp(`^${regex}$`).test(str);
  }

  private async executeGrep(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!workspace.permissions.read) {
      throw new Error('Read permission denied');
    }

    const pattern = params.pattern as string;
    const searchPath = await resolveSafePath(workspace, params.path as string | undefined);

    const matches: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(pattern, params.ignoreCase ? 'gi' : 'g');

    await this.searchFilesRecursive(searchPath, workspace.rootPath, regex, matches, 500, workspace);

    return {
      pattern,
      matches,
      truncated: matches.length >= 500,
    };
  }

  private async searchFilesRecursive(
    dir: string,
    rootPath: string,
    regex: RegExp,
    results: Array<{ file: string; line: number; content: string }>,
    maxResults: number,
    workspace: WorkspaceContext
  ): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (results.length >= maxResults) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspace.rootPath, fullPath);
        if (isPathBlocked(relPath, workspace.permissions.blockedPaths)) continue;

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.searchFilesRecursive(fullPath, rootPath, regex, results, maxResults, workspace);
        } else if (entry.isFile()) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (regex.test(lines[i])) {
                results.push({
                  file: path.relative(rootPath, fullPath),
                  line: i + 1,
                  content: lines[i].trim(),
                });
              }
              regex.lastIndex = 0;
            }
          } catch {
            // Skip binary files
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  private async executeLs(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const fs = await import('fs/promises');
    const path = await import('path');

    if (!workspace.permissions.read) {
      throw new Error('Read permission denied');
    }

    const dirPath = params.path as string;
    const fullPath = await resolveSafePath(workspace, dirPath);

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const result: Array<{ name: string; type: string; size?: number }> = [];

    for (const entry of entries) {
      if (!params.includeHidden && entry.name.startsWith('.')) continue;

      const entryPath = path.join(fullPath, entry.name);
      const stat = await fs.stat(entryPath).catch(() => null);

      result.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        size: stat?.size,
      });
    }

    return {
      path: dirPath,
      entries: result,
    };
  }

  private async executeBash(params: Record<string, unknown>, workspace: WorkspaceContext): Promise<unknown> {
    const { spawn } = await import('child_process');

    // NOT A SANDBOX: this runs as the service process. Double-gated: the
    // workspace must carry execute permission AND the deployment must set
    // ASSISTANTS_CODE_TOOLS_ALLOW_BASH=true.
    if (!BASH_ENABLED) {
      throw new Error('Bash execution is disabled (set ASSISTANTS_CODE_TOOLS_ALLOW_BASH=true to enable in trusted development only)');
    }
    if (!workspace.permissions.execute) {
      throw new Error('Execute permission denied');
    }

    const command = params.command as string;
    const cwd = await resolveSafePath(workspace, params.cwd as string | undefined);

    const timeout = (params.timeout as number) || 120000;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn('bash', ['-c', command], { cwd });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > 100000) {
          stdout = stdout.slice(0, 100000) + '\n[truncated]';
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > 50000) {
          stderr = stderr.slice(0, 50000) + '\n[truncated]';
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          command,
          stdout,
          stderr,
          exitCode: code ?? 1,
          timedOut,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({
          command,
          stdout,
          stderr: err.message,
          exitCode: 1,
          timedOut: false,
        });
      });
    });
  }
}

// Workspace management actions

export class WorkspaceCreateHandler extends BaseActionHandler {
  type = 'workspace.create';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as {
      permissions?: Partial<WorkspaceContext['permissions']>;
    };

    try {
      const { v4: uuid } = await import('uuid');
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');

      const workspaceId = uuid();
      // SECURITY: rootPath is never caller-supplied. Workspaces live under
      // the OS temp dir only; a caller-chosen root (e.g. '/') defeats every
      // path check downstream.
      const rootPath = path.join(os.tmpdir(), 'symbia-workspaces', workspaceId);

      await fs.mkdir(rootPath, { recursive: true });

      // SECURITY: callers may narrow permissions, never widen them.
      // - execute additionally requires the deployment-level bash opt-in
      // - blockedPaths can only grow; the defaults cannot be removed
      const requested = params.permissions ?? {};
      const workspace: WorkspaceContext & { conversationId: string } = {
        workspaceId,
        rootPath,
        conversationId: context.conversationId,
        permissions: {
          read: requested.read !== false,
          write: requested.write !== false,
          execute: BASH_ENABLED && requested.execute === true,
          paths: requested.paths ?? ['**/*'],
          blockedPaths: [...DEFAULT_BLOCKED_PATHS, ...(requested.blockedPaths ?? [])],
        },
      };

      workspaces.set(workspaceId, workspace);

      return this.success({
        workspaceId,
        rootPath,
        permissions: workspace.permissions,
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to create workspace: ${message}`, Date.now() - start);
    }
  }
}

export class WorkspaceDestroyHandler extends BaseActionHandler {
  type = 'workspace.destroy';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as { workspaceId?: string };

    try {
      const fs = await import('fs/promises');

      // Find workspace
      let workspaceId = params.workspaceId;
      if (!workspaceId) {
        // Find by conversation
        for (const [id, ws] of workspaces.entries()) {
          const wsWithConv = ws as WorkspaceContext & { conversationId?: string };
          if (wsWithConv.conversationId === context.conversationId) {
            workspaceId = id;
            break;
          }
        }
      }

      if (!workspaceId || !workspaces.has(workspaceId)) {
        return this.failure('Workspace not found', Date.now() - start);
      }

      const workspace = workspaces.get(workspaceId)!;

      // Remove files
      await fs.rm(workspace.rootPath, { recursive: true, force: true });

      // Remove from map
      workspaces.delete(workspaceId);

      return this.success({ workspaceId, destroyed: true }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to destroy workspace: ${message}`, Date.now() - start);
    }
  }
}
