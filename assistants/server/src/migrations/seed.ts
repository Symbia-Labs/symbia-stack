import { db, pool } from '../lib/db.js';
import { orgs, users, orgMemberships, llmProviders, promptGraphs, compiledGraphs, graphRuns, runLogs, agentPrincipals, conversations } from '../models/schema.js';
import { v4 as uuidv4 } from 'uuid';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';

async function seed() {
  console.log('Seeding database with graph-based model...');

  const [org] = await db.insert(orgs).values({
    name: 'Demo Organization',
    slug: 'demo-org',
    settings: { theme: 'light', timezone: 'UTC' },
    entitlements: ['collaborate', 'graphs', 'actors'],
  }).onConflictDoNothing().returning();

  const orgId = org?.id || (await db.select().from(orgs).limit(1))[0]?.id;
  
  if (!orgId) {
    throw new Error('Failed to get org ID');
  }

  console.log('Using org:', orgId);

  const [adminUser] = await db.insert(users).values({
    email: 'admin@demo.org',
    displayName: 'Demo Admin',
    externalId: 'demo-admin-001',
  }).onConflictDoNothing().returning();

  const userId = adminUser?.id || (await db.select().from(users).limit(1))[0]?.id;

  if (org && adminUser) {
    await db.insert(orgMemberships).values({
      orgId: org.id,
      userId: adminUser.id,
      role: 'owner',
      acceptedAt: new Date(),
    }).onConflictDoNothing();
  }

  const [provider] = await db.insert(llmProviders).values({
    orgId,
    name: 'OpenAI Primary',
    providerType: 'openai',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    routingWeight: 100,
    fallbackOrder: 0,
    isActive: true,
  }).onConflictDoNothing().returning();

  console.log('Created/found LLM provider');

  const welcomeGraph = {
    components: [
      {
        id: 'start',
        type: 'trigger',
        data: { label: 'Message Received', event: 'message' },
        position: { x: 100, y: 100 },
      },
      {
        id: 'llm-greeting',
        type: 'llm',
        data: {
          label: 'Generate Greeting',
          model: 'gpt-4',
          systemPrompt: 'You are a friendly assistant. Greet the user warmly.',
          temperature: 0.7,
        },
        position: { x: 100, y: 250 },
      },
      {
        id: 'intent-check',
        type: 'condition',
        data: {
          label: 'Check Intent',
          conditions: [
            { field: 'intent', operator: 'eq', value: 'support', nextNode: 'handoff-support' },
            { field: 'intent', operator: 'eq', value: 'sales', nextNode: 'llm-sales' },
          ],
          defaultNode: 'llm-general',
        },
        position: { x: 100, y: 400 },
      },
      {
        id: 'handoff-support',
        type: 'handoff',
        data: { label: 'Handoff to Support', targetRole: 'agent', reason: 'User requested support' },
        position: { x: -100, y: 550 },
      },
      {
        id: 'llm-sales',
        type: 'llm',
        data: {
          label: 'Sales Response',
          model: 'gpt-4',
          systemPrompt: 'You are a helpful sales assistant. Provide information about our products.',
        },
        position: { x: 100, y: 550 },
      },
      {
        id: 'llm-general',
        type: 'llm',
        data: {
          label: 'General Response',
          model: 'gpt-4',
          systemPrompt: 'You are a helpful general assistant. Answer the user\'s question.',
        },
        position: { x: 300, y: 550 },
      },
      {
        id: 'end',
        type: 'end',
        data: { label: 'End Conversation' },
        position: { x: 100, y: 700 },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'llm-greeting' },
      { id: 'e2', source: 'llm-greeting', target: 'intent-check' },
      { id: 'e3', source: 'intent-check', target: 'handoff-support', label: 'support' },
      { id: 'e4', source: 'intent-check', target: 'llm-sales', label: 'sales' },
      { id: 'e5', source: 'intent-check', target: 'llm-general', label: 'default' },
      { id: 'e6', source: 'llm-sales', target: 'end' },
      { id: 'e7', source: 'llm-general', target: 'end' },
    ],
  };

  const [graph1] = await db.insert(promptGraphs).values({
    orgId,
    name: 'Welcome Flow',
    description: 'Initial greeting and intent routing flow',
    graphJson: welcomeGraph,
    isPublished: true,
    logLevel: 'info',
    createdBy: userId,
    publishedAt: new Date(),
  }).returning();

  console.log('Created graph:', graph1.name);

  const [compiled1] = await db.insert(compiledGraphs).values({
    graphId: graph1.id,
    version: 1,
    bytecode: JSON.stringify({
      compiled: true,
      version: 1,
      nodes: welcomeGraph.components,
      edges: welcomeGraph.edges,
      compiledAt: new Date().toISOString(),
    }),
    checksum: 'demo-checksum-1',
  }).returning();

  console.log('Created compiled graph version:', compiled1.version);

  const faqGraph = {
    components: [
      {
        id: 'start',
        type: 'trigger',
        data: { label: 'FAQ Request', event: 'message' },
        position: { x: 100, y: 100 },
      },
      {
        id: 'rag-lookup',
        type: 'tool',
        data: {
          label: 'RAG Lookup',
          toolName: 'vector_search',
          config: { index: 'faq_embeddings', topK: 5 },
        },
        position: { x: 100, y: 250 },
      },
      {
        id: 'llm-answer',
        type: 'llm',
        data: {
          label: 'Generate Answer',
          model: 'gpt-4',
          systemPrompt: 'Answer the user\'s question using the provided context from FAQ documents.',
          contextInjectors: ['rag_results'],
        },
        position: { x: 100, y: 400 },
      },
      {
        id: 'end',
        type: 'end',
        data: { label: 'Response Sent' },
        position: { x: 100, y: 550 },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'rag-lookup' },
      { id: 'e2', source: 'rag-lookup', target: 'llm-answer' },
      { id: 'e3', source: 'llm-answer', target: 'end' },
    ],
  };

  const [graph2] = await db.insert(promptGraphs).values({
    orgId,
    name: 'FAQ Actor',
    description: 'RAG-powered FAQ answering flow',
    graphJson: faqGraph,
    isPublished: true,
    logLevel: 'warn',
    createdBy: userId,
    publishedAt: new Date(),
  }).returning();

  console.log('Created graph:', graph2.name);

  await db.insert(compiledGraphs).values({
    graphId: graph2.id,
    version: 1,
    bytecode: JSON.stringify({
      compiled: true,
      version: 1,
      nodes: faqGraph.components,
      edges: faqGraph.edges,
      compiledAt: new Date().toISOString(),
    }),
    checksum: 'demo-checksum-2',
  });

  // Create agent principals (runtime agents that execute graphs)
  const [agent1] = await db.insert(agentPrincipals).values({
    orgId,
    principalId: `welcome-agent-${orgId}`,
    principalType: 'agent',
    name: 'Welcome Agent',
    description: 'Handles initial user greetings and intent routing',
    defaultGraphId: graph1.id,
    capabilities: ['cap:messaging.interrupt', 'cap:messaging.route'],
    webhooks: {
      message: `${resolveServiceUrl(ServiceId.RUNTIME)}/api/webhook/message`,
      control: `${resolveServiceUrl(ServiceId.RUNTIME)}/api/webhook/control`,
    },
  }).returning();

  console.log('Created agent principal:', agent1.name);

  const [agent2] = await db.insert(agentPrincipals).values({
    orgId,
    principalId: `faq-agent-${orgId}`,
    principalType: 'agent',
    name: 'FAQ Agent',
    description: 'RAG-powered FAQ answering agent',
    defaultGraphId: graph2.id,
    capabilities: ['cap:messaging.interrupt'],
    webhooks: {
      message: `${resolveServiceUrl(ServiceId.RUNTIME)}/api/webhook/message`,
      control: `${resolveServiceUrl(ServiceId.RUNTIME)}/api/webhook/control`,
    },
  }).returning();

  console.log('Created agent principal:', agent2.name);

  // Create assistant principals (specialized capability APIs)
  const [logAnalyst] = await db.insert(agentPrincipals).values({
    orgId,
    principalId: 'log-analyst',
    principalType: 'assistant',
    name: 'Log Analyst',
    description: 'Analyzes logs from the Logging service, provides summaries, insights, and anomaly detection',
    capabilities: ['cap:messaging.interrupt'],
    webhooks: {
      message: `${resolveServiceUrl(ServiceId.RUNTIME)}/api/assistants/log-analyst/message`,
    },
    assistantConfig: {
      loggingEndpoint: `${resolveServiceUrl(ServiceId.LOGGING)}/api`,
      capabilities: ['query', 'summarize', 'analyze', 'alert'],
      supportedEventTypes: ['e2e.*', 'service.*', 'error.*'],
    },
  }).returning();

  console.log('Created assistant principal:', logAnalyst.name);

  const [conversation] = await db.insert(conversations).values({
    orgId,
    title: 'Demo Conversation',
    status: 'active',
    channel: 'web',
  }).returning();

  const [run] = await db.insert(graphRuns).values({
    graphId: graph1.id,
    compiledGraphId: compiled1.id,
    conversationId: conversation.id,
    orgId,
    traceId: uuidv4(),
    state: {
      currentNode: 'llm-greeting',
      inputs: [{ content: 'Hello!', from: 'user' }],
      outputs: [],
    },
    status: 'running',
    priority: 'normal',
  }).returning();

  console.log('Created demo run:', run.id);

  await db.insert(runLogs).values([
    {
      runId: run.id,
      level: 'info',
      nodeId: 'start',
      message: 'Message received from user',
      data: { content: 'Hello!' },
    },
    {
      runId: run.id,
      level: 'info',
      nodeId: 'llm-greeting',
      message: 'LLM call started',
      data: { model: 'gpt-4' },
    },
  ]);

  console.log('Seed completed successfully!');
  console.log('\nDemo data summary:');
  console.log(`  Org: ${orgId}`);
  console.log(`  Graphs: Welcome Flow, FAQ Actor`);
  console.log(`  Agents: Welcome Agent, FAQ Agent`);
  console.log(`  Assistants: Log Analyst`);
  console.log(`  Sample run: ${run.id}`);

  await pool.end();
}

seed().catch(console.error);
