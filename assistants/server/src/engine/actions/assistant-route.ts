/**
 * Assistant Route Action
 *
 * Silently routes a message to another assistant for processing.
 * Used by the coordinator to orchestrate conversations without generating visible responses.
 *
 * The coordinator:
 * 1. Adds the target assistant as a participant to the conversation
 * 2. Forwards the message to the target assistant via SDN
 * 3. The target assistant receives the message and responds directly
 *
 * The coordinator stays completely silent.
 */

import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { getLoadedAssistant } from '../../services/assistant-loader.js';
import { emitEvent } from '@symbia/relay';
import { createMessagingClient } from '@symbia/messaging-client';

interface AssistantRouteParams {
  // Target assistant key (e.g., 'log-analyst')
  targetAssistant: string;
  // Optional reason for routing (for observability)
  reason?: string;
  // If true, get target from context.routeTarget instead of params
  fromContext?: boolean;
  // Context key to read target from (default: 'routeTarget')
  contextKey?: string;
}

export class AssistantRouteHandler extends BaseActionHandler {
  type = 'assistant.route';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const startTime = Date.now();
    const params = config.params as AssistantRouteParams;

    // Get target assistant - either from params or from context (set by LLM)
    let targetAssistant = params.targetAssistant;

    if (params.fromContext) {
      const contextKey = params.contextKey || 'routeTarget';
      const contextValue = context.context[contextKey];

      if (typeof contextValue === 'string') {
        targetAssistant = contextValue;
      } else if (contextValue && typeof contextValue === 'object') {
        // LLM might return { assistant: 'log-analyst', reason: '...' }
        const obj = contextValue as Record<string, unknown>;
        targetAssistant = (obj.assistant || obj.target || obj.key) as string;
      }
    }

    if (!targetAssistant) {
      return this.failure('No target assistant specified for routing', Date.now() - startTime);
    }

    // Clean up the assistant key (remove @ prefix if present)
    targetAssistant = targetAssistant.replace(/^@/, '').toLowerCase();

    // Map common aliases
    const aliasMap: Record<string, string> = {
      'logs': 'log-analyst',
      'log': 'log-analyst',
      'catalog': 'catalog-search',
      'search': 'catalog-search',
      'debug': 'run-debugger',
      'debugger': 'run-debugger',
      'usage': 'usage-reporter',
      'welcome': 'onboarding',
      'onboard': 'onboarding',
      'help': 'coordinator',
      'builder': 'assistants-assistant',
      'build': 'assistants-assistant',
    };

    targetAssistant = aliasMap[targetAssistant] || targetAssistant;

    // Get target assistant configuration
    const assistant = getLoadedAssistant(targetAssistant);
    if (!assistant || !assistant.ruleSet) {
      console.log(`[AssistantRoute] Target assistant '${targetAssistant}' not found or has no rules`);
      return this.failure(`Assistant '${targetAssistant}' not found`, Date.now() - startTime);
    }

    console.log(`[AssistantRoute] Routing message to ${targetAssistant} (reason: ${params.reason || 'user intent'})`);

    try {
      const targetUserId = `assistant:${targetAssistant}`;

      // Step 1: Add target assistant to the conversation as a participant
      console.log(`[AssistantRoute] Adding ${targetAssistant} to conversation ${context.conversationId}`);

      try {
        const messagingClient = createMessagingClient();
        await messagingClient.joinConversation(context.conversationId, {
          asUserId: targetUserId,
        });
        console.log(`[AssistantRoute] ${targetAssistant} joined conversation`);
      } catch (joinError) {
        // May already be a participant - that's OK
        const joinMsg = joinError instanceof Error ? joinError.message : String(joinError);
        console.log(`[AssistantRoute] Join attempt for ${targetAssistant}: ${joinMsg}`);
      }

      // Step 2: Forward the message to the target assistant via SDN
      // This triggers the target assistant to process the message and respond directly
      console.log(`[AssistantRoute] Forwarding message to ${targetAssistant} via SDN`);

      const forwardPayload = {
        conversationId: context.conversationId,
        message: {
          id: context.message?.id,
          sender_id: context.user?.id,
          sender_type: 'user' as const,
          content: context.message?.content,
          created_at: new Date().toISOString(),
          metadata: {
            routedFrom: 'coordinator',
            routeReason: params.reason,
          },
        },
        // Target this specific assistant
        assistants: [{
          userId: targetUserId,
          key: targetAssistant,
        }],
        orgId: context.orgId.split(':')[1] || 'default',
      };

      const emitResult = await emitEvent(
        'message.new',
        forwardPayload,
        undefined,
        {
          target: 'assistants',
          boundary: 'intra',
        }
      );

      if (emitResult) {
        console.log(`[AssistantRoute] Message forwarded to ${targetAssistant}: ${emitResult.eventId}`);
      } else {
        console.warn(`[AssistantRoute] Failed to forward message via SDN, trying direct emit`);
        // Fallback: emit without target constraint
        await emitEvent('message.new', forwardPayload);
      }

      // Return success - coordinator stays silent, target assistant will respond
      return this.success({
        routed: true,
        targetAssistant,
        reason: params.reason,
        // Mark that coordinator should not produce its own response
        suppressResponse: true,
      }, Date.now() - startTime);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[AssistantRoute] Failed to route to ${targetAssistant}:`, errorMsg);
      return this.failure(`Failed to route to ${targetAssistant}: ${errorMsg}`, Date.now() - startTime);
    }
  }
}
