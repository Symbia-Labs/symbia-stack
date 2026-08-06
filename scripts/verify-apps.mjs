#!/usr/bin/env node
/**
 * Reconcile every registered app against what the registry actually contains.
 *
 * An app manifest asserts two things that nothing previously checked: that the
 * resources it claims to provide exist, and that no app-layer resource entered
 * the platform outside an app. Both directions matter, and for the same reason
 * the API validation report checked advertised→implemented AND
 * implemented→advertised: one direction alone cannot tell an incomplete
 * install from a smaller app.
 *
 *   declared but not registered  -> an incomplete install
 *   registered but unclaimed     -> a resource that entered outside any app
 *
 * Exits non-zero when either is non-empty, so it can gate a build.
 *
 * Usage: node scripts/verify-apps.mjs [--json]
 */
const endpoint = (process.env.CATALOG_ENDPOINT || 'http://localhost:5003').replace(/\/$/, '');
const serviceToken = process.env.CATALOG_INTERNAL_SERVICE_TOKEN || 'internal';
const asJson = process.argv.includes('--json');

async function list(type) {
  const res = await fetch(`${endpoint}/api/resources?type=${type}&limit=500`, {
    headers: { 'X-Service-Auth': serviceToken },
  });
  if (!res.ok) throw new Error(`GET /api/resources?type=${type} -> ${res.status}`);
  const body = await res.json();
  // Bare array from REST; {resources:[…]} through the MCP wrapper.
  return Array.isArray(body) ? body : body?.resources ?? [];
}

const [apps, graphs, components, integrations] = await Promise.all([
  list('app'),
  list('graph'),
  list('component'),
  list('integration'),
]);

const manifestOf = (r) => (r.metadata ?? {})?.manifest ?? {};
const ownerOf = (r) => (r.metadata ?? {})?.app ?? null;

// Ingresses are integrations registered by the runtime under ingress/*.
const ingresses = integrations.filter((r) => r.key.startsWith('ingress/'));

// Components with implementation "builtin" are platform substrate. The platform
// is NOT an app (docs/APP-MODEL.md), so they are expected to have no owner and
// are excluded from the unclaimed check rather than reported forever.
const appLayerComponents = components.filter(
  (r) => manifestOf(r).implementation !== 'builtin'
);

const report = { apps: [], unclaimed: { graphs: [], components: [], ingresses: [] } };

for (const app of apps) {
  const m = manifestOf(app);
  const provides = m.provides ?? {};
  const entry = {
    key: app.key,
    version: m.version,
    declaredNotRegistered: [],
    claimedByThisApp: { graphs: [], components: [], ingresses: [] },
  };

  const graphNames = new Set(
    graphs.map((g) => (g.metadata ?? {})?.definition?.name).filter(Boolean)
  );
  for (const name of provides.graphs ?? []) {
    if (!graphNames.has(name)) entry.declaredNotRegistered.push(`graph:${name}`);
  }
  for (const name of provides.ingresses ?? []) {
    if (!ingresses.some((i) => i.key === `ingress/${name}`)) {
      entry.declaredNotRegistered.push(`ingress:${name}`);
    }
  }
  for (const key of provides.components ?? []) {
    if (!components.some((c) => manifestOf(c).key === key)) {
      entry.declaredNotRegistered.push(`component:${key}`);
    }
  }

  entry.claimedByThisApp.graphs = graphs.filter((g) => ownerOf(g) === app.key).map((g) => g.key);
  entry.claimedByThisApp.ingresses = ingresses.filter((i) => ownerOf(i) === app.key).map((i) => i.key);
  entry.claimedByThisApp.components = appLayerComponents
    .filter((c) => ownerOf(c) === app.key)
    .map((c) => c.key);

  report.apps.push(entry);
}

report.unclaimed.graphs = graphs.filter((g) => !ownerOf(g)).map((g) => g.key);
report.unclaimed.ingresses = ingresses.filter((i) => !ownerOf(i)).map((i) => i.key);
report.unclaimed.components = appLayerComponents.filter((c) => !ownerOf(c)).map((c) => c.key);

const declaredMissing = report.apps.reduce((n, a) => n + a.declaredNotRegistered.length, 0);
const unclaimedCount =
  report.unclaimed.graphs.length +
  report.unclaimed.components.length +
  report.unclaimed.ingresses.length;

if (asJson) {
  console.log(JSON.stringify({ ...report, declaredMissing, unclaimedCount }, null, 2));
} else {
  console.log(`Apps registered: ${report.apps.length}`);
  console.log(`Platform components (substrate, no owner expected): ${components.length - appLayerComponents.length}`);
  console.log('');
  for (const a of report.apps) {
    const c = a.claimedByThisApp;
    console.log(`${a.key}  v${a.version}`);
    console.log(`   claims: ${c.graphs.length} graph(s), ${c.ingresses.length} ingress(es), ${c.components.length} component(s)`);
    if (a.declaredNotRegistered.length > 0) {
      console.log(`   DECLARED BUT NOT REGISTERED (incomplete install):`);
      for (const d of a.declaredNotRegistered) console.log(`     - ${d}`);
    }
  }
  console.log('');
  if (unclaimedCount > 0) {
    console.log('REGISTERED BUT UNCLAIMED (entered outside any app):');
    for (const g of report.unclaimed.graphs) console.log(`  graph      ${g}`);
    for (const i of report.unclaimed.ingresses) console.log(`  ingress    ${i}`);
    for (const c of report.unclaimed.components) console.log(`  component  ${c}`);
  } else {
    console.log('No unclaimed app-layer resources.');
  }
  console.log('');
  console.log(`declared-but-missing: ${declaredMissing}   unclaimed: ${unclaimedCount}`);
}

process.exit(declaredMissing === 0 && unclaimedCount === 0 ? 0 : 1);
