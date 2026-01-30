import { getAgentToken } from '@symbia/id';

async function test() {
  console.log('[Test] Testing getAgentToken...');
  try {
    const token = await getAgentToken('assistant:onboarding');
    console.log('[Test] SUCCESS! Token:', token.substring(0, 50) + '...');
  } catch (error: any) {
    console.error('[Test] FAILED:', error.message);
    console.error('[Test] Full error:', error);
  }
  process.exit(0);
}

test();
