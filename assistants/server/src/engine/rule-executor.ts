import type {
  Rule,
  RuleSet,
  ExecutionContext,
  RuleExecutionResult,
  RunResult,
  ActionResult,
  ConversationState,
} from './types.js';
import { evaluateConditions } from './condition-evaluator.js';
import { getActionHandler } from './actions/index.js';
import { TokenAuthError } from './actions/llm-invoke.js';

export class RuleExecutor {
  async execute(context: ExecutionContext, ruleSet: RuleSet): Promise<RunResult> {
    const start = Date.now();
    const runId = crypto.randomUUID();

    console.log(`[RuleExecutor] Starting execution for trigger: ${context.trigger}`);
    console.log(`[RuleExecutor] RuleSet: ${ruleSet.name} (${ruleSet.rules.length} rules)`);
    console.log(`[RuleExecutor] Message content: "${context.message?.content?.substring(0, 50)}..."`);

    const applicableRules = ruleSet.rules
      .filter((rule) => rule.enabled && rule.trigger === context.trigger)
      .sort((a, b) => b.priority - a.priority);

    console.log(`[RuleExecutor] Found ${applicableRules.length} applicable rules for trigger ${context.trigger}`);

    const results: RuleExecutionResult[] = [];
    let newState: ConversationState | undefined;
    let rulesMatched = 0;

    for (const rule of applicableRules) {
      console.log(`[RuleExecutor] Evaluating rule: ${rule.name} (priority: ${rule.priority})`);
      const ruleResult = await this.executeRule(rule, context);
      results.push(ruleResult);

      console.log(`[RuleExecutor] Rule "${rule.name}" matched: ${ruleResult.matched}, conditionsEvaluated: ${ruleResult.conditionsEvaluated}`);
      if (ruleResult.error) {
        console.log(`[RuleExecutor] Rule error: ${ruleResult.error}`);
      }
      if (ruleResult.actionsExecuted.length > 0) {
        console.log(`[RuleExecutor] Actions executed: ${ruleResult.actionsExecuted.map(a => `${a.actionType}(${a.success ? 'ok' : 'fail'})`).join(', ')}`);
      }

      if (ruleResult.matched) {
        rulesMatched++;

        const stateAction = ruleResult.actionsExecuted.find(
          (a) => a.actionType === 'state.transition' && a.success
        );
        if (stateAction?.output && typeof stateAction.output === 'object') {
          const output = stateAction.output as { newState?: ConversationState };
          if (output.newState) {
            newState = output.newState;
            context.conversationState = newState;
          }
        }

        // Stop after first match - priority determines winner
        break;
      }
    }

    console.log(`[RuleExecutor] Execution complete: ${rulesMatched}/${applicableRules.length} rules matched in ${Date.now() - start}ms`);

    return {
      runId,
      orgId: context.orgId,
      conversationId: context.conversationId,
      trigger: context.trigger,
      rulesEvaluated: applicableRules.length,
      rulesMatched,
      results,
      newState,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
  
  private async executeRule(
    rule: Rule,
    context: ExecutionContext
  ): Promise<RuleExecutionResult> {
    const start = Date.now();
    
    try {
      const conditionsMatch = evaluateConditions(rule.conditions, context);
      console.log(`[RuleExecutor] evaluateConditions returned: ${conditionsMatch} (type: ${typeof conditionsMatch})`);

      if (!conditionsMatch) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          matched: false,
          conditionsEvaluated: true,
          actionsExecuted: [],
          durationMs: Date.now() - start,
        };
      }

      console.log(`[RuleExecutor] Conditions matched! Executing ${rule.actions.length} action(s)...`);
      const actionResults: ActionResult[] = [];

      for (const actionConfig of rule.actions) {
        console.log(`[RuleExecutor] Executing action: ${actionConfig.type}`);
        const handler = getActionHandler(actionConfig.type);
        
        if (!handler) {
          actionResults.push({
            success: false,
            actionType: actionConfig.type as ActionResult['actionType'],
            error: `Unknown action type: ${actionConfig.type}`,
            durationMs: 0,
          });
          continue;
        }
        
        const result = await handler.execute(actionConfig, context);
        actionResults.push(result);
        
        if (!result.success) {
          break;
        }
      }
      
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        matched: true,
        conditionsEvaluated: true,
        actionsExecuted: actionResults,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      // Re-throw TokenAuthError so it can be handled at a higher level
      // (e.g., to trigger token refresh and retry)
      if (error instanceof TokenAuthError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Rule execution failed';
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        conditionsEvaluated: false,
        actionsExecuted: [],
        error: message,
        durationMs: Date.now() - start,
      };
    }
  }
}

export const ruleExecutor = new RuleExecutor();
