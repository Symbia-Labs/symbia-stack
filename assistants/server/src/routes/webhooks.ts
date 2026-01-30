import { Router, Request, Response } from 'express';
import { db } from '../lib/db.js';
import { graphRuns, runLogs, actorPrincipals, promptGraphs, compiledGraphs } from '../models/schema.js';
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
import { getLoadedAssistant, getAllLoadedAssistants } from '../services/assistant-loader.js';
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
    assistantsToNotify = allLoaded.map(loaded => ({
      userId: `assistant:${loaded.config.key}`,
      key: loaded.config.key,
      entityId: loaded.resource.entityId,
    }));
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

  // Build a set of aliases/keys that map to assistant keys
  const aliasToKey: Record<string, string> = {
    'logs': 'log-analyst',
    'log': 'log-analyst',
    'catalog': 'catalog-search',
    'search': 'catalog-search',
    'debug': 'run-debugger',
    'debugger': 'run-debugger',
    'usage': 'usage-reporter',
    'welcome': 'onboarding',
    'onboard': 'onboarding',
    'builder': 'assistants-assistant',
    'build': 'assistants-assistant',
  };

  // Process for each assistant
  for (const assistant of assistantsToNotify) {
    if (!assistant.key) {
      console.log(`[SDN] Skipping assistant with no key: ${JSON.stringify(assistant)}`);
      continue;
    }

    // Skip assistants that were @mentioned in the original broadcast
    // Let coordinator route to them instead (avoids duplicate processing)
    // Only skip if this is NOT a targeted forward (payload.assistants is empty or undefined)
    const isTargetedForward = payload.assistants && payload.assistants.length > 0;
    if (!isTargetedForward && mentionedAlias) {
      const mentionedKey = aliasToKey[mentionedAlias] || mentionedAlias;
      // Check if this assistant matches the mention (by key, alias map, or configured alias)
      const loadedAssistant = getLoadedAssistant(assistant.key);
      const assistantAlias = loadedAssistant?.alias?.toLowerCase();
      if (assistant.key === mentionedKey ||
          assistant.key === mentionedAlias ||
          assistantAlias === mentionedAlias) {
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

  // Get auth token for LLM actions
  let token = authToken;
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
  let errorMessage: string | null = null;
  let suppressResponse = false;

  for (const ruleResult of result.results) {
    if (!ruleResult.matched) continue;
    for (const action of ruleResult.actionsExecuted) {
      if (action.success && action.output) {
        if (action.actionType === 'message.send') {
          const output = action.output as { content?: string };
          if (output.content) responseContent = output.content;
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
      runId
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
  runId: string
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
    let errorMessage: string | null = null;
    let suppressResponse = false;

    for (const ruleResult of result.results) {
      if (!ruleResult.matched) continue;
      for (const action of ruleResult.actionsExecuted) {
        if (action.success && action.output) {
          if (action.actionType === 'message.send') {
            const output = action.output as { content?: string };
            if (output.content) responseContent = output.content;
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
