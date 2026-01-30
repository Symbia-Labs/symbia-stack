import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// All settings routes require authentication - these control LLM API keys
router.use(requireAuth);

interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'custom';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKeySet: boolean;
}

// In-memory storage for settings (per org)
const llmSettings: Record<string, LLMSettings & { apiKey?: string }> = {};

// Default settings
const defaultLLMSettings: LLMSettings = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 1024,
  apiKeySet: false,
};

// Get LLM settings for org
router.get('/llm', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const settings = llmSettings[orgId];

  if (!settings) {
    // Check if there's an env var API key
    const envApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    res.json({
      data: {
        ...defaultLLMSettings,
        apiKeySet: !!envApiKey,
      },
    });
    return;
  }

  // Don't send the actual API key, just whether it's set
  const { apiKey, ...safeSettings } = settings;
  res.json({
    data: {
      ...safeSettings,
      apiKeySet: !!apiKey || !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY,
    },
  });
});

// Save LLM settings for org
router.put('/llm', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const body = req.body as Partial<LLMSettings & { apiKey?: string }>;

  const existing = llmSettings[orgId] || { ...defaultLLMSettings };

  const updated = {
    provider: body.provider ?? existing.provider,
    model: body.model ?? existing.model,
    temperature: body.temperature ?? existing.temperature,
    maxTokens: body.maxTokens ?? existing.maxTokens,
    apiKeySet: !!(body.apiKey || existing.apiKey),
    apiKey: body.apiKey || existing.apiKey,
  };

  llmSettings[orgId] = updated;

  // Update environment variable for the LLM invoke action
  if (body.apiKey) {
    if (updated.provider === 'openai') {
      process.env.OPENAI_API_KEY = body.apiKey;
    } else if (updated.provider === 'anthropic') {
      process.env.ANTHROPIC_API_KEY = body.apiKey;
    }
  }

  // Don't send the actual API key back
  const { apiKey, ...safeSettings } = updated;
  res.json({
    data: {
      ...safeSettings,
      apiKeySet: !!apiKey,
    },
  });
});

// Get settings for org (used internally)
export function getOrgLLMSettings(orgId: string): LLMSettings & { apiKey?: string } {
  return llmSettings[orgId] || {
    ...defaultLLMSettings,
    apiKey: process.env.OPENAI_API_KEY,
  };
}

export default router;
