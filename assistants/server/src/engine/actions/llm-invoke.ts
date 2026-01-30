import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { invokeLLM, isIntegrationsAvailable, TokenAuthError } from '../../integrations-client.js';
import { interpolate } from '../template.js';

// Re-export for consumers
export { TokenAuthError };

export interface LLMInvokeParams {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  promptTemplate?: string;
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
    // Default template for backwards compatibility
    const template = params.promptTemplate || '{{message.content}}';

    // Use unified Symbia Script interpolation
    // Supports both {{@user.name}} and legacy {{message.content}} syntax
    return interpolate(template, context);
  }

  private async callLLM(
    params: LLMInvokeParams,
    prompt: string,
    context: ExecutionContext
  ): Promise<{ content: string; model: string; usage: { promptTokens: number; completionTokens: number } }> {
    const provider = params.provider || 'openai';
    const model = params.model || 'gpt-4o-mini';
    const systemPrompt = params.systemPrompt || 'You are a helpful assistant.';

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

    const response = await invokeLLM(token, {
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: params.temperature,
      maxTokens: params.maxTokens,
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
