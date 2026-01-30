# Symbia Channels

Multi-platform messaging channels for the Symbia Integrations service. Channels bridge external messaging platforms (Telegram, WhatsApp, Discord, etc.) with the Symbia SDN event system.

## Architecture

```
External Platform          Integrations Service              Symbia SDN
┌─────────────────┐       ┌─────────────────────┐       ┌─────────────────┐
│   Telegram      │──────►│  Webhook Handler    │──────►│ channel.message │
│   WhatsApp      │       │                     │       │    .inbound     │
│   Discord       │       │  Channel Provider   │       └────────┬────────┘
│   Slack         │       │    (normalize)      │                │
│   Signal        │       └─────────────────────┘                │
└─────────────────┘                                              ▼
                                                         ┌─────────────────┐
        ▲                 ┌─────────────────────┐       │   Messaging     │
        │                 │  Event Handler      │◄──────│   Assistants    │
        │                 │                     │       │   Rules Engine  │
        └─────────────────│  Channel Provider   │       └─────────────────┘
                          │    (send)           │              │
                          └─────────────────────┘              │
                                   ▲                           │
                                   │      channel.message      │
                                   └───────.outbound───────────┘
```

## Supported Channels

| Channel | Connection Mode | Status |
|---------|-----------------|--------|
| Telegram | `webhook` | Implemented |
| WhatsApp | `qr-link` | Planned |
| Discord | `webhook` | Planned |
| Slack | `oauth` | Planned |
| Signal | `qr-link` | Planned |
| Google Chat | `oauth` | Planned |
| iMessage | `local` | Planned |

## API Endpoints

### Channel Information

```
GET /api/integrations/channels
```
List all available channel types and their capabilities.

```
GET /api/integrations/channels/:channelType
```
Get details for a specific channel type (capabilities, formatting constraints, etc.)

### Connection Management

```
GET /api/integrations/channels/:channelType/connections
```
List all connections for the authenticated user's organization.

```
POST /api/integrations/channels/:channelType/connect
```
Create a new channel connection.

**Request Body:**
```json
{
  "config": {
    "webhookBaseUrl": "https://your-domain.com",
    "dropPendingUpdates": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "connectionId": "uuid",
  "status": "connected",
  "webhookUrl": "https://api.example.com/api/integrations/channels/telegram/webhook/uuid",
  "channelAccountId": "123456789",
  "channelAccountName": "MyBot"
}
```

```
GET /api/integrations/channels/:channelType/connections/:connectionId/status
```
Check the current status of a connection.

```
POST /api/integrations/channels/:channelType/connections/:connectionId/disconnect
```
Disconnect a channel (removes webhook, etc.)

```
DELETE /api/integrations/channels/:channelType/connections/:connectionId
```
Delete a connection record entirely.

### Sending Messages

```
POST /api/integrations/channels/:channelType/connections/:connectionId/send
```
Send a message through a channel (for testing/direct send).

**Request Body:**
```json
{
  "chatId": "123456789",
  "text": "Hello from Symbia!",
  "replyToMessageId": "optional-message-id",
  "formatting": {
    "parseMode": "markdown",
    "disablePreview": false,
    "silent": false
  }
}
```

### Webhooks

```
POST /api/integrations/channels/:channelType/webhook/:connectionId
```
Receive webhook callbacks from external platforms (no auth - verified by provider).

```
GET /api/integrations/channels/:channelType/webhook/:connectionId
```
Handle webhook verification (some platforms use GET for verification challenges).

## SDN Events

### Inbound Events (Emitted by Channels)

#### `channel.message.inbound`
Emitted when a message is received from an external platform.

```typescript
{
  id: string;              // Platform message ID
  channelType: string;     // "telegram", "whatsapp", etc.
  connectionId: string;    // Reference to channelConnections.id
  contentType: string;     // "text", "image", "audio", etc.
  text?: string;
  attachments?: Array<{
    type: string;
    url?: string;
    mimeType?: string;
    filename?: string;
  }>;
  sender: {
    id: string;
    name?: string;
    username?: string;
    isBot?: boolean;
  };
  chat: {
    id: string;
    type: "private" | "group" | "channel" | "thread";
    name?: string;
  };
  replyToMessageId?: string;
  timestamp: string;       // ISO datetime
  raw?: object;            // Platform-specific raw data
}
```

#### `channel.status.changed`
Emitted when a connection's status changes.

```typescript
{
  connectionId: string;
  channelType: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
  error?: string;
  timestamp: string;
}
```

### Outbound Events (Consumed by Channels)

#### `channel.message.outbound`
Subscribe to this event to send messages through channels.

```typescript
{
  channelType: string;
  connectionId: string;
  chatId: string;
  contentType: string;     // Default: "text"
  text?: string;
  attachments?: Array<...>;
  replyToMessageId?: string;
  formatting?: {
    parseMode?: "plain" | "markdown" | "html";
    disablePreview?: boolean;
    silent?: boolean;
  };
  conversationId?: string; // Symbia conversation ID (for correlation)
  assistantId?: string;    // Symbia assistant ID (for correlation)
  requestId?: string;      // For request/response tracking
}
```

#### `channel.message.delivery`
Emitted by channels after attempting to deliver a message.

```typescript
{
  connectionId: string;
  channelType: string;
  chatId: string;
  status: "delivered" | "failed" | "pending";
  messageId?: string;      // Platform message ID if delivered
  error?: string;          // Error message if failed
  timestamp: string;
  durationMs?: number;
}
```

## Database Schema

### `channel_connections` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | varchar | Primary key (UUID) |
| `integration_id` | varchar | Parent integration reference |
| `user_id` | varchar | Owner user ID |
| `org_id` | varchar | Organization ID |
| `channel_type` | varchar | Channel type (telegram, whatsapp, etc.) |
| `channel_account_id` | varchar | Platform-specific account ID |
| `channel_account_name` | varchar | Display name |
| `credential_id` | varchar | Reference to Identity credentials |
| `status` | varchar | Connection status |
| `session_data` | json | Session state for reconnection |
| `qr_code` | text | QR code data (for QR-link mode) |
| `qr_expires_at` | timestamp | QR code expiration |
| `webhook_url` | text | Configured webhook URL |
| `webhook_secret` | text | Webhook verification secret |
| `webhook_verified` | boolean | Whether webhook is verified |
| `last_ping_at` | timestamp | Last health check |
| `last_message_at` | timestamp | Last message sent/received |
| `last_error` | text | Last error message |
| `error_count` | integer | Total error count |
| `consecutive_errors` | integer | Consecutive error count |
| `messages_received` | integer | Total messages received |
| `messages_sent` | integer | Total messages sent |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |
| `connected_at` | timestamp | When connection was established |
| `disconnected_at` | timestamp | When connection was terminated |

## Credentials

Channel credentials are stored in the Identity service using the existing `userCredentials` table:

| Channel | Provider String | Credential Format |
|---------|-----------------|-------------------|
| Telegram | `telegram` | Bot token (from @BotFather) |
| WhatsApp | `whatsapp` | Session encrypted blob |
| Discord | `discord` | Bot token |
| Slack | `slack_oauth` | OAuth tokens JSON |
| Google Chat | `googlechat` | Service account JSON |
| Signal | `signal` | Linked device credentials |

## Adding a New Channel Provider

1. Create provider file in `integrations/server/src/channels/providers/`
2. Implement the `ChannelProvider` interface:

```typescript
import type { ChannelProvider } from "./types.js";

export class MyChannelProvider implements ChannelProvider {
  readonly type = "mychannel";
  readonly name = "My Channel";
  readonly connectionMode = "webhook";
  readonly capabilities = { /* ... */ };
  readonly formatting = { /* ... */ };

  async initConnection(ctx, credential, config) { /* ... */ }
  async getStatus(ctx, sessionData) { /* ... */ }
  async disconnect(ctx, sessionData) { /* ... */ }
  async sendMessage(ctx, message, credential, sessionData) { /* ... */ }
  verifyWebhook(headers, body, secret) { /* ... */ }
  parseWebhook(headers, body) { /* ... */ }
  formatMessage(text, options) { /* ... */ }
  getDefaultConfig() { /* ... */ }
}

export const myChannelProvider = new MyChannelProvider();
```

3. Register in `integrations/server/src/channels/providers/index.ts`:

```typescript
import { myChannelProvider } from "./mychannel.js";

export function initializeChannelProviders() {
  channelProviders.register(telegramProvider);
  channelProviders.register(myChannelProvider); // Add here
}
```

4. Add channel type to schema enum in `integrations/shared/schema.ts`:

```typescript
export const channelTypeSchema = z.enum([
  "telegram",
  "whatsapp",
  // ...
  "mychannel", // Add here
]);
```

## Example: Telegram Setup

1. Create a bot with @BotFather on Telegram
2. Store the bot token as a credential in Identity:
   - Provider: `telegram`
   - Credential: The bot token from BotFather
3. Connect the channel:

```bash
curl -X POST https://api.example.com/api/integrations/channels/telegram/connect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

4. The webhook is automatically configured with Telegram
5. Messages sent to your bot will emit `channel.message.inbound` events
6. Send `channel.message.outbound` events to reply

## Programmatic API

For direct use without SDN events:

```typescript
import { sendChannelMessage } from "./channels/index.js";

const result = await sendChannelMessage({
  channelType: "telegram",
  connectionId: "your-connection-id",
  chatId: "telegram-chat-id",
  contentType: "text",
  text: "Hello!",
  formatting: {
    parseMode: "markdown",
  },
});

if (result.success) {
  console.log("Sent:", result.messageId);
} else {
  console.error("Failed:", result.error);
}
```

## Channel Bridge

The Channel Bridge automatically routes messages between external messaging platforms and Symbia conversations.

### Architecture Flow

```
Telegram User                  Integrations                    Messaging                  Assistants
     │                              │                              │                           │
     │ Send message                 │                              │                           │
     ├──────────────────────────────►                              │                           │
     │                              │                              │                           │
     │                    Webhook receives message                 │                           │
     │                    Emits: channel.message.inbound           │                           │
     │                              │                              │                           │
     │                    Bridge picks up event                    │                           │
     │                    Finds/creates conversation               │                           │
     │                              ├──────────────────────────────►                           │
     │                              │         POST message         │                           │
     │                              │                              │                           │
     │                              │                              │ Emits: message.new        │
     │                              │                              ├──────────────────────────►│
     │                              │                              │                           │
     │                              │                              │ Assistant processes       │
     │                              │                              │◄──────────────────────────┤
     │                              │                              │  Emits: message.response  │
     │                              │                              │                           │
     │                              │       Bridge picks up        │                           │
     │                              │◄─────────────────────────────┤                           │
     │                              │   (message.new from agent)   │                           │
     │                              │                              │                           │
     │                    Checks conversation metadata             │                           │
     │                    Emits: channel.message.outbound          │                           │
     │                              │                              │                           │
     │                    Event handler sends via provider         │                           │
     │◄─────────────────────────────┤                              │                           │
     │        Telegram reply        │                              │                           │
```

### Conversation Metadata

When a conversation is created for a channel chat, it includes metadata linking it back:

```json
{
  "metadata": {
    "channel": {
      "type": "telegram",
      "connectionId": "conn_abc123",
      "chatId": "123456789",
      "chatType": "private",
      "chatName": "John Doe"
    },
    "channelSender": {
      "id": "user123",
      "name": "John Doe",
      "username": "johndoe"
    }
  }
}
```

### Internal API

The Messaging service exposes an internal endpoint for channel lookups:

```
GET /api/internal/conversations/by-channel?channelType=telegram&connectionId=xxx&chatId=yyy
```

Headers: `X-Service-Id: integrations`

Response:
```json
{
  "conversationId": "conv_uuid",
  "conversation": { ... }
}
```

## End-to-End Testing

### Prerequisites

1. **Start the required services:**
   ```bash
   # Terminal 1: Identity Service
   cd identity && npm run dev

   # Terminal 2: Messaging Service
   cd messaging && npm run dev

   # Terminal 3: Network Service (SDN)
   cd network && npm run dev

   # Terminal 4: Integrations Service
   cd integrations && npm run dev
   ```

2. **Create a Telegram bot:**
   - Message @BotFather on Telegram
   - Use `/newbot` to create a bot
   - Save the bot token

### Test Flow

#### 1. Store Credentials

First, store the Telegram bot token in Identity:

```bash
# Get an auth token (login to Identity first)
TOKEN="your-jwt-token"

# Store the credential
curl -X POST http://localhost:3001/api/credentials \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "telegram",
    "credentials": {
      "botToken": "your-bot-token-from-botfather"
    }
  }'
```

Note the returned `credentialId`.

#### 2. Connect the Channel

```bash
curl -X POST http://localhost:3003/api/integrations/channels/telegram/connect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentialId": "your-credential-id"
  }'
```

Expected response:
```json
{
  "success": true,
  "connectionId": "conn_xxx",
  "status": "connected",
  "webhookUrl": "http://localhost:3003/api/integrations/channels/telegram/webhook/conn_xxx",
  "channelAccountId": "123456789",
  "channelAccountName": "YourBotName"
}
```

#### 3. Configure Webhook (for local testing)

For local development, use ngrok or similar to expose your webhook:

```bash
ngrok http 3003
```

Then update the webhook URL with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://your-ngrok-url.ngrok.io/api/integrations/channels/telegram/webhook/conn_xxx"
```

#### 4. Send a Test Message

Open Telegram and send a message to your bot. You should see:

1. **In Integrations logs:**
   ```
   [channels] Telegram webhook received
   [channels] Emitted channel.message.inbound event
   [bridge] Inbound message received
   [bridge] Created new conversation: conv_xxx
   [bridge] Posted message to conversation conv_xxx
   ```

2. **In Messaging logs:**
   ```
   New message in conversation conv_xxx
   Emitting message.new event
   ```

#### 5. Test Assistant Response

Add an assistant to the conversation and have it respond. When the assistant sends a message, you should see:

1. **In Integrations logs:**
   ```
   [bridge] Assistant message in conversation conv_xxx
   [bridge] Conversation is channel-linked
   [bridge] Emitted channel.message.outbound for telegram
   [channels] Message sent successfully
   ```

2. **In Telegram:** The bot replies with the assistant's message.

### Manual Testing with curl

You can also test the outbound flow directly:

```bash
# Send a test message through the channel
curl -X POST http://localhost:3003/api/integrations/channels/telegram/connections/conn_xxx/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "your-telegram-chat-id",
    "text": "Hello from Symbia!",
    "formatting": {
      "parseMode": "markdown"
    }
  }'
```

### Debugging

Enable verbose logging by setting:

```bash
DEBUG=symbia:* npm run dev
```

Check SDN event flow:

```bash
# Watch SDN events (requires network service CLI)
symbia network watch --event "channel.*"
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook not receiving | URL not configured | Check `setWebhook` was called, use ngrok for local dev |
| "Connection not found" | Invalid connectionId | Verify connection exists in database |
| "No credentials available" | Credential lookup failed | Check credentialId is stored correctly |
| Messages not routing | SDN not connected | Ensure network service is running |
| Assistant not responding | Not subscribed | Ensure assistant is subscribed to `message.new` |
