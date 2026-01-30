#!/usr/bin/env npx tsx
/**
 * Fix executor componentKey metadata
 *
 * Updates V8 isolate executors to add componentKey matching their component.
 */

const CATALOG_URL = process.env.CATALOG_ENDPOINT || 'http://localhost:5052';

interface Resource {
  id: string;
  key: string;
  type: string;
  metadata: Record<string, unknown>;
}

async function main() {
  // Fetch all executors
  const response = await fetch(`${CATALOG_URL}/api/resources?type=executor`);
  const executors = await response.json() as Resource[];

  console.log(`Found ${executors.length} executors`);

  let updated = 0;
  let skipped = 0;

  for (const executor of executors) {
    // Skip if already has componentKey
    if (executor.metadata?.componentKey) {
      skipped++;
      continue;
    }

    // Extract component key from executor key
    // executor/v8-isolate/data/ArrayReduce -> data/ArrayReduce
    // executor/standard/data/ArrayReduce -> data/ArrayReduce
    const keyParts = executor.key.split('/');
    if (keyParts[0] !== 'executor' || keyParts.length < 3) {
      console.log(`  Skipping ${executor.key} - unexpected format`);
      skipped++;
      continue;
    }

    // Remove "executor" and runtime type (v8-isolate, standard)
    const componentKey = keyParts.slice(2).join('/');

    // Update executor with componentKey
    const updateResponse = await fetch(`${CATALOG_URL}/api/resources/${executor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          ...executor.metadata,
          componentKey
        }
      })
    });

    if (updateResponse.ok) {
      updated++;
      if (updated % 20 === 0) {
        console.log(`  Updated ${updated} executors...`);
      }
    } else {
      console.log(`  Failed to update ${executor.key}: ${await updateResponse.text()}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
}

main().catch(console.error);
