#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OBJECT_SERVICE_URL = process.env.OBJECT_SERVICE_URL || 'https://symbia-object-service.replit.app/api';
const OBJECT_SERVICE_API_KEY = process.env.OBJECT_SERVICE_API_KEY;
const NORMALIZED_JSON_PATH = path.resolve(__dirname, '../docs/context-definitions.normalized.json');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (OBJECT_SERVICE_API_KEY) {
    headers['X-API-Key'] = OBJECT_SERVICE_API_KEY;
  }
  return headers;
}

function log(msg, ...args) {
  console.log(`[sync-context] ${msg}`, ...args);
}

function verbose(msg, ...args) {
  if (VERBOSE) console.log(`[sync-context:debug] ${msg}`, ...args);
}

function computeHash(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function transformContextItem(item) {
  const tags = [
    `kind:${item.kind}`,
    ...(item.tags || []),
  ];
  const displayName = item.displayName || item.name;
  
  return {
    key: `context/${item.kind}/${item.name}`,
    name: displayName,
    description: item.summary || item.description || null,
    type: 'context',
    status: 'published',
    isBootstrap: true,
    tags,
    metadata: {
      kind: item.kind,
      version: item.version,
      displayName,
      summary: item.summary,
      description: item.description,
      schema: item.schema || {},
      values: item.values || {},
      legacyId: item.id,
    },
  };
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 1000 * attempt;
        log(`Rate limit hit. Waiting ${waitMs}ms before retrying ${url}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      log(`Retry ${attempt}/${retries} for ${url}`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function getExistingResources() {
  const response = await fetchWithRetry(`${OBJECT_SERVICE_URL}/resources?type=context`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch existing resources: ${response.status}`);
  }
  return response.json();
}

async function createResource(payload) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would create: ${payload.key}`);
    return { id: 'dry-run-id', key: payload.key };
  }
  
  const response = await fetchWithRetry(`${OBJECT_SERVICE_URL}/resources`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create ${payload.key}: ${response.status} - ${text}`);
  }
  
  return response.json();
}

async function updateResource(id, payload) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would update: ${payload.key}`);
    return { id, key: payload.key };
  }
  
  const response = await fetchWithRetry(`${OBJECT_SERVICE_URL}/resources/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update ${payload.key}: ${response.status} - ${text}`);
  }
  
  return response.json();
}

async function publishVersion(resourceId, changelog) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would publish version for resource ${resourceId}`);
    return;
  }
  
  const response = await fetchWithRetry(`${OBJECT_SERVICE_URL}/resources/${resourceId}/versions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ changelog }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to publish version: ${response.status} - ${text}`);
  }
}

async function setResourceStatus(resourceId, status) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would set status to ${status} for resource ${resourceId}`);
    return;
  }
  
  const response = await fetchWithRetry(`${OBJECT_SERVICE_URL}/resources/${resourceId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to set status: ${response.status} - ${text}`);
  }
}

function needsUpdate(existing, incoming) {
  const existingHash = computeHash(existing.metadata || {});
  const incomingHash = computeHash(incoming.metadata || {});
  return existingHash !== incomingHash || 
         existing.name !== incoming.name || 
         existing.description !== incoming.description;
}

async function main() {
  log('Starting context sync to Object Service');
  log(`Target: ${OBJECT_SERVICE_URL}`);
  log(`Auth: ${OBJECT_SERVICE_API_KEY ? 'API key configured' : 'No API key (set OBJECT_SERVICE_API_KEY)'}`);
  log(`Dry run: ${DRY_RUN}`);
  
  if (!fs.existsSync(NORMALIZED_JSON_PATH)) {
    throw new Error(`Normalized JSON not found: ${NORMALIZED_JSON_PATH}`);
  }
  
  const data = JSON.parse(fs.readFileSync(NORMALIZED_JSON_PATH, 'utf-8'));
  const items = data.items || [];
  log(`Found ${items.length} context items in normalized JSON`);
  
  let existing = [];
  try {
    existing = await getExistingResources();
    log(`Found ${existing.length} existing context resources in Object Service`);
  } catch (err) {
    log(`Warning: Could not fetch existing resources: ${err.message}`);
    log('Proceeding with full create mode...');
  }
  
  const existingByKey = new Map(existing.map(r => [r.key, r]));
  
  const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };
  
  for (const item of items) {
    const payload = transformContextItem(item);
    const existingResource = existingByKey.get(payload.key);
    
    try {
      if (existingResource) {
        if (needsUpdate(existingResource, payload)) {
          verbose(`Updating: ${payload.key}`);
          await updateResource(existingResource.id, payload);
          await publishVersion(existingResource.id, `Sync from bundled context`);
          stats.updated++;
        } else {
          verbose(`Skipping (unchanged): ${payload.key}`);
          stats.skipped++;
        }
      } else {
        verbose(`Creating: ${payload.key}`);
        const created = await createResource(payload);
        if (created.id && !DRY_RUN) {
          await publishVersion(created.id, 'Initial sync from bundled context');
          await setResourceStatus(created.id, 'published');
        }
        stats.created++;
      }
    } catch (err) {
      log(`Error processing ${payload.key}: ${err.message}`);
      stats.errors++;
    }
  }
  
  log('');
  log('=== Sync Complete ===');
  log(`Created: ${stats.created}`);
  log(`Updated: ${stats.updated}`);
  log(`Skipped: ${stats.skipped}`);
  log(`Errors:  ${stats.errors}`);
  
  if (DRY_RUN) {
    log('');
    log('This was a dry run. No changes were made.');
  }
  
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[sync-context] Fatal error:', err);
  process.exit(1);
});
