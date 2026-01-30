import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication - these manage assistant configurations
router.use(requireAuth);

interface AssistantConfig {
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'draft';
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  hasHandler: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage for custom assistants (per org)
const customAssistants: Record<string, Record<string, AssistantConfig>> = {};

// Get all assistants for org (combines bootstrap + custom)
router.get('/', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const orgAssistants = customAssistants[orgId] || {};

  res.json({
    data: Object.values(orgAssistants),
    count: Object.keys(orgAssistants).length,
  });
});

// Get single assistant
router.get('/:key', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const { key } = req.params;

  const orgAssistants = customAssistants[orgId] || {};
  const assistant = orgAssistants[key];

  if (!assistant) {
    res.status(404).json({ error: 'Assistant not found' });
    return;
  }

  res.json({ data: assistant });
});

// Create assistant
router.post('/', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const body = req.body as Partial<AssistantConfig>;

  if (!body.key || !body.name) {
    res.status(400).json({ error: 'key and name are required' });
    return;
  }

  // Validate key format
  if (!/^[a-z0-9-]+$/.test(body.key)) {
    res.status(400).json({ error: 'key must be lowercase alphanumeric with dashes only' });
    return;
  }

  if (!customAssistants[orgId]) {
    customAssistants[orgId] = {};
  }

  if (customAssistants[orgId][body.key]) {
    res.status(409).json({ error: 'Assistant with this key already exists' });
    return;
  }

  const assistant: AssistantConfig = {
    key: body.key,
    name: body.name,
    description: body.description || '',
    capabilities: body.capabilities || [],
    status: body.status || 'draft',
    systemPrompt: body.systemPrompt,
    model: body.model || 'gpt-4o-mini',
    temperature: body.temperature ?? 0.7,
    hasHandler: true, // Custom assistants use the generic LLM handler
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  customAssistants[orgId][body.key] = assistant;

  res.status(201).json({ data: assistant });
});

// Update assistant
router.put('/:key', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const { key } = req.params;
  const body = req.body as Partial<AssistantConfig>;

  if (!customAssistants[orgId] || !customAssistants[orgId][key]) {
    res.status(404).json({ error: 'Assistant not found' });
    return;
  }

  const existing = customAssistants[orgId][key];

  const updated: AssistantConfig = {
    ...existing,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    capabilities: body.capabilities ?? existing.capabilities,
    status: body.status ?? existing.status,
    systemPrompt: body.systemPrompt ?? existing.systemPrompt,
    model: body.model ?? existing.model,
    temperature: body.temperature ?? existing.temperature,
    updatedAt: new Date(),
  };

  customAssistants[orgId][key] = updated;

  res.json({ data: updated });
});

// Delete assistant
router.delete('/:key', (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string || 'default';
  const { key } = req.params;

  if (!customAssistants[orgId] || !customAssistants[orgId][key]) {
    res.status(404).json({ error: 'Assistant not found' });
    return;
  }

  delete customAssistants[orgId][key];

  res.json({ success: true });
});

// Get assistant config for message handling (used internally)
export function getAssistantConfig(orgId: string, key: string): AssistantConfig | undefined {
  return customAssistants[orgId]?.[key];
}

export default router;
