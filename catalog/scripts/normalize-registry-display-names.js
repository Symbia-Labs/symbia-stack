#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OBJECT_SERVICE_URL = process.env.OBJECT_SERVICE_URL || 'https://symbia-object-service.replit.app/api';
const OBJECT_SERVICE_API_KEY = process.env.OBJECT_SERVICE_API_KEY;
const CONTEXT_DEFS_PATH = (() => {
  if (process.env.CONTEXT_DEFS_PATH) {
    return path.resolve(process.env.CONTEXT_DEFS_PATH);
  }
  const candidates = [
    path.resolve(__dirname, '../docs/context-definitions.normalized.json'),
    path.resolve(__dirname, '../../core/docs/context-definitions.normalized.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
})();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

function getArgValue(flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  return argv[idx + 1] || null;
}

function getArgValues(flag) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1]) {
      values.push(argv[i + 1]);
      i += 1;
    }
  }
  return values;
}

const DELAY_MS = Math.max(0, Number.parseInt(getArgValue('--delay-ms') || '2200', 10) || 2200);
const SCOPE = (getArgValue('--scope') || 'all').toLowerCase();
const EXECUTOR_TAGS = getArgValues('--executor-tag').filter(Boolean);
const DEFAULT_EXECUTOR_TAGS = ['runtime:node', 'env:server'];
const TARGET_EXECUTOR_TAGS = EXECUTOR_TAGS.length > 0 ? EXECUTOR_TAGS : DEFAULT_EXECUTOR_TAGS;

function log(message, ...args) {
  console.log(`[registry-names] ${message}`, ...args);
}

function verbose(message, ...args) {
  if (VERBOSE) console.log(`[registry-names:debug] ${message}`, ...args);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ACRONYMS = new Set([
  'AI',
  'API',
  'ASCII',
  'CPU',
  'CSV',
  'GCM',
  'GPU',
  'HMAC',
  'HTTP',
  'HTTPS',
  'IO',
  'IP',
  'JSON',
  'MCP',
  'MQTT',
  'RMS',
  'RTU',
  'S3',
  'SDO',
  'SQL',
  'TCP',
  'UDP',
  'URI',
  'URL',
  'UUID',
  'XML',
]);

function hasSplitAcronym(name) {
  return /(?:^|\s)(?:[A-Z]\s+){2,}[A-Z](?:\s|$)/.test(name.trim());
}

function hasSplitDigitToken(name) {
  return /\b\d\s+[A-Za-z]\b/.test(name);
}

function isPoorlyFormatted(name) {
  if (!name) return true;
  if (name === name.toLowerCase() && name.length > 1) return true;
  if (!name.includes(' ') && /[a-z][A-Z]/.test(name)) return true;
  if (!name.includes(' ') && /[A-Za-z][0-9]/.test(name)) return true;
  if (!name.includes(' ') && /[A-Z]/.test(name) && /[a-z]/.test(name)) return true;
  if (hasSplitAcronym(name)) return true;
  if (hasSplitDigitToken(name)) return true;
  return false;
}

function formatToken(word) {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  if (/^[A-Z0-9]+$/.test(word)) return word;
  if (/[A-Z][a-z]+[A-Z]/.test(word)) return word;
  return word[0].toUpperCase() + word.slice(1);
}

function titleize(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => formatToken(word))
    .join(' ')
    .trim();
}

function humanize(raw) {
  let value = raw.replace(/AESGCM/gi, 'AES GCM');
  value = value.replace(/[_-]+/g, ' ');
  value = value.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  value = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  value = value.replace(/([A-Za-z])([0-9])/g, '$1 $2');
  value = value.replace(/([0-9])([A-Za-z])/g, '$1 $2');
  value = value.replace(/\s+/g, ' ').trim();
  value = value.replace(/(\b\d)\s+([A-Za-z])\b/g, '$1$2');
  return value;
}

function deriveDisplayNameFromKey(key) {
  if (!key) return '';
  const parts = key.split('/');
  const nameRaw = parts[parts.length - 1] || '';
  const category = parts[0] || '';
  const prefix = parts.length > 2 ? parts[parts.length - 2] : null;

  let name = titleize(humanize(nameRaw));
  if (prefix && prefix !== category) {
    const match = new RegExp(`^${escapeRegExp(prefix)}`, 'i').exec(nameRaw);
    if (match) {
      const rawPrefix = nameRaw.slice(0, match[0].length);
      const remainder = nameRaw.slice(match[0].length);
      const remainderName = remainder ? titleize(humanize(remainder)) : '';
      name = [formatToken(rawPrefix), remainderName].filter(Boolean).join(' ').trim();
    } else {
      name = `${formatToken(prefix)} ${name}`.trim();
    }
  }
  return name;
}

function deriveContextDisplayName(context, definitionMap) {
  const fromDefs = definitionMap?.get(context.key);
  if (fromDefs) return fromDefs;
  const displayName = context?.metadata?.displayName;
  if (displayName) return displayName;
  if (!context?.key) return '';
  const parts = context.key.split('/');
  const nameRaw = parts[parts.length - 1] || '';
  return titleize(humanize(nameRaw));
}

function mergeTags(existing, additions) {
  const result = Array.isArray(existing) ? [...existing] : [];
  for (const tag of additions) {
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
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

function shouldUpdateContexts() {
  return SCOPE === 'all' || SCOPE === 'contexts';
}

function shouldUpdateComponents() {
  return SCOPE === 'all' || SCOPE === 'components';
}

function shouldUpdateExecutors() {
  return SCOPE === 'all' || SCOPE === 'executors';
}

async function main() {
  log('Starting registry display name normalization');
  log(`Target: ${OBJECT_SERVICE_URL}`);
  log(`Auth: ${OBJECT_SERVICE_API_KEY ? 'API key configured' : 'No API key (set OBJECT_SERVICE_API_KEY)'}`);
  log(`Dry run: ${DRY_RUN}`);
  log(`Scope: ${SCOPE}`);
  if (shouldUpdateExecutors()) {
    log(`Executor tags: ${TARGET_EXECUTOR_TAGS.join(', ') || '(none)'}`);
  }

  if (!DRY_RUN && !OBJECT_SERVICE_API_KEY) {
    throw new Error('OBJECT_SERVICE_API_KEY is required (or run with --dry-run)');
  }

  const resources = await listResources();
  const components = resources.filter((r) => r.type === 'component');
  const contexts = resources.filter((r) => r.type === 'context');
  const executors = resources.filter((r) => r.type === 'executor');

  const componentNames = new Map();
  for (const comp of components) {
    if (comp.key && comp.name) componentNames.set(comp.key, comp.name);
  }
  const contextDisplayNames = new Map();
  if (fs.existsSync(CONTEXT_DEFS_PATH)) {
    try {
      const defs = JSON.parse(fs.readFileSync(CONTEXT_DEFS_PATH, 'utf8'));
      const items = Array.isArray(defs.items) ? defs.items : [];
      for (const item of items) {
        if (!item?.kind || !item?.name || !item?.displayName) continue;
        const key = `context/${item.kind}/${item.name}`;
        contextDisplayNames.set(key, item.displayName);
      }
      log(`Loaded ${contextDisplayNames.size} context display names from definitions`);
    } catch (err) {
      log(`Warning: Failed to load context definitions: ${err.message || err}`);
    }
  } else {
    verbose(`Context definitions not found: ${CONTEXT_DEFS_PATH}`);
  }

  const stats = {
    componentUpdates: 0,
    contextUpdates: 0,
    executorUpdates: 0,
    skipped: 0,
    errors: 0,
  };

  if (shouldUpdateComponents()) {
    for (const comp of components) {
      const displayName = comp?.metadata?.displayName;
      const baseName = displayName && !isPoorlyFormatted(displayName)
        ? displayName
        : (comp.name && !isPoorlyFormatted(comp.name))
          ? comp.name
          : deriveDisplayNameFromKey(comp.key || '');
      const desiredName = baseName || comp.name;

      if (!desiredName || comp.name === desiredName) {
        stats.skipped += 1;
        continue;
      }

      try {
        log(`Updating component ${comp.key}: "${comp.name}" -> "${desiredName}"`);
        await patchResource(comp.id, { name: desiredName });
        stats.componentUpdates += 1;
        if (DELAY_MS > 0) await sleep(DELAY_MS);
      } catch (err) {
        stats.errors += 1;
        log(`Component update failed ${comp.key}: ${err.message || err}`);
      }
    }
  }

  if (shouldUpdateContexts()) {
    for (const context of contexts) {
      const desiredName = deriveContextDisplayName(context, contextDisplayNames);
      if (!desiredName) {
        verbose(`Skipping context ${context.key} (no display name)`);
        stats.skipped += 1;
        continue;
      }
      if (context.name === desiredName) {
        stats.skipped += 1;
        continue;
      }
      try {
        log(`Updating context ${context.key}: "${context.name}" -> "${desiredName}"`);
        await patchResource(context.id, { name: desiredName });
        stats.contextUpdates += 1;
        if (DELAY_MS > 0) await sleep(DELAY_MS);
      } catch (err) {
        stats.errors += 1;
        log(`Context update failed ${context.key}: ${err.message || err}`);
      }
    }
  }

  if (shouldUpdateExecutors()) {
    for (const executor of executors) {
      const componentKey = executor?.metadata?.componentKey || executor.key?.replace(/^executor\//, '');
      const componentName = componentKey ? componentNames.get(componentKey) : null;
      const baseName =
        componentName && !isPoorlyFormatted(componentName)
          ? componentName
          : deriveDisplayNameFromKey(componentKey || executor.key || '');
      const desiredName = baseName ? `${baseName} Executor` : executor.name;

      const mergedTags = mergeTags(executor.tags, TARGET_EXECUTOR_TAGS);
      const tagsChanged = (executor.tags || []).length !== mergedTags.length;
      const nameChanged = executor.name !== desiredName;

      if (!nameChanged && !tagsChanged) {
        stats.skipped += 1;
        continue;
      }

      try {
        log(`Updating executor ${executor.key}: "${executor.name}" -> "${desiredName}"`);
        await patchExecutor(executor.id, {
          ...(nameChanged ? { name: desiredName } : {}),
          ...(tagsChanged ? { tags: mergedTags } : {}),
        });
        stats.executorUpdates += 1;
        if (DELAY_MS > 0) await sleep(DELAY_MS);
      } catch (err) {
        stats.errors += 1;
        log(`Executor update failed ${executor.key}: ${err.message || err}`);
      }
    }
  }

  log('Registry display name normalization complete');
  log(`Components updated: ${stats.componentUpdates}`);
  log(`Contexts updated: ${stats.contextUpdates}`);
  log(`Executors updated: ${stats.executorUpdates}`);
  log(`Skipped: ${stats.skipped}`);
  log(`Errors: ${stats.errors}`);
}

main().catch((err) => {
  console.error(`[registry-names] Fatal: ${err.message || err}`);
  process.exit(1);
});
