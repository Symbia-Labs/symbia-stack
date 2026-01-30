#!/usr/bin/env npx tsx
/**
 * Remove standard executors that have V8 isolate duplicates.
 * Keeps only the V8 isolate version for components with both.
 */

const CATALOG_URL = process.env.LOCAL_CATALOG_URL || 'http://localhost:5052';

interface Resource {
  id: string;
  key: string;
  name: string;
  type: string;
  metadata: {
    componentKey?: string;
    entrypoint?: string;
  };
}

async function main() {
  // Fetch all executors
  const response = await fetch(`${CATALOG_URL}/api/resources`);
  const resources = await response.json() as Resource[];

  const executors = resources.filter(r => r.type === 'executor');
  console.log(`Total executors: ${executors.length}`);

  // Group by componentKey
  const byComponent = new Map<string, Resource[]>();
  for (const executor of executors) {
    const key = executor.metadata?.componentKey || 'unknown';
    if (!byComponent.has(key)) {
      byComponent.set(key, []);
    }
    byComponent.get(key)!.push(executor);
  }

  // Find duplicates (components with both standard and v8-isolate)
  const toDelete: Resource[] = [];
  for (const [componentKey, execs] of byComponent) {
    if (execs.length === 2) {
      const v8 = execs.find(e => e.key.includes('v8-isolate'));
      const standard = execs.find(e => !e.key.includes('v8-isolate'));

      if (v8 && standard) {
        toDelete.push(standard);
      }
    }
  }

  console.log(`Found ${toDelete.length} standard executors with V8 duplicates to delete`);

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // Delete them
  let deleted = 0;
  let failed = 0;

  for (const executor of toDelete) {
    try {
      const res = await fetch(`${CATALOG_URL}/api/resources/${executor.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        deleted++;
        process.stdout.write(`\rDeleted ${deleted}/${toDelete.length}`);
      } else {
        failed++;
        console.error(`\nFailed to delete ${executor.key}: ${await res.text()}`);
      }
    } catch (error) {
      failed++;
      console.error(`\nError deleting ${executor.key}:`, error);
    }
  }

  console.log(`\n\nDone! Deleted ${deleted}, failed ${failed}`);

  // Verify
  const verifyResponse = await fetch(`${CATALOG_URL}/api/resources`);
  const remaining = (await verifyResponse.json() as Resource[]).filter(r => r.type === 'executor');
  console.log(`Remaining executors: ${remaining.length}`);
}

main().catch(console.error);
