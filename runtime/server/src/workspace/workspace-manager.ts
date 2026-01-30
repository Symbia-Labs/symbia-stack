/**
 * Workspace Manager
 *
 * Manages isolated workspaces for code execution.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import type { Workspace, CreateWorkspaceOptions, WorkspaceManagerConfig } from './types.js';
import { DEFAULT_WORKSPACE_CONFIG, DEFAULT_PERMISSIONS } from './types.js';
import type { CodePermissions, WorkspaceContext } from '../types/code-tools.js';
import { validatePath, type PathValidationResult } from './path-validator.js';

export class WorkspaceManager {
  private config: WorkspaceManagerConfig;
  private workspaces = new Map<string, Workspace>();

  constructor(config: Partial<WorkspaceManagerConfig> = {}) {
    this.config = { ...DEFAULT_WORKSPACE_CONFIG, ...config };
  }

  /**
   * Create a new isolated workspace
   */
  async create(options: CreateWorkspaceOptions): Promise<Workspace> {
    const workspaceId = uuid();
    const rootPath = path.join(this.config.baseDir, workspaceId);

    // Merge permissions with defaults
    const permissions: CodePermissions = {
      ...this.config.defaultPermissions,
      ...options.permissions,
    };

    // Create workspace directory
    await fs.mkdir(rootPath, { recursive: true });

    const workspace: Workspace = {
      id: workspaceId,
      orgId: options.orgId,
      userId: options.userId,
      conversationId: options.conversationId,
      rootPath,
      permissions,
      createdAt: new Date(),
      expiresAt: options.ttlHours
        ? new Date(Date.now() + options.ttlHours * 3600000)
        : new Date(Date.now() + this.config.defaultTtlHours * 3600000),
      metadata: options.metadata || {},
    };

    // Initialize with files if provided
    if (options.initialFiles) {
      for (const file of options.initialFiles) {
        const filePath = path.join(rootPath, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    }

    this.workspaces.set(workspaceId, workspace);

    console.log(`[WorkspaceManager] Created workspace: ${workspaceId} at ${rootPath}`);

    return workspace;
  }

  /**
   * Get a workspace by ID
   */
  get(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get workspace context for tool execution
   */
  getContext(workspaceId: string): WorkspaceContext | undefined {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return undefined;

    return {
      workspaceId: workspace.id,
      rootPath: workspace.rootPath,
      permissions: workspace.permissions,
    };
  }

  /**
   * Find workspace by conversation ID
   */
  findByConversation(conversationId: string): Workspace | undefined {
    for (const workspace of this.workspaces.values()) {
      if (workspace.conversationId === conversationId) {
        return workspace;
      }
    }
    return undefined;
  }

  /**
   * Validate a path for an operation
   */
  validatePath(
    workspaceId: string,
    targetPath: string,
    operation: 'read' | 'write' | 'execute'
  ): PathValidationResult {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return { valid: false, error: 'Workspace not found' };
    }

    return validatePath(workspace.rootPath, targetPath, operation, workspace.permissions);
  }

  /**
   * Check if a workspace is expired
   */
  isExpired(workspaceId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return true;
    if (!workspace.expiresAt) return false;
    return new Date() > workspace.expiresAt;
  }

  /**
   * Extend workspace TTL
   */
  extend(workspaceId: string, additionalHours: number): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    workspace.expiresAt = new Date(
      (workspace.expiresAt?.getTime() || Date.now()) + additionalHours * 3600000
    );
    return true;
  }

  /**
   * Destroy a workspace and clean up files
   */
  async destroy(workspaceId: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    try {
      await fs.rm(workspace.rootPath, { recursive: true, force: true });
      this.workspaces.delete(workspaceId);
      console.log(`[WorkspaceManager] Destroyed workspace: ${workspaceId}`);
      return true;
    } catch (error) {
      console.error(`[WorkspaceManager] Failed to destroy workspace ${workspaceId}:`, error);
      return false;
    }
  }

  /**
   * Clean up expired workspaces
   */
  async cleanupExpired(): Promise<number> {
    let cleaned = 0;
    const now = new Date();

    for (const [id, workspace] of this.workspaces.entries()) {
      if (workspace.expiresAt && workspace.expiresAt < now) {
        if (await this.destroy(id)) {
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[WorkspaceManager] Cleaned up ${cleaned} expired workspaces`);
    }

    return cleaned;
  }

  /**
   * Get workspace stats
   */
  getStats(): {
    total: number;
    byOrg: Record<string, number>;
    expired: number;
  } {
    const stats = {
      total: this.workspaces.size,
      byOrg: {} as Record<string, number>,
      expired: 0,
    };

    const now = new Date();
    for (const workspace of this.workspaces.values()) {
      stats.byOrg[workspace.orgId] = (stats.byOrg[workspace.orgId] || 0) + 1;
      if (workspace.expiresAt && workspace.expiresAt < now) {
        stats.expired++;
      }
    }

    return stats;
  }

  /**
   * List all workspaces for an org
   */
  listByOrg(orgId: string): Workspace[] {
    return Array.from(this.workspaces.values()).filter(w => w.orgId === orgId);
  }
}

// Singleton instance
let workspaceManager: WorkspaceManager | null = null;

export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) {
    workspaceManager = new WorkspaceManager();
  }
  return workspaceManager;
}

export function initWorkspaceManager(config: Partial<WorkspaceManagerConfig>): WorkspaceManager {
  workspaceManager = new WorkspaceManager(config);
  return workspaceManager;
}
