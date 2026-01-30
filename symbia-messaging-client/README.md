# @symbia/messaging-client - Messaging Service Client

Messaging service client providing REST API, WebSocket, and pub/sub for Symbia services. Dual-mode library for both synchronous operations and real-time messaging.

## Capabilities

| Capability | Description |
|------------|-------------|
| Dual-Mode | REST API for sync ops, WebSocket for real-time |
| Real-Time | Live message delivery via Socket.IO |
| Presence | User status tracking (online/away/busy/offline) |
| Typing Indicators | Real-time typing status |
| Control Events | Stream pause, resume, preempt, handoff |
| Message Priority | Low, normal, high, critical levels |
| Distributed Tracing | Run and trace ID propagation |

## Quick Start

### Installation

```bash
npm install @symbia/messaging-client
```

### REST Client

```typescript
import { createMessagingClient } from "@symbia/messaging-client";

const client = createMessagingClient({
  endpoint: "http://localhost:5005",
  token: process.env.MESSAGING_TOKEN,
});

// Create conversation
const conversation = await client.createConversation({
  type: "private",
  name: "Support Chat",
});

// Send message
await client.sendMessage({
  conversationId: conversation.id,
  content: "Hello!",
});

// Get messages
const messages = await client.getMessages(conversation.id, { limit: 50 });
```

### WebSocket Client

```typescript
import { createMessagingSocket } from "@symbia/messaging-client";

const socket = createMessagingSocket({
  endpoint: "http://localhost:5005",
  token: process.env.MESSAGING_TOKEN,
});

await socket.connect();
await socket.joinConversation("conversation-id");

// Listen for messages
socket.onMessage((message) => {
  console.log("New message:", message.content);
});

// Listen for typing
socket.onTypingStart((event) => {
  console.log(`${event.userId} is typing...`);
});

// Send message
await socket.sendMessage({
  conversationId: "conversation-id",
  content: "Hello from WebSocket!",
});
```

### Environment Variables

```bash
MESSAGING_ENDPOINT=http://localhost:5005
MESSAGING_SERVICE_TOKEN=your-jwt-token
MESSAGING_API_KEY=your-api-key
```

## Architecture

### Directory Structure

```
symbia-messaging-client/
├── src/
│   ├── index.ts          # Main exports
│   ├── types.ts          # TypeScript interfaces
│   ├── client.ts         # REST API client
│   └── socket.ts         # WebSocket client
├── dist/                 # Compiled JavaScript + types
└── package.json
```

### Package Exports

```typescript
// Full package
import { createMessagingClient, createMessagingSocket } from "@symbia/messaging-client";

// REST client only
import { MessagingClient } from "@symbia/messaging-client/client";

// WebSocket client only
import { MessagingSocket } from "@symbia/messaging-client/socket";

// Types only
import type { Message, Conversation } from "@symbia/messaging-client/types";
```

## API Reference

### REST Client Configuration

```typescript
interface MessagingClientConfig {
  endpoint?: string;              // Default: http://localhost:5005
  token?: string;                 // JWT Bearer token
  apiKey?: string;                // X-API-Key header
  onError?: (error: Error) => void;
}
```

### REST Client Methods

#### Conversation Management

```typescript
// Create conversation
const conv = await client.createConversation({
  type: "private",  // or "group"
  name: "Chat Name",
  description: "Optional description",
  metadata: { custom: "data" },
});

// Get conversation
const conv = await client.getConversation("conversation-id");

// List conversations
const conversations = await client.listConversations("org-id");

// Update conversation
await client.updateConversation("conversation-id", {
  name: "New Name",
  description: "Updated description",
});

// Delete conversation
await client.deleteConversation("conversation-id");
```

#### Participant Management

```typescript
// Add participant
await client.addParticipant("conversation-id", "user-id", "user");

// Remove participant
await client.removeParticipant("conversation-id", "user-id");

// Join conversation (authenticated user)
await client.joinConversation("conversation-id");

// Leave conversation
await client.leaveConversation("conversation-id");
```

#### Message Operations

```typescript
// Send message
const message = await client.sendMessage({
  conversationId: "conversation-id",
  content: "Message text",
  contentType: "text",  // Optional, default: "text"
  replyTo: "parent-message-id",  // Optional, for threading
  priority: "high",  // Optional: low, normal, high, critical
  interruptible: true,  // Optional, can be preempted
  runId: "run-123",  // Optional, for tracing
  traceId: "trace-456",  // Optional, for tracing
  metadata: { custom: "data" },
});

// Get messages with pagination
const messages = await client.getMessages("conversation-id", {
  limit: 50,
  before: new Date(),  // Messages before this time
  after: new Date(),   // Messages after this time
});

// Send control event
await client.sendControl("conversation-id", {
  event: "pause",  // pause, resume, preempt, route, handoff, cancel, priority
  target: "agent-id",
  reason: "User requested pause",
});
```

#### Request Options

All methods accept optional request options:

```typescript
interface RequestOptions {
  asUserId?: string;  // Impersonate user
  orgId?: string;     // Organization context
}

// Example
await client.sendMessage(params, { orgId: "org-123" });
```

### WebSocket Client Configuration

```typescript
interface SocketClientConfig extends MessagingClientConfig {
  autoConnect?: boolean;          // Default: true
  reconnection?: boolean;         // Default: true
  reconnectionAttempts?: number;  // Default: 5
  reconnectionDelay?: number;     // Default: 1000ms
}
```

### WebSocket Client Methods

#### Connection Management

```typescript
// Connect to server
await socket.connect();

// Check connection status
if (socket.connected) {
  console.log("Connected");
}

// Disconnect
socket.disconnect();

// Update token
socket.setToken("new-token");
```

#### Room Management

```typescript
// Join conversation room
const result = await socket.joinConversation("conversation-id");
if (result.success) {
  console.log("Joined conversation");
}

// Leave conversation room
await socket.leaveConversation("conversation-id");
```

#### Messaging

```typescript
// Send message
const result = await socket.sendMessage({
  conversationId: "conversation-id",
  content: "Hello!",
  priority: "normal",
});

// Edit message
await socket.editMessage("message-id", "Updated content");

// Delete message
await socket.deleteMessage("message-id");

// Send control event
await socket.sendControl("conversation-id", {
  event: "preempt",
  target: "agent-id",
  runId: "run-123",
});
```

#### Presence & Typing

```typescript
// Start typing indicator
socket.startTyping("conversation-id");

// Stop typing indicator
socket.stopTyping("conversation-id");

// Update presence status
socket.updatePresence("online");  // online, away, busy, offline
```

#### Event Handlers

All event handlers return an unsubscribe function:

```typescript
// Connection events
const unsubConnect = socket.onConnect(() => {
  console.log("Connected");
});

const unsubDisconnect = socket.onDisconnect((reason) => {
  console.log("Disconnected:", reason);
});

// Message events
const unsubMessage = socket.onMessage((message) => {
  console.log("New message:", message.content);
});

socket.onMessageUpdate((message) => {
  console.log("Message updated:", message.id);
});

socket.onMessageDelete(({ id, conversationId }) => {
  console.log("Message deleted:", id);
});

// Typing events
socket.onTypingStart((event) => {
  console.log(`${event.userId} is typing...`);
});

socket.onTypingStop((event) => {
  console.log(`${event.userId} stopped typing`);
});

// Presence events
socket.onPresence((event) => {
  console.log(`${event.userId} is ${event.status}`);
});

// Control events
socket.onControl("stream.pause", (event) => {
  console.log("Stream paused");
});

socket.onControl("*", (event) => {
  console.log("Control event:", event.event);
});

// Cleanup
unsubMessage();
unsubConnect();
```

## TypeScript Types

### Domain Types

```typescript
type ConversationType = "private" | "group";
type ParticipantRole = "owner" | "admin" | "member";
type UserType = "user" | "agent";
type MessagePriority = "low" | "normal" | "high" | "critical";
```

### Entity Interfaces

```typescript
interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  description?: string;
  org_id?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
  participants?: Participant[];
  created_at: string;
  updated_at: string;
}

interface Participant {
  conversation_id: string;
  user_id: string;
  user_type?: UserType;
  role: ParticipantRole;
  joined_at: string;
  last_read_at?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type?: UserType;
  content: string;
  content_type?: string;
  reply_to?: string;
  metadata?: Record<string, unknown>;
  run_id?: string;
  trace_id?: string;
  priority?: MessagePriority;
  interruptible?: boolean;
  preempted_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}
```

### Event Types

```typescript
interface TypingEvent {
  conversationId: string;
  userId: string;
  userType?: UserType;
}

interface PresenceEvent {
  userId: string;
  status: "online" | "away" | "busy" | "offline";
}

interface ControlEvent {
  event: string;
  conversationId: string;
  target?: string;
  reason?: string;
  preemptedBy?: string;
  runId?: string;
  traceId?: string;
  effectiveAt?: string;
}
```

### Parameter Types

```typescript
interface CreateConversationParams {
  type: ConversationType;
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  participants?: string[];
}

interface SendMessageParams {
  conversationId: string;
  content: string;
  contentType?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
  priority?: MessagePriority;
  interruptible?: boolean;
}

interface GetMessagesParams {
  limit?: number;
  before?: Date | string;
  after?: Date | string;
}

interface ControlEventParams {
  event: "pause" | "resume" | "preempt" | "route" | "handoff" | "cancel" | "priority";
  target?: string;
  reason?: string;
  runId?: string;
  traceId?: string;
}
```

## Socket.IO Events

### Client → Server

| Event | Description |
|-------|-------------|
| `join:conversation` | Join conversation room |
| `leave:conversation` | Leave conversation room |
| `message:send` | Send message |
| `message:edit` | Edit message |
| `message:delete` | Delete message |
| `control:send` | Send control event |
| `typing:start` | Start typing indicator |
| `typing:stop` | Stop typing indicator |
| `presence:update` | Update presence status |

### Server → Client

| Event | Description |
|-------|-------------|
| `message:new` | New message received |
| `message:updated` | Message edited |
| `message:deleted` | Message deleted |
| `typing:started` | User started typing |
| `typing:stopped` | User stopped typing |
| `presence:changed` | Presence status changed |
| `stream.pause` | Stream paused |
| `stream.resume` | Stream resumed |
| `stream.preempt` | Stream preempted |
| `stream.route` | Stream routed |
| `stream.handoff` | Stream handed off |
| `stream.cancel` | Stream canceled |
| `stream.priority` | Priority changed |

## Control Events

For managing AI response streams and message flow:

| Event | Description |
|-------|-------------|
| `pause` | Temporarily halt stream |
| `resume` | Resume halted stream |
| `preempt` | Interrupt with higher priority |
| `route` | Redirect to another handler |
| `handoff` | Transfer to another agent |
| `cancel` | Abort current stream |
| `priority` | Update message priority |

## Services Using This Package

| Service | Use Case |
|---------|----------|
| Messaging | Backend service (self-client) |
| Assistants | Agent messaging |
| Runtime | Workflow messaging |
| Server | API gateway integration |

## LLM Integration Guide

### Server-Side Messaging

```typescript
import { createMessagingClient } from "@symbia/messaging-client";

const client = createMessagingClient({
  token: process.env.SERVICE_TOKEN,
});

// Send AI response with streaming support
await client.sendMessage({
  conversationId: "conv-123",
  content: aiResponse,
  priority: "high",
  interruptible: true,  // Allow user interruption
  runId: "run-456",
  traceId: "trace-789",
});

// Handle user interruption
await client.sendControl("conv-123", {
  event: "preempt",
  target: "agent-id",
  reason: "User asked new question",
});
```

### Real-Time Client

```typescript
import { createMessagingSocket } from "@symbia/messaging-client";

const socket = createMessagingSocket({ token: userToken });
await socket.connect();

// Join conversation
await socket.joinConversation("conv-123");

// Listen for AI responses
socket.onMessage((message) => {
  if (message.sender_type === "agent") {
    displayAIResponse(message.content);
  }
});

// Handle stream control
socket.onControl("stream.pause", () => {
  showPausedIndicator();
});

socket.onControl("stream.resume", () => {
  hidePausedIndicator();
});

// User sends message
await socket.sendMessage({
  conversationId: "conv-123",
  content: userInput,
  priority: "high",
});

// Typing indicator
socket.startTyping("conv-123");
// ... user typing ...
socket.stopTyping("conv-123");
```

### Combined Pattern

```typescript
import {
  createMessagingClient,
  createMessagingSocket,
} from "@symbia/messaging-client";

// Server-side: REST for sending
const client = createMessagingClient({ token: serviceToken });

// Client-side: WebSocket for receiving
const socket = createMessagingSocket({ token: userToken });

await socket.connect();
await socket.joinConversation(conversationId);

// Server sends via REST
await client.sendMessage({
  conversationId,
  content: "Server message",
});

// Client receives via WebSocket
socket.onMessage((message) => {
  updateUI(message);
});
```

## Integration Checklist

- [ ] Install `@symbia/messaging-client`
- [ ] Configure endpoint and authentication
- [ ] Choose client type (REST, WebSocket, or both)
- [ ] Set up error handling with `onError` callback
- [ ] For real-time: call `connect()` and `joinConversation()`
- [ ] Register event handlers before joining rooms
- [ ] Use `sendControl()` for stream management
- [ ] Handle reconnection for WebSocket
- [ ] Call `disconnect()` on cleanup
- [ ] Propagate `runId` and `traceId` for distributed tracing
