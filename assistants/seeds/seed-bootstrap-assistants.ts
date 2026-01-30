/**
 * Bootstrap Assistant Seeder
 *
 * Seeds the Catalog service with bootstrap assistant definitions.
 * Run with: npx tsx seeds/seed-bootstrap-assistants.ts
 *
 * Options:
 *   --dry-run     Print what would be created without making changes
 *   --force       Overwrite existing resources
 *   --status      Set initial status (draft|published, default: draft)
 */

import bootstrapData from './bootstrap-assistants.json' assert { type: 'json' };
import { resolveServiceUrl, ServiceId } from '@symbia/sys';

const CATALOG_ENDPOINT = process.env.CATALOG_ENDPOINT || `${resolveServiceUrl(ServiceId.CATALOG)}/api`;
const ORG_ID = process.env.SEED_ORG_ID || 'bootstrap-org';

interface AssistantSeed {
  key: string;
  name: string;
  description: string;
  tags: string[];
  capabilities: string[];
  serviceConfig: Record<string, string>;
  modelConfig: {
    provider: string;
    model: string;
    temperature: number;
  };
}

interface CatalogResource {
  key: string;
  name: string;
  description: string;
  type: 'assistant';
  status: 'draft' | 'published';
  tags: string[];
  metadata: {
    assistantConfig: {
      principalId: string;
      principalType: 'assistant';
      capabilities: string[];
      webhooks: {
        message: string;
      };
      endpoints: {
        query: string;
        summary: string;
        health: string;
      };
      serviceConfig: Record<string, string>;
      modelConfig: {
        provider: string;
        model: string;
        temperature: number;
      };
    };
  };
}

function buildCatalogResource(seed: AssistantSeed, status: 'draft' | 'published'): CatalogResource {
  return {
    key: seed.key,
    name: seed.name,
    description: seed.description,
    type: 'assistant',
    status,
    tags: seed.tags,
    metadata: {
      assistantConfig: {
        principalId: `assistant:${seed.key}`,
        principalType: 'assistant',
        capabilities: seed.capabilities,
        webhooks: {
          message: `/api/assistants/${seed.key}/message`,
        },
        endpoints: {
          query: `/api/assistants/${seed.key}/query`,
          summary: `/api/assistants/${seed.key}/summary`,
          health: `/api/assistants/${seed.key}/health`,
        },
        serviceConfig: seed.serviceConfig,
        modelConfig: seed.modelConfig,
      },
    },
  };
}

async function checkExisting(key: string): Promise<{ exists: boolean; id?: string }> {
  try {
    const response = await fetch(`${CATALOG_ENDPOINT}/resources?key=${key}&type=assistant`, {
      headers: { 'X-Org-Id': ORG_ID },
    });

    if (!response.ok) return { exists: false };

    const data = await response.json() as { resources?: { id: string }[] };
    const resources = data.resources || [];

    if (resources.length > 0) {
      return { exists: true, id: resources[0].id };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

async function createResource(resource: CatalogResource): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch(`${CATALOG_ENDPOINT}/resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': ORG_ID,
      },
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `${response.status}: ${error}` };
    }

    const data = await response.json() as { id?: string };
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function updateResource(id: string, resource: CatalogResource): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CATALOG_ENDPOINT}/resources/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': ORG_ID,
      },
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `${response.status}: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const statusArg = args.find(a => a.startsWith('--status='));
  const status = (statusArg?.split('=')[1] as 'draft' | 'published') || 'draft';

  console.log('Bootstrap Assistant Seeder');
  console.log('==========================');
  console.log(`Catalog: ${CATALOG_ENDPOINT}`);
  console.log(`Org ID: ${ORG_ID}`);
  console.log(`Status: ${status}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Force: ${force}`);
  console.log('');

  const assistants = bootstrapData.assistants as AssistantSeed[];
  console.log(`Found ${assistants.length} bootstrap assistant(s)\n`);

  const results: { key: string; action: string; success: boolean; error?: string }[] = [];

  for (const seed of assistants) {
    console.log(`Processing: ${seed.key} (${seed.name})`);

    const existing = await checkExisting(seed.key);
    const resource = buildCatalogResource(seed, status);

    if (existing.exists && !force) {
      console.log(`  ⏭️  Skipped (already exists, use --force to overwrite)\n`);
      results.push({ key: seed.key, action: 'skipped', success: true });
      continue;
    }

    if (dryRun) {
      console.log(`  🔍 Would ${existing.exists ? 'update' : 'create'}:`);
      console.log(`     Status: ${status}`);
      console.log(`     Capabilities: ${seed.capabilities.join(', ')}`);
      console.log(`     Model: ${seed.modelConfig.model}\n`);
      results.push({ key: seed.key, action: 'dry-run', success: true });
      continue;
    }

    let result: { success: boolean; error?: string };

    if (existing.exists && existing.id) {
      result = await updateResource(existing.id, resource);
      if (result.success) {
        console.log(`  ✅ Updated (id: ${existing.id})\n`);
        results.push({ key: seed.key, action: 'updated', success: true });
      } else {
        console.log(`  ❌ Failed to update: ${result.error}\n`);
        results.push({ key: seed.key, action: 'update-failed', success: false, error: result.error });
      }
    } else {
      const createResult = await createResource(resource);
      if (createResult.success) {
        console.log(`  ✅ Created (id: ${createResult.id})\n`);
        results.push({ key: seed.key, action: 'created', success: true });
      } else {
        console.log(`  ❌ Failed to create: ${createResult.error}\n`);
        results.push({ key: seed.key, action: 'create-failed', success: false, error: createResult.error });
      }
    }
  }

  // Summary
  console.log('Summary');
  console.log('-------');
  const created = results.filter(r => r.action === 'created').length;
  const updated = results.filter(r => r.action === 'updated').length;
  const skipped = results.filter(r => r.action === 'skipped').length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Seeder failed:', error);
  process.exit(1);
});
