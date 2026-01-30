/**
 * Condition Action Handler
 *
 * Conditional branching within action sequences.
 * Allows if/then/else logic based on context values.
 */

import { BaseActionHandler } from './base.js';
import { getActionHandler } from './index.js';
import { evaluateConditions } from '../condition-evaluator.js';
import type { ActionConfig, ExecutionContext, ActionResult, ConditionGroup } from '../types.js';

interface ConditionParams {
  if: ConditionGroup;              // Condition to evaluate
  then: ActionConfig[];            // Actions if condition is true
  else?: ActionConfig[];           // Actions if condition is false (optional)
}

export class ConditionHandler extends BaseActionHandler {
  type = 'condition' as const;

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as ConditionParams;

    try {
      if (!params.if) {
        return {
          success: false,
          actionType: this.type,
          error: 'Condition "if" clause is required',
          durationMs: Date.now() - start,
        };
      }

      // Evaluate the condition
      const conditionMet = evaluateConditions(params.if, context);
      console.log(`[Condition] Evaluated: ${conditionMet}`);

      // Select the branch to execute
      const actionsToExecute = conditionMet ? (params.then || []) : (params.else || []);

      if (actionsToExecute.length === 0) {
        return {
          success: true,
          actionType: this.type,
          output: {
            conditionMet,
            branch: conditionMet ? 'then' : 'else',
            actionsExecuted: 0,
          },
          durationMs: Date.now() - start,
        };
      }

      // Execute the selected branch
      const results: ActionResult[] = [];
      for (const actionConfig of actionsToExecute) {
        const handler = getActionHandler(actionConfig.type);
        if (!handler) {
          results.push({
            success: false,
            actionType: actionConfig.type as ActionResult['actionType'],
            error: `Unknown action type: ${actionConfig.type}`,
            durationMs: 0,
          });
          continue;
        }

        const result = await handler.execute(actionConfig, context);
        results.push(result);

        // Stop on first failure
        if (!result.success) {
          break;
        }
      }

      const allSucceeded = results.every((r) => r.success);

      return {
        success: allSucceeded,
        actionType: this.type,
        output: {
          conditionMet,
          branch: conditionMet ? 'then' : 'else',
          actionsExecuted: results.length,
          results,
        },
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        actionType: this.type,
        error: error instanceof Error ? error.message : 'Condition evaluation failed',
        durationMs: Date.now() - start,
      };
    }
  }
}
