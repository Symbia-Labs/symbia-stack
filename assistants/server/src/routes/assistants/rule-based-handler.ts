/**
 * Generic Rule-Based Assistant Handler
 *
 * This handler processes messages through the rule engine instead of
 * using hardcoded logic. Assistants using this handler have their
 * behavior defined entirely through rules.
 *
 * NOTE: Messages are now received via the Messaging Service webhook.
 * The legacy POST /message endpoint has been removed.
 * See /api/webhook/messaging in webhooks.ts for message handling.
 */

import { Router, Request, Response } from 'express';
import { setRuleSet } from '../../engine/run-coordinator.js';
import type { RuleSet } from '../../engine/types.js';
import { invokeLLM, TokenAuthError } from '../../integrations-client.js';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';
import { createIdentityClient } from '@symbia/id';

// Cache for coordinator token
let coordinatorTokenCache: { token: string; expires: number } | null = null;
const BOOTSTRAP_AGENT_CREDENTIAL = process.env.AGENT_CREDENTIAL || 'symbia-agent-dev-secret-32chars-min!!';

/**
 * Get a token for the coordinator assistant
 */
async function getCoordinatorToken(): Promise<string | undefined> {
  // Check cache
  if (coordinatorTokenCache && Date.now() < coordinatorTokenCache.expires) {
    return coordinatorTokenCache.token;
  }

  const identityClient = createIdentityClient();
  const coordinatorId = 'assistant:coordinator';

  try {
    // Try to register (will fail if already exists)
    const result = await identityClient.registerAgent({
      agentId: coordinatorId,
      credential: BOOTSTRAP_AGENT_CREDENTIAL,
      name: 'Coordinator',
      capabilities: ['llm.chat', 'catalog.query'],
    });
    coordinatorTokenCache = { token: result.token, expires: Date.now() + 3500000 }; // ~1 hour
    return result.token;
  } catch {
    // Already registered, try to login
    try {
      const loginResult = await identityClient.loginAgent(coordinatorId, BOOTSTRAP_AGENT_CREDENTIAL);
      coordinatorTokenCache = { token: loginResult.token, expires: Date.now() + 3500000 };
      return loginResult.token;
    } catch {
      return undefined;
    }
  }
}

interface AssistantRuleConfig {
  key: string;
  name: string;
  description: string;
  defaultRules: RuleSet;
}

/**
 * Create a rule-based assistant router
 */
export function createRuleBasedAssistantRouter(config: AssistantRuleConfig): Router {
  const router = Router();

  // Initialize default rules for this assistant
  // Rules are keyed by `assistantKey:orgId`
  const defaultOrgId = 'default';
  setRuleSet(`${config.key}:${defaultOrgId}`, config.defaultRules);

  // NOTE: The POST /message endpoint has been removed.
  // Messages are now handled via the Messaging Service webhook at /api/webhook/messaging
  // This ensures all conversations flow through the messaging bus per architecture tenets.

  /**
   * Get assistant info
   */
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      principalId: `assistant:${config.key}`,
      principalType: 'assistant',
      name: config.name,
      description: config.description,
      capabilities: extractCapabilities(config.defaultRules),
      messaging: {
        // Messages flow through the Messaging Service
        // Assistants receive messages via webhook at /api/webhook/messaging
        userId: `assistant:${config.key}`,
        webhookUrl: '/api/webhook/messaging',
      },
      source: 'rule-based',
      rulesCount: config.defaultRules.rules.length,
    });
  });

  /**
   * Health check
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      assistant: config.key,
      source: 'rule-based',
      rulesLoaded: config.defaultRules.rules.length,
    });
  });

  /**
   * Get current rules for this assistant
   */
  router.get('/rules', (req: Request, res: Response) => {
    const orgId = (req.headers['x-org-id'] as string) || defaultOrgId;
    res.json({
      assistantKey: config.key,
      orgId,
      rules: config.defaultRules,
    });
  });

  /**
   * Generate topic name for a conversation (coordinator only)
   */
  router.post('/topic-name', async (req: Request, res: Response) => {
    // Only coordinator supports topic name generation
    if (config.key !== 'coordinator') {
      res.status(404).json({ error: 'Topic name generation only available on coordinator' });
      return;
    }

    const { conversationId } = req.body;
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }

    try {
      // Fetch conversation messages from messaging service
      const messagingUrl = resolveServiceUrl(ServiceId.MESSAGING);
      const token = req.headers.authorization;

      const messagesResponse = await fetch(
        `${messagingUrl}/api/conversations/${conversationId}/messages?limit=10`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: token } : {}),
          },
        }
      );

      if (!messagesResponse.ok) {
        res.status(500).json({ error: 'Failed to fetch conversation messages' });
        return;
      }

      const messagesData = await messagesResponse.json();
      const messages = messagesData.messages || messagesData || [];

      if (messages.length === 0) {
        res.json({ topicName: 'New Topic' });
        return;
      }

      // Format messages for LLM
      const messageText = messages
        .slice(0, 5)
        .map((m: { sender_id?: string; content?: string }) =>
          `${m.sender_id?.includes('assistant') ? 'Assistant' : 'User'}: ${m.content?.slice(0, 200) || ''}`
        )
        .join('\n');

      // Helper to invoke LLM with a token
      const callLLM = async (authToken: string) => {
        return invokeLLM(authToken, {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You generate short, descriptive topic names for conversations.
Rules:
- Maximum 4-5 words
- No quotes or special characters
- Capture the main topic or intent
- Be specific but concise
- Return ONLY the topic name, nothing else`,
            },
            {
              role: 'user',
              content: `Generate a topic name for this conversation:\n\n${messageText}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 30,
        });
      };

      // Try with user token first, fall back to coordinator's own token
      let response;
      const userToken = token?.replace('Bearer ', '') || '';

      if (userToken) {
        try {
          response = await callLLM(userToken);
        } catch (error) {
          if (error instanceof TokenAuthError) {
            console.log('[Coordinator] User token failed, trying coordinator token...');
            // Fall back to coordinator's own token
            const coordinatorToken = await getCoordinatorToken();
            if (!coordinatorToken) {
              res.status(500).json({ error: 'Failed to get coordinator token' });
              return;
            }
            response = await callLLM(coordinatorToken);
          } else {
            throw error;
          }
        }
      } else {
        // No user token, use coordinator's token directly
        const coordinatorToken = await getCoordinatorToken();
        if (!coordinatorToken) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        response = await callLLM(coordinatorToken);
      }

      const topicName = response.content?.trim() || 'New Topic';

      res.json({ topicName });
    } catch (error) {
      console.error('[Coordinator] Error generating topic name:', error);
      res.status(500).json({ error: 'Failed to generate topic name' });
    }
  });

  return router;
}

/**
 * Extract capabilities from rules
 */
function extractCapabilities(ruleSet: RuleSet): string[] {
  const capabilities = new Set<string>();
  for (const rule of ruleSet.rules) {
    for (const action of rule.actions) {
      if (action.type === 'service.call') {
        const params = action.params as { service?: string };
        if (params.service) capabilities.add(`${params.service}.query`);
      }
      if (action.type === 'llm.invoke') {
        capabilities.add('llm.chat');
      }
    }
  }
  return Array.from(capabilities);
}

export type { AssistantRuleConfig };
