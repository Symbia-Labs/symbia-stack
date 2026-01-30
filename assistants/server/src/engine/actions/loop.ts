/**
 * Loop Action Handler
 *
 * Iterates over a collection and executes actions for each item.
 * Supports arrays from context or inline data.
 */

import { BaseActionHandler } from './base.js';
import { getActionHandler } from './index.js';
import type { ActionConfig, ExecutionContext, ActionResult } from '../types.js';

interface LoopParams {
  over: string | unknown[];         // Context path to array or inline array
  as: string;                       // Variable name for current item
  index?: string;                   // Variable name for current index
  actions: ActionConfig[];          // Actions to execute per iteration
  maxIterations?: number;           // Safety limit (default 100)
  continueOnError?: boolean;        // Continue if an iteration fails
}

export class LoopHandler extends BaseActionHandler {
  type = 'loop' as const;

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as LoopParams;

    try {
      // Resolve the collection to iterate over
      let collection: unknown[];
      if (typeof params.over === 'string') {
        // It's a context path like "context.items" or "event.data.users"
        collection = this.resolveContextPath(params.over, context) as unknown[];
      } else if (Array.isArray(params.over)) {
        collection = params.over;
      } else {
        return {
          success: false,
          actionType: this.type,
          error: '"over" must be an array or a context path to an array',
          durationMs: Date.now() - start,
        };
      }

      if (!Array.isArray(collection)) {
        return {
          success: false,
          actionType: this.type,
          error: `Resolved value is not an array: ${typeof collection}`,
          durationMs: Date.now() - start,
        };
      }

      const maxIterations = params.maxIterations || 100;
      const itemsToProcess = collection.slice(0, maxIterations);

      if (collection.length > maxIterations) {
        console.warn(`[Loop] Collection has ${collection.length} items, limiting to ${maxIterations}`);
      }

      console.log(`[Loop] Iterating over ${itemsToProcess.length} items as "${params.as}"`);

      const iterationResults: Array<{ index: number; results: ActionResult[] }> = [];
      let failedIterations = 0;

      for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];

        // Create a modified context with the loop variables
        const loopContext: ExecutionContext = {
          ...context,
          context: {
            ...context.context,
            [params.as]: item,
            ...(params.index ? { [params.index]: i } : {}),
          },
        };

        const actionResults: ActionResult[] = [];
        let iterationFailed = false;

        for (const actionConfig of params.actions || []) {
          const handler = getActionHandler(actionConfig.type);
          if (!handler) {
            actionResults.push({
              success: false,
              actionType: actionConfig.type as ActionResult['actionType'],
              error: `Unknown action type: ${actionConfig.type}`,
              durationMs: 0,
            });
            iterationFailed = true;
            break;
          }

          const result = await handler.execute(actionConfig, loopContext);
          actionResults.push(result);

          if (!result.success) {
            iterationFailed = true;
            if (!params.continueOnError) {
              break;
            }
          }
        }

        iterationResults.push({ index: i, results: actionResults });

        if (iterationFailed) {
          failedIterations++;
          if (!params.continueOnError) {
            break;
          }
        }
      }

      return {
        success: failedIterations === 0 || params.continueOnError === true,
        actionType: this.type,
        output: {
          totalItems: collection.length,
          processedItems: iterationResults.length,
          failedIterations,
          iterations: iterationResults,
        },
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        actionType: this.type,
        error: error instanceof Error ? error.message : 'Loop execution failed',
        durationMs: Date.now() - start,
      };
    }
  }

  private resolveContextPath(path: string, context: ExecutionContext): unknown {
    const parts = path.split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
