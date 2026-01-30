import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext, ConversationState } from '../types.js';

export interface StateTransitionParams {
  targetState: ConversationState;
  reason?: string;
}

const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  'idle': ['ai_active', 'agent_active', 'resolved'],
  'ai_active': ['waiting_for_user', 'handoff_pending', 'resolved', 'idle'],
  'waiting_for_user': ['ai_active', 'handoff_pending', 'resolved', 'archived'],
  'handoff_pending': ['agent_active', 'ai_active', 'resolved'],
  'agent_active': ['ai_active', 'handoff_pending', 'resolved', 'waiting_for_user'],
  'resolved': ['archived', 'ai_active', 'idle'],
  'archived': ['idle'],
};

export class StateTransitionHandler extends BaseActionHandler {
  type = 'state.transition';
  
  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as Partial<StateTransitionParams>;
    
    if (!params.targetState) {
      return this.failure('targetState is required', Date.now() - start);
    }
    
    try {
      const currentState = context.conversationState;
      const targetState = params.targetState;
      
      const validTargets = VALID_TRANSITIONS[currentState] || [];
      if (!validTargets.includes(targetState)) {
        return this.failure(
          `Invalid state transition from '${currentState}' to '${targetState}'`,
          Date.now() - start
        );
      }
      
      return this.success({
        previousState: currentState,
        newState: targetState,
        reason: params.reason,
        transitionedAt: new Date().toISOString(),
      }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to transition state';
      return this.failure(message, Date.now() - start);
    }
  }
}

export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
  const validTargets = VALID_TRANSITIONS[from] || [];
  return validTargets.includes(to);
}

export function getValidTransitions(from: ConversationState): ConversationState[] {
  return VALID_TRANSITIONS[from] || [];
}
