import { getAgentToken } from '@symbia/id';
import { createMessagingClient } from '@symbia/messaging-client';

async function test() {
  const assistantUserId = 'assistant:onboarding';
  const conversationId = 'a50e8400-e29b-41d4-a716-446655440000';
  
  console.log('[Test] Step 1: Get agent token...');
  const agentToken = await getAgentToken(assistantUserId);
  console.log('[Test] Got token:', agentToken.substring(0, 50) + '...');
  
  console.log('[Test] Step 2: Create messaging client...');
  const client = createMessagingClient({ token: agentToken });
  console.log('[Test] Client endpoint:', (client as any).endpoint);
  
  console.log('[Test] Step 3: Send message...');
  try {
    const result = await client.sendMessage({
      conversationId,
      content: 'Test message from webhook simulation!',
      contentType: 'text',
    });
    console.log('[Test] SUCCESS! Message sent:', result);
  } catch (error: any) {
    console.error('[Test] FAILED to send message:', error.message);
    console.error('[Test] Error details:', error);
  }
  
  process.exit(0);
}

test();
