#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OBJECT_SERVICE_URL = process.env.OBJECT_SERVICE_URL || 'https://symbia-object-service.replit.app/api';
const OBJECT_SERVICE_API_KEY = process.env.OBJECT_SERVICE_API_KEY;
const EXPORT_PATH = path.resolve(__dirname, '../components-export.json');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const VERBOSE = argv.includes('--verbose');

function getArgValue(flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  return argv[idx + 1] || null;
}

const START_INDEX = Math.max(0, Number.parseInt(getArgValue('--start') || '0', 10) || 0);
const LIMIT = Number.parseInt(getArgValue('--limit') || '0', 10) || 0;
const DELAY_MS = Math.max(0, Number.parseInt(getArgValue('--delay-ms') || '6500', 10) || 6500);
const COMPONENT_FILTER_RAW = getArgValue('--component');
const ARTIFACT_MIME_TYPE = getArgValue('--mime') || process.env.OBJECT_SERVICE_ARTIFACT_MIME || 'text/plain';
const COMPONENT_FILTER = COMPONENT_FILTER_RAW
  ? new Set(COMPONENT_FILTER_RAW.split(',').map((item) => item.trim()).filter(Boolean))
  : null;

function log(message, ...args) {
  console.log(`[executor-artifacts] ${message}`, ...args);
}

function verbose(message, ...args) {
  if (VERBOSE) console.log(`[executor-artifacts:debug] ${message}`, ...args);
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

function sanitizeExecutor(source) {
  let output = source;
  output = output.replace(/: number\[\]\[\]/g, '');
  output = output.replace(/: number\[\]/g, '');
  output = output.replace(/: any\[\]\[\]/g, '');
  output = output.replace(/: any\[\]/g, '');
  output = output.replace(/: string/g, '');
  output = output.replace(/: number/g, '');
  output = output.replace(/: boolean/g, '');
  output = output.replace(/: any/g, '');
  output = output.replace(/\s+as\s+keyof\s+Console/g, '');
  output = output.replace(/\s+as\s+any\[\]\[\]/g, '');
  output = output.replace(/\s+as\s+any\[\]/g, '');
  output = output.replace(/\s+as\s+string/g, '');
  output = output.replace(/\s+as\s+any/g, '');
  return {
    code: output,
    changed: output !== source,
  };
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
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

async function listExecutors() {
  return fetchJson(`${OBJECT_SERVICE_URL}/executors`, {
    headers: getAuthHeaders(),
  });
}

async function uploadArtifact(resourceId, executorCode) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would upload artifact for resource ${resourceId}`);
    return { id: 'dry-run-artifact' };
  }
  const content = Buffer.from(executorCode, 'utf8').toString('base64');
  const payload = {
    name: 'executor.js',
    type: ARTIFACT_MIME_TYPE,
    content,
  };
  return fetchJson(`${OBJECT_SERVICE_URL}/resources/${resourceId}/artifacts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

async function updateExecutorArtifact(executorId, artifactId) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would patch executor ${executorId} with artifact ${artifactId}`);
    return;
  }
  await fetchJson(`${OBJECT_SERVICE_URL}/executors/${executorId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ artifactRef: artifactId }),
  });
}

async function main() {
  log('Starting executor artifact attachment');
  log(`Target: ${OBJECT_SERVICE_URL}`);
  log(`Auth: ${OBJECT_SERVICE_API_KEY ? 'API key configured' : 'No API key (set OBJECT_SERVICE_API_KEY)'}`);
  log(`Dry run: ${DRY_RUN}`);
  log(`Artifact MIME: ${ARTIFACT_MIME_TYPE}`);

  if (!DRY_RUN && !OBJECT_SERVICE_API_KEY) {
    throw new Error('OBJECT_SERVICE_API_KEY is required (or run with --dry-run)');
  }
  if (!fs.existsSync(EXPORT_PATH)) {
    throw new Error(`components-export.json not found: ${EXPORT_PATH}`);
  }

  const data = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));
  let components = data.components || [];

  components = components
    .filter((comp) => !COMPONENT_FILTER || COMPONENT_FILTER.has(comp.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (START_INDEX) {
    components = components.slice(START_INDEX);
  }
  if (LIMIT) {
    components = components.slice(0, LIMIT);
  }

  log(`Components queued: ${components.length}`);

  const executors = await listExecutors();
  const executorByComponent = new Map();
  for (const executor of executors) {
    const componentKey = executor?.metadata?.componentKey;
    if (!componentKey) {
      verbose(`Skipping executor ${executor.key || executor.id} (missing componentKey)`);
      continue;
    }
    if (executorByComponent.has(componentKey)) {
      verbose(`Duplicate executor for component ${componentKey}; using first match`);
      continue;
    }
    executorByComponent.set(componentKey, executor);
  }

  const stats = {
    total: components.length,
    uploaded: 0,
    skipped: 0,
    missingExecutor: 0,
    missingResource: 0,
    sanitized: 0,
    errors: 0,
  };

  let index = 0;
  for (const component of components) {
    index += 1;
    const componentKey = component.id;
    const executorCode = component.executor;
    const executorResource = executorByComponent.get(componentKey);

    if (!executorCode) {
      stats.missingExecutor += 1;
      log(`[${index}/${stats.total}] ${componentKey}: missing executor source`);
      continue;
    }
    if (!executorResource) {
      stats.missingResource += 1;
      log(`[${index}/${stats.total}] ${componentKey}: missing executor resource`);
      continue;
    }
    const existingArtifact = executorResource?.metadata?.artifactRef;
    if (existingArtifact && !FORCE) {
      stats.skipped += 1;
      verbose(`[${index}/${stats.total}] ${componentKey}: artifact already set`);
      continue;
    }

    const sanitized = sanitizeExecutor(executorCode);
    if (sanitized.changed) stats.sanitized += 1;

    try {
      log(`[${index}/${stats.total}] ${componentKey}: uploading artifact`);
      const artifact = await uploadArtifact(executorResource.id, sanitized.code);
      await updateExecutorArtifact(executorResource.id, artifact.id);
      stats.uploaded += 1;
    } catch (err) {
      stats.errors += 1;
      log(`[${index}/${stats.total}] ${componentKey}: error ${err.message || err}`);
    }

    if (DELAY_MS > 0) {
      await sleep(DELAY_MS);
    }
  }

  log('Executor artifact attachment complete');
  log(`Uploaded: ${stats.uploaded}`);
  log(`Skipped (already set): ${stats.skipped}`);
  log(`Missing executor source: ${stats.missingExecutor}`);
  log(`Missing executor resource: ${stats.missingResource}`);
  log(`Sanitized sources: ${stats.sanitized}`);
  log(`Errors: ${stats.errors}`);
}

main().catch((err) => {
  console.error(`[executor-artifacts] Fatal: ${err.message || err}`);
  process.exit(1);
});
