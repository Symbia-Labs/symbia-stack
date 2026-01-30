#!/usr/bin/env node

const OBJECT_SERVICE_URL = process.env.OBJECT_SERVICE_URL || 'https://symbia-object-service.replit.app/api';
const OBJECT_SERVICE_API_KEY = process.env.OBJECT_SERVICE_API_KEY;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

function getArgValue(flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  return argv[idx + 1] || null;
}

const DELAY_MS = Math.max(0, Number.parseInt(getArgValue('--delay-ms') || '2000', 10) || 2000);
const scopeArg = (getArgValue('--scope') || 'component,context').toLowerCase();
const scopeSet = new Set(scopeArg.split(',').map((s) => s.trim()).filter(Boolean));

const DEFAULT_ACTIONS = {
  write: { anyOf: ['cap:registry.write', 'role:admin'] },
  publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
  sign: { anyOf: ['cap:registry.sign', 'role:admin'] },
  certify: { anyOf: ['cap:registry.certify', 'role:admin'] },
  delete: { anyOf: ['role:admin'] },
};

function log(message, ...args) {
  console.log(`[registry-access] ${message}`, ...args);
}

function verbose(message, ...args) {
  if (VERBOSE) console.log(`[registry-access:debug] ${message}`, ...args);
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (OBJECT_SERVICE_API_KEY) {
    headers['X-API-Key'] = OBJECT_SERVICE_API_KEY;
  }
  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 1000 * (attempt + 1);
        log(`Rate limit hit. Waiting ${waitMs}ms before retrying ${url}`);
        await sleep(waitMs);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      const waitMs = 1000 * (attempt + 1);
      log(`Network error (attempt ${attempt + 1}/${retries + 1}): ${err.message || err}. Retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status}: ${text}`);
  }
  return response.json();
}

async function listResources() {
  return fetchJson(`${OBJECT_SERVICE_URL}/resources`, {
    headers: getAuthHeaders(),
  });
}

async function patchResource(id, payload) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would patch resource ${id}:`, payload);
    return;
  }
  await fetchJson(`${OBJECT_SERVICE_URL}/resources/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

function shouldHandle(type) {
  if (scopeSet.has('all')) return true;
  return scopeSet.has(type);
}

function getPack(tags) {
  if (!Array.isArray(tags)) return null;
  return tags.find((tag) => tag.startsWith('pack:')) || null;
}

function getReadAnyOf(pack) {
  if (pack === 'pack:Core') return ['public'];
  if (pack === 'pack:Free') return ['authenticated'];
  if (pack === 'pack:Premium') return ['pack:Premium', 'role:admin'];
  return null;
}

function buildAccessPolicy(pack, existing) {
  const readAnyOf = getReadAnyOf(pack);
  if (!readAnyOf) return null;
  const visibility = readAnyOf.includes('public') ? 'public' : (existing?.visibility || 'org');
  const actions = {
    ...DEFAULT_ACTIONS,
    ...(existing?.actions || {}),
    read: { anyOf: readAnyOf },
  };
  return { visibility, actions };
}

function policiesEqual(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

async function main() {
  log('Starting access policy update by pack');
  log(`Target: ${OBJECT_SERVICE_URL}`);
  log(`Auth: ${OBJECT_SERVICE_API_KEY ? 'API key configured' : 'No API key (set OBJECT_SERVICE_API_KEY)'}`);
  log(`Dry run: ${DRY_RUN}`);
  log(`Scope: ${Array.from(scopeSet).join(', ')}`);

  if (!DRY_RUN && !OBJECT_SERVICE_API_KEY) {
    throw new Error('OBJECT_SERVICE_API_KEY is required (or run with --dry-run)');
  }

  const resources = await listResources();
  const stats = { updated: 0, skipped: 0, errors: 0 };

  for (const resource of resources) {
    if (!shouldHandle(resource.type)) continue;

    const pack = getPack(resource.tags);
    if (!pack) {
      stats.skipped += 1;
      continue;
    }

    const nextPolicy = buildAccessPolicy(pack, resource.accessPolicy);
    if (!nextPolicy) {
      stats.skipped += 1;
      continue;
    }

    if (policiesEqual(resource.accessPolicy, nextPolicy)) {
      stats.skipped += 1;
      continue;
    }

    try {
      log(`Updating accessPolicy for ${resource.key}: ${pack}`);
      await patchResource(resource.id, { accessPolicy: nextPolicy });
      stats.updated += 1;
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    } catch (err) {
      stats.errors += 1;
      log(`Access policy update failed ${resource.key}: ${err.message || err}`);
    }
  }

  log('Access policy update complete');
  log(`Updated: ${stats.updated}`);
  log(`Skipped: ${stats.skipped}`);
  log(`Errors: ${stats.errors}`);
}

main().catch((err) => {
  console.error(`[registry-access] Fatal: ${err.message || err}`);
  process.exit(1);
});
