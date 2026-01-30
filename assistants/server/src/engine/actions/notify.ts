import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { interpolate } from '../template.js';

export interface NotifyParams {
  channel?: 'email' | 'sms' | 'webhook' | 'slack' | 'push';
  recipient?: string;
  recipientId?: string;
  subject?: string;
  content?: string;
  contentTemplate?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export class NotifyHandler extends BaseActionHandler {
  type = 'notify';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as NotifyParams;

    try {
      let content = params.content || '';

      if (params.contentTemplate) {
        // Interpolate using unified Symbia Script
        content = interpolate(params.contentTemplate, context);
      }

      const notification = {
        id: crypto.randomUUID(),
        orgId: context.orgId,
        conversationId: context.conversationId,
        channel: params.channel || 'webhook',
        recipient: params.recipient,
        recipientId: params.recipientId,
        subject: params.subject,
        content,
        metadata: params.metadata || {},
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      if (params.channel === 'webhook' && params.webhookUrl) {
        await this.sendWebhook(params.webhookUrl, notification, context);
        notification.status = 'sent';
      }

      return this.success({
        notificationId: notification.id,
        channel: notification.channel,
        status: notification.status,
        notification,
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send notification';
      return this.failure(message, Date.now() - start);
    }
  }

  private async sendWebhook(
    url: string,
    notification: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notification,
        context: {
          orgId: context.orgId,
          conversationId: context.conversationId,
          trigger: context.trigger,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  }
}
