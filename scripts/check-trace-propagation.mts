#!/usr/bin/env node
/**
 * Does a trace id survive a hop between services?
 *
 * The baseline this replaces: 1011 distinct trace ids in 2000 events, ZERO
 * appearing from more than one service. That is the number to beat, and a
 * single shared trace is the whole claim — the topology graph can draw an
 * observed edge or it cannot.
 *
 * This drives a request through the control center proxy (the edge, and the
 * hop the fetch wrapper cannot see) and then reads the mesh events back.
 *
 * It reports what it found. Whether the coverage is good enough is a judgement
 * about this stack's call patterns and belongs to the reader.
 */
const CONSOLE_URL = process.env.CONSOLE_URL || 'http://localhost:8000';
const NETWORK = process.env.NETWORK_URL || 'http://localhost:5009';
const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';

const token = await fetch(`${IDENTITY}/api/auth/me`)
  .then((r) => r.json())
  .then((d: { token?: string }) => d.token)
  .catch(() => undefined);
const auth = token ? { Authorization: `Bearer ${token}` } : {};

// Drive traffic through the proxy. /execute is the interesting one: the
// console calls integrations, which calls identity for a credential — two hops
// from one browser request, which is exactly the shape an edge needs.
const paths = [
  '/svc/integrations/api/integrations/capabilities',
  '/svc/integrations/api/integrations/status',
  '/svc/assistants/api/assistants',
  '/svc/catalog/api/resources?limit=1',
];
for (let i = 0; i < 4; i++) {
  await Promise.all(paths.map((p) => fetch(`${CONSOLE_URL}${p}`, { headers: auth }).catch(() => undefined)));
}

await new Promise((r) => setTimeout(r, 4000));

const res = await fetch(`${NETWORK}/api/events?limit=3000`, { headers: auth });
const body = (await res.json()) as {
  events?: { event?: { wrapper?: { source?: string }; payload?: { type?: string; data?: Record<string, unknown> } } }[];
};
const events = body.events ?? [];

const byTrace = new Map<string, Set<string>>();
const callers = new Map<string, number>();
let obsCount = 0;

for (const e of events) {
  const type = e.event?.payload?.type ?? '';
  if (!type.startsWith('obs.http')) continue;
  obsCount++;
  const source = e.event?.wrapper?.source ?? '?';
  const data = (e.event?.payload?.data ?? {}) as { traceId?: string; caller?: string };
  if (data.traceId) {
    const set = byTrace.get(data.traceId) ?? new Set<string>();
    set.add(source);
    byTrace.set(data.traceId, set);
  }
  if (data.caller) callers.set(`${data.caller} -> ${source}`, (callers.get(`${data.caller} -> ${source}`) ?? 0) + 1);
}

const multi = [...byTrace.entries()].filter(([, s]) => s.size > 1);

console.log(`\nobs.http events read: ${obsCount}`);
console.log(`distinct trace ids: ${byTrace.size}`);
console.log(`trace ids seen from MORE THAN ONE service: ${multi.length}   (baseline was 0)`);
for (const [t, s] of multi.slice(0, 5)) console.log(`   ${t}  ${[...s].sort().join(' , ')}`);

console.log(`\nobserved edges (caller -> handler):`);
if (callers.size === 0) {
  console.log('   none — no obs.http event carried a caller');
} else {
  for (const [edge, n] of [...callers.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${edge.padEnd(34)} ${n}`);
  }
}

console.log(
  `\nAn absent caller means one of two things and they are not the same: a\n` +
    `browser-originated request, or a call made outside any request's async\n` +
    `context (timer, interval, socket handler).`
);
process.exit(multi.length > 0 || callers.size > 0 ? 0 : 1);
