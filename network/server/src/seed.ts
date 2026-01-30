/**
 * Network Service Development Seed
 *
 * Seeds the network registry with known Symbia services when running in development mode.
 * This allows the Control Center to display the service mesh topology with:
 * - All service nodes
 * - Communication contracts between services
 * - Sample SDN events demonstrating the event flow
 */

import { ServiceId } from '@symbia/sys';
import * as registry from './services/registry.js';
import * as router from './services/router.js';

interface SeedService {
  id: string;
  name: string;
  type: 'service' | 'assistant' | 'sandbox' | 'bridge' | 'client';
  capabilities: string[];
  port: number;
}

const DEV_SERVICES: SeedService[] = [
  {
    id: ServiceId.IDENTITY,
    name: 'Identity Service',
    type: 'service',
    capabilities: ['auth', 'users', 'orgs', 'api-keys'],
    port: 5001,
  },
  {
    id: ServiceId.LOGGING,
    name: 'Logging Service',
    type: 'service',
    capabilities: ['telemetry', 'logs', 'metrics', 'traces'],
    port: 5002,
  },
  {
    id: ServiceId.CATALOG,
    name: 'Catalog Service',
    type: 'service',
    capabilities: ['resources', 'schemas', 'manifests'],
    port: 5003,
  },
  {
    id: ServiceId.ASSISTANTS,
    name: 'Assistants Service',
    type: 'assistant',
    capabilities: ['graphs', 'actors', 'runs', 'ai-engine'],
    port: 5004,
  },
  {
    id: ServiceId.MESSAGING,
    name: 'Messaging Service',
    type: 'service',
    capabilities: ['conversations', 'messages', 'realtime'],
    port: 5005,
  },
  {
    id: ServiceId.RUNTIME,
    name: 'Runtime Service',
    type: 'sandbox',
    capabilities: ['graphs', 'execution', 'sandbox'],
    port: 5006,
  },
  {
    id: ServiceId.INTEGRATIONS,
    name: 'Integrations Service',
    type: 'bridge',
    capabilities: ['providers', 'credentials', 'external-apis'],
    port: 5007,
  },
  {
    id: ServiceId.NETWORK,
    name: 'Network Service',
    type: 'service',
    capabilities: ['registry', 'routing', 'policies', 'sdn'],
    port: 5054,
  },
];

/**
 * Seed the network registry with known dev services.
 * Only runs if NETWORK_DEV_SEED=true or NODE_ENV=development.
 */
export async function seedDevServices(): Promise<void> {
  const isDev = process.env.NODE_ENV === 'development' || process.env.NETWORK_DEV_SEED === 'true';

  if (!isDev) {
    return;
  }

  console.log('[Network Seed] Seeding dev services...');

  // Step 1: Register all nodes
  for (const service of DEV_SERVICES) {
    const endpoint = `http://localhost:${service.port}`;
    const isRunning = await checkServiceHealth(endpoint);

    registry.registerNode(
      service.id,
      service.name,
      service.type,
      service.capabilities,
      endpoint,
      undefined,
      { seeded: true, running: isRunning }
    );

    console.log(`[Network Seed] Registered ${service.name} (${service.id}) - ${isRunning ? 'ONLINE' : 'offline'}`);
  }

  // Step 2: Create contracts between services
  const contractCount = seedDevContracts();
  console.log(`[Network Seed] Created ${contractCount} contracts`);

  // Step 3: Generate sample SDN events (historical)
  await seedDevEvents();

  // Step 4: Start periodic event generator for real-time demo
  startPeriodicEventGenerator();

  console.log('[Network Seed] Done seeding dev environment');
}

async function checkServiceHealth(endpoint: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${endpoint}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create contracts defining allowed communication paths between services.
 */
function seedDevContracts(): number {
  let count = 0;

  const contractDefs = [
    // Assistants -> Runtime: workflow execution
    {
      from: ServiceId.ASSISTANTS,
      to: ServiceId.RUNTIME,
      events: ['graph.execute', 'graph.input', 'graph.output', 'node.execute'],
      boundaries: ['intra'] as const,
    },
    // Assistants -> Integrations: LLM calls
    {
      from: ServiceId.ASSISTANTS,
      to: ServiceId.INTEGRATIONS,
      events: ['llm.invoke', 'llm.complete', 'provider.execute'],
      boundaries: ['intra', 'extra'] as const,
    },
    // Runtime -> Integrations: external API calls from graph nodes
    {
      from: ServiceId.RUNTIME,
      to: ServiceId.INTEGRATIONS,
      events: ['provider.execute', 'http.request', 'api.call'],
      boundaries: ['intra', 'extra'] as const,
    },
    // Runtime -> Catalog: load graph definitions
    {
      from: ServiceId.RUNTIME,
      to: ServiceId.CATALOG,
      events: ['resource.get', 'schema.validate', 'manifest.load'],
      boundaries: ['intra'] as const,
    },
    // Assistants -> Catalog: load actor configs
    {
      from: ServiceId.ASSISTANTS,
      to: ServiceId.CATALOG,
      events: ['resource.get', 'actor.config', 'graph.definition'],
      boundaries: ['intra'] as const,
    },
    // Messaging -> Assistants: route messages to AI
    {
      from: ServiceId.MESSAGING,
      to: ServiceId.ASSISTANTS,
      events: ['message.received', 'message.new', 'conversation.started', 'user.input'],
      boundaries: ['intra'] as const,
    },
    // Messaging -> Integrations: route assistant messages to channel bridge
    {
      from: ServiceId.MESSAGING,
      to: ServiceId.INTEGRATIONS,
      events: ['message.new'],
      boundaries: ['intra'] as const,
    },
    // Assistants -> Messaging: send AI responses
    {
      from: ServiceId.ASSISTANTS,
      to: ServiceId.MESSAGING,
      events: ['message.send', 'message.response', 'assistant.action.respond', 'typing.start', 'typing.stop', 'stream.chunk'],
      boundaries: ['intra'] as const,
    },
    // Integrations -> external (bridge) - logging
    {
      from: ServiceId.INTEGRATIONS,
      to: ServiceId.LOGGING,
      events: ['api.request', 'api.response', 'api.error', 'llm.request', 'llm.response'],
      boundaries: ['extra'] as const,
    },
  ];

  // Create defined contracts
  for (const def of contractDefs) {
    const contract = registry.createContract(
      def.from,
      def.to,
      def.events,
      [...def.boundaries]
    );
    if (contract) {
      count++;
    }
  }

  // All services -> Logging: telemetry (except logging itself)
  // Includes all event types that services might send to logging for observability
  for (const service of DEV_SERVICES) {
    if (service.id !== ServiceId.LOGGING) {
      const contract = registry.createContract(
        service.id,
        ServiceId.LOGGING,
        [
          'log.write', 'metric.record', 'trace.span', 'error.report',
          // Additional telemetry event types
          'api.request', 'api.response', 'api.error',
          'message.received', 'message.sent',
          'resource.access', 'resource.modified',
          // Ephemeral observability events (via @symbia/relay)
          'obs.http.request', 'obs.http.response',
          'obs.db.query', 'obs.db.slow',
          'obs.cache.hit', 'obs.cache.miss',
          'obs.error', 'obs.process.metrics',
        ],
        ['intra', 'extra'] // Allow both intra and extra boundary for logging
      );
      if (contract) count++;
    }
  }

  // All services can emit observability events to Network for SDN watching
  // This allows ephemeral observability without requiring logging persistence
  for (const service of DEV_SERVICES) {
    if (service.id !== ServiceId.NETWORK) {
      const contract = registry.createContract(
        service.id,
        ServiceId.NETWORK,
        [
          'obs.http.request', 'obs.http.response',
          'obs.db.query', 'obs.db.slow',
          'obs.cache.hit', 'obs.cache.miss',
          'obs.error', 'obs.process.metrics',
        ],
        ['intra']
      );
      if (contract) count++;
    }
  }

  // All services -> Identity: auth verification (except identity itself)
  for (const service of DEV_SERVICES) {
    if (service.id !== ServiceId.IDENTITY) {
      const contract = registry.createContract(
        service.id,
        ServiceId.IDENTITY,
        ['auth.verify', 'token.validate', 'user.lookup', 'permission.check'],
        ['intra']
      );
      if (contract) count++;
    }
  }

  return count;
}

/**
 * Generate sample SDN events to demonstrate the event stream.
 */
async function seedDevEvents(): Promise<void> {
  const runId = `demo-run-${Date.now()}`;

  // Define a sequence of demo events that tell a story
  const eventSequence = [
    // User sends a message
    {
      source: ServiceId.MESSAGING,
      target: ServiceId.ASSISTANTS,
      type: 'message.received',
      data: { content: 'Hello, can you help me analyze this data?', userId: 'demo-user' },
      boundary: 'intra' as const,
    },
    // Assistants validates auth
    {
      source: ServiceId.ASSISTANTS,
      target: ServiceId.IDENTITY,
      type: 'auth.verify',
      data: { userId: 'demo-user', action: 'assistant.invoke' },
      boundary: 'intra' as const,
    },
    // Assistants loads graph definition
    {
      source: ServiceId.ASSISTANTS,
      target: ServiceId.CATALOG,
      type: 'resource.get',
      data: { resourceType: 'graph', resourceId: 'data-analysis-graph' },
      boundary: 'intra' as const,
    },
    // Assistants triggers graph execution
    {
      source: ServiceId.ASSISTANTS,
      target: ServiceId.RUNTIME,
      type: 'graph.execute',
      data: { graphId: 'data-analysis-graph', input: { query: 'analyze data' } },
      boundary: 'intra' as const,
    },
    // Runtime calls LLM via integrations
    {
      source: ServiceId.RUNTIME,
      target: ServiceId.INTEGRATIONS,
      type: 'llm.invoke',
      data: { provider: 'openai', model: 'gpt-4o-mini', prompt: 'Analyze the following...' },
      boundary: 'extra' as const,
    },
    // Integrations logs the external call
    {
      source: ServiceId.INTEGRATIONS,
      target: ServiceId.LOGGING,
      type: 'api.request',
      data: { provider: 'openai', endpoint: '/v1/chat/completions', status: 200 },
      boundary: 'extra' as const,
    },
    // Assistants sends response back
    {
      source: ServiceId.ASSISTANTS,
      target: ServiceId.MESSAGING,
      type: 'message.send',
      data: { content: 'I\'ve analyzed your data. Here are the insights...', userId: 'demo-user' },
      boundary: 'intra' as const,
    },
    // Telemetry events
    {
      source: ServiceId.RUNTIME,
      target: ServiceId.LOGGING,
      type: 'metric.record',
      data: { metric: 'graph.execution.duration', value: 1250, unit: 'ms' },
      boundary: 'intra' as const,
    },
    {
      source: ServiceId.ASSISTANTS,
      target: ServiceId.LOGGING,
      type: 'trace.span',
      data: { operation: 'assistant.process', duration: 1842, success: true },
      boundary: 'intra' as const,
    },
  ];

  console.log('[Network Seed] Generating sample SDN events...');

  for (let i = 0; i < eventSequence.length; i++) {
    const eventDef = eventSequence[i];

    // Create the event
    const event = router.createEvent(
      { type: eventDef.type, data: eventDef.data },
      eventDef.source,
      runId,
      {
        target: eventDef.target,
        boundary: eventDef.boundary,
        causedBy: i > 0 ? `demo-event-${i - 1}` : undefined,
      }
    );

    // Record it in history
    router.recordEvent(event);

    // Route it (creates trace)
    await router.routeEvent(event);

    // Small delay between events for realistic timestamps
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(`[Network Seed] Generated ${eventSequence.length} sample events`);
}

/**
 * Generate periodic events to demonstrate real-time streaming.
 * Creates telemetry-like events every 5 seconds.
 */
function startPeriodicEventGenerator(): void {
  const eventTypes = [
    { source: ServiceId.RUNTIME, type: 'metric.record', data: () => ({ metric: 'graph.executions', value: Math.floor(Math.random() * 100), unit: 'count' }) },
    { source: ServiceId.ASSISTANTS, type: 'trace.span', data: () => ({ operation: 'assistant.invoke', duration: Math.floor(Math.random() * 2000), success: true }) },
    { source: ServiceId.INTEGRATIONS, type: 'api.request', data: () => ({ provider: 'openai', latency: Math.floor(Math.random() * 500), status: 200 }) },
    { source: ServiceId.MESSAGING, type: 'message.received', data: () => ({ conversationId: `conv-${Date.now()}`, messageCount: Math.floor(Math.random() * 10) + 1 }) },
    { source: ServiceId.CATALOG, type: 'resource.access', data: () => ({ resourceType: 'graph', action: 'read', cached: Math.random() > 0.5 }) },
  ];

  let eventIndex = 0;

  setInterval(async () => {
    const eventDef = eventTypes[eventIndex % eventTypes.length];
    eventIndex++;

    const runId = `live-telemetry-${Date.now()}`;
    const event = router.createEvent(
      { type: eventDef.type, data: eventDef.data() },
      eventDef.source,
      runId,
      { target: ServiceId.LOGGING, boundary: 'intra' }
    );

    router.recordEvent(event);
    await router.routeEvent(event);
  }, 5000); // Every 5 seconds

  console.log('[Network Seed] Started periodic event generator (every 5s)');
}
