/**
 * Symbia Website Chat Integration
 *
 * This module provides chat functionality that can operate in two modes:
 * 1. Mock mode - Uses predefined responses for static demos
 * 2. Live mode - Connects to real Symbia services via the messaging API
 */

const SYMBIA_API_BASE = window.SYMBIA_API_BASE || 'http://localhost:5001/api';

// Chat configuration
const config = {
  mode: 'mock', // 'mock' | 'live'
  assistantKey: 'website-helper', // Default assistant for website chat
  streamingEnabled: true,
};

/**
 * Initialize chat with configuration
 */
export function initChat(options = {}) {
  Object.assign(config, options);
  console.log('[Symbia Chat] Initialized in', config.mode, 'mode');
}

/**
 * Send a message and get a response
 * @param {string} context - The service/feature context
 * @param {string} message - User's message
 * @param {function} onChunk - Callback for streaming chunks
 * @returns {Promise<string>} - Full response
 */
export async function sendMessage(context, message, onChunk) {
  if (config.mode === 'live') {
    return sendLiveMessage(context, message, onChunk);
  }
  return sendMockMessage(context, message, onChunk);
}

/**
 * Live message via Symbia messaging service
 */
async function sendLiveMessage(context, message, onChunk) {
  const systemPrompt = getSystemPrompt(context);

  try {
    // Create a channel or use existing
    const channelResponse = await fetch(`${SYMBIA_API_BASE}/messaging/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'website-chat',
        metadata: { context }
      })
    });

    const channel = await channelResponse.json();

    // Start streaming response
    const streamResponse = await fetch(`${SYMBIA_API_BASE}/messaging/streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: channel.id,
        assistantKey: config.assistantKey,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      })
    });

    if (config.streamingEnabled && streamResponse.body) {
      return handleStream(streamResponse.body, onChunk);
    }

    const result = await streamResponse.json();
    return result.content;
  } catch (error) {
    console.error('[Symbia Chat] Live message failed:', error);
    // Fall back to mock
    return sendMockMessage(context, message, onChunk);
  }
}

/**
 * Handle SSE stream
 */
async function handleStream(body, onChunk) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'chunk' && data.content) {
            fullResponse += data.content;
            if (onChunk) onChunk(data.content);
          }
        } catch (e) {
          // Non-JSON line, ignore
        }
      }
    }
  }

  return fullResponse;
}

/**
 * Mock message with simulated delay and streaming
 */
async function sendMockMessage(context, message, onChunk) {
  const response = getMockResponse(context, message);

  // Simulate streaming with delays
  if (onChunk) {
    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      await sleep(30 + Math.random() * 50);
      onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
    }
  } else {
    await sleep(800 + Math.random() * 400);
  }

  return response;
}

/**
 * Get context-aware system prompt
 */
function getSystemPrompt(context) {
  const prompts = {
    'server': `You are an expert on the Symbia Server service. Help users understand API gateway functionality, routing, health checks, and WebSocket management. Be concise and technical.`,
    'identity': `You are an expert on the Symbia Identity service. Help users understand the Dual Principal Model, JWT tokens, RBAC, API keys, and authentication flows.`,
    'catalog': `You are an expert on the Symbia Catalog service. Help users understand service discovery, resource registration, catalog:// URIs, and namespace resolution.`,
    'logging': `You are an expert on the Symbia Logging service. Help users understand log queries, real-time streaming, trace correlation, and observability patterns.`,
    'assistants': `You are an expert on the Symbia Assistants service. Help users understand @mention routing, assistant configuration, rules, capabilities, and LLM presets.`,
    'messaging': `You are an expert on the Symbia Messaging service. Help users understand stream control, channels, backpressure, and conversation orchestration.`,
    'runtime': `You are an expert on the Symbia Runtime service. Help users understand workflow graphs, node types, execution, and debugging workflows.`,
    'integrations': `You are an expert on the Symbia Integrations service. Help users understand OpenAPI integrations, MCP servers, LLM providers, and SDK wrappers.`,
    'network': `You are an expert on the Symbia Network service. Help users understand service mesh, mTLS, rate limiting, traffic shaping, and header propagation.`,
    'dual-principal': `You are an expert on Symbia's Dual Principal Model. Help users understand how user and assistant identities combine for secure, auditable AI operations.`,
    'stream-control': `You are an expert on Symbia's Stream Control semantics. Help users understand pause, resume, preempt, and handoff operations for LLM streams.`,
    'graphs': `You are an expert on Symbia's declarative workflow graphs. Help users understand node types, edges, visual editing, and runtime mutation.`,
    'self-doc': `You are an expert on Symbia's self-documenting services. Help users understand llms.txt generation and machine-readable API documentation.`,
    'multi-tenant': `You are an expert on Symbia's multi-tenant architecture. Help users understand workspace isolation, header propagation, and tenant scoping.`,
    'integrations-detail': `You are an expert on Symbia's universal integration patterns. Help users understand OpenAPI, MCP, and JS SDK integration methods.`
  };

  return prompts[context] || `You are a helpful expert on the Symbia platform. Help users understand AI-native architecture, assistants, and orchestration.`;
}

/**
 * Mock responses by context
 */
const mockResponses = {
  'server': [
    "The Server service routes requests based on URL path prefixes. Each microservice gets its own prefix like /api/identity/*, /api/catalog/*, etc.",
    "The health endpoint at /health aggregates status from all 9 services and returns a unified health check response.",
    "To add middleware, you can use Express middleware patterns in the server/src/middleware directory. The service auto-discovers and loads them."
  ],
  'identity': [
    "Dual principal works by encoding both user and assistant identities in a compound JWT token. The effective permissions are the intersection of both principal's capabilities.",
    "API keys are issued via POST /api/identity/api-keys. You can scope them to specific capabilities and set expiration times.",
    "RBAC capabilities are hierarchical. A role can have multiple capabilities, and capabilities can include wildcards like 'messaging.*' for all messaging operations."
  ],
  'catalog': [
    "Service discovery uses the Catalog service as a registry. Services register on startup and the Catalog tracks their health status.",
    "catalog:// URIs resolve through the Catalog service. For example, catalog://assistants/coordinator resolves to the coordinator assistant's full definition.",
    "Register resources via POST /api/catalog/resources with a type, key, and payload. The Catalog validates the schema and stores it."
  ],
  'logging': [
    "Query logs via GET /api/logging/query with filters like level, source, timeRange, and text search. Results are paginated.",
    "Trace correlation uses the X-Trace-Id header. All services propagate this header, so you can follow a request across the entire platform.",
    "Real-time streaming uses Server-Sent Events. Subscribe to GET /api/logging/stream with optional filters."
  ],
  'assistants': [
    "@mentions work by parsing message content for @alias patterns. The messaging service routes to the matching assistant based on the Catalog registration.",
    "Create a custom assistant by defining a JSON config with key, alias, capabilities, LLM preset, and rules. Register it via POST /api/assistants.",
    "The rule engine matches patterns in user messages and triggers behaviors. Rules can invoke tools, route to other assistants, or modify response behavior."
  ],
  'messaging': [
    "Stream pause preserves the LLM generation state. The token buffer is held in memory, and resuming continues from the exact position.",
    "Handoff transfers the full conversation context to another assistant. Use POST /streams/:id/handoff with the target assistant ID.",
    "Backpressure is managed via acknowledgments. Clients must ACK chunks before receiving more, preventing memory overflow on slow connections."
  ],
  'runtime': [
    "Create a workflow via POST /api/runtime/workflows with a JSON graph structure. Define nodes with types and configs, then connect them with edges.",
    "Node types include: input, llm, router, tool, condition, recall, say, think, and output. Each has specific configuration options.",
    "Debug execution via the /runs endpoint. Each run has a trace showing node execution order, inputs, outputs, and timing."
  ],
  'integrations': [
    "To add OpenAPI integration, POST to /api/integrations with type: 'openapi', the spec URL, and authentication config.",
    "LLM provider configuration is stored in the Catalog. Use presets to define model, temperature, max tokens, and other parameters.",
    "MCP servers connect via POST /api/integrations with type: 'mcp' and the server URL. The service auto-discovers available tools."
  ],
  'network': [
    "mTLS is automatic. The Network service issues certificates to services on registration and validates all inter-service communication.",
    "Rate limiting is configured per-endpoint in the Catalog. Set requests-per-second, burst limits, and penalty behaviors.",
    "Canary routing splits traffic by percentage. Configure via the Network service with source, target, and weight parameters."
  ]
};

function getMockResponse(context, message) {
  const responses = mockResponses[context] || mockResponses['server'];
  // Simple keyword matching for slightly smarter mock responses
  const lowerMessage = message.toLowerCase();

  for (const response of responses) {
    const keywords = response.split(' ').slice(0, 3).map(w => w.toLowerCase());
    if (keywords.some(k => lowerMessage.includes(k))) {
      return response;
    }
  }

  return responses[Math.floor(Math.random() * responses.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stream control operations (for live mode)
 */
export async function pauseStream(streamId) {
  if (config.mode !== 'live') return;
  await fetch(`${SYMBIA_API_BASE}/messaging/streams/${streamId}/pause`, { method: 'POST' });
}

export async function resumeStream(streamId) {
  if (config.mode !== 'live') return;
  await fetch(`${SYMBIA_API_BASE}/messaging/streams/${streamId}/resume`, { method: 'POST' });
}

export default {
  initChat,
  sendMessage,
  pauseStream,
  resumeStream
};
