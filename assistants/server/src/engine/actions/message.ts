import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { seal, type ProvenanceStep } from '../provenance.js';
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

      // Seal the envelope over the content actually being sent.
      //
      // The template decides the arena as much as the actions do: a reply
      // whose text is {{steps.step-calc.result}} carries a computed value
      // verbatim, while one whose text is {{steps.step-answer.response}} is
      // whatever a model wrote. Detecting that here — from the template, at
      // the moment of sending — is the only place both facts are available.
      const steps = (context.provenance as ProvenanceStep[] | undefined) ?? [];
      const modelStepIds = steps
        .filter((st) => st.action === 'llm.invoke')
        .map((st) => st.id);
      const contentFromModel = modelStepIds.some((id) => template.includes(id));

      const envelope = seal({
        content,
        steps,
        contentFromModel,
        rule: context.provenanceRule as string | undefined,
        assistant: (context.metadata as Record<string, unknown> | undefined)?.assistantKey as string | undefined,
        runId: (context.metadata as Record<string, unknown> | undefined)?.runId as string | undefined,
        causedBy: context.message?.id,
      });

      const message = {
        id: crypto.randomUUID(),
        conversationId: context.conversationId,
        orgId: context.orgId,
        role: params.role || 'assistant',
        content,
        channel: params.channel,
        metadata: {
          ...(params.metadata || {}),
          // Structured, hashed, and verifiable — not a sentence appended to
          // the text. The chat window renders from this; nothing renders from
          // a string an author remembered to write.
          symbia: { provenance: envelope },
        },
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
