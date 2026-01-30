import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { interpolate } from '../template.js';

export interface WebhookCallParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  bodyTemplate?: string;
  timeout?: number;
}

export class WebhookCallHandler extends BaseActionHandler {
  type = 'webhook.call';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as Partial<WebhookCallParams>;

    if (!params.url) {
      return this.failure('url is required', Date.now() - start);
    }

    try {
      // Interpolate URL using unified Symbia Script
      const url = interpolate(params.url, context);
      const method = params.method || 'POST';
      const timeout = params.timeout || 30000;

      let body: string | undefined;
      if (params.bodyTemplate) {
        // Interpolate body template using unified Symbia Script
        body = interpolate(params.bodyTemplate, context);
      } else if (params.body) {
        body = JSON.stringify(params.body);
      } else if (method !== 'GET' && method !== 'DELETE') {
        body = JSON.stringify({
          orgId: context.orgId,
          conversationId: context.conversationId,
          trigger: context.trigger,
          message: context.message,
          context: context.context,
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...params.headers,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let responseBody: unknown;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        if (!response.ok) {
          return this.failure(
            `Webhook returned ${response.status}: ${JSON.stringify(responseBody)}`,
            Date.now() - start
          );
        }

        return this.success({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        }, Date.now() - start);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook call failed';
      return this.failure(message, Date.now() - start);
    }
  }
}
