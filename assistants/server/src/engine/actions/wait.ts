/**
 * Wait Action Handler
 *
 * Delays execution for a specified duration.
 * Useful for rate limiting, polling intervals, or timed sequences.
 */

import { BaseActionHandler } from './base.js';
import type { ActionConfig, ExecutionContext, ActionResult } from '../types.js';

interface WaitParams {
  duration: number;      // Duration in milliseconds
  unit?: 'ms' | 's' | 'm'; // Optional unit (defaults to ms)
  reason?: string;       // Optional reason for the wait (for logging)
}

export class WaitHandler extends BaseActionHandler {
  type = 'wait' as const;

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as WaitParams;

    try {
      let durationMs = params.duration || 0;

      // Convert to milliseconds based on unit
      switch (params.unit) {
        case 's':
          durationMs = durationMs * 1000;
          break;
        case 'm':
          durationMs = durationMs * 60 * 1000;
          break;
        // 'ms' or undefined - already in milliseconds
      }

      // Cap at 5 minutes to prevent runaway waits
      const maxWait = 5 * 60 * 1000;
      if (durationMs > maxWait) {
        console.warn(`[Wait] Duration ${durationMs}ms exceeds max ${maxWait}ms, capping`);
        durationMs = maxWait;
      }

      if (durationMs > 0) {
        console.log(`[Wait] Waiting ${durationMs}ms${params.reason ? ` (${params.reason})` : ''}`);
        await this.sleep(durationMs);
      }

      return {
        success: true,
        actionType: this.type,
        output: {
          waited: durationMs,
          reason: params.reason,
        },
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        actionType: this.type,
        error: error instanceof Error ? error.message : 'Wait failed',
        durationMs: Date.now() - start,
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
