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
import {
  resolveAssistant,
  getAllLoadedAssistants,
  loadedAssistantKey,
} from '../../services/assistant-loader.js';
import { emitEvent } from '@symbia/relay';
import { createMessagingClient } from '@symbia/messaging-client';
import { sealDelegation, type ProvenanceStep } from '../provenance.js';

interface AssistantRouteParams {
  // Target assistant key (e.g., 'log-analyst')
  targetAssistant: string;
  // Optional reason for routing (for observability)
  reason?: string;
  // If true, get target from context.routeTarget instead of params
  fromContext?: boolean;
  // Context key to read target from (default: 'routeTarget')
  contextKey?: string;
  /**
   * Context key holding the message text to forward, when it differs from what
   * the person typed — e.g. after `context.resolve` substituted a
   * back-reference. The specialist must receive the RESOLVED text, or it is
   * handed "multiply that by 10" and refuses for the reason the resolution
   * just removed.
   */
  contentKey?: string;
}

export class AssistantRouteHandler extends BaseActionHandler {
  type = 'assistant.route';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const startTime = Date.now();
    const params = config.params as unknown as AssistantRouteParams;

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

    // Resolve by key OR alias, against the registry. The hardcoded alias table
    // that used to sit here mapped six of its seven targets to assistants that
    // do not exist, and rewrote the real 'builder' into 'assistants-assistant'.
    // See resolveAssistant() in assistant-loader for the measurement.
    const requested = targetAssistant;
    const resolved = resolveAssistant(requested);
    if (!resolved || !resolved.ruleSet) {
      const known = getAllLoadedAssistants()
        .map((l) => {
          const k = loadedAssistantKey(l);
          return l.alias && l.alias !== k ? `${k} (@${l.alias})` : k;
        })
        .filter(Boolean)
        .sort()
        .join(', ');
      // Name what was asked for AND what exists. "Assistant 'x' not found" sent
      // an operator looking for a broken assistant when the real answer was
      // that the name was never a name.
      console.log(`[AssistantRoute] '${requested}' does not resolve. Loaded: ${known}`);
      return this.failure(
        `No assistant named '${requested}'. Loaded assistants: ${known}`,
        Date.now() - startTime
      );
    }

    targetAssistant = loadedAssistantKey(resolved)!;
    const assistant = resolved;

    // A conversation is not a place to discover a cycle.
    //
    // assistant.route forwards a message.new event that re-enters
    // handleSDNMessageNew. Routing to yourself re-triggers the same ruleset on
    // the same message, matches the same rule, and routes again — an unbounded
    // loop that costs a model call per iteration and is only visible as a
    // climbing bill. Refuse it at the boundary rather than relying on every
    // future ruleset to be written carefully.
    const selfKey = (context.event?.data as { assistantKey?: string } | undefined)?.assistantKey;
    if (selfKey && selfKey === targetAssistant) {
      return this.failure(
        `Refusing to route to self ('${targetAssistant}') — that is an unbounded loop, not a delegation`,
        Date.now() - startTime
      );
    }

    // Second cycle guard: a message that arrived here BY routing does not get
    // routed onward. One hop. Two assistants that each route to the other
    // would otherwise ping-pong forever, and neither ruleset would look wrong
    // on its own.
    const alreadyRouted = (context.message?.metadata as { routedFrom?: string } | undefined)?.routedFrom;
    if (alreadyRouted) {
      return this.failure(
        `Message was already routed by '${alreadyRouted}'; refusing a second hop`,
        Date.now() - startTime
      );
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

      // SEAL THE DECISION HERE, BECAUSE THERE IS NOWHERE ELSE.
      //
      // A reply is sealed inside message.send. This assistant will not send
      // one — that is the whole point of delegating — so `suppressResponse`
      // returns before any seal and `context.provenance` is discarded with the
      // context. The specialist then starts a fresh ExecutionContext with an
      // empty array. This is the only moment the decision exists.
      //
      // The steps recorded so far are the classifier's: whatever fetched the
      // roster, and the model call that chose. The route itself is appended
      // because rule-executor records a step only AFTER its handler returns,
      // so at this instant the action doing the routing is not yet in its own
      // provenance.
      // What the specialist actually receives. Falls back to what the person
      // typed, so a rule that does no resolution behaves exactly as before.
      const resolved = params.contentKey
        ? (context.context[params.contentKey] as { text?: string; resolved?: boolean } | undefined)
        : undefined;
      const forwardedContent =
        resolved?.resolved && typeof resolved.text === 'string'
          ? resolved.text
          : context.message?.content;

      const selfName =
        selfKey ||
        (context.metadata as { assistantKey?: string } | undefined)?.assistantKey ||
        'coordinator';
      const priorSteps = (context.provenance ?? []) as ProvenanceStep[];

      // NAME THE DECIDER, AND SAY WHETHER IT CAN BE RUN AGAIN.
      //
      // A declared match is a function of the message and the registry: no
      // model, no network, recomputable. A model choosing is none of those.
      // Both are legitimate; reporting them the same way is not, because the
      // lane the reply travels in depends on which happened.
      const decision = context.context[params.contextKey || 'routeTarget'] as
        | { matchedPattern?: string; method?: string; tieBroken?: boolean }
        | undefined;
      const modelSteps = priorSteps.filter((s) => s.action === 'llm.invoke');

      // Two escalations, and only one of them leaves the canonical lane.
      // `declaration` and `classifier` are both recomputable; a generative
      // model is not. Reporting them with one flag was the error corrected in
      // docs/2026-08-11-lean-deterministic.md.
      const tier: 'declaration' | 'classifier' | 'model' =
        modelSteps.length > 0
          ? 'model'
          : decision?.method === 'classifier'
            ? 'classifier'
            : 'declaration';

      const decidedBy =
        tier === 'model'
          ? modelSteps.map((s) => s.source).join(', ') || undefined
          : tier === 'classifier'
            ? `assistants.route (${decision?.matchedPattern ?? 'classifier'})`
            : `assistants.route (declared pattern ${JSON.stringify(decision?.matchedPattern ?? '')}${decision?.tieBroken ? ', TIE BROKEN BY NAME' : ''})`;

      const delegation = sealDelegation({
        from: selfName,
        to: targetAssistant,
        reason: params.reason,
        decidedBy: decidedBy || undefined,
        method: tier,
        causedBy: context.message?.id,
        conversationId: context.conversationId,
        steps: [
          ...priorSteps,
          {
            id: (config as { id?: string }).id || 'assistant.route',
            action: 'assistant.route',
            source: `${selfName} -> ${targetAssistant}`,
            ok: true,
            by: selfName,
          },
        ],
      });

      const forwardPayload = {
        conversationId: context.conversationId,
        message: {
          id: context.message?.id,
          sender_id: context.user?.id,
          sender_type: 'user' as const,
          content: forwardedContent,
          created_at: new Date().toISOString(),
          metadata: {
            // Carried so the specialist's reply can show that the question it
            // answered is not word-for-word the question that was asked.
            ...(forwardedContent !== context.message?.content
              ? { resolvedFrom: context.message?.content }
              : {}),
            // Was the literal string 'coordinator' regardless of who routed,
            // so the one surviving breadcrumb would have lied the moment
            // anything else delegated.
            routedFrom: selfName,
            routeReason: params.reason,
            // The sealed decision travels with the message it caused. The
            // specialist cannot have forged it and does not need to be trusted
            // to describe it.
            symbia: { delegation },
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
        context.conversationId,
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
        await emitEvent('message.new', forwardPayload, context.conversationId);
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
