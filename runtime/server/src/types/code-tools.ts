/**
 * Code Tools Types
 *
 * Types for code execution and workspace management.
 */

export interface CodePermissions {
  read: boolean;
  write: boolean;
  execute: boolean;
  paths: string[];
  blockedPaths: string[];
}

export interface WorkspaceContext {
  workspaceId: string;
  rootPath: string;
  permissions: CodePermissions;
  orgId: string;
  userId?: string;
  conversationId?: string;
}
