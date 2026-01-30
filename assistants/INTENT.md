# Assistants Service — Architectural Intent

> The orchestration engine for AI-powered workflows.

---

## What Assistants Is

Assistants is the **graph-based execution engine** for AI workflows in the Symbia platform. It manages:

1. **Prompt Graphs** — DAGs of nodes that define multi-step AI workflows
2. **Rule Engine** — Event-triggered, condition-based action execution
3. **Agent Principals** — AI identities that can participate in conversations
4. **LLM Integration** — Multi-provider support with context injection
5. **Conversation State** — Persistent context and handoff management

This is not a chatbot framework. It's an orchestration engine that can execute complex, multi-step workflows where AI, humans, and services collaborate to accomplish tasks.

---

## The Problem We're Solving

Building AI assistants requires more than calling an LLM API:

1. **Responses need context** — An assistant analyzing logs needs to first query the Logging service, then synthesize results. That's a multi-step workflow, not a single LLM call.

2. **Different triggers, different behaviors** — A message from a VIP customer should route differently than a routine inquiry. You need rules, not just prompts.

3. **Humans stay in the loop** — AI handles routine requests, but complex issues need human handoff. The transition should be seamless with full context transfer.

4. **Cost needs tracking** — LLM tokens cost money. Every call needs logging for billing, debugging, and optimization.

5. **Agents need identities** — An AI assistant isn't just code — it's a participant in conversations with its own identity, capabilities, and permissions.

6. **Workflows need debugging** — When an assistant gives a wrong answer, you need to trace which nodes executed, what data flowed, and where things went wrong.

Assistants addresses all of these as primary concerns.

---

## Core Concepts

### Prompt Graphs

**What they are:** Directed acyclic graphs (DAGs) that define multi-step AI workflows.

**Structure:**
```json
{
  "components": [
    {"id": "trigger", "type": "message-trigger", "config": {}},
    {"id": "query", "type": "service-call", "config": {"service": "logging"}},
    {"id": "analyze", "type": "llm-invoke", "config": {"model": "gpt-4o-mini"}},
    {"id": "respond", "type": "message-send", "config": {}}
  ],
  "edges": [
    {"from": "trigger", "to": "query"},
    {"from": "query", "to": "analyze"},
    {"from": "analyze", "to": "respond"}
  ]
}
```

**Component types:**
- `message-trigger` — Entry point for message events
- `service-call` — Call other Symbia services
- `llm-invoke` — Call LLM with prompt template
- `message-send` — Send response to conversation
- `condition` — Branch based on data
- `parallel` — Execute multiple paths concurrently
- `loop` — Iterate over collections

**Why graphs:**
- Visual representation of complex logic
- Each node can be logged and debugged
- Parallel execution is natural
- Reusable components across workflows

---

### Rule Engine

**What it is:** Event-driven rules that trigger actions based on conditions.

**Structure:**
```json
{
  "id": "error-handler",
  "name": "Handle error queries",
  "priority": 100,
  "enabled": true,
  "trigger": "message.received",
  "conditions": {
    "logic": "and",
    "conditions": [
      {"field": "message.content", "operator": "contains", "value": "error"}
    ]
  },
  "actions": [
    {"type": "service.call", "params": {...}},
    {"type": "llm.invoke", "params": {...}},
    {"type": "message.send", "params": {...}}
  ]
}
```

**Triggers:**

| Trigger | When |
|---------|------|
| `message.received` | New message from user |
| `conversation.created` | New conversation started |
| `handoff.requested` | Human handoff requested |
| `context.updated` | Context changed |
| `timer.fired` | Scheduled trigger |

**Why rules:**
- Declarative (what, not how)
- Priority-based evaluation
- Easy to modify without code changes
- Audit trail of which rules fired

---

### Agent Principals

**What they are:** AI identities that participate in conversations.

**Structure:**
```json
{
  "principalId": "assistant:support",
  "orgId": "org-uuid",
  "name": "Support Assistant",
  "defaultGraphId": "graph-uuid",
  "capabilities": ["cap:messaging.send", "cap:logging.read"],
  "webhooks": {
    "message": "/api/webhook/message",
    "control": "/api/webhook/control"
  },
  "assistantConfig": {
    "modelConfig": {
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

**Why separate from users:**
- Different authentication (agent tokens vs user sessions)
- Declared capabilities (what the agent can do)
- Webhook configuration (how to reach the agent)
- Default behavior (which graph to run)

---

### Conversation State

**What it is:** Persistent context that flows through a conversation.

**States:**

| State | Meaning |
|-------|---------|
| `idle` | Waiting for user input |
| `ai_active` | AI is processing/responding |
| `waiting_for_user` | AI asked a question, waiting for answer |
| `handoff_pending` | Waiting for human agent assignment |
| `agent_active` | Human agent is handling |
| `resolved` | Conversation complete |
| `archived` | Historical record |

**Context fields:**
- Conversation history
- User information
- Custom data from actions
- State machine position

---

### Handoff Workflows

**What they are:** Transitions from AI to human agents.

**Flow:**
```
AI Assistant ──[handoff.create]──▶ Handoff Queue
                                        │
                                        ▼
                              Human Agent Assigned
                                        │
                                        ▼
                              Human Takes Over
                                        │
                                        ▼
                              Resolved by Human
```

**Handoff data:**
- Reason for handoff
- Conversation context snapshot
- Priority level
- Assignment rules

---

## Design Principles

### 1. SDN-Routed Message Handling

Assistants receives messages through the Network SDN mesh for full observability:

```
User ◄──────────────────────────────────────────► Messaging Service
                                                        │
                                                        ▼
                                               Emits 'message.new'
                                               via Network SDN
                                                        │
                                                        ▼
                                               Assistants receives
                                               via SDN handler
                                                        │
                                                        ▼
                                               Turn-taking protocol
                                               (claim/defer/respond)
                                                        │
                                                        ▼
                                               Emits 'message.response'
                                               via Network SDN
```

**Why SDN routing:**
- Full observability in Control Center's Network panel
- Turn-taking events visible in event timeline
- Enables assistant coordination via claim/defer protocol
- HTTP fallback if SDN unavailable

**Trade-off accepted:** Additional event routing complexity. Worth it for observability and coordination.

### 2. Declarative Workflows via Graphs

Workflows are data, not code:

```json
{
  "components": [...],
  "edges": [...]
}
```

**Why declarative:**
- Version control friendly
- Can be edited in UI
- Easy to visualize
- A/B testing by swapping graph IDs
- No code deployment for workflow changes

**Trade-off accepted:** Less flexible than arbitrary code. Mitigated by extensible action types.

### 3. Template-Based Prompts

Prompts use `{{variable}}` syntax for dynamic content:

```
You are analyzing logs for {{user.displayName}}.
User's question: {{message.content}}
Recent errors: {{logsResult.entries}}
```

**Available variables:**

| Variable | Source |
|----------|--------|
| `{{message.*}}` | Current message |
| `{{user.*}}` | User information |
| `{{context.*}}` | Conversation context |
| `{{[nodeId].result}}` | Output from previous node |
| `{{llmResponse}}` | Previous LLM output |

**Why templates:**
- Non-developers can edit prompts
- Clear data flow visibility
- Type-safe at runtime

### 4. Action Handler Extensibility

Actions are pluggable:

```typescript
// Built-in actions
"llm.invoke"      → Call LLM
"message.send"    → Send message
"service.call"    → Call Symbia service
"webhook.call"    → Call external HTTP
"handoff.create"  → Request human handoff
"context.update"  → Update conversation context
"state.transition"→ Change conversation state
"parallel"        → Execute concurrently
"loop"            → Iterate collection
"condition"       → Branch logic
"wait"            → Delay execution
```

**Why extensible:**
- New actions without core changes
- Domain-specific actions possible
- Testing via mock actions

### 5. Token Tracking for Every LLM Call

Every LLM invocation is logged:

```json
{
  "runId": "run-uuid",
  "nodeId": "analyze",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "promptTokens": 250,
  "completionTokens": 150,
  "totalTokens": 400,
  "latencyMs": 1200,
  "success": true
}
```

**Why tracking:**
- Cost attribution per org
- Debugging slow responses
- Optimization opportunities
- Billing accuracy

### 6. Control Events for Stream Management

Graphs respond to control events from Messaging:

| Event | Effect |
|-------|--------|
| `stream.pause` | Pause execution |
| `stream.resume` | Continue execution |
| `stream.preempt` | Cancel current node |
| `stream.cancel` | Abort entire run |
| `stream.handoff` | Transition to human |

**Why control events:**
- User can interrupt long responses
- Priority changes mid-execution
- Graceful handoff without losing state

### 7. Turn-Taking Protocol (Justification Events)

Prevents "nosy" assistant behavior through coordinated claim/defer events:

**The Problem:**
- Multiple assistants in a conversation all receive messages
- Without coordination, multiple might respond simultaneously
- Overlapping keyword rules (greetings, task words) trigger chaos

**The Solution:**
1. **Claim Phase** — Matching assistants emit `assistant.intent.claim` with confidence score
2. **Claim Window** — 500ms for higher-priority assistants to counter-claim
3. **Resolution** — Highest priority wins; others defer or observe
4. **Response** — Winner emits `assistant.action.respond` with justification

**Justification Event Types:**

| Event | When Emitted |
|-------|--------------|
| `assistant.intent.claim` | Before responding — declares intent with confidence |
| `assistant.intent.defer` | When passing to higher-priority assistant |
| `assistant.action.observe` | When watching silently without responding |
| `assistant.action.respond` | When sending response with full justification |

**Justification Payload:**
```json
{
  "assistantKey": "log-analyst",
  "entityId": "ent_asst_111",
  "conversationId": "conv-uuid",
  "justification": {
    "reason": "Message contains 'logs' - matches my domain",
    "triggerRule": "log-keyword-rule",
    "conditions": [
      {"field": "message.content", "operator": "contains", "value": "logs", "matched": true}
    ],
    "confidence": 0.95
  },
  "claim": {
    "claimedAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-15T10:30:00.500Z",
    "priority": 150
  }
}
```

**Why turn-taking:**
- Predictable behavior — users know which assistant will respond
- Full observability — Control Center shows claim/defer reasoning
- Debugging — audit trail of why assistants acted or didn't
- Cross-assistant awareness — each sees what others are doing

---

## Data Flow

### Message Processing

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Messaging  │     │  Assistants  │     │     LLM      │
│   Service    │     │   Service    │     │   Provider   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ POST /webhook/message                   │
       │───────────────────▶│                    │
       │                    │ Find agent         │
       │                    │ Load graph         │
       │                    │ Create run         │
       │                    │                    │
       │                    │ Execute nodes...   │
       │                    │                    │
       │                    │ llm.invoke         │
       │                    │───────────────────▶│
       │                    │◀───────────────────│
       │                    │ Response           │
       │                    │                    │
       │                    │ Log tokens         │
       │                    │                    │
       │◀───────────────────│                    │
       │ POST /messages     │                    │
       │ (response)         │                    │
```

### Rule Evaluation

```
Message Received
       │
       ▼
┌─────────────────────────────────────────┐
│ Rule Evaluation                          │
├─────────────────────────────────────────┤
│ 1. Filter by trigger: message.received   │
│ 2. Sort by priority (high → low)         │
│ 3. For each rule:                        │
│    - Evaluate conditions                 │
│    - If match: execute actions           │
│    - Continue to next rule               │
└─────────────────────────────────────────┘
       │
       ▼
Actions Executed
```

### Graph Execution

```
┌─────────────┐
│   Trigger   │
│    Node     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Query     │     │   Parallel  │
│   Logs      │     │   Branch    │
└──────┬──────┘     └──────┬──────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Analyze   │     │   Notify    │
│   (LLM)     │     │   Slack     │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│   Respond   │
│   to User   │
└─────────────┘
```

### Handoff Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Assistant   │     │  Assistants  │     │    Human     │
│   (AI)       │     │   Service    │     │    Agent     │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ User asks for      │                    │
       │ human help         │                    │
       │───────────────────▶│                    │
       │                    │ Create handoff     │
       │                    │ request            │
       │                    │                    │
       │                    │ Snapshot context   │
       │                    │                    │
       │                    │ Set state:         │
       │                    │ handoff_pending    │
       │                    │                    │
       │                    │ Notify human ─────────────────▶│
       │                    │                    │ Accept     │
       │                    │◀───────────────────│            │
       │                    │                    │
       │                    │ Set state:         │
       │                    │ agent_active       │
       │                    │                    │
       │                    │                    │ Handle     │
       │                    │                    │ conversation
```

---

## Schema Design Decisions

### Why Separate Graphs and Rules

Graphs are reusable workflows; rules are trigger conditions:

```
Rule: "When message contains 'error', run Error Analysis Graph"
Graph: Error Analysis Graph (query logs → analyze → respond)
```

**Why:**
- Same graph can be triggered by multiple rules
- Rules can be enabled/disabled without touching graphs
- Clear separation of "when" and "what"

### Why JSONB for Graph and Config

Graph structure and configurations are JSON:

```sql
graphJson: JSONB      -- { components: [], edges: [] }
triggerConditions: JSONB
assistantConfig: JSONB
```

**Why:**
- Flexible schema (different component types)
- No migrations for new component types
- Easy to version control
- Type safety via Zod validation

### Why Runs are First-Class Entities

Every graph execution creates a run:

```sql
graphRuns (
  id, graphId, conversationId, orgId,
  state, status, priority,
  startedAt, completedAt
)
```

**Why:**
- Debugging: "Show me all runs for this conversation"
- Analytics: "How long do runs take on average?"
- Resumability: Paused runs can continue
- Audit: Complete execution history

### Why Run Logs are Separate

Each run has detailed logs:

```sql
runLogs (
  id, runId, level, nodeId,
  message, data, createdAt
)
```

**Why:**
- High cardinality (many logs per run)
- Different retention than runs
- Queryable by node, level
- Detailed debugging data

---

## Action Handler Deep Dive

### llm.invoke

Call an LLM with context injection.

```typescript
{
  type: "llm.invoke",
  params: {
    provider: "openai",           // or anthropic, azure, google
    model: "gpt-4o-mini",
    systemPrompt: "You are a helpful assistant.",
    promptTemplate: "User asked: {{message.content}}",
    temperature: 0.7,
    maxTokens: 1024,
    contextFields: ["message", "user", "context"]
  }
}
```

**What happens:**
1. Resolve template variables
2. Build messages array (system + user prompts)
3. Call provider API
4. Log token usage
5. Store response in `{{llmResponse}}`

### service.call

Call another Symbia service.

```typescript
{
  type: "service.call",
  params: {
    service: "logging",           // logging, catalog, identity
    method: "POST",
    path: "/api/logs/query",
    body: {"level": "error", "limit": 10},
    resultKey: "logsResult"       // Store response here
  }
}
```

**What happens:**
1. Resolve service endpoint from config
2. Build request with auth headers
3. Execute HTTP request
4. Store response in `{{resultKey}}`

### parallel

Execute actions concurrently.

```typescript
{
  type: "parallel",
  params: {
    actions: [
      {type: "service.call", params: {...}},
      {type: "service.call", params: {...}}
    ],
    strategy: "all",    // all (wait for all), any (first wins), settle (all + errors)
    timeout: 5000       // ms
  }
}
```

**Strategies:**
- `all` — Wait for all, fail if any fails
- `any` — Return first success
- `settle` — Wait for all, collect successes and errors

### condition

Branch based on data.

```typescript
{
  type: "condition",
  params: {
    condition: {
      field: "logsResult.total",
      operator: "gt",
      value: 0
    },
    ifTrue: [{type: "llm.invoke", ...}],
    ifFalse: [{type: "message.send", params: {content: "No errors found"}}]
  }
}
```

### loop

Iterate over collections.

```typescript
{
  type: "loop",
  params: {
    collection: "{{logsResult.entries}}",
    itemKey: "logEntry",
    indexKey: "i",
    actions: [
      {type: "message.send", params: {content: "{{i}}: {{logEntry.message}}"}}
    ]
  }
}
```

---

## LLM Integration

### Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| OpenAI | gpt-4, gpt-4o, gpt-4o-mini, gpt-3.5-turbo | Default provider |
| Anthropic | claude-3-opus, claude-3-sonnet, claude-3-haiku | Streaming supported |
| Azure OpenAI | Configured models | Enterprise deployments |
| Google Vertex | gemini-pro | Limited support |

### Configuration Hierarchy

1. **Action-level:** Params in action config
2. **Agent-level:** assistantConfig.modelConfig
3. **Org-level:** LLM settings for organization
4. **Environment:** OPENAI_API_KEY, ANTHROPIC_API_KEY

### Token Tracking

Every LLM call logs:

| Field | Description |
|-------|-------------|
| `promptTokens` | Input tokens |
| `completionTokens` | Output tokens |
| `totalTokens` | Sum |
| `latencyMs` | Response time |
| `model` | Model used |
| `success` | Boolean |
| `error` | Error message if failed |

---

## Integration Patterns

### For Messaging Service

Messaging calls Assistants via webhook when a message targets an agent:

```typescript
// Messaging Service code
if (message.to.principalType === "assistant") {
  await fetch(`${ASSISTANTS_URL}/api/webhook/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: message.id,
      conversationId: message.conversationId,
      orgId: message.orgId,
      from: { principalId: message.senderId, principalType: message.senderType },
      to: { principalId: message.to.principalId, principalType: "assistant" },
      content: message.content,
      contentType: message.contentType,
      sequence: message.sequence,
      priority: message.priority,
      createdAt: message.createdAt
    })
  });
}
```

### For Custom Assistants

Define assistant in Catalog, register agent principal:

```typescript
// 1. Create assistant resource in Catalog
await catalog.createResource({
  key: "my-assistant",
  type: "assistant",
  status: "published",
  metadata: {
    assistantConfig: {
      principalId: "assistant:my-assistant",
      capabilities: ["cap:messaging.send", "cap:data.read"],
      modelConfig: { provider: "openai", model: "gpt-4o-mini" }
    }
  }
});

// 2. Register agent principal in Assistants
await assistants.createActor({
  orgId,
  principalId: "assistant:my-assistant",
  name: "My Assistant",
  defaultGraphId: graphId,
  capabilities: ["cap:messaging.send", "cap:data.read"],
  webhooks: { message: "/api/webhook/message" }
});

// 3. Create prompt graph
await assistants.createGraph({
  orgId,
  name: "My Assistant Flow",
  graphJson: {
    components: [...],
    edges: [...]
  },
  triggerConditions: { event: "message.received" }
});
```

### For Human Handoff

```typescript
// In graph, add handoff action
{
  type: "condition",
  params: {
    condition: {
      field: "message.content",
      operator: "contains",
      value: "speak to human"
    },
    ifTrue: [
      {
        type: "handoff.create",
        params: {
          reason: "User requested human support",
          priority: "high",
          metadata: { category: "support" }
        }
      },
      {
        type: "message.send",
        params: {
          content: "I'm connecting you with a human agent. Please wait..."
        }
      }
    ]
  }
}
```

---

## Operational Considerations

### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| Webhook receive | 10-50ms | Parse + validate |
| Rule evaluation | 5-20ms | Condition matching |
| LLM call | 500-5000ms | Depends on model/tokens |
| Service call | 20-200ms | Depends on target |
| Graph execution | 1-10s | Depends on complexity |

### Scaling Considerations

- **Horizontal:** Stateless — add instances
- **LLM calls:** Rate limiting per provider
- **Database:** Read replicas for run/log queries
- **Webhooks:** Async processing for high volume

### Monitoring Points

- Webhook request rate
- Run completion rate
- Run duration distribution
- LLM token usage by org
- LLM error rate by provider
- Handoff rate
- Action type distribution

### Debugging Runs

```bash
# Get run details
GET /api/runs/{runId}

# Get run logs
GET /api/runs/{runId}/logs?level=debug

# Response shows node-by-node execution
{
  "logs": [
    {"nodeId": "trigger", "message": "Triggered by message.received"},
    {"nodeId": "query", "message": "Called logging service", "data": {"entriesFound": 5}},
    {"nodeId": "analyze", "message": "LLM completed", "data": {"tokens": 450}},
    {"nodeId": "respond", "message": "Sent response"}
  ]
}
```

---

## What Assistants Does Not Do

### No Direct WebSocket Connections

Users connect to Messaging, not Assistants. Assistants receives webhooks.

**Rationale:** Messaging handles real-time complexity. Assistants focuses on execution.

### No User Authentication

Assistants trusts the caller (Messaging service). It doesn't validate user tokens.

**Rationale:** Authentication happens at the edge (Messaging). Internal services trust each other.

### No Persistent Conversations

Conversation state is in Messaging. Assistants gets context per-request.

**Rationale:** Single source of truth for conversation data.

### No Streaming Responses

Responses are complete messages, not token streams.

**Rationale:** Simplicity. Streaming would require WebSocket from Assistants to Messaging. Future consideration.

---

## Future Directions

### Planned

1. **Streaming responses** — Token-by-token delivery via WebSocket
2. **Multi-turn memory** — Automatic context summarization
3. **Graph versioning** — A/B testing between versions
4. **Action marketplace** — Custom action plugins

### Considered

1. **Voice support** — Speech-to-text/text-to-speech integration
2. **Image understanding** — Multi-modal LLM support
3. **Fine-tuning UI** — Train custom models from conversation data
4. **Evaluation framework** — Automated testing of assistant quality

### Intentionally Deferred

1. **Direct user connections** — Messaging handles this
2. **Custom LLM hosting** — Use provider APIs
3. **Conversation search** — Messaging/Logging service responsibility

---

## Quick Reference

### Trigger Types

| Trigger | When |
|---------|------|
| `message.received` | New user message |
| `conversation.created` | New conversation |
| `handoff.requested` | Human handoff |
| `context.updated` | Context change |
| `timer.fired` | Scheduled |

### Conversation States

| State | Meaning |
|-------|---------|
| `idle` | Waiting for user |
| `ai_active` | AI processing |
| `waiting_for_user` | AI asked question |
| `handoff_pending` | Awaiting human |
| `agent_active` | Human handling |
| `resolved` | Complete |
| `archived` | Historical |

### Action Types

| Action | Purpose |
|--------|---------|
| `llm.invoke` | Call LLM |
| `message.send` | Send response |
| `service.call` | Call Symbia service |
| `webhook.call` | Call external HTTP |
| `handoff.create` | Request human |
| `context.update` | Update state |
| `state.transition` | Change state |
| `parallel` | Concurrent execution |
| `loop` | Iteration |
| `condition` | Branching |
| `wait` | Delay |

### Condition Operators

| Operator | Meaning |
|----------|---------|
| `eq`, `neq` | Equals, not equals |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison |
| `contains`, `not_contains` | String contains |
| `starts_with`, `ends_with` | String prefix/suffix |
| `matches` | Regex |
| `in`, `not_in` | Array membership |
| `exists`, `not_exists` | Field presence |

### Control Events

| Event | Effect |
|-------|--------|
| `stream.pause` | Pause run |
| `stream.resume` | Resume run |
| `stream.preempt` | Cancel current node |
| `stream.cancel` | Abort run |
| `stream.handoff` | Transfer to human |

---

*This document reflects the Assistants service architectural intent as of January 2026.*
