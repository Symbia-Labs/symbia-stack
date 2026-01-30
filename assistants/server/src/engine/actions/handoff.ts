import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';

export interface HandoffCreateParams {
  reason?: string;
  priority?: number;
  tags?: string[];
  assignTo?: string;
  contextSummary?: string;
}

export interface HandoffAssignParams {
  handoffId: string;
  agentId: string;
}

export interface HandoffResolveParams {
  handoffId?: string;
  resolution?: string;
}

export class HandoffCreateHandler extends BaseActionHandler {
  type = 'handoff.create';
  
  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as HandoffCreateParams;
    
    try {
      const handoffRequest = {
        id: crypto.randomUUID(),
        conversationId: context.conversationId,
        orgId: context.orgId,
        status: 'pending',
        reason: params.reason || 'Handoff requested',
        priority: params.priority ?? 0,
        tags: params.tags || [],
        contextSummary: params.contextSummary || this.generateContextSummary(context),
        requestedAt: new Date().toISOString(),
      };
      
      return this.success({
        handoffId: handoffRequest.id,
        status: 'pending',
        message: 'Handoff request created',
        request: handoffRequest,
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create handoff';
      return this.failure(message, Date.now() - start);
    }
  }
  
  private generateContextSummary(context: ExecutionContext): string {
    const parts: string[] = [];
    
    if (context.message?.content) {
      parts.push(`Last message: ${context.message.content.substring(0, 200)}`);
    }
    
    if (context.user?.displayName) {
      parts.push(`User: ${context.user.displayName}`);
    }
    
    parts.push(`Conversation state: ${context.conversationState}`);
    
    return parts.join('\n');
  }
}

export class HandoffAssignHandler extends BaseActionHandler {
  type = 'handoff.assign';
  
  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as Partial<HandoffAssignParams>;
    
    if (!params.handoffId) {
      return this.failure('handoffId is required', Date.now() - start);
    }
    if (!params.agentId) {
      return this.failure('agentId is required', Date.now() - start);
    }
    
    try {
      return this.success({
        handoffId: params.handoffId,
        agentId: params.agentId,
        conversationId: context.conversationId,
        status: 'assigned',
        assignedAt: new Date().toISOString(),
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign handoff';
      return this.failure(message, Date.now() - start);
    }
  }
}

export class HandoffResolveHandler extends BaseActionHandler {
  type = 'handoff.resolve';
  
  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as HandoffResolveParams;
    
    try {
      return this.success({
        handoffId: params.handoffId,
        conversationId: context.conversationId,
        status: 'resolved',
        resolution: params.resolution,
        resolvedAt: new Date().toISOString(),
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve handoff';
      return this.failure(message, Date.now() - start);
    }
  }
}
