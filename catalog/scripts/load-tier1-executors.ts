#!/usr/bin/env npx tsx
/**
 * Load Tier 1 (pure/parse_transform) components from production catalog
 * and create corresponding v8-isolate executor resources in local catalog.
 *
 * Usage:
 *   npx tsx scripts/load-tier1-executors.ts
 *
 * Environment:
 *   LOCAL_CATALOG_URL - Local catalog service URL (default: http://localhost:5003)
 */

const PROD_CATALOG_URL = 'https://catalog.symbia-labs.com';
const LOCAL_CATALOG_URL = process.env.LOCAL_CATALOG_URL || 'http://localhost:5003';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// Tier 1 determinism classes - safe for V8 isolate execution
const TIER1_DETERMINISM_CLASSES = ['pure', 'parse_transform'];

interface ProductionComponent {
  id: string;
  key: string;
  name: string;
  description: string;
  type: string;
  status: string;
  isBootstrap: boolean;
  tags: string[];
  orgId: string | null;
  accessPolicy: any;
  metadata: {
    ports: Array<{
      name: string;
      type: string;
      default: any;
      direction: 'input' | 'output' | 'config';
    }>;
    version: string;
    category: string;
    displayName: string;
    determinismHints?: {
      class: string;
    };
  };
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface ExecutorResource {
  key: string;
  name: string;
  description: string;
  type: 'executor';
  status: 'published';
  isBootstrap: boolean;
  tags: string[];
  accessPolicy: any;
  metadata: {
    componentKey: string;
    componentVersion: string;
    runtimeType: string;
    runtimeVersion: string;
    environment: string[];
    language: string;
    entrypoint: string;
    determinism: string;
    capabilities: string[];
    ports: {
      inputs: Array<{ id: string; label: string; type: string }>;
      outputs: Array<{ id: string; label: string; type: string }>;
      configs: Array<{ id: string; label: string; type: string; default?: any }>;
    };
  };
}

async function fetchBootstrapComponents(): Promise<ProductionComponent[]> {
  console.log(`Fetching bootstrap components from ${PROD_CATALOG_URL}...`);

  const response = await fetch(`${PROD_CATALOG_URL}/api/bootstrap`);
  if (!response.ok) {
    throw new Error(`Failed to fetch bootstrap: ${response.status} ${response.statusText}`);
  }

  const resources = await response.json() as ProductionComponent[];
  console.log(`  Found ${resources.length} total bootstrap resources`);

  // Filter to components only
  const components = resources.filter(r => r.type === 'component');
  console.log(`  Found ${components.length} components`);

  return components;
}

function filterTier1Components(components: ProductionComponent[]): ProductionComponent[] {
  const tier1 = components.filter(c => {
    const determinismClass = c.metadata?.determinismHints?.class;
    return determinismClass && TIER1_DETERMINISM_CLASSES.includes(determinismClass);
  });

  console.log(`  Filtered to ${tier1.length} Tier 1 (${TIER1_DETERMINISM_CLASSES.join('/')}) components`);
  return tier1;
}

function convertToExecutor(component: ProductionComponent): ExecutorResource {
  const ports = component.metadata?.ports || [];

  // Separate ports by direction
  const inputs = ports
    .filter(p => p.direction === 'input')
    .map(p => ({ id: p.name, label: p.name, type: p.type }));

  const outputs = ports
    .filter(p => p.direction === 'output')
    .map(p => ({ id: p.name, label: p.name, type: p.type }));

  const configs = ports
    .filter(p => p.direction === 'config')
    .map(p => ({ id: p.name, label: p.name, type: p.type, default: p.default }));

  const determinismClass = component.metadata?.determinismHints?.class || 'pure';

  return {
    key: `executor/v8-isolate/${component.key}`,
    name: `${component.name} (V8 Isolate)`,
    description: `V8 isolate executor for ${component.name}: ${component.description || ''}`,
    type: 'executor',
    status: 'published',
    isBootstrap: true,
    tags: [
      ...component.tags,
      'runtime:v8-isolate',
      'tier:1',
      `determinism:${determinismClass}`,
    ],
    accessPolicy: {
      visibility: 'public',
      actions: {
        read: { anyOf: ['public'] },
        write: { anyOf: ['cap:registry.write', 'role:admin'] },
        publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
        sign: { anyOf: ['cap:registry.sign', 'role:admin'] },
        certify: { anyOf: ['cap:registry.certify', 'role:admin'] },
        delete: { anyOf: ['role:admin'] },
      },
    },
    metadata: {
      componentKey: component.key,
      componentVersion: component.metadata?.version || '1.0.0',
      runtimeType: 'v8-isolate',
      runtimeVersion: '1.0.0',
      environment: ['browser', 'edge', 'server'],
      language: 'javascript',
      entrypoint: `@symbia/runtime-v8/components/${component.key}`,
      determinism: determinismClass === 'pure' ? 'deterministic' : 'non-deterministic',
      capabilities: [], // Tier 1 needs no special capabilities
      ports: {
        inputs,
        outputs,
        configs,
      },
    },
  };
}

async function createExecutorInLocalCatalog(executor: ExecutorResource): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  try {
    // First check if it already exists
    const checkResponse = await fetch(
      `${LOCAL_CATALOG_URL}/api/resources/by-key/${encodeURIComponent(executor.key)}`,
      { headers }
    );

    if (checkResponse.ok) {
      console.log(`    [skip] ${executor.key} already exists`);
      return true;
    }

    // Create the executor
    const response = await fetch(`${LOCAL_CATALOG_URL}/api/resources`, {
      method: 'POST',
      headers,
      body: JSON.stringify(executor),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`    [fail] ${executor.key}: ${error}`);
      return false;
    }

    console.log(`    [created] ${executor.key}`);
    return true;
  } catch (error) {
    console.error(`    [error] ${executor.key}: ${error}`);
    return false;
  }
}

async function createExecutorsBulk(executors: ExecutorResource[]): Promise<{ created: number; failed: number; errors: string[] }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  try {
    const response = await fetch(`${LOCAL_CATALOG_URL}/api/resources/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ resources: executors }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Bulk create failed: ${error}`);
      return { created: 0, failed: executors.length, errors: [error] };
    }

    const result = await response.json() as { created: number; errors: Array<{ key: string; error: string }> };
    const errors = result.errors?.map(e => `${e.key}: ${e.error}`) || [];
    return { created: result.created, failed: errors.length, errors };
  } catch (error) {
    console.error(`Bulk create error: ${error}`);
    return { created: 0, failed: executors.length, errors: [String(error)] };
  }
}

async function main() {
  console.log('=== Loading Tier 1 Executors ===\n');

  // 1. Fetch production bootstrap components
  const allComponents = await fetchBootstrapComponents();

  // 2. Filter to Tier 1 only
  const tier1Components = filterTier1Components(allComponents);

  // 3. Convert each to executor format
  console.log('\nConverting to executor resources...');
  const executors = tier1Components.map(convertToExecutor);

  // 4. Group by category for logging
  const byCategory = new Map<string, ExecutorResource[]>();
  for (const exec of executors) {
    const category = exec.metadata.componentKey.split('/')[0];
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(exec);
  }

  console.log('\nExecutors by category:');
  for (const [category, execs] of byCategory) {
    console.log(`  ${category}: ${execs.length}`);
  }

  // 5. Load into local catalog one by one
  console.log(`\nLoading ${executors.length} executors into local catalog at ${LOCAL_CATALOG_URL}...`);

  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < executors.length; i++) {
    const executor = executors[i];
    const result = await createExecutorInLocalCatalog(executor);
    if (result) {
      created++;
    } else {
      failed++;
      errors.push(executor.key);
    }

    // Progress indicator
    if ((i + 1) % 10 === 0 || i === executors.length - 1) {
      console.log(`  Progress: ${i + 1}/${executors.length} (${created} created, ${failed} failed)`);
    }
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors.slice(0, 10)) {
      console.log(`  - ${err}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total Tier 1 components: ${tier1Components.length}`);
  console.log(`Executors created: ${created}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0 && created === 0) {
    process.exit(1);
  }
}

main().catch(console.error);
