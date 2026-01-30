/**
 * Example: Simplified Assistant Loader using @symbia/catalog-client
 *
 * This demonstrates how the catalog-client simplifies service integrations.
 * Compare with the original assistant-loader.ts which uses raw fetch calls.
 */

import { createCatalogClient, type AssistantResource, type AssistantConfig } from '@symbia/catalog-client';
import type { RuleSet } from '../assistants/server/src/engine/types.js';

// Create client (configured via env vars or explicit config)
const catalog = createCatalogClient({
  // Optional: override defaults
  // endpoint: 'https://catalog.symbia-labs.com',
  // token: process.env.SERVICE_TOKEN,
  onError: (error) => {
    console.warn('[Assistant Loader] Catalog error:', error.message);
  },
});

/**
 * Before (raw fetch):
 *
 * async function fetchFromCatalog(type: string): Promise<CatalogResource[]> {
 *   try {
 *     const response = await fetch(`${CATALOG_ENDPOINT}/resources?type=${type}&status=published`, {
 *       headers: { 'Content-Type': 'application/json' },
 *     });
 *     if (!response.ok) {
 *       console.warn(`Catalog returned ${response.status} for type=${type}`);
 *       return [];
 *     }
 *     const data = await response.json();
 *     return data.resources || data || [];
 *   } catch (error) {
 *     console.warn('Failed to fetch from Catalog:', error);
 *     return [];
 *   }
 * }
 */

/**
 * After (with catalog-client):
 */
async function loadPublishedAssistants(): Promise<AssistantResource[]> {
  // Type-safe, handles errors, respects timeout
  return catalog.getPublishedAssistants();
}

/**
 * Before (raw fetch for rule set):
 *
 * async function fetchRuleSet(ruleSetId: string): Promise<RuleSet | null> {
 *   try {
 *     const response = await fetch(`${CATALOG_ENDPOINT}/resources/${ruleSetId}`, {
 *       headers: { 'Content-Type': 'application/json' },
 *     });
 *     if (!response.ok) return null;
 *     const data = await response.json();
 *     return data.metadata?.ruleSet || null;
 *   } catch {
 *     return null;
 *   }
 * }
 */

/**
 * After (with catalog-client):
 */
async function fetchRuleSet(ruleSetId: string): Promise<RuleSet | null> {
  const resource = await catalog.getResource(ruleSetId);
  if (!resource) return null;
  return (resource.metadata as { ruleSet?: RuleSet })?.ruleSet || null;
}

/**
 * Full example: Load assistants with rule sets
 */
async function loadAssistants(): Promise<void> {
  console.log('[Assistant Loader] Loading assistants from Catalog...');

  // Get all published assistants (single type-safe call)
  const assistants = await catalog.getPublishedAssistants();
  console.log(`[Assistant Loader] Found ${assistants.length} assistant(s)`);

  for (const assistant of assistants) {
    const config = assistant.metadata as AssistantConfig | undefined;
    if (!config) {
      console.warn(`[Assistant Loader] Skipping ${assistant.key}: no config`);
      continue;
    }

    // Fetch associated rule set if referenced
    let ruleSet: RuleSet | null = null;
    if (config.ruleSetId) {
      ruleSet = await fetchRuleSet(config.ruleSetId);
      if (!ruleSet) {
        console.warn(`[Assistant Loader] Rule set ${config.ruleSetId} not found for ${assistant.key}`);
      }
    }

    console.log(`[Assistant Loader] ✓ Loaded ${assistant.key} with ${ruleSet?.rules.length || 0} rules`);
  }
}

/**
 * Additional catalog-client capabilities not available with raw fetch:
 */
async function advancedExamples(): Promise<void> {
  // Search for assistants by keyword
  const searchResults = await catalog.search({
    query: 'log analysis',
    type: 'assistant',
    status: 'published',
  });

  // Get bootstrap summary for initialization
  const summary = await catalog.getBootstrapSummary();
  console.log(`Total assistants: ${summary.assistants.count}`);

  // Get executor for a component (useful for runtime)
  const executor = await catalog.getExecutorByComponentKey('symbia.core.http-request');
  if (executor) {
    console.log(`Executor: ${executor.metadata?.entrypoint}`);
  }

  // List graphs with filters
  const graphs = await catalog.listGraphs({
    status: 'published',
    tags: ['production'],
  });

  // Bulk publish resources
  await catalog.bulkOperation({
    action: 'publish',
    ids: ['resource-1', 'resource-2'],
  });

  // Get version history
  const versions = await catalog.getVersions('resource-id');

  // Health check (useful for service readiness)
  const health = await catalog.health();
  console.log(`Catalog status: ${health.status}`);
}

// Run example
loadAssistants().catch(console.error);
