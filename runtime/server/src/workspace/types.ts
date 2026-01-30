/**
 * Workspace Types
 *
 * Types for managing isolated code execution workspaces.
 */

import type { CodePermissions } from '../types/code-tools.js';

export interface Workspace {
  id: string;
  orgId: string;
  userId?: string;
  conversationId?: string;
  rootPath: string;
  permissions: CodePermissions;
  createdAt: Date;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}

export interface CreateWorkspaceOptions {
  orgId: string;
  userId?: string;
  conversationId?: string;
  permissions?: Partial<CodePermissions>;
  ttlHours?: number;
  initialFiles?: Array<{ path: string; content: string }>;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceManagerConfig {
  baseDir: string;
  defaultTtlHours: number;
  maxWorkspaceSizeMb: number;
  defaultPermissions: CodePermissions;
}

export const DEFAULT_PERMISSIONS: CodePermissions = {
  read: true,
  write: true,
  execute: false,
  paths: ['**/*'],
  blockedPaths: [
    '**/.env*',
    '**/.git/config',
    '**/secrets/**',
    '**/*.pem',
    '**/*.key',
    '**/id_rsa*',
    '**/credentials*',
  ],
};

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceManagerConfig = {
  baseDir: process.env.WORKSPACE_BASE_DIR || '/tmp/symbia-workspaces',
  defaultTtlHours: 24,
  maxWorkspaceSizeMb: 500,
  defaultPermissions: DEFAULT_PERMISSIONS,
};
