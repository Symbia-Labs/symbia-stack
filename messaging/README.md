# Symbia Messaging Service

The Messaging Service is a real-time messaging bus for users, agents, and services. It provides conversation management, message delivery, control events for stream management, and WebSocket support for bidirectional communication.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Database Schema](#database-schema)
- [Control Events](#control-events)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `messaging.conversation.create` | Create new conversations |
| `messaging.conversation.read` | Read conversation details |
| `messaging.message.send` | Send messages to conversations |
| `messaging.message.receive` | Receive messages in real-time |
| `messaging.control.send` | Send stream control events |

### Key Features

- **Dual Protocol:** REST API for CRUD + WebSocket for real-time
- **Conversation Types:** Private (1:1) and group conversations
- **Message Features:** Threading, priority levels, soft-delete, edit history
- **Control Events:** Stream pause/resume, preemption, routing, handoff
- **Participant Roles:** Owner, admin, member with role-based permissions
- **Typing Indicators:** Real-time typing status broadcasts
- **Presence Tracking:** Online/away/busy/offline status
- **Multi-Tenant:** Organization-scoped conversations

### Participant Types

| Type | Description |
|------|-------------|
| `user` | Human users authenticated via Identity Service |
| `agent` | AI agents (format: `assistant:key`) |
| `service` | Backend services |
| `bot` | Automated bots |

---

## Quick Start

### Environment Variables

```bash
# Required for production
DATABASE_URL=postgresql://user:pass@host:5432/messaging

# Optional
MESSAGING_USE_MEMORY_DB=true              # Use in-memory DB for testing
IDENTITY_SERVICE_URL=http://localhost:5001
ASSISTANTS_WEBHOOK_URL=http://localhost:5050/api/webhook/messaging
CORS_ALLOWED_ORIGINS=http://localhost:3000
PORT=5005
```

### Running the Service

```bash
# Development with in-memory DB
npm run dev

# Production
npm run build && npm run start

# Seed test data
npm run seed
```

### Default Port

The service runs on port **5005** by default.

---

## Architecture

### Directory Structure

```
messaging/
├── server/src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuration
│   ├── auth.ts               # Authentication middleware
│   ├── database.ts           # PostgreSQL/pg-mem setup
│   ├── socket.ts             # WebSocket handlers
│   ├── openapi.ts            # OpenAPI specification
│   ├── models/
│   │   ├── conversation.ts   # Conversation CRUD
│   │   ├── message.ts        # Message operations
│   │   └── participant.ts    # Participant management
│   └── routes/
│       ├── conversations.ts  # REST API routes
│       ├── auth.ts           # Auth proxy routes
│       └── admin.ts          # Admin endpoints
├── docs/
│   ├── openapi.json          # OpenAPI specification
│   ├── llms.txt              # Quick LLM reference
│   └── llms-full.txt         # Full LLM documentation
└── Dockerfile                # Production container
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 5.x
- **WebSocket:** Socket.IO 4.x
- **Database:** PostgreSQL (or pg-mem for testing)
- **Authentication:** JWT + API Keys via Identity Service

---

## Authentication

### Authentication Methods (Priority Order)

| Method | Header/Token | Description |
|--------|--------------|-------------|
| Bearer Token | `Authorization: Bearer <jwt>` | JWT from Identity Service |
| API Key | `X-API-Key: <key>` | Service-to-service auth |
| Session Cookie | `token` or `symbia_session` | Browser session |

### Auth User Object

```typescript
{
  id: string,
  email?: string,
  name?: string,
  type: 'user' | 'agent',
  agentId?: string,           // For agents: "assistant:key"
  orgId?: string,
  organizations: [{
    id: string,
    name: string,
    slug: string,
    role: 'admin' | 'member' | 'viewer'
  }],
  entitlements: string[],
  roles: string[],
  isSuperAdmin: boolean
}
```

### Authorization Levels

| Level | Criteria |
|-------|----------|
| Participant | User is a member of the conversation |
| Admin (conversation) | User has `owner` or `admin` role in conversation |
| Admin (system) | `isSuperAdmin` OR has `admin` role OR has `messaging:admin` entitlement |

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/config` | No | Get Identity Service URLs |
| GET | `/api/auth/me` | Yes | Get current user |
| POST | `/api/auth/login` | No | Proxy to Identity Service |
| POST | `/api/auth/logout` | No | Proxy to Identity Service |
| GET | `/api/auth/session` | No | Check session status |

### Conversation Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/conversations` | Yes | List user's conversations |
| POST | `/api/conversations` | Yes | Create conversation |
| GET | `/api/conversations/:id` | Yes | Get conversation |
| PATCH | `/api/conversations/:id` | Yes | Update conversation |
| DELETE | `/api/conversations/:id` | Yes | Delete conversation |
| POST | `/api/conversations/:id/join` | Yes | Join group conversation |
| POST | `/api/conversations/:id/leave` | Yes | Leave conversation |

**Create Conversation:**
```json
{
  "type": "private" | "group",
  "name": "Project Discussion",
  "description": "Optional description",
  "orgId": "org-uuid",
  "participantIds": ["user-1", "assistant:helper"],
  "metadata": {}
}
```

### Participant Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/conversations/:id/participants` | Yes | Add participant |
| DELETE | `/api/conversations/:id/participants/:userId` | Yes | Remove participant |

**Add Participant:**
```json
{
  "userId": "user-uuid",
  "userType": "user" | "agent",
  "role": "member" | "admin"
}
```

### Message Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/conversations/:id/messages` | Yes | List messages |
| POST | `/api/conversations/:id/messages` | Yes | Send message |

**Query Parameters for GET:**
- `limit` - Number of messages (default: 50)
- `before` - Messages before this ID
- `after` - Messages after this ID

**Send Message:**
```json
{
  "content": "Hello, world!",
  "contentType": "text" | "markdown" | "json" | "html",
  "replyTo": "message-uuid",
  "metadata": {},
  "priority": "low" | "normal" | "high" | "critical",
  "runId": "graph-execution-uuid",
  "traceId": "trace-id"
}
```

### Control Events Endpoint

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/conversations/:id/control` | Yes | Send control event |

**Send Control Event:**
```json
{
  "event": "stream.pause" | "stream.resume" | "stream.preempt" | "stream.route" | "stream.handoff" | "stream.cancel" | "stream.priority",
  "target": "target-user-id",
  "reason": "User requested pause",
  "metadata": {},
  "runId": "uuid",
  "traceId": "trace-id"
}
```

### Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/conversations` | Admin | List all conversations |
| GET | `/api/admin/conversations/:id` | Admin | Get conversation details |
| DELETE | `/api/admin/conversations/:id` | Admin | Delete conversation |
| GET | `/api/admin/users/:userId/conversations` | Admin | List user's conversations |
| POST | `/api/admin/conversations/:id/participants` | Admin | Add participant |
| DELETE | `/api/admin/conversations/:id/participants/:userId` | Admin | Remove participant |
| GET | `/api/admin/stats` | Admin | Get messaging statistics |

### Health & Discovery

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/bootstrap/service` | No | Service discovery |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/docs/openapi.json` | OpenAPI specification |
| GET | `/docs/llms.txt` | Quick LLM reference |
| GET | `/docs/llms-full.txt` | Full LLM documentation |

---

## WebSocket Events

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:5005', {
  auth: {
    token: 'jwt_token'        // or apiKey: 'api_key'
  }
});
```

### Client Events (Send to Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `join:conversation` | `conversationId` | Join conversation room |
| `leave:conversation` | `conversationId` | Leave conversation room |
| `message:send` | `{conversationId, content, contentType?, ...}` | Send message |
| `message:edit` | `{messageId, content}` | Edit message |
| `message:delete` | `messageId` | Delete message |
| `control:send` | `{conversationId, event, target?, reason?, ...}` | Send control event |
| `typing:start` | `conversationId` | Start typing indicator |
| `typing:stop` | `conversationId` | Stop typing indicator |
| `presence:update` | `status` | Update presence status |
| `watch:conversation` | `conversationId` | Agent observation mode |
| `unwatch:conversation` | `conversationId` | Stop watching |

### Server Events (Receive from Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | Message object | New message received |
| `message:updated` | `{id, content, updated_at}` | Message edited |
| `message:deleted` | `{id, conversationId}` | Message deleted |
| `typing:started` | `{conversationId, userId, userType}` | User typing |
| `typing:stopped` | `{conversationId, userId}` | User stopped typing |
| `presence:changed` | `{userId, userType, status}` | Presence changed |
| `participant:online` | `{conversationId, userId, userType}` | User online |
| `participant:offline` | `{conversationId, userId, userType}` | User offline |
| `stream.pause` | Control event | Stream paused |
| `stream.resume` | Control event | Stream resumed |
| `stream.preempt` | Control event | Stream preempted |
| `stream.route` | Control event | Stream routed |
| `stream.handoff` | Control event | Stream handed off |
| `stream.cancel` | Control event | Stream cancelled |

### Message Send Example

```javascript
socket.emit('message:send', {
  conversationId: 'conv-uuid',
  content: 'Hello!',
  contentType: 'text',
  priority: 'normal'
}, (response) => {
  if (response.success) {
    console.log('Message sent:', response.message);
  } else {
    console.error('Error:', response.error);
  }
});
```

---

## Database Schema

### conversations
```sql
id: UUID (PK)
type: VARCHAR(20)             -- 'private' | 'group'
name: VARCHAR(255)
description: TEXT
org_id: VARCHAR(255)
created_by: VARCHAR(255) NOT NULL
created_at: TIMESTAMP
updated_at: TIMESTAMP
metadata: JSONB
```

### participants
```sql
id: UUID (PK)
conversation_id: UUID (FK conversations)
user_id: VARCHAR(255) NOT NULL
user_type: VARCHAR(20)        -- 'user' | 'agent'
role: VARCHAR(20)             -- 'owner' | 'admin' | 'member'
joined_at: TIMESTAMP
last_read_at: TIMESTAMP
UNIQUE(conversation_id, user_id)
```

### messages
```sql
id: UUID (PK)
conversation_id: UUID (FK conversations)
sender_id: VARCHAR(255) NOT NULL
sender_type: VARCHAR(20)      -- 'user' | 'agent' | 'service' | 'bot'
content: TEXT NOT NULL
content_type: VARCHAR(50)     -- 'text' | 'markdown' | 'json' | 'html' | 'event'
reply_to: UUID (FK messages)
org_id: VARCHAR(255)
run_id: UUID                  -- Collaborate graph execution ID
trace_id: VARCHAR(255)        -- Distributed tracing
sequence: BIGINT              -- Ordered delivery
priority: VARCHAR(20)         -- 'low' | 'normal' | 'high' | 'critical'
interruptible: BOOLEAN
preempted_by: UUID
created_at: TIMESTAMP
updated_at: TIMESTAMP
deleted_at: TIMESTAMP         -- Soft delete
metadata: JSONB
```

---

## Control Events

Control events manage stream behavior for AI agent interactions.

### Event Types

| Event | Entitlement Required | Description |
|-------|---------------------|-------------|
| `stream.pause` | `cap:messaging.interrupt` | Pause incoming messages |
| `stream.resume` | `cap:messaging.interrupt` | Resume paused stream |
| `stream.preempt` | `cap:messaging.interrupt` | High-priority interrupt |
| `stream.cancel` | `cap:messaging.interrupt` | Cancel active stream |
| `stream.priority` | `cap:messaging.interrupt` | Change message priority |
| `stream.route` | `cap:messaging.route` | Route to different handler |
| `stream.handoff` | `cap:messaging.route` | Human/agent handoff |

### Control Event Structure

```json
{
  "event": "stream.pause",
  "conversationId": "conv-uuid",
  "target": "agent-user-id",
  "reason": "User requested pause",
  "effectiveAt": "2024-01-15T10:30:00Z",
  "metadata": {}
}
```

### Stored as Message

Control events are stored as messages with:
- `content_type = 'event'`
- `priority = 'high'`
- `interruptible = false`
- Full payload in `metadata.control`

---

## Assistant Notification

When a message is sent to a conversation with assistant participants, the Messaging Service notifies them through the SDN (Software-Defined Network) mesh.

### Notification Flow

1. **SDN Preferred:** Emits `message.new` event through `@symbia/relay`
   - Full observability in Control Center Network panel
   - Supports justification event protocol
   - Enables turn-taking coordination

2. **HTTP Fallback:** If SDN unavailable, POSTs to `ASSISTANTS_WEBHOOK_URL`

### Event Payload (SDN)

```json
{
  "conversationId": "conv-uuid",
  "message": {
    "id": "msg-uuid",
    "sender_id": "user:123",
    "sender_type": "user",
    "content": "Hello assistant!",
    "content_type": "text",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "assistants": [
    {"userId": "assistant:helper", "key": "helper", "entityId": "ent_uuid"}
  ],
  "orgId": "org-uuid",
  "senderEntityId": "ent_sender",
  "recipientEntityIds": ["ent_1", "ent_2"]
}
```

### Webhook Payload (Fallback)

```json
{
  "conversationId": "conv-uuid",
  "message": {...},
  "assistant": {"userId": "assistant:helper", "key": "helper", "entityId": "ent_uuid"},
  "orgId": "org-uuid"
}
```

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (production) |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5005` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `MESSAGING_USE_MEMORY_DB` | `false` | Force in-memory DB |
| `IDENTITY_SERVICE_URL` | `https://identity.example.com` | Identity service |
| `ASSISTANTS_WEBHOOK_URL` | `http://localhost:5050/api/webhook/messaging` | Agent notification webhook |
| `CORS_ALLOWED_ORIGINS` | `*` | Comma-separated origins |
| `SERVICE_ID` | `symbia-messaging-service` | Service identifier |
| `SERVICE_NAME` | `Symbia Messaging` | Display name |

### Standard Headers

| Header | Description |
|--------|-------------|
| `X-Org-Id` | Organization scope |
| `X-Service-Id` | Caller service ID |
| `X-Env` | Environment (dev/stage/prod) |
| `X-Data-Class` | Data sensitivity level |

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Messaging Service.

### Common Workflows

#### 1. Create a Conversation and Send Messages

```bash
# Create conversation
POST /api/conversations
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "group",
  "name": "Project Alpha Discussion",
  "description": "Team discussion for Project Alpha",
  "orgId": "org-uuid",
  "participantIds": ["user-1", "user-2", "assistant:helper"]
}

# Response
{
  "id": "conv-uuid",
  "type": "group",
  "name": "Project Alpha Discussion",
  "participants": [
    {"userId": "creator-id", "role": "owner", "userType": "user"},
    {"userId": "user-1", "role": "member", "userType": "user"},
    {"userId": "user-2", "role": "member", "userType": "user"},
    {"userId": "assistant:helper", "role": "member", "userType": "agent"}
  ]
}

# Send message
POST /api/conversations/conv-uuid/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello team! Let's discuss the project requirements.",
  "contentType": "text"
}

# Response
{
  "id": "msg-uuid",
  "conversation_id": "conv-uuid",
  "sender_id": "user-id",
  "sender_type": "user",
  "content": "Hello team! Let's discuss the project requirements.",
  "sequence": 1,
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### 2. Send Message as Agent

```bash
POST /api/conversations/conv-uuid/messages
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "content": "I've analyzed the requirements. Here are my suggestions:\n\n1. **Authentication**: Use OAuth 2.0\n2. **Database**: PostgreSQL recommended\n3. **Caching**: Redis for sessions",
  "contentType": "markdown",
  "metadata": {
    "model": "gpt-4",
    "confidence": 0.95
  }
}
```

#### 3. Reply to a Message (Threading)

```bash
POST /api/conversations/conv-uuid/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Good suggestion! Can you elaborate on the OAuth setup?",
  "replyTo": "previous-msg-uuid"
}
```

#### 4. Send Control Event (Pause Agent)

```bash
POST /api/conversations/conv-uuid/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "event": "stream.pause",
  "target": "assistant:helper",
  "reason": "User needs time to review suggestions"
}

# Response
{
  "success": true,
  "control": {
    "event": "stream.pause",
    "conversationId": "conv-uuid",
    "target": "assistant:helper",
    "reason": "User needs time to review suggestions",
    "effectiveAt": "2024-01-15T10:35:00Z"
  }
}
```

#### 5. Handoff to Human Agent

```bash
POST /api/conversations/conv-uuid/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "event": "stream.handoff",
  "target": "support-agent-id",
  "reason": "Customer requested human support",
  "metadata": {
    "priority": "high",
    "category": "billing"
  }
}
```

#### 6. List Messages with Pagination

```bash
# Get latest 20 messages
GET /api/conversations/conv-uuid/messages?limit=20
Authorization: Bearer <token>

# Get messages before a specific message
GET /api/conversations/conv-uuid/messages?limit=20&before=msg-uuid

# Get messages after a specific message (newer)
GET /api/conversations/conv-uuid/messages?limit=20&after=msg-uuid
```

#### 7. WebSocket Real-Time Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:5005', {
  auth: { token: 'jwt_token' }
});

// Join conversation
socket.emit('join:conversation', 'conv-uuid', (response) => {
  console.log('Joined:', response);
});

// Listen for new messages
socket.on('message:new', (message) => {
  console.log('New message:', message.content);
});

// Listen for control events
socket.on('stream.pause', (event) => {
  console.log('Stream paused:', event.reason);
});

// Send message via WebSocket
socket.emit('message:send', {
  conversationId: 'conv-uuid',
  content: 'Hello via WebSocket!',
  contentType: 'text'
}, (response) => {
  if (response.success) {
    console.log('Sent:', response.message.id);
  }
});

// Typing indicator
socket.emit('typing:start', 'conv-uuid');
setTimeout(() => socket.emit('typing:stop', 'conv-uuid'), 3000);
```

#### 8. Add Agent to Existing Conversation

```bash
POST /api/conversations/conv-uuid/participants
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "assistant:analyst",
  "userType": "agent",
  "role": "member"
}
```

### Request/Response Patterns

#### Standard Success Response
```json
{
  "id": "uuid",
  "name": "...",
  ...
}
```

#### List Response
```json
{
  "conversations": [...],
  "total": 42
}
```

#### Error Response
```json
{
  "error": "Error description"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden (not participant or missing entitlement) |
| 404 | Not Found |
| 500 | Internal Server Error |

### Validation Rules

| Field | Rule |
|-------|------|
| `type` | One of: `private`, `group` |
| `role` | One of: `owner`, `admin`, `member` |
| `userType` | One of: `user`, `agent`, `service`, `bot` |
| `contentType` | One of: `text`, `markdown`, `json`, `html` |
| `priority` | One of: `low`, `normal`, `high`, `critical` |
| `event` | One of: `stream.pause`, `stream.resume`, `stream.preempt`, `stream.route`, `stream.handoff`, `stream.cancel`, `stream.priority` |

### Entitlements for Control Events

| Entitlement | Allows |
|-------------|--------|
| `cap:messaging.interrupt` | pause, resume, preempt, cancel, priority |
| `cap:messaging.route` | route, handoff |
| `cap:messaging.observe` | Watch conversations without participating |

### Agent Webhook Notifications

When a non-agent sends a message to a conversation with agent participants:

```json
POST ${ASSISTANTS_WEBHOOK_URL}
Content-Type: application/json

{
  "conversationId": "conv-uuid",
  "message": {
    "id": "msg-uuid",
    "content": "User's message",
    "sender_id": "user-id",
    ...
  },
  "assistant": {
    "userId": "assistant:helper",
    "key": "helper"
  },
  "orgId": "org-uuid"
}
```

### Best Practices for LLMs

1. **Use appropriate content types** - `markdown` for formatted responses
2. **Include metadata** - Add model info, confidence scores, sources
3. **Handle control events** - Respond to pause/resume appropriately
4. **Use threading** - Reply to specific messages with `replyTo`
5. **Track with traceId** - Include trace IDs for debugging
6. **Use WebSocket for real-time** - More efficient than polling
7. **Respect permissions** - Check participant status before sending
8. **Handle handoffs gracefully** - Acknowledge when handed off
9. **Use priority levels** - Mark urgent messages as `high` or `critical`
10. **Sequence for ordering** - Messages have sequence numbers for replay

### Integration Checklist

- [ ] Authenticate via Identity Service (JWT or API key)
- [ ] Join conversations before sending messages
- [ ] Handle WebSocket reconnection gracefully
- [ ] Implement typing indicators for better UX
- [ ] Listen for control events (pause/resume)
- [ ] Handle stream.handoff events
- [ ] Track messages with runId/traceId for debugging
- [ ] Implement presence updates
- [ ] Handle message soft-deletes (deleted_at)
- [ ] Support threaded replies

---

## Additional Resources

- **OpenAPI Spec:** `/docs/openapi.json`
- **Quick Reference:** `/docs/llms.txt`
- **Full Documentation:** `/docs/llms-full.txt`
- **Health Check:** `/health`
- **Service Discovery:** `/api/bootstrap/service`

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
