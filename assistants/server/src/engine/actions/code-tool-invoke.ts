/**
 * Code Tool Invoke Action
 *
 * Action handler for invoking code tools (file read/write/edit, glob, grep, ls).
 *
 * SECURITY (13 Aug 2026 — see STATUS.md and docs/2026-08-13-adversarial-analysis.md):
 * This is NOT a sandbox. File operations run as the service process with its
 * environment. The controls here (env-flag gating, workspace confinement with
 * symlink-aware path resolution, blocked-path globs, no caller-supplied roots or
 * permission escalation) are an interim floor for the FILE tools only.
 *
 * BASH WAS REMOVED (13 Aug 2026). Arbitrary `bash -c` on the service process is
 * not something an env flag makes safe. It stays out until real isolation is
 * decided — the intended home is a WASM sandbox; until that lands there is no
 * command-execution tool here. Do not re-add `spawn`/`child_process` to this
 * file without that boundary.
 *
 * Registration is gated: handlers are only wired when
 * ASSISTANTS_ENABLE_CODE_TOOLS=true.
 *
 * Inspired by OpenCode (https://github.com/opencode-ai/opencode)
 * OpenCode is licensed under the MIT License
 */

import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
// Path confinement lives in ONE place — @symbia/pathguard (consolidated
// 13 Aug 2026 after this file briefly held the third copy of the validator).
import { resolveConfinedPath, isPathBlocked } from '@symbia/pathguard';

/** Code tools are off unless explicitly enabled. */
export const CODE_TOOLS_ENABLED = process.env.ASSISTANTS_ENABLE_CODE_TOOLS === 'true';

// `**/.env*` also matches a root-level `.env` (pathguard's `**/` matches
// zero segments), so the bare variants are belt-and-braces only.
const DEFAULT_BLOCKED_PATHS = ['**/.env*', '.env*', '**/secrets/**', 'secrets/**'];

/**
 * Resolve a target path safely inside a workspace, enforcing the workspace's
 * path policy. Thin adapter over @symbia/pathguard's resolveConfinedPath —
 * sep-boundary containment, symlink defense, blockedPaths/paths globs.
 */
async function resolveSafePath(workspace: WorkspaceContext, targetPath: string | undefined): Promise<string> {
  return resolveConfinedPath(workspace.rootPath, targetPath, workspace.permissions);
}

export type CodeToolName =
  | 'file-read'
  | 'file-write'
  | 'file-edit'
  | 'glob'
  | 'grep'
  | 'ls';

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

  // executeBash was removed 13 Aug 2026 (see the file header). There is no
  // command-execution tool until a real isolation boundary (WASM sandbox) is
  // decided.
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
      // - blockedPaths can only grow; the defaults cannot be removed
      const requested = params.permissions ?? {};
      const workspace: WorkspaceContext & { conversationId: string } = {
        workspaceId,
        rootPath,
        conversationId: context.conversationId,
        permissions: {
          read: requested.read !== false,
          write: requested.write !== false,
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
