#!/usr/bin/env npx tsx
/**
 * Load a catalog snapshot JSON file into the local catalog service.
 *
 * Usage:
 *   npx tsx scripts/load-snapshot.ts [snapshot-file]
 *
 * If no file is specified, uses the most recent snapshot in data/ directory.
 *
 * Environment:
 *   LOCAL_CATALOG_URL - Catalog service URL (default: http://localhost:5052)
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_CATALOG_URL = process.env.LOCAL_CATALOG_URL || 'http://localhost:5052';
const API_KEY = process.env.OBJECT_SERVICE_API_KEY || process.env.CATALOG_API_KEY;
const DATA_DIR = resolve(__dirname, '../data');

interface Resource {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  isBootstrap: boolean;
  tags: string[];
  orgId: string | null;
  accessPolicy: any;
  metadata: any;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

function findLatestSnapshot(): string | null {
  try {
    const files = readdirSync(DATA_DIR)
      .filter(f => f.startsWith('catalog-snapshot-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: join(DATA_DIR, f),
        mtime: statSync(join(DATA_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  return headers;
}

async function checkCatalogHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_CATALOG_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function getExistingResourceKeys(): Promise<Set<string>> {
  try {
    const response = await fetch(`${LOCAL_CATALOG_URL}/api/resources`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) return new Set();
    const resources = await response.json() as Resource[];
    return new Set(resources.map(r => r.key));
  } catch {
    return new Set();
  }
}

async function createResource(resource: Resource): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${LOCAL_CATALOG_URL}/api/resources`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const error = await response.text();
      if (error.includes('already exists')) {
        return { success: true }; // Skip existing
      }
      return { success: false, error };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function main() {
  // Determine snapshot file
  let snapshotPath = process.argv[2];

  if (!snapshotPath) {
    snapshotPath = findLatestSnapshot()!;
    if (!snapshotPath) {
      console.error('No snapshot file specified and no snapshots found in data/ directory');
      process.exit(1);
    }
    console.log(`Using latest snapshot: ${snapshotPath}`);
  } else {
    snapshotPath = resolve(snapshotPath);
  }

  // Check catalog is running
  console.log(`\nChecking catalog at ${LOCAL_CATALOG_URL}...`);
  if (!await checkCatalogHealth()) {
    console.error('Catalog service is not running or not healthy');
    process.exit(1);
  }
  console.log('  Catalog is healthy');

  // Check existing resources
  const existingKeys = await getExistingResourceKeys();
  console.log(`  Existing resources: ${existingKeys.size}`);

  // Load snapshot
  console.log(`\nLoading snapshot from ${snapshotPath}...`);
  const snapshotData = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as Resource[];
  console.log(`  Snapshot contains ${snapshotData.length} resources`);

  // Group by type
  const byType = new Map<string, Resource[]>();
  for (const r of snapshotData) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  console.log('\n  By type:');
  for (const [type, resources] of Array.from(byType.entries()).sort()) {
    console.log(`    ${type}: ${resources.length}`);
  }

  // Filter out existing
  const toLoad = snapshotData.filter(r => !existingKeys.has(r.key));
  console.log(`\n  New resources to load: ${toLoad.length}`);

  if (toLoad.length === 0) {
    console.log('\nAll resources already exist. Nothing to load.');
    return;
  }

  // Load resources
  console.log('\nLoading resources...');
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < toLoad.length; i++) {
    const resource = toLoad[i];
    const result = await createResource(resource);

    if (result.success) {
      created++;
    } else {
      failed++;
      errors.push(`${resource.key}: ${result.error}`);
    }

    if ((i + 1) % 50 === 0 || i === toLoad.length - 1) {
      process.stdout.write(`\r  Progress: ${i + 1}/${toLoad.length} (${created} created, ${failed} failed)`);
    }
  }
  console.log();

  // Show errors
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors.slice(0, 10)) {
      console.log(`  - ${err.slice(0, 100)}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Snapshot resources: ${snapshotData.length}`);
  console.log(`Already existed: ${existingKeys.size}`);
  console.log(`Newly created: ${created}`);
  console.log(`Failed: ${failed}`);

  // Verify
  const finalKeys = await getExistingResourceKeys();
  console.log(`\nFinal catalog size: ${finalKeys.size} resources`);
}

main().catch(console.error);
