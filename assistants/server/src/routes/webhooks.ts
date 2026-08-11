import { Router, Request, Response } from 'express';
import { db } from '../lib/db.js';
import { graphRuns, runLogs, actorPrincipals, promptGraphs, compiledGraphs } from '@shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createMessagingClient } from '@symbia/messaging-client';
import { getAgentToken, createIdentityClient, clearAgentToken } from '@symbia/id';
import {
  emitEvent,
  emitClaim,
  emitDefer,
  emitObserve,
  waitForClaimWindow,
  type SandboxEvent,
  type AssistantJustification,
} from '@symbia/relay';
import { defaultCoordinator } from '../engine/run-coordinator.js';
import {
  getLoadedAssistant,
  getAllLoadedAssistants,
  resolveAssistant,
  loadedAssistantKey,
} from '../services/assistant-loader.js';
import type { TriggerType } from '../engine/types.js';
import { TokenAuthError } from '../integrations-client.js';
import { DEFAULT_ORG_IDS } from '@symbia/seed';

// Default org ID for credential lookups when not specified
const DEFAULT_ORG_ID = DEFAULT_ORG_IDS.SYMBIA_LABS;

const router = Router();

// Cache for bootstrap assistant tokens
const bootstrapTokenCache = new Map<string, string>();

// ==============================================================================
// SDN Event Handlers
// ==============================================================================

/**
 * SDN payload for message.new events from Messaging service
 */
interface SDNMessagePayload {
  conversationId: string;
  message: {
    id: string;
    sender_id: string;
    sender_type: 'user' | 'agent';
    content: string;
    content_type?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
  };
  // Entity-based addressing
  senderEntityId?: string;
  recipientEntityIds?: string[];
  // Legacy: list of assistants
  assistants?: Array<{
    userId: string;
    key: string | null;
    entityId?: string;
  }>;
  orgId?: string;
  _auth?: { token?: string };
}

/**
 * The assistant key for a loaded assistant.
 *
 * loadedAssistants is a Map<key, LoadedAssistant> and getAllLoadedAssistants()
 * returns only the VALUES, so the key is not on the object — `config.key` is
 * undefined, which is exactly what tsc says and what the log said when the
 * mention router printed "resolves to undefined".
 *
 * The key lives on the catalog resource as "assistants/<key>", which is where
 * assistant-loader derives it from in the first place.
 */
const loadedKey = loadedAssistantKey as (loaded: { resource: { key?: string } }) => string | undefined;

/**
 * Flatten action results, descending into the container actions.
 *
 * A REPLY THAT NEVER LEAVES IS INDISTINGUISHABLE FROM AN ASSISTANT WITH
 * NOTHING TO SAY.
 *
 * `message.send` does not send. It builds the message, seals the provenance
 * envelope over the content, and RETURNS it; the caller below is what actually
 * puts it on the bus. That caller scanned the rule's top-level
 * `actionsExecuted` only.
 *
 * `condition`, `parallel` and `loop` run their child actions themselves and
 * report them inside their own `output` — `output.results` for condition and
 * parallel, `output.iterations` for loop. So a `message.send` inside any
 * branch produced a message that nothing ever read, while `condition` returned
 * `success: true` and the provenance step recorded `ok`. The operator saw
 * silence with every log line green.
 *
 * The same omission swallowed `assistant.route`'s `suppressResponse`, which is
 * the flag that keeps the coordinator quiet after it delegates. A branch that
 * routed would have produced a delegation AND a coordinator reply talking over
 * it.
 *
 * Measured 10 Aug 2026: all three container actions were registered in the
 * handler map, and none of them could produce a reply. They had never had a
 * caller, so nothing had found it.
 */
function flattenActionResults(actions: ActionResultLike[]): ActionResultLike[] {
  const flat: ActionResultLike[] = [];

  for (const action of actions) {
    flat.push(action);

    const output = action.output as
      | { results?: unknown; iterations?: unknown }
      | undefined;
    if (!output || typeof output !== 'object') continue;

    // condition: output.results — the branch that ran
    // parallel:  output.results — every branch
    // loop:      output.iterations — each pass, itself a list of results
    const nested: ActionResultLike[] = [];
    if (Array.isArray(output.results)) {
      nested.push(...(output.results as ActionResultLike[]));
    }
    if (Array.isArray(output.iterations)) {
      for (const iteration of output.iterations as unknown[]) {
        if (Array.isArray(iteration)) {
          nested.push(...(iteration as ActionResultLike[]));
        } else if (
          iteration &&
          typeof iteration === 'object' &&
          Array.isArray((iteration as { results?: unknown }).results)
        ) {
          nested.push(...((iteration as { results: ActionResultLike[] }).results));
        }
      }
    }

    if (nested.length > 0) {
      flat.push(...flattenActionResults(nested));
    }
  }

  return flat;
}

interface ActionResultLike {
  success: boolean;
  actionType: string;
  output?: unknown;
  error?: string;
}

/**
 * Handle message.new events from the Network SDN.
 * This replaces the HTTP webhook for message routing.
 */
export async function handleSDNMessageNew(event: SandboxEvent): Promise<void> {
  const payload = event.payload.data as SDNMessagePayload;
  const runId = event.wrapper.runId;

  console.log(`[SDN] ====== RECEIVED message.new EVENT ======`);
  console.log(`[SDN] Event ID: ${event.wrapper.id}`);
  console.log(`[SDN] Run ID: ${runId}`);
  console.log(`[SDN] Conversation: ${payload.conversationId}`);
  console.log(`[SDN] Sender: ${payload.message?.sender_id} (${payload.message?.sender_type})`);
  console.log(`[SDN] Message content: ${payload.message?.content?.substring(0, 100)}...`);
  console.log(`[SDN] Assistants in payload: ${payload.assistants?.length || 0}`);

  // Don't process messages from agents (avoid loops)
  if (payload.message?.sender_type === 'agent') {
    console.log(`[SDN] Skipping message from agent: ${payload.message.sender_id}`);
    return;
  }

  // Get all assistants to process this message
  let assistantsToNotify = payload.assistants || [];

  // If no specific assistants in payload, check all loaded assistants
  if (assistantsToNotify.length === 0) {
    const allLoaded = getAllLoadedAssistants();
    console.log(`[SDN] No specific assistants in payload, will check ${allLoaded.length} loaded assistants`);

    // Convert loaded assistants to the expected format
    // Same key derivation as the mention router below. This built
    // `assistant:undefined` for every entry, so the "no participants in the
    // payload" path has never worked either — it produced a list of
    // assistants with no keys, each skipped a few lines later.
    assistantsToNotify = allLoaded
      .map(loaded => ({
        userId: `assistant:${loadedKey(loaded)}`,
        key: loadedKey(loaded) ?? null,
        entityId: (loaded.resource as { entityId?: string }).entityId,
      }))
      .filter(a => a.key);
  }

  if (assistantsToNotify.length === 0) {
    console.log(`[SDN] No assistants to notify - message will not be processed`);
    return;
  }

  console.log(`[SDN] Processing message for ${assistantsToNotify.length} assistant(s): ${assistantsToNotify.map(a => a.key).join(', ')}`);

  // Detect if message has an @mention that should be routed by coordinator
  // Format: @alias or @key at start of message (keys may contain dashes)
  const messageContent = payload.message?.content?.trim() || '';
  const mentionMatch = messageContent.match(/^@([\w-]+)/);
  const mentionedAlias = mentionMatch ? mentionMatch[1].toLowerCase() : null;

  // A DELIVERY ADDRESS BEATS A MENTION.
  //
  // This event carries an explicit recipient when it was produced by
  // assistant.route — the coordinator already decided who should answer. The
  // mention check below used to run first and OVERWRITE that decision, so a
  // routed message whose text still began with "@something" was re-resolved by
  // its own text and delivered somewhere else. The routing decision is the
  // later and better-informed of the two; text is what it was derived from.
  const isTargetedForward = Boolean(payload.assistants && payload.assistants.length > 0);
  const routedFrom = (payload.message?.metadata as { routedFrom?: string } | undefined)?.routedFrom;

  // AN @MENTION IS A ROUTE, NOT A HINT.
  //
  // If the mention names a loaded assistant, that assistant is the only one
  // that should answer. Previously the mentioned assistant was SKIPPED (see
  // below) on the assumption that the coordinator would forward to it — but
  // the coordinator's orchestrate rule is a plain llm.invoke over a prompt
  // listing its team, so it writes prose ABOUT mentions and forwards nothing.
  //
  // Measured 8 Aug 2026: "@docs help" in a conversation where docs was not a
  // participant produced "I'm Claude, made by Anthropic. I don't have a @docs
  // command" — the mentioned assistant dropped, some other assistant's
  // catch-all answering in its place. With docs as an explicit participant the
  // same message matched its help rule immediately, which is how the two paths
  // were told apart.
  if (mentionedAlias && !isTargetedForward) {
    // Resolve against ALL LOADED assistants, not just the ones in the payload.
    //
    // The payload contains the conversation's participants, and the console
    // adds only the coordinator by default — so "@docs help" arrived with
    // assistants: [coordinator] and docs was never a candidate to narrow to.
    // Searching the payload alone made this fix a no-op in exactly the case it
    // was written for, which the first test caught.
    const loadedMatch = resolveAssistant(mentionedAlias);
    const matchKey = loadedMatch ? loadedKey(loadedMatch) : undefined;
    if (loadedMatch && matchKey) {
      console.log(`[SDN] @${mentionedAlias} resolves to ${matchKey} — routing there only`);
      assistantsToNotify = [{
        userId: `assistant:${matchKey}`,
        key: matchKey,
        entityId: (loadedMatch.resource as { entityId?: string }).entityId,
      }];
    }
  }

  // Process for each assistant
  for (const assistant of assistantsToNotify) {
    if (!assistant.key) {
      console.log(`[SDN] Skipping assistant with no key: ${JSON.stringify(assistant)}`);
      continue;
    }

    // Skip assistants that were @mentioned in the original broadcast
    // Let coordinator route to them instead (avoids duplicate processing)
    // Only skip if this is NOT a targeted forward (payload.assistants is empty or undefined)
    // The skip below is now unreachable for a mention that RESOLVED, because
    // assistantsToNotify was narrowed to that one assistant above. It still
    // applies when a mention names something that is not a loaded assistant —
    // in that case the coordinator should get it, and the others should not.
    if (!isTargetedForward && mentionedAlias && assistantsToNotify.length > 1) {
      const mentioned = resolveAssistant(mentionedAlias);
      if (mentioned && loadedKey(mentioned) === assistant.key) {
        console.log(`[SDN] Skipping ${assistant.key} - was @mentioned, coordinator will route`);
        continue;
      }
    }

    try {
      console.log(`[SDN] Processing for assistant: ${assistant.key}`);
      await processMessageForAssistant(
        assistant.key,
        assistant.userId,
        assistant.entityId,
        payload,
        runId,
        payload._auth?.token
      );
      console.log(`[SDN] Finished processing for assistant: ${assistant.key}`);
    } catch (err) {
      console.error(`[SDN] Error processing message for ${assistant.key}:`, err);
    }
  }

  console.log(`[SDN] ====== FINISHED message.new EVENT ======`);
}

/**
 * Strip the assistant's @mention prefix from message content.
 * This allows rules to match command patterns without the @mention.
 * e.g., "@eval list benchmarks" -> "list benchmarks"
 */
function stripMentionPrefix(content: string, assistantKey: string, alias?: string): string {
  // Build patterns to strip: @alias, @key, @key-with-dashes
  const patterns: string[] = [];

  if (alias) {
    patterns.push(`@${alias}`);
  }
  patterns.push(`@${assistantKey}`);

  // Sort by length descending so longer patterns match first
  patterns.sort((a, b) => b.length - a.length);

  // Create regex to match any of the patterns at the start, with optional trailing space
  const regex = new RegExp(`^(${patterns.map(p => p.replace(/-/g, '\\-')).join('|')})\\s*`, 'i');

  const stripped = content.replace(regex, '').trim();

  // Log if we actually stripped something
  if (stripped !== content.trim()) {
    console.log(`[SDN] Stripped @mention: "${content.substring(0, 50)}" -> "${stripped.substring(0, 50)}"`);
  }

  return stripped;
}

/**
 * Process a message for a specific assistant and emit response via SDN.
 */
async function processMessageForAssistant(
  assistantKey: string,
  assistantUserId: string,
  assistantEntityId: string | undefined,
  payload: SDNMessagePayload,
  runId: string,
  authToken?: string
): Promise<void> {
  const assistant = getLoadedAssistant(assistantKey);
  if (!assistant || !assistant.ruleSet) {
    console.warn(`[SDN] Assistant ${assistantKey} not found or has no rules`);
    return;
  }

  const orgId = payload.orgId || DEFAULT_ORG_ID;

  // Get auth token for LLM actions.
  //
  // STRIP "Bearer ". messaging puts req.headers.authorization into
  // payload._auth.token verbatim, prefix included, and service.call then builds
  // `Authorization: Bearer ${token}` — producing "Bearer Bearer eyJ..." and a
  // 401 invalid_token on every service call an assistant made.
  //
  // The HTTP webhook path has always stripped it
  // (authHeader.startsWith('Bearer ') ? slice(7) : undefined). The SDN path,
  // which is the one actually in use, never did. Measured 8 Aug 2026: the
  // identical request with the same token, correctly formatted, returns 200
  // from inside the same container.
  let token = authToken?.startsWith('Bearer ') ? authToken.slice(7) : authToken;
  if (!token) {
    token = await getAssistantToken(assistantUserId, assistantKey);
  }

  // Load catalog resources
  const catalog = await getCatalogResources();

  // Helper to execute rules with given token
  const executeRulesWithToken = async (currentToken: string | undefined) => {
    // Strip @mention prefix from message content for rule pattern matching
    // e.g., "@eval list benchmarks" -> "list benchmarks"
    const strippedContent = stripMentionPrefix(
      payload.message.content,
      assistantKey,
      assistant.alias
    );

    // Determine if this assistant was directly @mentioned
    const wasMentioned = strippedContent !== payload.message.content.trim();

    // Transpile user message content
    const { interpolate } = await import('../engine/template.js');
    const transpiled = interpolate(strippedContent, {
      orgId: `${assistantKey}:${orgId}`,
      conversationId: payload.conversationId,
      message: {
        id: payload.message.id,
        role: 'user' as const,
        content: strippedContent,  // Use stripped content for rules
        originalContent: payload.message.content,  // Keep original for reference
      },
      user: { id: payload.message.sender_id },
      context: {},
      metadata: { token: currentToken },
      catalog,
    });

    console.log(`[SDN] Processing message for ${assistantKey}:`, { transpiled });

    // Execute rules
    return defaultCoordinator.processEvent({
      type: 'message.received' as TriggerType,
      orgId: `${assistantKey}:${orgId}`,
      conversationId: payload.conversationId,
      data: {
        assistantKey,
        messageId: payload.message.id,
        senderId: payload.message.sender_id,
        senderType: payload.message.sender_type,
        wasMentioned, // True if assistant was directly @mentioned
      },
      message: {
        id: payload.message.id,
        role: 'user',
        content: transpiled,
        metadata: {
          contentType: payload.message.content_type || 'text',
          senderId: payload.message.sender_id,
          timestamp: payload.message.created_at,
          originalContent: payload.message.content,
          // Where the operator was standing when they asked. The console sends
          // this alongside the message rather than prepending it to their
          // words, so "what am I looking at" is answerable without the person
          // restating what is already on their screen.
          //
          // It says which PANEL they are on. It does NOT contain the panel's
          // data — if the assistant needs the numbers it must fetch them
          // through the platform, with a receipt. Scraping the screen would
          // produce answers with no provenance, which is the one thing this
          // codebase must not start doing.
          symbiaContext: (payload.message as { metadata?: { symbiaContext?: unknown } })
            .metadata?.symbiaContext,
          // Carried so assistant.route can refuse a second hop. Without this
          // the one-hop guard reads undefined on every message and two
          // assistants routing to each other never stop.
          routedFrom: (payload.message as { metadata?: { routedFrom?: string } })
            .metadata?.routedFrom,
          routeReason: (payload.message as { metadata?: { routeReason?: string } })
            .metadata?.routeReason,
          // The sealed delegation that caused this message to arrive here.
          //
          // Carried through so message.send can put it inside the reply's
          // hashed body. Without this the specialist has no way to know it was
          // chosen rather than addressed, and the reply seals a chain that
          // begins halfway through what actually happened.
          symbia: (payload.message as { metadata?: { symbia?: unknown } })
            .metadata?.symbia,
        },
      },
      user: {
        id: payload.message.sender_id,
        metadata: { type: payload.message.sender_type },
      },
      catalog,
      metadata: {
        token: currentToken,
        rawOrgId: orgId, // Original org ID for credential lookup
        // THE ENVELOPE SEALS THESE. THEY HAVE ALWAYS BEEN UNDEFINED.
        //
        // message.ts reads `context.metadata.assistantKey` and
        // `context.metadata.runId` when it seals a reply. Neither was ever
        // set here: `assistantKey` lives on `event.data` (where
        // assistant-route's self-loop guard correctly reads it) and the runId
        // was generated inside RuleExecutor.execute() and never written back.
        //
        // Because both were `undefined`, JSON.stringify dropped them from the
        // hashed body — so the seal committed to their ABSENCE, and every
        // provenance envelope this platform has produced is unable to say
        // which assistant wrote the reply or which run produced it. The
        // comment in provenance.ts about correlating with the SDN wrapper
        // described something that had never happened.
        //
        // Measured 11 Aug 2026: 0 of 2 sealed replies carried either field.
        assistantKey,
        runId,
      },
    });
  };

  // Execute rules with retry on token auth failure
  let result;
  try {
    result = await executeRulesWithToken(token);
  } catch (error) {
    if (error instanceof TokenAuthError) {
      console.log(`[SDN] Token auth failed for ${assistantKey}, refreshing token and retrying...`);

      // Clear the cached token
      clearAssistantToken(assistantUserId);

      // Get a fresh token
      token = await getAssistantToken(assistantUserId, assistantKey, true);

      if (!token) {
        console.error(`[SDN] Failed to get fresh token for ${assistantKey}`);
        return;
      }

      // Retry with fresh token
      result = await executeRulesWithToken(token);
    } else {
      throw error;
    }
  }

  console.log(`[SDN] Rules evaluated: ${result.rulesEvaluated}, matched: ${result.rulesMatched}`);

  // If no rules matched, emit observe event and return
  if (result.rulesMatched === 0) {
    await emitObserve(
      assistantKey,
      assistantEntityId,
      payload.conversationId,
      'No rules matched for this message',
      runId
    );
    console.log(`[SDN] No rules matched for ${assistantKey}, observing only`);
    return;
  }

  // Build justification from matched rules
  const matchedRules = result.results.filter(r => r.matched);
  const topRule = matchedRules[0];
  const justification: AssistantJustification = {
    reason: `Rule "${topRule?.ruleName || topRule?.ruleId}" matched`,
    triggerRule: topRule?.ruleId,
    conditions: matchedRules.map(r => ({
      field: 'rule',
      operator: 'matched',
      value: r.ruleName || r.ruleId,
      matched: true,
    })),
    confidence: Math.min(result.rulesMatched / Math.max(result.rulesEvaluated, 1), 1.0),
  };

  // Calculate priority from rule confidence (scale to 0-100)
  const priority = Math.round(justification.confidence * 100);

  // === Turn-Taking Protocol ===
  // Reduced claim window for faster responses - can be increased if multiple assistants
  // need more time to coordinate
  const claimWindowMs = parseInt(process.env.ASSISTANT_CLAIM_WINDOW_MS || '100', 10);

  // Step 1: Emit claim for this conversation
  const claimResult = await emitClaim(
    assistantKey,
    assistantEntityId,
    payload.conversationId,
    justification,
    runId,
    claimWindowMs
  );

  if (claimResult) {
    console.log(`[SDN] Claim emitted for ${assistantKey}: priority=${priority}`);
  }

  // Step 2: Wait for claim window to close
  const { shouldProceed, winningAssistant } = await waitForClaimWindow(
    payload.conversationId,
    assistantKey,
    priority,
    claimWindowMs
  );

  // Step 3: If we lost, emit defer and return
  if (!shouldProceed && winningAssistant && winningAssistant !== assistantKey) {
    await emitDefer(
      assistantKey,
      assistantEntityId,
      payload.conversationId,
      winningAssistant,
      undefined, // We don't have winner's entityId
      `Higher priority claim from ${winningAssistant}`,
      runId
    );
    console.log(`[SDN] ${assistantKey} deferring to ${winningAssistant}`);
    return;
  }

  console.log(`[SDN] ${assistantKey} won claim, proceeding with response`);

  // Extract response content
  let responseContent: string | null = null;
  let provenance: unknown = null;
  let errorMessage: string | null = null;
  let suppressResponse = false;

  for (const ruleResult of result.results) {
    if (!ruleResult.matched) continue;
    for (const action of flattenActionResults(ruleResult.actionsExecuted)) {
      if (action.success && action.output) {
        if (action.actionType === 'message.send') {
          const output = action.output as {
            content?: string;
            message?: { metadata?: { symbia?: { provenance?: unknown } } };
          };
          if (output.content) responseContent = output.content;
          // The sealed envelope travels with the reply. Dropping it here was
          // the difference between a platform that can show where an answer
          // came from and one that merely asserts it can.
          const env = output.message?.metadata?.symbia?.provenance;
          if (env) provenance = env;
        }
        if (action.actionType === 'llm.invoke') {
          const output = action.output as { response?: string };
          if (output.response) responseContent = output.response;
        }
        // Check if routing action indicates we should suppress this assistant's response
        if (action.actionType === 'assistant.route') {
          const output = action.output as { suppressResponse?: boolean; routed?: boolean; targetAssistant?: string };
          if (output.suppressResponse || output.routed) {
            suppressResponse = true;
            console.log(`[SDN] ${assistantKey} routed to ${output.targetAssistant} - suppressing coordinator response`);
          }
        }
      } else if (!action.success && action.error) {
        errorMessage = action.error;
        console.error(`[SDN] Action ${action.actionType} failed: ${action.error}`);
      }
    }
  }

  // If this assistant routed to another, don't send our own response
  if (suppressResponse) {
    console.log(`[SDN] Response suppressed for ${assistantKey} (message was routed)`);
    return;
  }

  // Format error as response if no response generated
  if (!responseContent && errorMessage) {
    responseContent = `⚠️ I encountered an error while processing your request:\n\n\`${errorMessage}\`\n\nPlease check my configuration or try again.`;
    // A failure is a REFUSED answer, not an absence of one. It carries an
    // envelope like any other reply, so the console can show that the system
    // declined and why, rather than rendering an unattributed apology.
    provenance = {
      arena: 'REFUSED',
      basis: errorMessage,
      steps: [],
      timestamp: new Date().toISOString(),
      hash: null,
    };
  }

  // Send response via SDN
  if (responseContent) {
    await sendResponseViaSDN(
      payload.conversationId,
      assistantKey,
      assistantUserId,
      assistantEntityId,
      responseContent,
      result,
      runId,
      provenance
    );
  } else {
    console.log(`[SDN] No response generated for assistant: ${assistantKey}`);
  }
}

/**
 * Send assistant response via SDN instead of direct HTTP.
 */
async function sendResponseViaSDN(
  conversationId: string,
  assistantKey: string,
  assistantUserId: string,
  assistantEntityId: string | undefined,
  content: string,
  ruleResult: {
    runId: string;
    trigger: string;
    rulesEvaluated: number;
    rulesMatched: number;
    durationMs: number;
    results: Array<{
      ruleId: string;
      ruleName?: string;
      matched: boolean;
      actionsExecuted: Array<{
        actionType: string;
        success: boolean;
        durationMs?: number;
      }>;
    }>;
  },
  runId: string,
  /** Sealed provenance for this reply. Null only if no rule produced one. */
  provenance?: unknown
): Promise<boolean> {
  // Build justification for observability
  const justification = {
    reason: `Rule matched and generated response`,
    rulesEvaluated: ruleResult.rulesEvaluated,
    rulesMatched: ruleResult.rulesMatched,
    conditions: ruleResult.results
      .filter(r => r.matched)
      .map(r => ({
        field: 'rule',
        operator: 'matched',
        value: r.ruleName || r.ruleId,
        matched: true,
      })),
    confidence: ruleResult.rulesMatched > 0 ? 1.0 : 0,
  };

  // Build the response payload
  const responsePayload = {
    conversationId,
    message: {
      content,
      content_type: 'markdown',
      metadata: {
        symbia: provenance ? { provenance } : undefined,
        assistantKey,
        rulesEvaluated: ruleResult.rulesEvaluated,
        rulesMatched: ruleResult.rulesMatched,
        runId: ruleResult.runId,
        ruleTrace: {
          runId: ruleResult.runId,
          trigger: ruleResult.trigger,
          rulesEvaluated: ruleResult.rulesEvaluated,
          rulesMatched: ruleResult.rulesMatched,
          totalDurationMs: ruleResult.durationMs,
          entries: ruleResult.results.map(r => ({
            ruleId: r.ruleId,
            ruleName: r.ruleName,
            matched: r.matched,
            actions: r.matched
              ? r.actionsExecuted.map(a => ({
                  type: a.actionType,
                  success: a.success,
                  durationMs: a.durationMs,
                }))
              : undefined,
          })),
        },
      },
    },
    assistantKey,
    assistant: {
      key: assistantKey,
      userId: assistantUserId,
      entityId: assistantEntityId,
    },
    senderEntityId: assistantEntityId,
    justification,
  };

  // Try SDN first
  const sdnResult = await emitEvent(
    'message.response',
    responsePayload,
    runId,
    {
      target: 'messaging', // Must match ServiceId.MESSAGING
      boundary: 'intra',
    }
  );

  if (sdnResult) {
    console.log(`[SDN] Response emitted: ${sdnResult.eventId}, trace: ${sdnResult.trace.status}`);
    return true;
  }

  // Fallback to HTTP if SDN not available
  console.log(`[SDN] SDN not available, falling back to HTTP for ${assistantKey}`);
  return sendResponseViaHttp(
    conversationId,
    assistantKey,
    assistantUserId,
    content,
    ruleResult
  );
}

/**
 * Fallback: Send response via HTTP messaging client.
 */
async function sendResponseViaHttp(
  conversationId: string,
  assistantKey: string,
  assistantUserId: string,
  content: string,
  ruleResult: any
): Promise<boolean> {
  try {
    const { client, asUserId } = await getAssistantMessagingClient(assistantUserId, assistantKey);

    // Try to join conversation first
    try {
      await client.joinConversation(conversationId, { asUserId });
    } catch {
      // Already joined - ok
    }

    await client.sendMessage({
      conversationId,
      content,
      contentType: 'markdown',
      metadata: {
        assistantKey,
        rulesEvaluated: ruleResult.rulesEvaluated,
        rulesMatched: ruleResult.rulesMatched,
        runId: ruleResult.runId,
      },
    }, { asUserId });

    console.log(`[HTTP] Response sent for assistant: ${assistantKey}`);
    return true;
  } catch (err) {
    console.error(`[HTTP] Failed to send response for ${assistantKey}:`, err);
    return false;
  }
}

// Cache for catalog resources (refresh every 5 minutes)
let catalogCache: { resources: any[] } | null = null;
let catalogCacheExpiry = 0;

// Credential for bootstrap assistants - must match what identity service seeded
// Must be at least 32 characters to pass identity service validation
const BOOTSTRAP_AGENT_CREDENTIAL = process.env.AGENT_CREDENTIAL || 'symbia-agent-dev-secret-32chars-min!!';

/**
 * Fetch catalog resources for Symbia Script @catalog references.
 * Cached for 5 minutes to avoid excessive API calls.
 */
async function getCatalogResources(): Promise<{ resources: any[] } | undefined> {
  const now = Date.now();

  // Return cached data if still fresh
  if (catalogCache && now < catalogCacheExpiry) {
    return catalogCache;
  }

  try {
    // Use symbia-sys service resolution (port 5003) or env override
    const catalogBaseUrl = process.env.CATALOG_BASE_URL || 'http://localhost:5003';
    const response = await fetch(`${catalogBaseUrl}/symbia-namespace`);

    if (!response.ok) {
      console.warn(`[Webhook] Failed to fetch catalog: ${response.status}`);
      return undefined;
    }

    const data = await response.json();
    catalogCache = { resources: data.resources || [] };
    catalogCacheExpiry = now + (5 * 60 * 1000); // 5 minutes

    console.log(`[Webhook] Loaded ${catalogCache.resources.length} catalog resources`);
    return catalogCache;
  } catch (error) {
    console.warn(`[Webhook] Error fetching catalog:`, error);
    return undefined;
  }
}

/**
 * Clear cached token for an assistant (used when token is rejected)
 */
function clearAssistantToken(assistantUserId: string): void {
  bootstrapTokenCache.delete(assistantUserId);
  clearAgentToken(assistantUserId);
  console.log(`[Webhook] Cleared cached token for ${assistantUserId}`);
}

/**
 * Get an auth token for an assistant.
 * Bootstrap assistants are auto-registered with identity and their tokens cached.
 * @param forceRefresh If true, ignores cached token and fetches a new one
 */
async function getAssistantToken(assistantUserId: string, assistantKey: string, forceRefresh = false): Promise<string | undefined> {
  const loadedAssistant = getLoadedAssistant(assistantKey);

  // Bootstrap assistants (isBootstrap: true) auto-register with Identity and use shared credential
  if (loadedAssistant?.resource.isBootstrap) {
    // Clear cache if force refresh
    if (forceRefresh) {
      bootstrapTokenCache.delete(assistantUserId);
    }

    // Check cache first
    let token = bootstrapTokenCache.get(assistantUserId);

    if (!token) {
      const identityClient = createIdentityClient();
      const credential = BOOTSTRAP_AGENT_CREDENTIAL;

      try {
        // Try to register the agent with identity service
        const result = await identityClient.registerAgent({
          agentId: assistantUserId,
          credential,
          name: loadedAssistant.resource.name,
          capabilities: loadedAssistant.config.capabilities,
        });
        token = result.token;
        bootstrapTokenCache.set(assistantUserId, token);
        console.log(`[Webhook] Registered bootstrap assistant for token: ${assistantKey}`);
      } catch (regError) {
        // Agent might already be registered, try to login with same credential
        try {
          const loginResult = await identityClient.loginAgent(assistantUserId, credential);
          token = loginResult.token;
          bootstrapTokenCache.set(assistantUserId, token);
          console.log(`[Webhook] Got existing token for bootstrap assistant: ${assistantKey}`);
        } catch (loginError) {
          console.error(`[Webhook] Failed to get token for bootstrap assistant ${assistantKey}:`, loginError);
          return undefined;
        }
      }
    }

    return token;
  }

  // Catalog assistants use their own agent token
  // For force refresh, clear the token first
  if (forceRefresh) {
    clearAgentToken(assistantUserId);
  }

  try {
    const token = await getAgentToken(assistantUserId);
    return token;
  } catch (error) {
    console.error(`[Webhook] Failed to get token for catalog assistant ${assistantKey}:`, error);
    return undefined;
  }
}

// Export for use in other modules
export { clearAssistantToken, getAssistantToken };

/**
 * Get a messaging client for an assistant to send responses.
 * Bootstrap assistants are auto-registered with identity and their tokens cached.
 */
async function getAssistantMessagingClient(assistantUserId: string, assistantKey: string) {
  const loadedAssistant = getLoadedAssistant(assistantKey);

  // Bootstrap assistants (isBootstrap: true) auto-register with Identity and use shared credential
  if (loadedAssistant?.resource.isBootstrap) {
    // Check cache first
    let token = bootstrapTokenCache.get(assistantUserId);

    if (!token) {
      const identityClient = createIdentityClient();

      try {
        // Try to register the agent with identity service
        const result = await identityClient.registerAgent({
          agentId: assistantUserId,
          credential: BOOTSTRAP_AGENT_CREDENTIAL,
          name: loadedAssistant.resource.name,
          capabilities: loadedAssistant.config.capabilities,
        });
        token = result.token;
        bootstrapTokenCache.set(assistantUserId, token);
        console.log(`[Webhook] Registered bootstrap assistant: ${assistantKey}`);
      } catch (regError) {
        // Agent might already be registered, try to login with same credential
        try {
          const loginResult = await identityClient.loginAgent(assistantUserId, BOOTSTRAP_AGENT_CREDENTIAL);
          token = loginResult.token;
          bootstrapTokenCache.set(assistantUserId, token);
          console.log(`[Webhook] Got existing token for bootstrap assistant: ${assistantKey}`);
        } catch (loginError) {
          console.error(`[Webhook] Failed to authenticate bootstrap assistant ${assistantKey}:`, loginError);
          throw loginError;
        }
      }
    }

    const client = createMessagingClient({ token: token! });
    return { client, asUserId: undefined };
  }

  // Catalog assistants use their own agent token
  const agentToken = await getAgentToken(assistantUserId);
  console.log(`[Webhook] Using agent token for catalog assistant: ${assistantKey}`);
  const client = createMessagingClient({ token: agentToken });
  return { client, asUserId: undefined };
}

interface MessageEnvelope {
  id: string;
  conversationId: string;
  orgId: string;
  from: { principalId: string; principalType: string };
  to: { principalId: string; principalType: string };
  content: string;
  contentType: string;
  metadata: Record<string, any>;
  runId?: string;
  traceId?: string;
  sequence: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  interruptible: boolean;
  preemptedBy?: string;
  createdAt: string;
}

interface ControlEvent {
  event: string;
  conversationId: string;
  orgId: string;
  target: { principalId: string; principalType: string };
  reason: string;
  preemptedBy?: string;
  effectiveAt: string;
}

router.post('/message', async (req: Request, res: Response) => {
  try {
    const envelope: MessageEnvelope = req.body;
    
    if (!envelope.conversationId || !envelope.orgId || !envelope.to?.principalId) {
      return res.status(400).json({ error: 'Invalid message envelope' });
    }

    const actor = await db.select().from(actorPrincipals)
      .where(and(
        eq(actorPrincipals.principalId, envelope.to.principalId),
        eq(actorPrincipals.orgId, envelope.orgId),
        eq(actorPrincipals.isActive, true)
      ))
      .limit(1);

    if (!actor.length) {
      return res.status(404).json({ error: 'Actor principal not found or inactive' });
    }

    const actorData = actor[0];
    let run: typeof graphRuns.$inferSelect | null = null;

    if (envelope.runId) {
      const existingRun = await db.select().from(graphRuns)
        .where(and(
          eq(graphRuns.id, envelope.runId),
          eq(graphRuns.orgId, envelope.orgId)
        ))
        .limit(1);
      run = existingRun[0] || null;
    }

    if (!run && actorData.defaultGraphId) {
      const latestCompiled = await db.select().from(compiledGraphs)
        .where(eq(compiledGraphs.graphId, actorData.defaultGraphId))
        .orderBy(desc(compiledGraphs.version))
        .limit(1);

      const [newRun] = await db.insert(graphRuns).values({
        graphId: actorData.defaultGraphId,
        compiledGraphId: latestCompiled[0]?.id,
        conversationId: envelope.conversationId,
        orgId: envelope.orgId,
        traceId: envelope.traceId || uuidv4(),
        priority: envelope.priority || 'normal',
        state: {
          currentNode: 'start',
          inputs: [envelope],
          outputs: [],
        },
      }).returning();

      run = newRun;
    }

    if (run) {
      await db.insert(runLogs).values({
        runId: run.id,
        level: 'info',
        nodeId: 'webhook',
        message: `Message received from ${envelope.from.principalId}`,
        data: { messageId: envelope.id, contentType: envelope.contentType },
      });
    }

    res.json({
      success: true,
      runId: run?.id,
      traceId: run?.traceId,
      message: 'Message received and queued for processing',
    });
  } catch (error) {
    console.error('Error processing webhook message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * Webhook endpoint for messages from the Messaging Service
 * Called when a message is sent to a conversation that includes an assistant
 */
interface MessagingWebhookPayload {
  conversationId: string;
  message: {
    id: string;
    sender_id: string;
    sender_type: 'user' | 'agent';
    content: string;
    content_type?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
  };
  assistant: {
    userId: string; // e.g., "assistant:log-analyst"
    key: string;    // e.g., "log-analyst"
  };
  orgId?: string;
}

router.post('/messaging', async (req: Request, res: Response) => {
  try {
    const payload: MessagingWebhookPayload = req.body;

    console.log(`[Webhook] Received message for assistant: ${payload.assistant.key}`);

    // Validate payload
    if (!payload.conversationId || !payload.message || !payload.assistant) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    // Don't process messages from assistants (avoid loops)
    if (payload.message.sender_type === 'agent') {
      res.json({ success: true, skipped: true, reason: 'Message from agent' });
      return;
    }

    // Get the assistant configuration
    const assistant = getLoadedAssistant(payload.assistant.key);
    if (!assistant || !assistant.ruleSet) {
      console.warn(`[Webhook] Assistant ${payload.assistant.key} not found or has no rules`);
      res.status(404).json({ error: 'Assistant not found or has no rules configured' });
      return;
    }

    const orgId = payload.orgId || DEFAULT_ORG_ID;

    // Get auth token for LLM actions - from header or get assistant's own token
    const authHeader = req.headers.authorization;
    let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    // If no token from header, get the assistant's token for calling integrations
    if (!token) {
      token = await getAssistantToken(payload.assistant.userId, payload.assistant.key);
      if (token) {
        console.log(`[Webhook] Using assistant token for LLM actions: ${payload.assistant.key}`);
      }
    }

    // Load catalog resources for @catalog references
    const catalog = await getCatalogResources();

    // Build execution context for transpilation
    const executionContext = {
      orgId: `${payload.assistant.key}:${orgId}`,
      conversationId: payload.conversationId,
      conversationState: {} as any, // Minimal state for transpilation
      trigger: 'message.received' as TriggerType,
      event: {
        type: 'message.received' as TriggerType,
        orgId: `${payload.assistant.key}:${orgId}`,
        conversationId: payload.conversationId,
        data: {
          assistantKey: payload.assistant.key,
          messageId: payload.message.id,
          senderId: payload.message.sender_id,
          senderType: payload.message.sender_type,
        },
      },
      message: {
        id: payload.message.id,
        role: 'user' as const,
        content: payload.message.content,
        metadata: {
          // Carry the INBOUND metadata through.
          //
          // This object was built from scratch, which silently dropped
          // everything the sender attached — symbiaContext (which panel the
          // operator is on) and symbiaFrame (a captured region and what a
          // vision model said about it). The console has been sending both;
          // nothing on this side has ever read them, so the assistant answered
          // "I'm not sure what context you're referring to" to a message that
          // arrived with its context attached.
          //
          // symbiaContext WAS read — at line ~292, in the SDN block, which is
          // not the path the coordinator takes. Two near-identical extraction
          // blocks, and the wrong one was wired. That is the third time in this
          // file.
          ...(payload.message.metadata ?? {}),
          contentType: payload.message.content_type || 'text',
          senderId: payload.message.sender_id,
          timestamp: payload.message.created_at,
        },
      },
      user: {
        id: payload.message.sender_id,
        metadata: {
          type: payload.message.sender_type,
        },
      },
      context: {},
      metadata: {
        token,
        rawOrgId: orgId, // Original org ID for API calls (before composite key)
      },
      catalog,
    };

    // Transpile user message content - resolve Symbia Script references
    const { interpolate } = await import('../engine/template.js');
    const transpiled = interpolate(payload.message.content, executionContext);

    console.log(`[Webhook] Transpiled message:`, {
      original: payload.message.content,
      transpiled,
    });

    // Execute rules for this message
    const result = await defaultCoordinator.processEvent({
      type: 'message.received' as TriggerType,
      orgId: `${payload.assistant.key}:${orgId}`,
      conversationId: payload.conversationId,
      data: {
        assistantKey: payload.assistant.key,
        messageId: payload.message.id,
        senderId: payload.message.sender_id,
        senderType: payload.message.sender_type,
      },
      message: {
        id: payload.message.id,
        role: 'user',
        content: transpiled, // ← Use transpiled content instead of raw
        metadata: {
          // Same carry-through as the execution context above. Both objects
          // are built here and both dropped the sender's metadata; patching
          // one would have reached neither the prompt nor the rules.
          ...(payload.message.metadata ?? {}),
          contentType: payload.message.content_type || 'text',
          senderId: payload.message.sender_id,
          timestamp: payload.message.created_at,
          originalContent: payload.message.content, // Keep original for debugging
        },
      },
      user: {
        id: payload.message.sender_id,
        metadata: {
          type: payload.message.sender_type,
        },
      },
      catalog, // Inject catalog for Symbia Script @catalog references
      metadata: {
        token, // Pass token for LLM actions to use Integrations service
        rawOrgId: orgId, // Original org ID for credential lookup (not the composite key)
      },
    });

    console.log(`[Webhook] Rules evaluated: ${result.rulesEvaluated}, matched: ${result.rulesMatched}`);

    // Extract response content from rule execution
    let responseContent: string | null = null;
    // Sealed provenance for the reply. THIS is the live path — there is a
    // second, near-identical extraction block earlier in this file for the SDN
    // route, and patching that one alone did nothing for two build cycles
    // because the coordinator does not take it. Two copies of one concern,
    // again; consolidating them is a separate change and is noted rather than
    // done here, because doing it inside a provenance fix would hide which
    // change caused what.
    let provenance: unknown = null;
    let errorMessage: string | null = null;
    let suppressResponse = false;

    for (const ruleResult of result.results) {
      if (!ruleResult.matched) continue;
      for (const action of ruleResult.actionsExecuted) {
        if (action.success && action.output) {
          if (action.actionType === 'message.send') {
            const output = action.output as {
              content?: string;
              message?: { metadata?: { symbia?: { provenance?: unknown } } };
            };
            if (output.content) responseContent = output.content;
            const env = output.message?.metadata?.symbia?.provenance;
            if (env) provenance = env;
          }
          if (action.actionType === 'llm.invoke') {
            const output = action.output as { response?: string };
            if (output.response) responseContent = output.response;
          }
          // Check if routing action indicates we should suppress this assistant's response
          if (action.actionType === 'assistant.route') {
            const output = action.output as { suppressResponse?: boolean; routed?: boolean; targetAssistant?: string };
            if (output.suppressResponse || output.routed) {
              suppressResponse = true;
              console.log(`[Webhook] ${payload.assistant.key} routed to ${output.targetAssistant} - suppressing response`);
            }
          }
        } else if (!action.success && action.error) {
          // Capture error from failed action
          errorMessage = action.error;
          console.error(`[Webhook] Action ${action.actionType} failed: ${action.error}`);
        }
      }
    }

    // If this assistant routed to another, don't send our own response
    if (suppressResponse) {
      console.log(`[Webhook] Response suppressed for ${payload.assistant.key} (message was routed)`);
      res.json({
        success: true,
        runId: result.runId,
        rulesEvaluated: result.rulesEvaluated,
        rulesMatched: result.rulesMatched,
        routed: true,
        responseGenerated: false,
        responseSent: false,
      });
      return;
    }

    // If no response but we have an error, format it as the response
    if (!responseContent && errorMessage) {
      responseContent = `⚠️ I encountered an error while processing your request:\n\n\`${errorMessage}\`\n\nPlease check my configuration or try again.`;
    }

    // If we have a response, send it back via the messaging service
    let responseSent = false;
    if (responseContent) {
      try {
        // Get messaging client for this assistant (handles bootstrap vs catalog auth)
        console.log(`[Webhook] Getting messaging client for: ${payload.assistant.userId}`);
        const { client: agentMessagingClient, asUserId } = await getAssistantMessagingClient(
          payload.assistant.userId,
          payload.assistant.key
        );

        // Ensure the assistant is a participant in the conversation before sending
        try {
          await agentMessagingClient.joinConversation(payload.conversationId, { asUserId });
          console.log(`[Webhook] Assistant ${payload.assistant.key} joined conversation ${payload.conversationId}`);
        } catch (joinError) {
          // Might already be a participant - that's ok
          console.log(`[Webhook] Join result for ${payload.assistant.key}:`, joinError instanceof Error ? joinError.message : 'joined');
        }

        await agentMessagingClient.sendMessage({
          conversationId: payload.conversationId,
          content: responseContent,
          contentType: 'markdown',
          metadata: {
            // The envelope. Structured and hashed, not a sentence appended to
            // the text.
            ...(provenance ? { symbia: { provenance } } : {}),
            assistantKey: payload.assistant.key,
            rulesEvaluated: result.rulesEvaluated,
            rulesMatched: result.rulesMatched,
            runId: result.runId,
            ruleTrace: {
              runId: result.runId,
              trigger: result.trigger,
              rulesEvaluated: result.rulesEvaluated,
              rulesMatched: result.rulesMatched,
              totalDurationMs: result.durationMs,
              entries: result.results.map((r) => ({
                ruleId: r.ruleId,
                ruleName: r.ruleName,
                matched: r.matched,
                actions: r.matched
                  ? r.actionsExecuted.map((a) => ({
                      type: a.actionType,
                      success: a.success,
                      durationMs: a.durationMs,
                    }))
                  : undefined,
              })),
            },
          },
          replyTo: payload.message.id,
        }, { asUserId });

        console.log(`[Webhook] Response sent for assistant: ${payload.assistant.key}`);
        responseSent = true;
      } catch (sendError: unknown) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError);
        console.error(`[Webhook] Failed to send response for ${payload.assistant.key}:`, errMsg);
        // Try again without replyTo if it failed
        try {
          console.log(`[Webhook] Retry: Getting messaging client for: ${payload.assistant.userId}`);
          const { client: retryClient, asUserId: retryAsUserId } = await getAssistantMessagingClient(
            payload.assistant.userId,
            payload.assistant.key
          );
          await retryClient.sendMessage({
            conversationId: payload.conversationId,
            content: responseContent,
            contentType: 'markdown',
          }, { asUserId: retryAsUserId });
          console.log(`[Webhook] Response sent (without replyTo) for assistant: ${payload.assistant.key}`);
          responseSent = true;
        } catch (retryError) {
          console.error(`[Webhook] Retry also failed:`, retryError);
        }
      }
    } else {
      console.log(`[Webhook] No response generated for assistant: ${payload.assistant.key}`);
    }

    res.json({
      success: true,
      runId: result.runId,
      rulesEvaluated: result.rulesEvaluated,
      rulesMatched: result.rulesMatched,
      responseGenerated: !!responseContent,
      responseSent,
    });
  } catch (error) {
    console.error('[Webhook] Error processing messaging webhook:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

router.post('/control', async (req: Request, res: Response) => {
  try {
    const event: ControlEvent = req.body;
    
    if (!event.event || !event.conversationId || !event.orgId) {
      return res.status(400).json({ error: 'Invalid control event: event, conversationId, and orgId required' });
    }

    const runs = await db.select().from(graphRuns)
      .where(and(
        eq(graphRuns.conversationId, event.conversationId),
        eq(graphRuns.orgId, event.orgId),
        eq(graphRuns.status, 'running')
      ))
      .limit(10);

    for (const run of runs) {
      let newStatus: 'running' | 'paused' | 'waiting' | 'completed' | 'failed' | 'cancelled' = run.status as any;
      
      switch (event.event) {
        case 'stream.pause':
          newStatus = 'paused';
          break;
        case 'stream.resume':
          newStatus = 'running';
          break;
        case 'stream.preempt':
          newStatus = 'paused';
          break;
        case 'stream.handoff':
          newStatus = 'waiting';
          break;
        case 'stream.cancel':
          newStatus = 'cancelled';
          break;
      }

      await db.update(graphRuns)
        .set({
          status: newStatus,
          updatedAt: new Date(),
          state: {
            ...(run.state as object),
            lastControlEvent: event,
          },
        })
        .where(eq(graphRuns.id, run.id));

      await db.insert(runLogs).values({
        runId: run.id,
        level: 'info',
        nodeId: 'arbiter',
        message: `Control event: ${event.event}`,
        data: { reason: event.reason, effectiveAt: event.effectiveAt },
      });
    }

    res.json({
      success: true,
      affectedRuns: runs.length,
      event: event.event,
    });
  } catch (error) {
    console.error('Error processing control event:', error);
    res.status(500).json({ error: 'Failed to process control event' });
  }
});

export default router;
