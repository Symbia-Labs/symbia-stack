import { v4 as uuidv4 } from 'uuid';
import { emitEvent } from '@symbia/relay';
import { ParticipantModel } from './models/participant.js';
import { ConversationModel } from './models/conversation.js';
import { config } from './config.js';

export interface MessageForWebhook {
  id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  content_type?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

/**
 * Notify assistant participants about a new message via SDN.
 *
 * This emits an `assistant.message.new` event through the Network SDN mesh,
 * replacing the previous direct HTTP webhook calls. This enables:
 * - Full observability in Control Center Network panel
 * - Justification event protocol support
 * - Turn-taking coordination between assistants
 *
 * Events are traced via runId for correlation.
 */
export async function notifyAssistants(
  conversationId: string,
  message: MessageForWebhook,
  senderId: string,
  authToken?: string,
  runId?: string
): Promise<void> {
  console.log(`[SDN] ====== NOTIFY ASSISTANTS ======`);
  console.log(`[SDN] Conversation: ${conversationId}`);
  console.log(`[SDN] Sender: ${senderId}`);
  console.log(`[SDN] Message content: ${message.content?.substring(0, 100)}...`);

  const assistants = await ParticipantModel.getAssistantParticipants(conversationId);

  if (assistants.length === 0) {
    console.log(`[SDN] No assistant participants in conversation ${conversationId}`);
    return;
  }

  console.log(`[SDN] Found ${assistants.length} assistant participant(s): ${assistants.map(a => a.user_id).join(', ')}`);

  const conversation = await ConversationModel.getById(conversationId);

  // Generate a runId for this message flow if not provided
  const flowRunId = runId || `run_msg_${uuidv4()}`;

  console.log(`[SDN] Emitting message.new to ${assistants.length} assistant(s), runId: ${flowRunId}`);

  // Get entity IDs for all participants (for entity-based addressing)
  const senderEntityId = await ParticipantModel.getByEntityId(conversationId, senderId)
    .then(p => p?.entity_id)
    .catch(() => undefined);

  // Build list of recipient entity IDs
  const recipientEntityIds = await ParticipantModel.getEntityIdsForConversation(conversationId)
    .catch(() => []);

  // Emit a single message.new event (broadcast to all assistants in conversation)
  // Individual assistants will filter based on their rules
  const eventPayload = {
    conversationId,
    message: {
      id: message.id,
      sender_id: message.sender_id,
      sender_type: message.sender_type,
      content: message.content,
      content_type: message.content_type || 'text',
      metadata: message.metadata,
      created_at: message.created_at.toISOString(),
    },
    // Entity-based addressing
    senderEntityId: senderEntityId || senderId,
    recipientEntityIds,
    // Legacy: list of assistants for backward compatibility
    assistants: assistants
      .filter(a => a.user_id !== senderId)
      .map(a => ({
        userId: a.user_id,
        key: ParticipantModel.getAssistantKey(a.user_id),
        entityId: a.entity_id,
      })),
    orgId: conversation?.org_id,
    // Include auth token in metadata for downstream services
    _auth: authToken ? { token: authToken } : undefined,
  };

  // Try SDN first, fall back to HTTP if SDN not available
  const sdnResult = await emitEvent(
    'message.new',
    eventPayload,
    flowRunId,
    {
      // Broadcast to all assistants (contracts determine actual recipients)
      boundary: 'intra',
    }
  );

  if (sdnResult) {
    console.log(`[SDN] Event emitted successfully!`);
    console.log(`[SDN] Event ID: ${sdnResult.eventId}`);
    console.log(`[SDN] Trace status: ${sdnResult.trace.status}`);
    console.log(`[SDN] Trace path: ${JSON.stringify(sdnResult.trace.path)}`);
    if (sdnResult.trace.error) {
      console.log(`[SDN] Trace error: ${sdnResult.trace.error}`);
    }
    console.log(`[SDN] ====== END NOTIFY ASSISTANTS ======`);
    return;
  }

  // Fallback: Direct HTTP if SDN is not connected
  console.log(`[SDN] Network relay not available (null result), falling back to HTTP webhooks`);
  await notifyAssistantsViaHttp(assistants, conversationId, message, senderId, conversation?.org_id, authToken);
}

/**
 * Fallback: Notify assistants via direct HTTP webhooks.
 * Used when the Network SDN is not available.
 */
async function notifyAssistantsViaHttp(
  assistants: Array<{ user_id: string; entity_id?: string }>,
  conversationId: string,
  message: MessageForWebhook,
  senderId: string,
  orgId?: string,
  authToken?: string
): Promise<void> {
  for (const assistant of assistants) {
    // Don't notify the assistant that sent the message
    if (assistant.user_id === senderId) continue;

    const assistantKey = ParticipantModel.getAssistantKey(assistant.user_id);
    if (!assistantKey) {
      console.log(`[Webhook] No assistant key found for ${assistant.user_id}`);
      continue;
    }

    const webhookPayload = {
      conversationId,
      message: {
        id: message.id,
        sender_id: message.sender_id,
        sender_type: message.sender_type,
        content: message.content,
        content_type: message.content_type || 'text',
        metadata: message.metadata,
        created_at: message.created_at.toISOString(),
      },
      assistant: {
        userId: assistant.user_id,
        key: assistantKey,
        entityId: assistant.entity_id,
      },
      orgId,
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = authToken;
      }

      console.log(`[Webhook] Sending to ${config.assistantsWebhookUrl} for assistant ${assistantKey}`);

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.webhookTimeoutMs);

      try {
        const response = await fetch(config.assistantsWebhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error(
            `[Webhook] Failed to notify assistant ${assistantKey}: ${response.status} ${response.statusText}`
          );
        } else {
          const result = await response.json();
          console.log(`[Webhook] Notified assistant ${assistantKey}:`, result);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`[Webhook] Timeout after ${config.webhookTimeoutMs}ms for assistant ${assistantKey}`);
        } else {
          throw fetchError;
        }
      }
    } catch (err) {
      console.error(`[Webhook] Error notifying assistant ${assistantKey}:`, err);
    }
  }
}
