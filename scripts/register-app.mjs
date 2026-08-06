#!/usr/bin/env node
/**
 * Register an app manifest as a catalog resource.
 *
 * An app enters the platform the same way every other capability does: an
 * authenticated, gated, ledgered write. There is no file convention and no
 * directory that makes something an app — see docs/APP-MODEL.md.
 *
 * Usage:
 *   node scripts/register-app.mjs <app.json> [--org ORG_ID]
 *                                 [--status published] [--republish]
 *
 * --org records which org this INSTALLATION belongs to. The artifact itself
 * carries no org; baking one into a manifest is how an app stops being
 * portable. Passing it here is the installation step, not part of the app.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('-')) {
  console.error('usage: register-app.mjs <app.json> [--org ORG_ID] [--status published] [--republish]');
  process.exit(2);
}

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const file = path.resolve(args[0]);
const republish = args.includes('--republish');
const endpoint = (process.env.CATALOG_ENDPOINT || 'http://localhost:5003').replace(/\/$/, '');
const serviceToken = process.env.CATALOG_INTERNAL_SERVICE_TOKEN || 'internal';

const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!manifest.key || !manifest.version) {
  console.error(`${file}: not an app manifest (missing key/version)`);
  process.exit(1);
}

const status = flag('status', 'published');
const orgId = flag('org', undefined);

const headers = {
  'Content-Type': 'application/json',
  'X-Service-Auth': serviceToken,
};

async function api(method, urlPath, body) {
  const res = await fetch(`${endpoint}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} -> ${res.status}: ${parsed?.error ?? text}${
      parsed?.details ? '\n' + JSON.stringify(parsed.details, null, 2) : ''
    }`);
  }
  return parsed;
}

// Public read, gated write — an app's contract is what a prospective installer
// reads to decide whether their stack can run it. The gate belongs on
// registration, not on discovery.
const accessPolicy = {
  visibility: 'public',
  actions: {
    read: { anyOf: ['public'] },
    write: { anyOf: ['cap:registry.write', 'role:admin'] },
    publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
    delete: { anyOf: ['role:admin'] },
  },
};

const tags = [
  'app',
  ...(manifest.privilege?.crossAppRead || manifest.privilege?.crossOrgRead ? ['privileged'] : []),
  ...(manifest.surfaces?.ui ? ['ui'] : []),
];

const payload = {
  key: manifest.key,
  name: manifest.name ?? manifest.key,
  description: manifest.description,
  type: 'app',
  status,
  ...(orgId ? { orgId } : {}),
  tags,
  accessPolicy,
  metadata: { manifest },
};

// GET /api/resources returns a bare array; the MCP wrapper over the same
// endpoint returns {resources: [...]}. Accept both rather than assume.
const listed = await api('GET', '/api/resources?type=app&limit=200');
const existingResources = Array.isArray(listed) ? listed : listed?.resources ?? [];
const existing = existingResources.find((r) => r.key === manifest.key);

if (existing && !republish) {
  console.error(
    `An app is already registered under key "${manifest.key}" (id ${existing.id}). Re-run with --republish to update it.`
  );
  process.exit(1);
}

const result = existing
  ? await api('PATCH', `/api/resources/${existing.id}`, {
      name: payload.name,
      description: payload.description,
      status,
      ...(orgId ? { orgId } : {}),
      tags,
      accessPolicy,
      metadata: { manifest },
    })
  : await api('POST', '/api/resources', payload);

const p = manifest.privilege ?? {};
console.log(`${existing ? 'Updated' : 'Registered'} app "${manifest.name ?? manifest.key}"`);
console.log(`  key:        ${result.key}`);
console.log(`  id:         ${result.id}`);
console.log(`  version:    ${manifest.version}`);
console.log(`  status:     ${result.status}`);
console.log(`  requires:   platform ${manifest.requires?.platform ?? '(any)'}, ${
  (manifest.requires?.services ?? []).length
} service(s), ${(manifest.requires?.components ?? []).length} component(s)`);
console.log(`  provides:   ${(manifest.provides?.graphs ?? []).length} graph(s), ${
  (manifest.provides?.components ?? []).length
} component(s), ${(manifest.provides?.ingresses ?? []).length} ingress(es)`);
console.log(`  ui surface: ${manifest.surfaces?.ui ?? '(none)'}`);
if (p.crossAppRead || p.crossOrgRead) {
  console.log(`  PRIVILEGED: crossAppRead=${!!p.crossAppRead} crossOrgRead=${!!p.crossOrgRead}`);
  console.log(`              reason recorded in the registry, not assumed.`);
}
