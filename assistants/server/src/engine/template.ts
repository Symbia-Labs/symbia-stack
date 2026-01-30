/**
 * Template Utilities
 *
 * Adapts Symbia Script reference system to the assistants engine ExecutionContext.
 * This provides a single place for all template interpolation, replacing the
 * duplicated code across action handlers.
 */

import {
  interpolate as scriptInterpolate,
  interpolateObject as scriptInterpolateObject,
  parseRef,
  resolveRef,
  getRefSuggestions,
  validateTemplate,
  type ResolutionContext,
  type SymbiaRef,
  type RefValidation,
} from '@symbia/sys';
import type { ExecutionContext } from './types.js';

/**
 * Convert ExecutionContext to ResolutionContext for Symbia Script
 */
export function toResolutionContext(ctx: ExecutionContext): ResolutionContext {
  return {
    orgId: ctx.orgId,
    conversationId: ctx.conversationId,

    message: ctx.message ? {
      id: ctx.message.id,
      content: ctx.message.content,
      role: ctx.message.role,
      metadata: ctx.message.metadata,
    } : undefined,

    user: ctx.user ? {
      id: ctx.user.id,
      email: ctx.user.email,
      displayName: ctx.user.displayName,
      metadata: ctx.user.metadata,
    } : undefined,

    org: {
      id: ctx.orgId,
    },

    context: ctx.context,
    metadata: ctx.metadata,

    // Extract token from metadata if present
    token: (ctx.metadata as { token?: string })?.token,

    // Pass through catalog data if available
    catalog: ctx.catalog,
  };
}

/**
 * Interpolate a template string using ExecutionContext
 *
 * Supports both new @ref syntax and legacy {{path}} syntax:
 *   - New: "Hello {{@user.displayName}}"
 *   - Legacy: "Hello {{user.displayName}}" (still works)
 *
 * @param template - Template string with {{...}} placeholders
 * @param ctx - Execution context
 * @returns Interpolated string
 */
export function interpolate(template: string, ctx: ExecutionContext): string {
  const resCtx = toResolutionContext(ctx);

  // Use the Symbia Script interpolation
  // It handles both @ref syntax and bare paths for backwards compatibility
  return scriptInterpolate(template, resCtx);
}

/**
 * Recursively interpolate all string values in an object
 *
 * @param obj - Object with template strings
 * @param ctx - Execution context
 * @returns Object with interpolated values
 */
export function interpolateObject<T extends Record<string, unknown>>(
  obj: T,
  ctx: ExecutionContext
): T {
  const resCtx = toResolutionContext(ctx);
  return scriptInterpolateObject(obj, resCtx);
}

/**
 * Get a value from context using dot notation path
 *
 * @param path - Dot-separated path (e.g., "message.content" or "@message.content")
 * @param ctx - Execution context
 * @returns The value at the path, or undefined
 */
export function getContextValue(path: string, ctx: ExecutionContext): unknown {
  const resCtx = toResolutionContext(ctx);

  // Handle @ref syntax
  if (path.startsWith('@')) {
    const result = resolveRef(path, resCtx);
    return result.success ? result.value : undefined;
  }

  // Legacy: bare path (e.g., "message.content")
  const parts = path.split('.');
  let current: unknown = ctx;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Format a value for string output
 */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

// Re-export useful functions from Symbia Script
export {
  parseRef,
  resolveRef,
  getRefSuggestions,
  validateTemplate,
  type SymbiaRef,
  type RefValidation,
  type ResolutionContext,
};
