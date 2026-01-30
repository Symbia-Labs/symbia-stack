import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';

export interface ContextUpdateParams {
  updates?: Record<string, unknown>;
  // Alternative key/value format for single-key updates
  key?: string;
  value?: unknown;
  operation?: 'set' | 'merge' | 'delete';
}

export class ContextUpdateHandler extends BaseActionHandler {
  type = 'context.update';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as Partial<ContextUpdateParams>;

    // Support both formats:
    // 1. { updates: { key1: value1, key2: value2 } }
    // 2. { key: "keyName", value: someValue }
    let updates = params.updates;
    if (!updates && params.key !== undefined) {
      updates = { [params.key]: params.value };
    }

    if (!updates) {
      return this.failure('updates or key/value is required', Date.now() - start);
    }
    
    try {
      const operation = params.operation || 'merge';
      
      let newContext: Record<string, unknown>;
      
      switch (operation) {
        case 'set':
          newContext = { ...updates };
          break;
        
        case 'merge':
          newContext = this.deepMerge(context.context, updates);
          break;
        
        case 'delete':
          newContext = { ...context.context };
          for (const key of Object.keys(updates)) {
            delete newContext[key];
          }
          break;
        
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      
      return this.success({
        operation,
        previousContext: context.context,
        newContext,
        updatedAt: new Date().toISOString(),
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update context';
      return this.failure(message, Date.now() - start);
    }
  }
  
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };
    
    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const targetVal = result[key];
      
      if (
        sourceVal !== null &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal !== null &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        result[key] = this.deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>
        );
      } else {
        result[key] = sourceVal;
      }
    }
    
    return result;
  }
}
