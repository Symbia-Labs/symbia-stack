/**
 * Assistant Loader Service
 *
 * Loads assistant definitions from the Catalog service.
 * Assistants are configured with rule sets embedded in their metadata.
 *
 * All assistant definitions are stored in the Catalog - no local definitions.
 */

import { Router, Express } from 'express';
import { createRuleBasedAssistantRouter } from '../routes/assistants/rule-based-handler.js';
import { registerRuleSet } from '../routes/rules.js';
import type { RuleSet, ResolvedLLMConfig, AssistantLLMConfigRef } from '../engine/types.js';
import { ServiceId, resolveServiceUrl } from '@symbia/sys';
import { resolveLLMConfig } from '../config/llm-config-resolver.js';

/**
 * Get Catalog API endpoint from environment or service discovery
 * Supports: CATALOG_ENDPOINT, CATALOG_SERVICE_URL, or falls back to @symbia/sys defaults
 */
function getCatalogEndpoint(): string {
  // Direct endpoint override takes precedence (for k8s/docker)
  if (process.env.CATALOG_ENDPOINT) {
    return process.env.CATALOG_ENDPOINT;
  }
  // Use @symbia/sys service resolution (checks CATALOG_SERVICE_URL, then defaults)
  return `${resolveServiceUrl(ServiceId.CATALOG)}/api`;
}

/**
 * Assistant configuration from Catalog
 */
export interface AssistantConfig {
  principalId: string;
  principalType: 'assistant';
  capabilities: string[];
  webhooks?: {
    message?: string;
    control?: string;
  };
  endpoints?: {
    [key: string]: string;
  };
  serviceConfig?: {
    loggingEndpoint?: string;
    identityEndpoint?: string;
    catalogEndpoint?: string;
    [key: string]: unknown;
  };
  modelConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

/**
 * Catalog resource structure
 */
export interface CatalogResource {
  id: string;
  key: string;
  name: string;
  description: string;
  type: 'assistant' | string;
  status: string;
  tags: string[];
  metadata: {
    alias?: string;
    llmConfigPreset?: 'routing' | 'conversational' | 'code' | 'reasoning';
    assistantConfig?: AssistantConfig;
    ruleSet?: RuleSet;
    [key: string]: unknown;
  };
}

/**
 * Loaded assistant with runtime info
 */
export interface LoadedAssistant {
  resource: CatalogResource;
  config: AssistantConfig;
  alias?: string; // Short @mention alias (e.g., @logs, @welcome)
  ruleSet?: RuleSet;
  router?: Router;
  /** Resolved LLM configuration for this assistant */
  llmConfig?: ResolvedLLMConfig;
}

/**
 * Fetch resources from Catalog with retry support
 * Retries help handle the startup race condition where assistants service
 * may start before catalog has finished seeding its database.
 */
async function fetchFromCatalog(
  type: string,
  options: { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<CatalogResource[]> {
  const { maxRetries = 5, retryDelayMs = 2000 } = options;
  const catalogEndpoint = getCatalogEndpoint();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Load both published and bootstrap assistants
      const response = await fetch(`${catalogEndpoint}/resources?type=${type}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.warn(`[Assistant Loader] Catalog returned ${response.status} for type=${type} (attempt ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }
        return [];
      }

      const data = await response.json() as { resources?: CatalogResource[] } | CatalogResource[];
      const resources = (data as { resources?: CatalogResource[] }).resources || (data as CatalogResource[]) || [];

      // If we got results, return them
      if (resources.length > 0) {
        return resources;
      }

      // If empty but catalog is reachable, it might still be seeding - retry
      if (attempt < maxRetries) {
        console.log(`[Assistant Loader] Catalog returned 0 ${type}s, retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }

      return [];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries) {
        console.warn(`[Assistant Loader] Failed to fetch from Catalog (attempt ${attempt}/${maxRetries}): ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }
      console.warn('[Assistant Loader] Failed to fetch from Catalog after all retries:', errorMsg);
      return [];
    }
  }

  return [];
}

/**
 * Registry of loaded assistants
 */
const loadedAssistants = new Map<string, LoadedAssistant>();

/**
 * Get a loaded assistant by key
 */
export function getLoadedAssistant(key: string): LoadedAssistant | undefined {
  return loadedAssistants.get(key);
}

/**
 * Get all loaded assistants
 */
export function getAllLoadedAssistants(): LoadedAssistant[] {
  return Array.from(loadedAssistants.values());
}

/**
 * Load and register assistants from Catalog
 *
 * If Catalog is unavailable, logs an error and continues with no assistants.
 * This is intentional - all assistant definitions should be in the Catalog.
 *
 * Uses retry mechanism to handle startup race conditions where this service
 * may start before catalog has finished seeding its database.
 */
export async function loadAssistants(app: Express): Promise<void> {
  const catalogEndpoint = getCatalogEndpoint();
  console.log(`[Assistant Loader] Loading assistants from Catalog at ${catalogEndpoint}...`);

  const catalogAssistants = await fetchFromCatalog('assistant', {
    maxRetries: 5,
    retryDelayMs: 2000,
  });

  if (catalogAssistants.length === 0) {
    console.error('[Assistant Loader] No assistants found in Catalog after retries. Ensure Catalog service is running and has assistant resources.');
    return;
  }

  console.log(`[Assistant Loader] Found ${catalogAssistants.length} assistant(s) in Catalog`);

  for (const resource of catalogAssistants) {
    // Extract assistant key from the resource key (e.g., "assistants/log-analyst" -> "log-analyst")
    const assistantKey = resource.key.includes('/')
      ? resource.key.split('/').pop()!
      : resource.key;

    // Get rule set from embedded metadata
    const ruleSet = resource.metadata?.ruleSet;
    if (!ruleSet) {
      console.warn(`[Assistant Loader] Skipping ${assistantKey}: no ruleSet in metadata`);
      continue;
    }

    // Build assistant config from metadata
    const config: AssistantConfig = resource.metadata?.assistantConfig || {
      principalId: `assistant:${assistantKey}`,
      principalType: 'assistant',
      capabilities: extractCapabilities(ruleSet),
    };

    // Create rule-based router
    const router = createRuleBasedAssistantRouter({
      key: assistantKey,
      name: resource.name,
      description: resource.description,
      defaultRules: ruleSet,
    });

    const basePath = `/api/assistants/${assistantKey}`;
    app.use(basePath, router);

    // Register rules in the rules API for Admin UI visibility
    registerRuleSet(assistantKey, ruleSet);

    console.log(`[Assistant Loader] ✓ Registered ${assistantKey} at ${basePath}`);

    // Convert rule set to routines for UI display
    const routines = ruleSetToRoutines(ruleSet);

    // Extract legacy LLM config from rules (for display)
    const llmConfigLegacy = extractLlmConfig(ruleSet);

    // Resolve full LLM configuration based on preset
    const llmConfigPreset = resource.metadata?.llmConfigPreset || 'conversational';
    const llmConfigRef: AssistantLLMConfigRef = { preset: llmConfigPreset };
    const resolvedLLMConfig = resolveLLMConfig(llmConfigRef);

    // Get alias from metadata
    const alias = resource.metadata?.alias as string | undefined;

    loadedAssistants.set(assistantKey, {
      resource: {
        ...resource,
        metadata: {
          ...resource.metadata,
          routines,
          llm: llmConfigLegacy,
          llmConfig: resolvedLLMConfig,
        },
      },
      config,
      alias,
      ruleSet,
      router,
      llmConfig: resolvedLLMConfig,
    });
  }

  console.log(`[Assistant Loader] Loaded ${loadedAssistants.size} assistant(s) total`);
}

/**
 * Extract capabilities from a rule set
 */
function extractCapabilities(ruleSet: RuleSet): string[] {
  const capabilities = new Set<string>();

  for (const rule of ruleSet.rules) {
    for (const action of rule.actions) {
      if (action.type === 'service.call') {
        const params = action.params as { service?: string };
        if (params.service) capabilities.add(`${params.service}.query`);
      }
      if (action.type === 'llm.invoke') {
        capabilities.add('llm.chat');
      }
      if (action.type === 'message.send') {
        capabilities.add('messaging');
      }
    }
  }

  return Array.from(capabilities);
}

/**
 * Extract LLM configuration from a rule set's llm.invoke actions
 */
function extractLlmConfig(ruleSet: RuleSet): {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
} | undefined {
  // Find the first llm.invoke action to get default config
  for (const rule of ruleSet.rules) {
    for (const action of rule.actions) {
      if (action.type === 'llm.invoke') {
        const params = action.params as {
          provider?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
          systemPrompt?: string;
        };
        return {
          provider: params.provider || 'openai',
          model: params.model || 'gpt-4o-mini',
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          systemPrompt: params.systemPrompt,
        };
      }
    }
  }
  return undefined;
}

// Types for routines (UI format)
type StepType = 'say' | 'ask' | 'think' | 'remember' | 'recall' | 'wait' | 'check' | 'call' | 'repeat' | 'stop';

interface Step {
  id: string;
  type: StepType;
  description: string;
  params?: {
    duration?: number;
    condition?: string;
    routineName?: string;
    contextKey?: string;
    times?: number;
  };
}

interface Routine {
  id: string;
  name: string;
  description?: string;
  trigger?: string;
  steps: Step[];
  isMain?: boolean;
}

/**
 * Convert a rule action to a routine step
 */
function actionToStep(action: { type: string; params?: Record<string, unknown> }, index: number): Step {
  const id = `step-${Date.now()}-${index}`;

  switch (action.type) {
    case 'message.send':
      return {
        id,
        type: 'say',
        description: String(action.params?.content || 'Send response'),
      };

    case 'llm.invoke': {
      const params = action.params || {};
      const systemPrompt = params.systemPrompt as string || '';
      let description = 'Process with AI';
      if (systemPrompt) {
        const firstLine = systemPrompt.split('\n')[0].substring(0, 100);
        description = firstLine;
      }
      return {
        id,
        type: 'think',
        description,
      };
    }

    case 'service.call':
      return {
        id,
        type: 'recall',
        description: `@${action.params?.service || 'service'}.${action.params?.path || 'data'}`,
        params: {
          contextKey: action.params?.resultKey as string,
        },
      };

    default:
      return {
        id,
        type: 'say',
        description: `Execute: ${action.type}`,
      };
  }
}

/**
 * Convert conditions to a human-readable trigger description
 */
function conditionsToTrigger(trigger: string, conditions?: { field?: string; operator?: string; value?: unknown; logic?: string; conditions?: unknown[] }): string {
  if (!conditions) return trigger;

  const describeCondition = (cond: { field?: string; operator?: string; value?: unknown; logic?: string; conditions?: unknown[] }): string => {
    if (cond.logic && cond.conditions) {
      const parts = (cond.conditions as typeof cond[]).map(describeCondition);
      return parts.join(cond.logic === 'or' ? ' or ' : ' and ');
    }

    if (cond.field && cond.operator && cond.value !== undefined) {
      const field = cond.field.replace('message.', '');
      switch (cond.operator) {
        case 'contains':
          return `${field} contains "${cond.value}"`;
        case 'not_contains':
          return `${field} doesn't contain "${cond.value}"`;
        case 'equals':
          return `${field} equals "${cond.value}"`;
        case 'matches':
          return `${field} matches ${cond.value}`;
        default:
          return `${field} ${cond.operator} ${cond.value}`;
      }
    }

    return '';
  };

  const conditionDesc = describeCondition(conditions);
  return conditionDesc ? `When ${conditionDesc}` : trigger;
}

/**
 * Convert a RuleSet to Routine[] format for the UI
 */
function ruleSetToRoutines(ruleSet: RuleSet): Routine[] {
  return ruleSet.rules
    .filter(rule => rule.enabled)
    .sort((a, b) => b.priority - a.priority)
    .map((rule, idx) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      trigger: conditionsToTrigger(rule.trigger, rule.conditions as { field?: string; operator?: string; value?: unknown; logic?: string; conditions?: unknown[] }),
      steps: rule.actions.map((action, i) => actionToStep(action, i)),
      isMain: idx === 0,
    }));
}

/**
 * Create an API router for listing assistants
 */
export function createAssistantsListRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const assistants = getAllLoadedAssistants().map(a => ({
      key: a.resource.key.includes('/') ? a.resource.key.split('/').pop() : a.resource.key,
      name: a.resource.name,
      alias: a.alias || (a.resource.metadata?.alias as string), // @mention alias (e.g., "logs" for @logs)
      principalId: a.config.principalId,
      description: a.resource.description,
      status: a.resource.status,
      tags: a.resource.tags || [], // Include tags for UI grouping
      capabilities: a.config.capabilities,
      hasHandler: !!a.router,
      hasRules: !!a.ruleSet,
      rulesCount: a.ruleSet?.rules.length || 0,
      // Include routines for UI display
      routines: a.resource.metadata?.routines || [],
      // Include LLM config for UI display (legacy format)
      llm: a.resource.metadata?.llm || {},
      // Include full LLM configuration
      llmConfigPreset: a.resource.metadata?.llmConfigPreset || 'conversational',
      llmConfig: a.llmConfig || a.resource.metadata?.llmConfig || null,
    }));

    res.json({ assistants });
  });

  // Get mentionable actors for @mentions
  router.get('/mentionable', (_req, res) => {
    const mentionable = getAllLoadedAssistants()
      .filter(a => a.alias) // Only assistants with aliases
      .map(a => ({
        alias: a.alias!,
        name: a.resource.name,
        principalId: a.config.principalId,
        key: a.resource.key.includes('/') ? a.resource.key.split('/').pop() : a.resource.key,
      }));

    res.json({ mentionable });
  });

  return router;
}
