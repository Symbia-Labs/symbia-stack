/**
 * Parallel Action Handler
 *
 * Executes multiple actions concurrently (fan-out).
 * Supports different completion strategies: all, any, or settle.
 */

import { BaseActionHandler } from './base.js';
import { getActionHandler } from './index.js';
import type { ActionConfig, ExecutionContext, ActionResult } from '../types.js';

interface ParallelParams {
  actions: ActionConfig[];           // Actions to execute in parallel
  strategy?: 'all' | 'any' | 'settle'; // Completion strategy
  timeout?: number;                  // Optional timeout in ms
  continueOnError?: boolean;         // Continue if some actions fail
}

interface ParallelOutput {
  strategy: string;
  total: number;
  succeeded: number;
  failed: number;
  results: ActionResult[];
}

export class ParallelHandler extends BaseActionHandler {
  type = 'parallel' as const;

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as ParallelParams;

    try {
      const actions = params.actions || [];
      const strategy = params.strategy || 'all';
      const timeout = params.timeout || 30000; // 30s default

      if (actions.length === 0) {
        return {
          success: true,
          actionType: this.type,
          output: { strategy, total: 0, succeeded: 0, failed: 0, results: [] },
          durationMs: Date.now() - start,
        };
      }

      console.log(`[Parallel] Executing ${actions.length} actions with strategy: ${strategy}`);

      // Create promises for each action
      const actionPromises = actions.map((actionConfig) => this.executeAction(actionConfig, context));

      // Apply timeout wrapper
      const timedPromises = actionPromises.map((p) =>
        Promise.race([
          p,
          this.timeoutPromise(timeout),
        ])
      );

      let results: ActionResult[];

      switch (strategy) {
        case 'any':
          // Return as soon as one succeeds
          const firstResult = await Promise.any(timedPromises).catch(() => null);
          if (firstResult) {
            results = [firstResult];
          } else {
            // All failed, collect all results
            results = await Promise.allSettled(timedPromises).then((settled) =>
              settled.map((s) => (s.status === 'fulfilled' ? s.value : this.errorResult(s.reason)))
            );
          }
          break;

        case 'settle':
          // Wait for all to complete, regardless of success/failure
          const settled = await Promise.allSettled(timedPromises);
          results = settled.map((s) =>
            s.status === 'fulfilled' ? s.value : this.errorResult(s.reason)
          );
          break;

        case 'all':
        default:
          // Wait for all to succeed (or fail fast)
          if (params.continueOnError) {
            const allSettled = await Promise.allSettled(timedPromises);
            results = allSettled.map((s) =>
              s.status === 'fulfilled' ? s.value : this.errorResult(s.reason)
            );
          } else {
            results = await Promise.all(timedPromises);
          }
          break;
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      const output: ParallelOutput = {
        strategy,
        total: actions.length,
        succeeded,
        failed,
        results,
      };

      // Determine overall success based on strategy
      let success = true;
      if (strategy === 'all' && failed > 0) {
        success = false;
      } else if (strategy === 'any' && succeeded === 0) {
        success = false;
      }
      // 'settle' always succeeds (it's informational)

      return {
        success,
        actionType: this.type,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        actionType: this.type,
        error: error instanceof Error ? error.message : 'Parallel execution failed',
        durationMs: Date.now() - start,
      };
    }
  }

  private async executeAction(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const handler = getActionHandler(config.type);
    if (!handler) {
      return {
        success: false,
        actionType: config.type as ActionResult['actionType'],
        error: `Unknown action type: ${config.type}`,
        durationMs: 0,
      };
    }
    return handler.execute(config, context);
  }

  private timeoutPromise(ms: number): Promise<ActionResult> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Action timed out after ${ms}ms`)), ms)
    );
  }

  private errorResult(reason: unknown): ActionResult {
    return {
      success: false,
      actionType: 'parallel',
      error: reason instanceof Error ? reason.message : String(reason),
      durationMs: 0,
    };
  }
}
