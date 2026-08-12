import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { invokeLLM, isIntegrationsAvailable, resolveUsableProvider, TokenAuthError } from '../../integrations-client.js';
import { interpolate } from '../template.js';
import { buildAttachmentBlock } from './attachments.js';
import { getActionConfig } from '../../config/llm-config-resolver.js';

// Re-export for consumers
export { TokenAuthError };

export interface LLMInvokeParams {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  promptTemplate?: string;
  userPrompt?: string; // Alias for promptTemplate
  temperature?: number;
  maxTokens?: number;
  contextFields?: string[];
  resultKey?: string; // Key to store result in context for subsequent actions
}

export class LLMInvokeHandler extends BaseActionHandler {
  type = 'llm.invoke';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as LLMInvokeParams;

    try {
      const prompt = this.buildPrompt(params, context);
      const response = await this.callLLM(params, prompt, context);

      // AN EMPTY ANSWER IS A FAILURE, NOT A SUCCESS.
      //
      // The provider returned no text and every step downstream reported ok:
      // "llm.invoke(ok), message.send(ok)" — and no message was ever sent,
      // because message.send happily rendered an empty template. Measured
      // 8 Aug 2026 on the coordinator: four service.calls succeeded, the model
      // returned "", and the operator saw silence with nothing in any log
      // marked as a problem.
      //
      // Silence that reports success is the worst shape a failure can take
      // here. It is indistinguishable from an assistant that had nothing to
      // say, and it is the reason this took three rounds to see.
      if (!response.content || response.content.trim() === '') {
        return this.failure(
          `LLM returned an empty response (provider=${response.model ? 'resolved' : 'unknown'}, ` +
            `model=${response.model || 'unknown'}, promptChars=${prompt.length}). ` +
            `Nothing was sent.`,
          Date.now() - start
        );
      }
      console.log(`[LLMInvoke] model=${response.model} promptChars=${prompt.length} replyChars=${response.content.length}`);

      // Store result in context if resultKey is specified
      // Try to parse as JSON for structured outputs (like routing decisions)
      if (params.resultKey) {
        let contextValue: unknown = response.content;
        try {
          // Try to parse JSON response
          contextValue = JSON.parse(response.content);
        } catch {
          // Not JSON, store as string
        }
        context.context[params.resultKey] = contextValue;
        console.log(`[LLMInvoke] Stored result in context.${params.resultKey}:`, contextValue);
      }

      // Also store in steps for template reference (like tool.invoke does)
      const actionId = (config as { id?: string }).id;
      if (actionId) {
        if (!context.context.steps) {
          context.context.steps = {};
        }
        (context.context.steps as Record<string, unknown>)[actionId] = { response: response.content };
        console.log(`[LLMInvoke] Stored result in steps.${actionId}.response`);
      }

      return this.success({
        response: response.content,
        model: response.model,
        usage: response.usage,
        promptUsed: prompt,
      }, Date.now() - start);
    } catch (error) {
      // Re-throw token auth errors so they can be handled at a higher level
      if (error instanceof TokenAuthError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'LLM invocation failed';
      return this.failure(message, Date.now() - start);
    }
  }

  private buildPrompt(params: LLMInvokeParams, context: ExecutionContext): string {
    // Support both promptTemplate and userPrompt (alias)
    const template = params.promptTemplate || params.userPrompt || '{{message.content}}';

    // Use unified Symbia Script interpolation
    // Supports both {{@user.name}} and legacy {{message.content}} syntax
    const prompt = interpolate(template, context);

    return prompt + buildAttachmentBlock(context, template);
  }

  private async callLLM(
    params: LLMInvokeParams,
    prompt: string,
    context: ExecutionContext
  ): Promise<{ content: string; model: string; usage: { promptTokens: number; completionTokens: number } }> {
    // THE SYSTEM PROMPT IS A TEMPLATE TOO.
    //
    // It was passed to the provider raw while userPrompt went through
    // interpolate(), so a systemPrompt containing {{roster}} reached the model
    // as the literal seven characters "{{roster}}". The model behaved
    // correctly on what it was shown — it reported that no specialist was
    // available — and the rule looked like a classification failure rather
    // than a plumbing one.
    //
    // Nothing marked the two fields as different. Both are prose with braces
    // in a JSON rule; one was a template and one was not, and the only way to
    // find out was to read this file. Measured 10 Aug 2026, on the first rule
    // that ever put data in a system prompt.
    const systemPrompt = interpolate(
      params.systemPrompt || 'You are a helpful assistant.',
      context
    );

    // Verify Integrations service is available
    const integrationsAvailable = await isIntegrationsAvailable();
    if (!integrationsAvailable) {
      throw new Error('Integrations service is not available');
    }

    // Get auth token from context metadata
    const token = (context.metadata as Record<string, unknown>)?.token as string;
    if (!token) {
      throw new Error('No auth token available in execution context');
    }

    // Get rawOrgId for credential lookup (not the composite key)
    const rawOrgId = (context.metadata as Record<string, unknown>)?.rawOrgId as string | undefined;

    // ONE MERGED CONFIGURATION, WITH ACTION PARAMS STILL WINNING.
    //
    // Until 12 Aug this read `params.*` directly and never consulted the
    // assistant's configuration, because `context.llmConfig` was undefined on
    // every execution — nothing assigned it. So an assistant declaring
    // temperature 0.7 sent no temperature at all, and every generation ran at
    // whatever the provider defaults to.
    //
    // getActionConfig has implemented exactly this precedence since January
    // and had no caller. Precedence is unchanged from what it already encoded:
    //
    //   action params  >  assistant config  >  preset  >  system defaults
    //
    // so no rule that sets a value explicitly changes behaviour. What changes
    // is rules that set nothing and previously meant nothing.
    const merged = context.llmConfig
      ? getActionConfig(context.llmConfig, params as unknown as Record<string, unknown>)
      : undefined;

    let provider = params.provider ?? merged?.provider;
    let model = params.model ?? merged?.model;

    // WHY THE CREDENTIAL PROBE STAYS.
    //
    // Wiring the merged config in naively makes every unconfigured assistant
    // resolve to SYSTEM_DEFAULTS — openai / gpt-4o-mini — then hard-fail on an
    // org whose only credential is anthropic. That is a regression introduced
    // by a change whose entire purpose is making configuration honest, and I
    // wrote it before catching it: `provider.type` is ALWAYS populated in a
    // resolved config, so "is it set?" cannot answer "did anyone choose it?".
    //
    // `declared` is set only when an author wrote a provider down. A declared
    // provider is used as declared; an undeclared one still asks which
    // credential exists, exactly as before.
    const providerWasDeclared = Boolean(params.provider || context.llmConfig?.provider?.declared);

    if (!providerWasDeclared) {
      const usable = await resolveUsableProvider(token, rawOrgId);
      if (!usable) {
        throw new Error(
          'No LLM provider has a usable credential. Add an API key in Settings, ' +
            'or configure this assistant to use a local provider.'
        );
      }
      provider = usable.provider;
      model = params.model ?? usable.model;
      console.log(
        `[llm.invoke] provider not declared; resolved by credential to ${provider} (${model})`
      );
    }

    const response = await invokeLLM(token, {
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: params.temperature ?? merged?.temperature,
      maxTokens: params.maxTokens ?? merged?.maxTokens,
      orgId: rawOrgId,
    });

    return {
      content: response.content,
      model: response.model,
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
      },
    };
  }
}
