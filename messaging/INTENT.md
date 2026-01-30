# Messaging Service — Architectural Intent

> The real-time communication backbone for humans and AI agents.

---

## What Messaging Is

Messaging is the **real-time communication bus** for the Symbia platform. It manages conversations between humans, AI agents, and services with:

1. **Conversations** — Containers for participants and messages
2. **Messages** — Content with threading, priority, and metadata
3. **Control Events** — Stream management (pause, resume, preempt, handoff)
4. **Presence** — Real-time online/offline/typing status

This is not a simple chat service. It's designed for human-AI collaboration where conversations need stream control, priority management, and seamless handoffs between automated and human responders.

---

## The Problem We're Solving

Traditional messaging systems assume all participants are human. This breaks down when AI agents are involved:

1. **Agents generate streams, not messages** — An LLM producing a response is a stream that can take seconds. Users need to pause, cancel, or interrupt that stream mid-generation.

2. **Priority matters** — When a user asks a new question while an agent is still responding to the previous one, the new question should preempt the old response. Traditional messaging has no priority concept.

3. **Handoffs are common** — AI agents escalate to humans. Humans delegate to AI. The conversation continues seamlessly, but participants change. This needs explicit support.

4. **Agents are participants, not integrations** — An AI assistant isn't a webhook that receives messages. It's a participant in the conversation with its own identity, typing indicators, and presence.

5. **Dual protocol is required** — REST for CRUD operations, WebSocket for real-time delivery. Both need to work with the same conversation model.

6. **Observability is critical** — When debugging why an AI responded incorrectly, you need trace IDs and run IDs linking messages to workflow executions.

Messaging addresses all of these as primary concerns.

---

## Core Concepts

### Conversations

**What they are:** Containers that group participants and messages together.

**Types:**
- `private` — Two participants only (1:1 chat)
- `group` — Multiple participants (team discussion, support channel)

**Properties:**
```json
{
  "id": "conv-uuid",
  "type": "group",
  "name": "Project Alpha Discussion",
  "description": "Team discussion for Project Alpha",
  "org_id": "org-uuid",
  "created_by": "user-uuid",
  "metadata": {}
}
```

**Why conversations exist:**
- Access control boundary (participants only)
- Context for AI agents (conversation history)
- Organizational scoping (org_id)
- Lifecycle management (archive, delete)

---

### Participants

**What they are:** Entities that can send/receive messages in a conversation.

**Types:**

| Type | Format | Description |
|------|--------|-------------|
| `user` | UUID | Human authenticated via Identity |
| `agent` | `assistant:key` | AI agent (e.g., `assistant:support`) |
| `service` | Service ID | Backend service |
| `bot` | Bot ID | Automated bot |

**Roles:**

| Role | Can Do |
|------|--------|
| `owner` | Full control, delete conversation, manage all participants |
| `admin` | Add/remove participants, manage settings |
| `member` | Send messages, view history |

**Why participant types matter:**
- UI renders agents differently (shows "AI" badge)
- Control events target specific participant types
- Webhooks trigger only for agent participants
- Presence tracking differs (agents don't go "away")

---

### Messages

**What they are:** Content sent within a conversation.

**Structure:**
```json
{
  "id": "msg-uuid",
  "conversation_id": "conv-uuid",
  "sender_id": "user-uuid",
  "sender_type": "user",
  "content": "Hello, can you help with this?",
  "content_type": "text",
  "reply_to": null,
  "sequence": 42,
  "priority": "normal",
  "interruptible": true,
  "run_id": "graph-run-uuid",
  "trace_id": "trace-123"
}
```

**Content types:**

| Type | Use Case |
|------|----------|
| `text` | Plain text messages |
| `markdown` | Formatted agent responses |
| `json` | Structured data payloads |
| `html` | Rich formatted content |
| `event` | Control events (stored as messages) |

**Why sequence numbers:**
- Guaranteed ordering across distributed systems
- Message replay from a known point
- Gap detection for missed messages

---

### Control Events

**What they are:** Commands that manage message stream behavior.

**Event types:**

| Event | Purpose |
|-------|---------|
| `stream.pause` | Temporarily halt agent response |
| `stream.resume` | Continue paused response |
| `stream.preempt` | Interrupt with higher priority |
| `stream.cancel` | Abort current response entirely |
| `stream.priority` | Change message priority level |
| `stream.route` | Redirect to different handler |
| `stream.handoff` | Transfer to human/agent |

**Why control events exist:**
- LLM responses take seconds — users need control
- Priority handling prevents queue starvation
- Handoffs enable human-in-the-loop workflows
- Routing enables dynamic agent selection

**Storage:** Control events are stored as messages with `content_type: 'event'` for audit trail.

---

## Design Principles

### 1. Dual Protocol Architecture

REST API for CRUD, WebSocket for real-time:

```
┌──────────────────────────────────────────────────────────┐
│                      Messaging Service                    │
├─────────────────────────┬────────────────────────────────┤
│      REST API           │         WebSocket              │
│  (Express.js)           │        (Socket.IO)             │
├─────────────────────────┼────────────────────────────────┤
│ • Create conversation   │ • Join/leave rooms             │
│ • List messages         │ • Real-time message delivery   │
│ • Add participants      │ • Typing indicators            │
│ • Send control events   │ • Presence updates             │
│ • CRUD operations       │ • Control event broadcast      │
└─────────────────────────┴────────────────────────────────┘
```

**Why both protocols:**
- REST for reliable CRUD (create conversation, list history)
- WebSocket for low-latency real-time (new message, typing)
- Same authentication works for both
- Same data model, different delivery

**Trade-off accepted:** Two codepaths to maintain. Worth it for optimal UX.

### 2. Agents as First-Class Participants

Agents aren't integrations — they're participants:

```json
{
  "participants": [
    {"userId": "user-123", "userType": "user", "role": "owner"},
    {"userId": "assistant:support", "userType": "agent", "role": "member"}
  ]
}
```

**What this enables:**
- Agents have typing indicators
- Agents have presence (online/offline)
- Agents can be added/removed like users
- Messages show sender type for UI rendering
- Control events can target specific agents

**Agent identification:** Format is `assistant:key` where `key` matches the assistant's key in Catalog.

### 3. Priority and Interruptibility

Messages have priority levels:

| Priority | Use Case |
|----------|----------|
| `low` | Background notifications |
| `normal` | Standard messages (default) |
| `high` | Urgent user requests |
| `critical` | System alerts, errors |

**Interruptibility:**
```json
{
  "content": "Let me explain in detail...",
  "priority": "normal",
  "interruptible": true  // Can be preempted
}
```

**Why this matters:**
- User's new question preempts ongoing agent response
- Critical alerts surface immediately
- Long explanations can be paused without losing context

**Preemption tracking:**
```json
{
  "id": "original-msg",
  "preempted_by": "preempting-msg-uuid"
}
```

### 4. SDN-Routed Agent Notifications

When a non-agent sends a message to a conversation with agent participants, Messaging notifies via the Network SDN mesh for full observability:

```
User sends message → Messaging stores → Messaging broadcasts via WebSocket
                                     → Messaging emits 'message.new' via SDN
                                          ↓
                                    Network SDN routes to Assistants
                                          ↓
                                    Assistants process (with turn-taking)
                                          ↓
                                    Agent emits 'message.response' via SDN
                                          ↓
                                    Messaging receives and broadcasts
```

**Why SDN routing:**
- Full visibility in Control Center's Network panel
- All events appear in event timeline with tracing
- Enables turn-taking protocol observability
- HTTP fallback if SDN unavailable

**SDN Event payload (`message.new`):**
```json
{
  "type": "message.new",
  "data": {
    "conversationId": "conv-uuid",
    "message": {
      "id": "msg-uuid",
      "content": "User's question",
      "senderId": "user-uuid",
      "senderType": "user"
    },
    "assistantKeys": ["support", "log-analyst"],
    "orgId": "org-uuid",
    "recipientEntityIds": ["ent_asst_111", "ent_asst_222"]
  }
}
```

**Why SDN routing:**
- Full observability in Network panel event stream
- Enables turn-taking protocol (assistants claim/defer)
- Events traceable with runId linking
- HTTP fallback if SDN unavailable for reliability

### 5. Message Threading

Messages can reply to other messages:

```json
{
  "content": "Can you elaborate on point 2?",
  "replyTo": "previous-msg-uuid"
}
```

**Why threading:**
- Preserves context in group conversations
- Enables focused sub-discussions
- AI can respond to specific questions
- UI can render threaded views

### 6. Observability Built In

Every message can carry tracing context:

```json
{
  "content": "Here's my analysis...",
  "runId": "graph-execution-uuid",
  "traceId": "distributed-trace-id"
}
```

**What this enables:**
- Link message to workflow execution
- Trace request across services
- Debug "why did the agent say this?"
- Correlate with logs and metrics

---

## Data Flow

### Message Send (REST)

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Client  │     │   Messaging  │     │   Database   │     │  WebSocket   │
│          │     │   Service    │     │              │     │   Clients    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                  │                    │                    │
     │ POST /messages   │                    │                    │
     │─────────────────▶│                    │                    │
     │                  │ Validate auth      │                    │
     │                  │ Check participant  │                    │
     │                  │ Assign sequence    │                    │
     │                  │───────────────────▶│                    │
     │                  │ INSERT message     │                    │
     │                  │◀───────────────────│                    │
     │                  │                    │                    │
     │                  │ Broadcast to room ─────────────────────▶│
     │                  │                    │                    │
     │◀─────────────────│                    │                    │
     │ 201 Created      │                    │                    │
```

### Message Send (WebSocket)

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Client  │     │   Messaging  │     │   Database   │     │    Other     │
│ (Socket) │     │   Service    │     │              │     │   Clients    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                  │                    │                    │
     │ message:send     │                    │                    │
     │─────────────────▶│                    │                    │
     │                  │ Validate auth      │                    │
     │                  │ Check participant  │                    │
     │                  │───────────────────▶│                    │
     │                  │◀───────────────────│                    │
     │                  │                    │                    │
     │                  │ Emit to room ──────────────────────────▶│
     │                  │                    │      message:new   │
     │◀─────────────────│                    │                    │
     │ callback(success)│                    │                    │
```

### Agent Notification Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User   │     │   Messaging  │     │  Assistants  │     │    Agent     │
│          │     │   Service    │     │   Service    │     │   (LLM)      │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                  │                    │                    │
     │ Send message     │                    │                    │
     │─────────────────▶│                    │                    │
     │                  │ Store + broadcast  │                    │
     │                  │                    │                    │
     │                  │ POST webhook       │                    │
     │                  │───────────────────▶│                    │
     │                  │                    │ Trigger agent      │
     │                  │                    │───────────────────▶│
     │                  │                    │◀───────────────────│
     │                  │                    │ Response           │
     │                  │◀───────────────────│                    │
     │                  │ Agent sends message│                    │
     │◀─────────────────│                    │                    │
     │ Receive response │                    │                    │
```

### Control Event Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User   │     │   Messaging  │     │    Agent     │     │  Assistants  │
│          │     │   Service    │     │  (listening) │     │   Service    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                  │                    │                    │
     │ stream.pause     │                    │                    │
     │─────────────────▶│                    │                    │
     │                  │ Store as message   │                    │
     │                  │                    │                    │
     │                  │ Broadcast ─────────────────────────────▶│
     │                  │ stream.pause       │                    │
     │                  │                    │                    │
     │                  │                    │ Stop generating    │
     │                  │                    │◀───────────────────│
     │◀─────────────────│                    │                    │
     │ Control ack      │                    │                    │
```

---

## Schema Design Decisions

### Why Soft Delete for Messages

Messages have `deleted_at` rather than being physically deleted:

```sql
deleted_at: TIMESTAMP  -- NULL = not deleted
```

**Why:**
- Audit trail preservation
- "Delete for me" vs "delete for everyone" semantics
- Recovery possible
- Compliance requirements

### Why Sequence Numbers

Every message has a monotonically increasing sequence:

```sql
sequence: BIGINT  -- Per-conversation incrementing number
```

**Why:**
- Guaranteed ordering (timestamps can collide)
- Gap detection ("I have 1-10, where is 11?")
- Efficient pagination ("give me messages after sequence 50")
- Replay from known point

### Why Control Events Are Messages

Control events are stored in the messages table:

```sql
content_type: 'event'
metadata: {"control": {"event": "stream.pause", ...}}
```

**Why:**
- Unified audit trail
- Same delivery mechanism
- Queryable history
- No separate table to manage

### Why JSONB for Metadata

Variable structure in metadata column:

```sql
metadata: JSONB  -- Agent confidence, model info, custom data
```

**Why:**
- Different senders need different metadata
- No schema migrations for new fields
- Queryable with PostgreSQL JSONB operators
- Type flexibility

---

## Participant Lifecycle

### Joining a Conversation

```
1. Create conversation → Creator is "owner"
2. Add participants → Each becomes "member"
3. Promote to admin → Role changes to "admin"
```

**On join:**
- Participant record created
- `joined_at` timestamp set
- WebSocket can join room immediately
- Participant receives `participant:online` event

### Leaving a Conversation

```
1. User leaves voluntarily → participant removed
2. Admin removes user → participant removed
3. Owner cannot leave → must transfer ownership first
```

**On leave:**
- Participant record deleted
- WebSocket removed from room
- Other participants receive `participant:offline`
- Message history preserved

### Read Tracking

```sql
last_read_at: TIMESTAMP  -- Last message the participant read
```

**Use cases:**
- Unread count calculation
- "Catch up" point for reconnecting
- Typing indicator relevance

---

## Integration Patterns

### For AI Agents

```typescript
// Respond to webhook notification
app.post("/api/webhook/messaging", async (req, res) => {
  const { conversationId, message, assistant } = req.body;

  // Generate response
  const response = await llm.complete({
    history: await getConversationHistory(conversationId),
    userMessage: message.content
  });

  // Send response via Messaging API
  await messagingClient.sendMessage({
    conversationId,
    content: response,
    contentType: "markdown",
    metadata: { model: "gpt-4", confidence: 0.95 }
  });

  res.json({ received: true });
});
```

### For Real-Time Clients

```typescript
import { createMessagingSocket } from "@symbia/messaging-client";

const socket = createMessagingSocket({
  endpoint: process.env.MESSAGING_URL,
  token: userToken
});

await socket.connect();
await socket.joinConversation(conversationId);

// Listen for messages
socket.onMessage((message) => {
  if (message.sender_type === "agent") {
    renderAgentMessage(message);
  } else {
    renderUserMessage(message);
  }
});

// Listen for control events
socket.onControl("stream.pause", (event) => {
  showPausedIndicator();
});

socket.onControl("stream.resume", (event) => {
  hidePausedIndicator();
});

// Send message
await socket.sendMessage({
  conversationId,
  content: userInput,
  priority: "high"
});

// Typing indicator
socket.startTyping(conversationId);
// ... user typing ...
socket.stopTyping(conversationId);
```

### For Backend Services

```typescript
import { createMessagingClient } from "@symbia/messaging-client";

const messaging = createMessagingClient({
  endpoint: process.env.MESSAGING_URL,
  apiKey: process.env.MESSAGING_API_KEY
});

// Create support conversation
const conversation = await messaging.createConversation({
  type: "private",
  name: `Support: ${ticketId}`,
  orgId,
  participantIds: [userId, "assistant:support"]
});

// Send system message
await messaging.sendMessage({
  conversationId: conversation.id,
  content: "Support ticket created. An agent will respond shortly.",
  contentType: "text",
  metadata: { ticketId, priority }
});

// Trigger handoff when needed
await messaging.sendControl(conversation.id, {
  event: "stream.handoff",
  target: humanAgentId,
  reason: "Customer requested human support",
  metadata: { ticketId }
});
```

---

## Operational Considerations

### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| Send message (REST) | 20-50ms | Database write + broadcast |
| Send message (WebSocket) | 10-30ms | Lower overhead |
| List messages | 10-50ms | Depends on limit |
| Join conversation | 5-20ms | Room subscription |
| Broadcast to room | <5ms | In-memory operation |

### Scaling Considerations

- **Horizontal:** Stateless API — add instances behind load balancer
- **WebSocket:** Requires sticky sessions or Redis adapter for multi-node
- **Database:** Read replicas for message history queries
- **Rooms:** Socket.IO rooms are in-memory; use Redis adapter for clustering

### Monitoring Points

- Messages per second (ingest rate)
- WebSocket connections (concurrent)
- Room sizes (participants per conversation)
- Control events (pause/preempt frequency)
- Webhook latency (Assistants notification)
- Message delivery latency (send to receive)

### Room Management

Socket.IO rooms map to conversations:

```
Room: conversation:{conv-uuid}
  └── Socket: user-1
  └── Socket: user-2
  └── Socket: assistant:support
```

**On disconnect:**
- Socket removed from all rooms
- Presence updated to offline
- No message loss (persisted to DB first)

---

## What Messaging Does Not Do

### No Message Storage Limits

Messages are stored indefinitely. No automatic purging.

**Rationale:** Conversation history is valuable context for AI. Archival/retention is a future concern.

### No Read Receipts

`last_read_at` tracks the user's position, but doesn't broadcast "user X read your message."

**Rationale:** Complexity. Users have mixed feelings about read receipts. Future consideration.

### No Reactions/Emoji

Messages don't support emoji reactions.

**Rationale:** Simplicity. Not critical for AI-human collaboration. Future consideration.

### No File Attachments

Messages are text content. File sharing requires external storage + URL.

**Rationale:** Blob storage is a separate concern. Reference files by URL in message content.

### No End-to-End Encryption

Messages are stored in plaintext. Transport is TLS.

**Rationale:** AI agents need to read messages to respond. E2E encryption would break this.

---

## Future Directions

### Planned

1. **Message reactions** — Emoji responses without full replies
2. **Read receipts** — "Seen by" indicators
3. **Message search** — Full-text search across conversations
4. **Scheduled messages** — Send later functionality

### Considered

1. **Voice/video** — WebRTC integration
2. **File attachments** — Native file upload
3. **Message expiry** — Auto-delete after time period
4. **Channels** — Public broadcast channels

### Intentionally Deferred

1. **E2E encryption** — Conflicts with AI agent access
2. **Federation** — Cross-org messaging (security concerns)
3. **SMS/email bridges** — External channel integration

---

## Quick Reference

### Conversation Types

| Type | Participants | Use Case |
|------|--------------|----------|
| `private` | Exactly 2 | 1:1 support, direct messages |
| `group` | 2+ | Team discussions, multi-agent |

### Participant Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full control, delete conversation |
| `admin` | Manage participants, settings |
| `member` | Send messages, view history |

### Participant Types

| Type | Format | Example |
|------|--------|---------|
| `user` | UUID | `650e8400-...` |
| `agent` | `assistant:key` | `assistant:support` |
| `service` | Service ID | `notification-service` |
| `bot` | Bot ID | `welcome-bot` |

### Message Priority

| Priority | Use Case |
|----------|----------|
| `low` | Background, non-urgent |
| `normal` | Standard messages |
| `high` | User questions, urgent |
| `critical` | System alerts, errors |

### Control Events

| Event | Entitlement | Purpose |
|-------|-------------|---------|
| `stream.pause` | `cap:messaging.interrupt` | Pause response |
| `stream.resume` | `cap:messaging.interrupt` | Resume response |
| `stream.preempt` | `cap:messaging.interrupt` | Interrupt with priority |
| `stream.cancel` | `cap:messaging.interrupt` | Abort response |
| `stream.priority` | `cap:messaging.interrupt` | Change priority |
| `stream.route` | `cap:messaging.route` | Redirect handler |
| `stream.handoff` | `cap:messaging.route` | Transfer to human/agent |

### Content Types

| Type | Use Case |
|------|----------|
| `text` | Plain text |
| `markdown` | Formatted responses |
| `json` | Structured data |
| `html` | Rich content |
| `event` | Control events |

---

*This document reflects the Messaging service architectural intent as of January 2026.*
