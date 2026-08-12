import type {
  ActionConfig,
  AssistantKind,
  Rule,
  RuleSet,
  ExecutionContext,
  RuleExecutionResult,
  RunResult,
  ActionResult,
  ConversationState,
} from './types.js';
import { digest, type ProvenanceStep } from './provenance.js';
import { evaluateConditions } from './condition-evaluator.js';
import { getActionHandler } from './actions/index.js';
import { TokenAuthError } from './actions/llm-invoke.js';
// The marker that distinguishes a decision from a malfunction. One definition,
// in conversational-turns.ts, read here and by webhooks.ts.
import { DECLINED } from './conversational-turns.js';

export class RuleExecutor {
  async execute(context: ExecutionContext, ruleSet: RuleSet): Promise<RunResult> {
    const start = Date.now();
    const runId = crypto.randomUUID();

    console.log(`[RuleExecutor] Starting execution for trigger: ${context.trigger}`);
    console.log(`[RuleExecutor] RuleSet: ${ruleSet.name} (${ruleSet.rules.length} rules)`);
    console.log(`[RuleExecutor] Message content: "${context.message?.content?.substring(0, 50)}..."`);

    // DEFAULTS RUN LAST, AND SAY SO.
    //
    // A default case used to be expressed as "the lowest priority number,
    // matching everything" — `coord-orchestrate` at 100 with
    // `content exists true`. That is invisible in the rule and fragile in the
    // set: adding a rule below it silently disables it, which is why
    // `coord-conversation` had to be 195 rather than the 95 that reads more
    // naturally. Marking a rule `isDefault` takes it out of the priority race
    // entirely, so its position stops being load-bearing.
    const enabled = ruleSet.rules.filter(
      (rule) => rule.enabled && rule.trigger === context.trigger
    );
    const byPriority = (a: Rule, b: Rule) => b.priority - a.priority;
    const normalRules = enabled.filter((r) => !r.isDefault).sort(byPriority);
    const defaultRules = enabled.filter((r) => r.isDefault).sort(byPriority);
    const applicableRules = [...normalRules, ...defaultRules];

    console.log(`[RuleExecutor] Found ${applicableRules.length} applicable rules for trigger ${context.trigger}`);

    const results: RuleExecutionResult[] = [];
    let newState: ConversationState | undefined;
    let rulesMatched = 0;
    /** The last rule that ceded, kept so ceding can never produce silence. */
    let cededResult: RuleExecutionResult | undefined;

    for (const rule of applicableRules) {
      console.log(`[RuleExecutor] Evaluating rule: ${rule.name} (priority: ${rule.priority})`);
      const ruleResult = await this.executeRule(
        rule,
        context,
        ruleSet.kind ?? 'deterministic',
        ruleSet.maxAttempts ?? 3
      );
      results.push(ruleResult);

      console.log(`[RuleExecutor] Rule "${rule.name}" matched: ${ruleResult.matched}, conditionsEvaluated: ${ruleResult.conditionsEvaluated}`);
      if (ruleResult.error) {
        console.log(`[RuleExecutor] Rule error: ${ruleResult.error}`);
      }
      if (ruleResult.actionsExecuted.length > 0) {
        console.log(`[RuleExecutor] Actions executed: ${ruleResult.actionsExecuted.map(a => `${a.actionType}(${a.success ? 'ok' : 'fail'})`).join(', ')}`);
      }

      // CEDING IS NOT WINNING.
      //
      // The loop stopped at the first rule whose CONDITIONS matched, so a rule
      // that matched and then failed took the conversation down with it. Right
      // for a rule that owns the request; wrong for one that merely recognised
      // it — `calc-evaluate` matches any string containing a digit and then
      // chokes, which is how "ask @smartcalc to…" produced `Invalid character:
      // @` instead of reaching a rule that could have said something useful.
      if (ruleResult.fellThrough) {
        console.log(
          `[RuleExecutor] Rule "${rule.name}" matched but ceded (fallThrough) — trying the next rule`
        );
        // KEEP IT. A ceded failure is the fallback if nothing else answers.
        //
        // Measured on the first run of this feature: `solve the quadradic
        // equation` reached Smart Calculator, `smart-compute` ceded, and Smart
        // Calculator has no default rule — so NOTHING replied. Silence is a
        // worse outcome than the tokenizer error it replaced, and it is the
        // one outcome a person cannot interpret at all.
        //
        // Ceding means "let someone better answer", never "let no one answer".
        cededResult = ruleResult;
        continue;
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

    // Nobody answered, and somebody ceded on the way. Surface the ceded
    // failure rather than returning nothing — the assistant recognised the
    // request and could not complete it, which is a thing a person can act on.
    // Saying nothing is not.
    if (rulesMatched === 0 && cededResult) {
      console.log(
        `[RuleExecutor] No rule handled this and "${cededResult.ruleName}" ceded — reporting its failure rather than staying silent`
      );
      rulesMatched = 1;
      results.push({ ...cededResult, fellThrough: false });
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
    context: ExecutionContext,
    kind: AssistantKind = 'deterministic',
    ruleSetMaxAttempts = 3
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

      // Provenance is recorded AS THE WORK HAPPENS, not reconstructed after.
      // A record assembled at the end can only describe what someone believed
      // occurred; this one accumulates from each step's actual result, and a
      // failed step stays in it.
      const provenance: ProvenanceStep[] = [];
      context.provenance = provenance;
      context.provenanceRule = rule.name;

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
        
        // DETERMINISTIC REFUSES. PROBABILISTIC TRIES AGAIN. EVERY ATTEMPT IS
        // RECORDED.
        //
        // Ruling 12 Aug, both halves. The second half is the one that needed a
        // decision beyond "retry": an answer that succeeded on the third
        // attempt is NOT the same claim as one that succeeded on the first, and
        // a receipt that cannot tell them apart is hiding the thing most worth
        // knowing about a probabilistic reply.
        //
        // So each attempt becomes its own step. A reply that took three tries
        // carries three steps, two of them `ok: false`, and the envelope seals
        // all of them. Silent retries would have made a flaky answer and a
        // clean one identical in the record — which is what a transport-level
        // retry does, and why this is not one.
        const maxAttempts =
          kind === 'probabilistic' ? Math.max(1, ruleSetMaxAttempts) : 1;
        let result!: ActionResult;
        let attempt = 0;

        while (attempt < maxAttempts) {
          attempt++;
          result = await handler.execute(actionConfig, context);

          provenance.push({
            // THE ID IS AN IDENTITY, NOT A LABEL. DO NOT DECORATE IT.
            //
            // This appended `#${attempt}` so repeated attempts were
            // distinguishable. It cost four predictions: other code KEYS on
            // this id. Templates resolve `{{steps.step-answer.response}}`, and
            // message.send matches the reply's content back to the step that
            // produced it to decide `contentFromModel`.
            //
            // With the suffix that match failed, so a reply a model had written
            // classified as RETRIEVED — authored text — instead of COMPOSED.
            // The reply was right and its receipt said the wrong thing about
            // where it came from, which on this platform is the worse failure.
            //
            // Attempt number lives in `attempt`, which was added for exactly
            // this and which nothing keys on.
            id: (actionConfig as { id?: string }).id || actionConfig.type,
            action: actionConfig.type,
            source: describeSource(actionConfig, result.output),
            ok: result.success,
            ms: result.durationMs,
            outputDigest: result.success ? digest(result.output) : undefined,
            error: result.success ? undefined : result.error,
            // Present only when retrying was possible, so a deterministic
            // assistant's receipt is not cluttered with `attempt: 1` on every
            // step it was never going to repeat.
            attempt: maxAttempts > 1 ? attempt : undefined,
          });

          if (result.success) break;

          // A REFUSAL IS NOT A MALFUNCTION, SO IT IS NOT RETRIED.
          //
          // webhooks.ts already states this rule for the reply path. I did not
          // apply it here, and the first run cost five predictions: the
          // coordinator's `assistants.route` refuses deliberately when nothing
          // declares a request, and the retry loop read that decision as a
          // failed attempt.
          //
          // It was worse than a wasted call. Declinations ESCALATE by design —
          // `declineFor` varies the wording by how many times it has been seen —
          // so three attempts consumed the entire escalation ladder inside a
          // single turn:
          //
          //   attempt 1  "That is not something any of my specialists declares…"
          //   attempt 2  "Still outside what my team covers, I am afraid."
          //   attempt 3  "Also no — arithmetic is genuinely all I have people for."
          //
          // The user asked once and was refused three times, each more curtly.
          //
          // Retrying is for a step that MIGHT succeed next time. A decision
          // will not, and repeating it only makes the system look like it is
          // arguing with itself.
          if (result.error?.startsWith(DECLINED)) {
            console.log(
              `[RuleExecutor] ${actionConfig.type} declined deliberately — not retrying a decision`
            );
            break;
          }

          if (attempt < maxAttempts) {
            console.log(
              `[RuleExecutor] ${actionConfig.type} failed on attempt ${attempt}/${maxAttempts} ` +
                `(${result.error}) — probabilistic assistant, trying again`
            );
          } else if (maxAttempts > 1) {
            console.log(
              `[RuleExecutor] ${actionConfig.type} failed on all ${maxAttempts} attempts — giving up`
            );
          }
        }

        actionResults.push(result);

        if (!result.success) {
          // ── the failure path, which until today did not exist ────────────
          const handler = (actionConfig as { onError?: ActionConfig }).onError;

          if (handler) {
            // Run the declared handler INSTEAD of the rest of the rule.
            // Continuing would be wrong: every later action was written
            // assuming this step produced something, and rendering
            // `{{steps.step-evaluate.result}}` after a failed evaluate is how
            // a template silently sends an empty answer.
            console.log(
              `[RuleExecutor] Action ${actionConfig.type} failed; running its onError handler (${handler.type})`
            );
            const handlerImpl = getActionHandler(handler.type);
            if (handlerImpl) {
              const handled = await handlerImpl.execute(handler, context);
              actionResults.push(handled);
              provenance.push({
                id: (handler as { id?: string }).id || `${actionConfig.type}:onError`,
                action: handler.type,
                source: describeSource(handler, handled.output),
                ok: handled.success,
                ms: handled.durationMs,
                outputDigest: handled.success ? digest(handled.output) : undefined,
                error: handled.success ? undefined : handled.error,
              });

              return {
                ruleId: rule.id,
                ruleName: rule.name,
                matched: true,
                conditionsEvaluated: true,
                actionsExecuted: actionResults,
                // The step that failed STAYS in the record. A handled failure
                // is not an absent one, and the receipt should show both what
                // broke and what was said about it.
                handled: true,
                durationMs: Date.now() - start,
              };
            }
            console.error(
              `[RuleExecutor] onError declares unknown action type '${handler.type}' — falling back to the raw failure`
            );
          }

          if (rule.fallThrough) {
            return {
              ruleId: rule.id,
              ruleName: rule.name,
              matched: true,
              conditionsEvaluated: true,
              actionsExecuted: actionResults,
              fellThrough: true,
              error: result.error,
              durationMs: Date.now() - start,
            };
          }

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


/**
 * What a step consulted, in terms a person reading a receipt can check.
 *
 * Names the actual tool, service path or provider — not the action type. A
 * receipt that says "llm.invoke" tells you nothing you could go and verify;
 * "anthropic/claude-sonnet-5" tells you where to look.
 */
function describeSource(
  action: { type: string; params?: Record<string, unknown> },
  output?: unknown
): string {
  const p = (action.params || {}) as Record<string, unknown>;
  switch (action.type) {
    // WHAT ACTUALLY ANSWERED, NOT WHAT WAS CONFIGURED.
    //
    // The note below said the resolved provider "is recorded by llm-invoke
    // itself when it differs". It never was. Almost no rule configures a
    // provider — resolveUsableProvider picks whichever has a credential — so
    // in practice every model step in every envelope read
    // "llm (provider resolved at call time)", which names nothing anyone
    // could go and check. A receipt whose source field is a description of
    // its own uncertainty is not a source field.
    //
    // llm-invoke has returned `output.model` all along. This reads it, so a
    // delegation can say WHICH model made a choice that is not reproducible.
    case 'llm.invoke': {
      const resolved = (output as { model?: string } | undefined)?.model;
      if (resolved) return p.provider ? `${p.provider}/${resolved}` : resolved;
      return p.provider ? `${p.provider}/${p.model ?? 'default'}` : 'llm (provider unresolved — the call did not report a model)';
    }
    case 'tool.invoke':
      return String(p.tool ?? 'tool');
    case 'service.call':
      return `${p.service ?? 'service'} ${String(p.method ?? 'GET')} ${p.path ?? ''}`.trim();
    case 'integration.invoke':
      return String(p.operation ?? 'integration');
    case 'assistant.route':
      return `route -> ${p.targetAssistant ?? (p.fromContext ? `(from context.${p.contextKey ?? 'routeTarget'})` : 'unspecified')}`;
    case 'message.send':
      return 'message.send';
    default:
      return action.type;
  }
}
