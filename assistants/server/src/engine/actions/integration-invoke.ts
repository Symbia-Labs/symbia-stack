/**
 * Integration Invoke Action Handler
 *
 * Executes any operation from a registered integration via namespace path.
 * e.g., integrations.openai.chat.completions.create
 *
 * Now uses unified Symbia Script for template interpolation.
 */

import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';
import { interpolate } from '../template.js';

const INTEGRATIONS_SERVICE_URL = resolveServiceUrl(ServiceId.INTEGRATIONS);

export interface IntegrationInvokeParams {
  // Operation path (e.g., "integrations.openai.chat.completions.create")
  operation: string;

  // Request parameters (query, path, header params)
  params?: Record<string, unknown>;

  // Request body
  body?: unknown;

  // Body template with {{@context}} substitution (Symbia Script)
  bodyTemplate?: string;

  // Additional headers
  headers?: Record<string, string>;

  // Timeout in ms
  timeout?: number;

  // Store result in context under this key
  resultKey?: string;
}

export class IntegrationInvokeHandler extends BaseActionHandler {
  type = 'integration.invoke';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as IntegrationInvokeParams;

    try {
      // Validate operation path
      if (!params.operation) {
        return this.failure('No operation specified', Date.now() - start);
      }

      // Build request body
      let body = params.body;
      if (params.bodyTemplate) {
        body = this.buildTemplatedBody(params.bodyTemplate, context);
      }

      // Get auth token from context
      const token = (context.metadata as Record<string, unknown>)?.token as string;
      if (!token) {
        return this.failure('No auth token available in execution context', Date.now() - start);
      }

      // Call the integrations service
      const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...params.headers,
        },
        body: JSON.stringify({
          operation: params.operation,
          params: params.params,
          body,
          timeout: params.timeout,
        }),
        signal: params.timeout ? AbortSignal.timeout(params.timeout) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        return this.failure(
          `Integration error: ${error.error || response.statusText}`,
          Date.now() - start
        );
      }

      const result = await response.json() as {
        success: boolean;
        data?: unknown;
        error?: string;
        requestId: string;
        durationMs: number;
      };

      if (!result.success) {
        return this.failure(result.error || 'Integration invocation failed', Date.now() - start);
      }

      // Store result in context if resultKey specified
      if (params.resultKey && result.data) {
        context.context[params.resultKey] = result.data;
      }

      return this.success({
        data: result.data,
        operation: params.operation,
        requestId: result.requestId,
        integrationDurationMs: result.durationMs,
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Integration invocation failed';
      return this.failure(message, Date.now() - start);
    }
  }

  private buildTemplatedBody(template: string, context: ExecutionContext): unknown {
    // Use unified Symbia Script interpolation
    const replaced = interpolate(template, context);

    // Try to parse as JSON
    try {
      return JSON.parse(replaced);
    } catch {
      return replaced;
    }
  }
}
