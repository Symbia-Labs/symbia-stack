import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { interpolate } from '../template.js';

export interface MessageSendParams {
  content?: string;
  contentTemplate?: string;
  template?: string; // Alias for contentTemplate
  role?: 'assistant' | 'system' | 'agent';
  channel?: string;
  metadata?: Record<string, unknown>;
}

export class MessageSendHandler extends BaseActionHandler {
  type = 'message.send';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as MessageSendParams;

    try {
      let content = params.content || '';

      // Use template or contentTemplate if provided, otherwise use content
      const template = params.template || params.contentTemplate || content;

      // Interpolate using unified Symbia Script system
      // Supports both {{@user.name}} and legacy {{message.content}} syntax
      content = interpolate(template, context);

      const message = {
        id: crypto.randomUUID(),
        conversationId: context.conversationId,
        orgId: context.orgId,
        role: params.role || 'assistant',
        content,
        channel: params.channel,
        metadata: params.metadata || {},
        createdAt: new Date().toISOString(),
      };

      return this.success({
        messageId: message.id,
        content: message.content,
        role: message.role,
        message,
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      return this.failure(message, Date.now() - start);
    }
  }
}
