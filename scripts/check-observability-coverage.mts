#!/usr/bin/env node
/**
 * Which services are actually observable?
 *
 * The Service Observation dashboard reads mesh events and filters them by
 * source, so a service with no `obs.http.*` events on the bus has an empty
 * dashboard no matter how healthy it is. This asks the platform directly:
 * generate a little traffic against every service, then count the events the
 * mesh recorded, by source.
 *
 * It reports counts. It does not decide what "enough" is — a service that
 * legitimately received no traffic and a service whose relay is dead both show
 * zero, and telling them apart is why this generates the traffic itself.
 *
 *   npx tsx scripts/check-observability-coverage.ts
 */
import { ServiceId, ServicePorts } from '@symbia/sys';

const IDENTITY = 'http://localhost:5001';
const NETWORK = 'http://localhost:5009';

/**
 * A path on each service that is NOT excluded from observability.
 *
 * /health and /health/* are deliberately excluded by the middleware, so
 * probing those would produce zero events from a perfectly working relay and
 * look exactly like a broken one.
 */
const PROBE_PATH: Partial<Record<ServiceId, string>> = {
  [ServiceId.IDENTITY]: '/api/auth/me',
  [ServiceId.LOGGING]: '/api/logs/streams',
  [ServiceId.CATALOG]: '/api/resources?limit=1',
  [ServiceId.ASSISTANTS]: '/api/assistants',
  [ServiceId.MESSAGING]: '/api/conversations',
  [ServiceId.RUNTIME]: '/api/components',
  [ServiceId.INTEGRATIONS]: '/api/integrations/status',
  [ServiceId.MODELS]: '/api/vision/status',
  [ServiceId.NETWORK]: '/api/sdn/topology',
};

const token = await fetch(`${IDENTITY}/api/auth/me`)
  .then((r) => r.json())
  .then((d) => d.token as string | undefined)
  .catch(() => undefined);

const auth = token ? { Authorization: `Bearer ${token}` } : {};

// 1. Generate traffic so a zero means "relay is not delivering" rather than
//    "nobody called this service".
const probed: string[] = [];
for (const [id, path] of Object.entries(PROBE_PATH) as [ServiceId, string][]) {
  const port = ServicePorts[id];
  for (let i = 0; i < 3; i++) {
    await fetch(`http://localhost:${port}${path}`, { headers: auth }).catch(() => undefined);
  }
  probed.push(id);
}

// Events are routed and recorded asynchronously.
await new Promise((r) => setTimeout(r, 3000));

// 2. Count what the mesh recorded, by source.
const res = await fetch(`${NETWORK}/api/events?limit=3000`, { headers: auth });
if (!res.ok) {
  console.log(`Could not read events: ${res.status}. Nothing measured.`);
  process.exit(1);
}
const body = (await res.json()) as { events?: { event?: { wrapper?: { source?: string }; payload?: { type?: string } } }[] };
const events = body.events ?? [];

const bySource = new Map<string, number>();
for (const e of events) {
  const type = e.event?.payload?.type ?? '';
  if (!type.startsWith('obs.http')) continue;
  const src = e.event?.wrapper?.source ?? '(none)';
  bySource.set(src, (bySource.get(src) ?? 0) + 1);
}

console.log(`\nProbed ${probed.length} services, read ${events.length} recent mesh events.\n`);
console.log('obs.http.* events by source:');

let silent = 0;
for (const id of probed) {
  const n = bySource.get(id) ?? 0;
  if (n === 0) silent++;
  console.log(`  ${n === 0 ? 'SILENT ' : 'ok     '} ${id.padEnd(14)} ${n}`);
}

// Sources that are not services we probed — the control center proxy, clients.
for (const [src, n] of bySource) {
  if (!probed.includes(src)) console.log(`  (other) ${src.padEnd(14)} ${n}`);
}

console.log(`\n${probed.length - silent}/${probed.length} probed services appear on the bus.`);
console.log(
  'NOTE: a source missing here means its dashboard is empty. It does NOT say\n' +
    'why — a dead relay, an excluded path, and a service that rejected the\n' +
    'probe all look the same from here.'
);
process.exit(silent === 0 ? 0 : 1);
