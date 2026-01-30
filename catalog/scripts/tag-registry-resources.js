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
const SCOPE = (getArgValue('--scope') || 'all').toLowerCase();

const PACKS = {
  core: new Set([
    'control',
    'logic',
    'math',
    'string',
    'data',
    'util',
    'time',
    'stats',
    'color',
    'complex',
    'geometry',
    'linear',
    'func',
    'observability',
  ]),
  free: new Set([
    'io',
    'http',
    'state',
    'workflow',
    'reliability',
    'security',
    'hil',
    'tools',
  ]),
  premium: new Set([
    'ai',
    'agents',
    'datasci',
    'iot',
    'industrial',
    'building',
  ]),
};

const GROUPS = {
  build: new Set([
    'audio',
    'control',
    'logic',
    'math',
    'parse',
    'string',
    'data',
    'util',
    'time',
    'stats',
    'validate',
    'color',
    'complex',
    'geometry',
    'linear',
    'func',
  ]),
  integrate: new Set([
    'io',
    'http',
    'net',
    'object',
    'tools',
    'iot',
    'industrial',
    'building',
  ]),
  operate: new Set([
    'observability',
    'reliability',
    'security',
    'crypto',
    'secrets',
    'hil',
    'state',
    'workflow',
  ]),
  intelligence: new Set([
    'ai',
    'agents',
    'datasci',
  ]),
};

const CONTEXT_PACKS = {
  core: new Set([
    'architecture',
    'identity',
    'persona',
    'domain',
    'use_case',
    'mission',
    'workspace',
  ]),
  free: new Set([
    'industry',
    'runtime',
    'security',
    'integrations',
  ]),
  premium: new Set([
    'ai',
  ]),
};

const CONTEXT_GROUPS = {
  build: new Set([
    'persona',
    'domain',
    'use_case',
    'mission',
    'workspace',
  ]),
  integrate: new Set([
    'integrations',
  ]),
  operate: new Set([
    'architecture',
    'identity',
    'security',
    'runtime',
    'industry',
  ]),
  intelligence: new Set([
    'ai',
  ]),
};

function log(message, ...args) {
  console.log(`[registry-tags] ${message}`, ...args);
}

function verbose(message, ...args) {
  if (VERBOSE) console.log(`[registry-tags:debug] ${message}`, ...args);
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

async function patchExecutor(id, payload) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would patch executor ${id}:`, payload);
    return;
  }
  await fetchJson(`${OBJECT_SERVICE_URL}/executors/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

function replaceTagPrefix(tags, prefix, value) {
  const next = Array.isArray(tags) ? tags.filter((tag) => !tag.startsWith(prefix)) : [];
  if (value) next.push(value);
  return next;
}

function choosePack(category, packMap) {
  if (packMap.premium.has(category)) return 'pack:Premium';
  if (packMap.core.has(category)) return 'pack:Core';
  if (packMap.free.has(category)) return 'pack:Free';
  return 'pack:Free';
}

function chooseGroup(category, groupMap) {
  if (groupMap.intelligence.has(category)) return 'group:intelligence';
  if (groupMap.integrate.has(category)) return 'group:integrate';
  if (groupMap.operate.has(category)) return 'group:operate';
  if (groupMap.build.has(category)) return 'group:build';
  return null;
}

function classifyComponentKey(key) {
  if (!key) return { pack: null, group: null };
  const category = key.split('/')[0];
  const pack = choosePack(category, PACKS);
  const group = chooseGroup(category, GROUPS);
  return { pack, group };
}

function classifyContextKey(key) {
  if (!key) return { pack: null, group: null };
  const parts = key.split('/');
  const kind = parts.length > 1 ? parts[1] : null;
  if (!kind) return { pack: null, group: null };
  const pack = choosePack(kind, CONTEXT_PACKS);
  const group = chooseGroup(kind, CONTEXT_GROUPS);
  return { pack, group };
}

function classifyGraphKey(_key) {
  return { pack: 'pack:Free', group: 'group:integrate' };
}

function shouldHandle(type) {
  if (SCOPE === 'all') return true;
  return type === SCOPE;
}

async function main() {
  log('Starting registry tag update');
  log(`Target: ${OBJECT_SERVICE_URL}`);
  log(`Auth: ${OBJECT_SERVICE_API_KEY ? 'API key configured' : 'No API key (set OBJECT_SERVICE_API_KEY)'}`);
  log(`Dry run: ${DRY_RUN}`);
  log(`Scope: ${SCOPE}`);

  if (!DRY_RUN && !OBJECT_SERVICE_API_KEY) {
    throw new Error('OBJECT_SERVICE_API_KEY is required (or run with --dry-run)');
  }

  const resources = await listResources();
  const stats = { updated: 0, skipped: 0, errors: 0 };

  for (const resource of resources) {
    if (!shouldHandle(resource.type)) continue;

    let classification = { pack: null, group: null };
    if (resource.type === 'component') {
      classification = classifyComponentKey(resource.key);
    } else if (resource.type === 'context') {
      classification = classifyContextKey(resource.key);
    } else if (resource.type === 'graph') {
      classification = classifyGraphKey(resource.key);
    } else if (resource.type === 'executor') {
      const componentKey = resource?.metadata?.componentKey || resource.key?.replace(/^executor\//, '');
      classification = classifyComponentKey(componentKey);
    } else {
      stats.skipped += 1;
      continue;
    }

    const currentTags = resource.tags || [];
    let nextTags = replaceTagPrefix(currentTags, 'pack:', classification.pack);
    nextTags = replaceTagPrefix(nextTags, 'group:', classification.group);

    const changed = nextTags.length !== currentTags.length || nextTags.some((tag, idx) => tag !== currentTags[idx]);
    if (!changed) {
      stats.skipped += 1;
      continue;
    }

    try {
      log(`Updating tags for ${resource.key}: ${classification.pack}, ${classification.group}`);
      if (resource.type === 'executor') {
        await patchExecutor(resource.id, { tags: nextTags });
      } else {
        await patchResource(resource.id, { tags: nextTags });
      }
      stats.updated += 1;
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    } catch (err) {
      stats.errors += 1;
      log(`Tag update failed ${resource.key}: ${err.message || err}`);
    }
  }

  log('Registry tag update complete');
  log(`Updated: ${stats.updated}`);
  log(`Skipped: ${stats.skipped}`);
  log(`Errors: ${stats.errors}`);
}

main().catch((err) => {
  console.error(`[registry-tags] Fatal: ${err.message || err}`);
  process.exit(1);
});
