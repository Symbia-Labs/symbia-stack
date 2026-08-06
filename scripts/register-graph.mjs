#!/usr/bin/env node
/**
 * Register a graph definition as a catalog resource.
 *
 * This exists because "put the file somewhere the runtime can find it" is the
 * ungoverned path Phase 0/1 is closing. A graph enters the platform the same
 * way any other capability does: an authenticated, gated, ledgered write to
 * the catalog. The runtime then hydrates it on boot — nothing loads a graph by
 * reading the filesystem.
 *
 * Usage:
 *   node scripts/register-graph.mjs <graph.json> [--key K] [--role pipeline]
 *                                   [--status published] [--republish]
 *
 * Auth: uses X-Service-Auth, matching CATALOG_INTERNAL_SERVICE_TOKEN when set
 * (falls back to the literal 'internal' for local dev, as the catalog does).
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('-')) {
  console.error('usage: register-graph.mjs <graph.json> [--key K] [--role pipeline] [--status published] [--republish]');
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

const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
  console.error(`${file}: not a graph definition (missing nodes/edges)`);
  process.exit(1);
}

const key = flag('key', `graphs/${definition.name}`);
const status = flag('status', 'published');
// Role is what tells the runtime this graph should be *running*, not merely
// present. A graph with no role is hydrated and left loaded.
const role = flag('role', definition.metadata?.role);

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
    throw new Error(`${method} ${urlPath} -> ${res.status}: ${parsed?.error ?? text}`);
  }
  return parsed;
}

const metadata = {
  ...(definition.metadata ?? {}),
  ...(role ? { role } : {}),
  ingress: definition.metadata?.ingress,
  definition,
};

// Public read, gated write: the gate belongs on registration, not discovery.
// The catalog's default policy is private-read, which would make a registered
// graph invisible to every reader that had not already authenticated as a
// writer — including the runtime tooling meant to show what is registered.
const accessPolicy = {
  visibility: 'public',
  actions: {
    read: { anyOf: ['public'] },
    write: { anyOf: ['cap:registry.write', 'role:admin'] },
    publish: { anyOf: ['cap:registry.publish', 'role:publisher', 'role:admin'] },
    delete: { anyOf: ['role:admin'] },
  },
};

const payload = {
  key,
  name: definition.name,
  description: definition.description,
  type: 'graph',
  status,
  tags: ['graph', ...(role ? [role] : []), ...(definition.metadata?.domain ? [definition.metadata.domain] : [])],
  accessPolicy,
  metadata,
};

// GET /api/resources returns a bare array; the MCP wrapper over the same
// endpoint returns {resources: [...]}. Accept both rather than assume.
const existingList = await api('GET', `/api/resources?type=graph&limit=200`);
const existingResources = Array.isArray(existingList)
  ? existingList
  : existingList?.resources ?? [];
const existing = existingResources.find((r) => r.key === key);

if (existing && !republish) {
  console.error(
    `A graph is already registered under key "${key}" (id ${existing.id}). Re-run with --republish to update it.`
  );
  process.exit(1);
}

const result = existing
  ? await api('PATCH', `/api/resources/${existing.id}`, {
      name: payload.name,
      description: payload.description,
      status,
      tags: payload.tags,
      accessPolicy,
      metadata,
    })
  : await api('POST', '/api/resources', payload);

console.log(`${existing ? 'Updated' : 'Registered'} graph "${definition.name}"`);
console.log(`  key:       ${result.key}`);
console.log(`  id:        ${result.id}`);
console.log(`  status:    ${result.status}`);
console.log(`  role:      ${role ?? '(none — will be loaded but not started)'}`);
console.log(`  ingress:   ${definition.metadata?.ingress ? JSON.stringify(definition.metadata.ingress) : '(none)'}`);
console.log(`  nodes:     ${definition.nodes.length}, edges: ${definition.edges.length}`);
console.log('');
console.log('The runtime hydrates published graphs on boot and reconciles periodically.');
