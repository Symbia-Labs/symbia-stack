#!/usr/bin/env node
/**
 * Bus eligibility, run as a reader: can a component's fitness for a
 * deterministic substrate be read off its manifest alone?
 *
 * BEHAVIOURAL, AGAINST A RUNNING STACK. NOT GREP OVER SOURCE.
 *
 * Measures two predictions registered in docs/proposals/canonical-bus.md §10
 * at commit dd97113, before this script existed:
 *
 *   P1  Every current builtin can be classified bus-eligible or not from its
 *       manifest alone, with no appeal to its implementation.
 *   P5  The transition set of every existing graph is derivable statically and
 *       is smaller than the number of nodes.
 *
 * P1 is the one that matters. If the manifest cannot classify, the canonical
 * bus needs the import-set declaration the Component Model provides
 * (docs/proposals/wasm-runtime.md §4) and cannot be built on today's contract.
 * A failure here is evidence FOR that proposal, not against this one.
 *
 * Deliberately .mjs, not .mts: `npx tsx` does not run on a machine whose
 * node_modules was assembled on another platform, which is the state of this
 * working copy (see docs/2026-08-14-bus-eligibility-results.md §"tsx"). A
 * verification script that cannot be executed verifies nothing.
 *
 * The comparison is against SOURCE_TRUTH below — hand-declared, each entry
 * citing where it was read from. That table is the instrument, and an
 * instrument sharing the assumptions of what it measures is worthless (the ITT
 * suite, STATUS §11). So each entry records WHY a component is ineligible in
 * terms of observed behaviour, never in terms of what its manifest claims.
 *
 * Usage: node scripts/verify-bus-eligibility.mjs
 *        RUNTIME_URL / IDENTITY_URL to point elsewhere.
 */

const RUNTIME = (process.env.RUNTIME_URL || 'http://localhost:5006').replace(/\/$/, '');
const IDENTITY = (process.env.IDENTITY_URL || 'http://localhost:5001').replace(/\/$/, '');

/**
 * Why a component cannot run on a deterministic substrate, read from the
 * implementation. `why: null` means nothing disqualifying was found.
 *
 * The four kinds of ambient authority that break recomputation:
 *   state   the result depends on values from earlier deliveries
 *   clock   the result embeds wall-clock time
 *   io      the result depends on, or affects, something outside the graph
 *   timing  the result depends on elapsed real time
 */
const SOURCE_TRUTH = {
  'symbia.io.passthrough':     { why: null,     cite: 'components.ts — returns its input unchanged' },
  'symbia.io.collect':         { why: null,     cite: 'components.ts:183 — handler is (input) => ({ out: input })' },
  'symbia.transform.map':      { why: null,     cite: 'components.ts:220 — field renaming over the input object only' },
  'symbia.logic.filter':       { why: null,     cite: 'components.ts:259 — pure predicate over input.value' },
  'symbia.logic.switch':       { why: null,     cite: 'components.ts — emits on a port named by an input field' },
  'symbia.compute.arithmetic': { why: null,     cite: 'components.ts:372 — Function() fenced by /^[\\d\\s+\\-*/().]+$/, admits no identifiers' },

  'symbia.state.latest':       { why: 'state',  cite: 'components-state.ts:74 — state.set(key, input.value)' },
  'symbia.state.join':         { why: 'state',  cite: 'components-state.ts:128 — state.set(f, ...)' },
  'symbia.state.window':       { why: 'state',  cite: 'components-state.ts:182 — state.set("values", values)' },
  'symbia.state.rollup':       { why: 'state',  cite: 'components-state.ts:247 — state.set(key, v)' },

  'symbia.io.http-request':    { why: 'io',     cite: 'components.ts — safeFetch via @symbia/egress' },
  'symbia.sink.metric':        { why: 'io',     cite: 'components-sinks.ts — writes a point to the logging service' },
  'symbia.sink.log':           { why: 'io',     cite: 'components-sinks.ts — writes to the platform log store' },
  'symbia.io.log':             { why: 'io',     cite: 'components.ts — writes to the execution trace' },

  'symbia.source.timer':       { why: 'clock',  cite: 'graph-executor.ts:102 — payload carries ts: new Date().toISOString()' },
  'symbia.io.delay':           { why: 'timing', cite: 'components.ts — waits config.ms before emitting' },
};

/**
 * Classify from the manifest ALONE. No lookups by id — anything that needed
 * the id would be the instrument cheating.
 */
function classifyFromManifest(c) {
  if (c.emitsApocryphal === true) {
    return { eligible: false, basis: 'emitsApocryphal is set' };
  }
  const lanes = Object.entries(c.lanes ?? {});
  if (lanes.length === 0) {
    return { eligible: false, basis: 'no lanes declared — nothing to read' };
  }
  const conditional = lanes.filter(([, l]) => l.lane === 'conditional');
  if (conditional.length > 0) {
    return { eligible: false, basis: `conditional port(s): ${conditional.map(([p]) => p).join(', ')}` };
  }
  const apocNonError = lanes.filter(([p, l]) => l.lane === 'apocryphal' && p !== 'error');
  if (apocNonError.length > 0) {
    return { eligible: false, basis: `apocryphal non-error port(s): ${apocNonError.map(([p]) => p).join(', ')}` };
  }
  // What remains declares only inherit, canonical, or an apocryphal error port
  // — which is exactly what a pure component looks like from outside.
  return { eligible: true, basis: 'declares only inherit/canonical (+ apocryphal error)' };
}

async function devToken() {
  const res = await fetch(`${IDENTITY}/api/auth/me`);
  if (!res.ok) throw new Error(`identity /api/auth/me -> ${res.status}`);
  const body = await res.json();
  if (!body.token) throw new Error('identity returned no token; DEV_NO_AUTH probably off');
  return body.token;
}

const token = await devToken();
const headers = { authorization: `Bearer ${token}` };

const cRes = await fetch(`${RUNTIME}/api/components`, { headers });
if (!cRes.ok) throw new Error(`GET /api/components -> ${cRes.status}`);
const components = (await cRes.json()).components ?? [];

console.log('# Bus eligibility audit');
console.log(`# runtime: ${RUNTIME}`);
console.log(`# utc: ${new Date().toISOString()}`);
console.log(`# components registered: ${components.length}\n`);

console.log('## P1 — classifiable from the manifest alone?\n');

let agree = 0;
const disagreements = [];
const unknown = [];

for (const c of components) {
  const truth = SOURCE_TRUTH[c.id];
  if (!truth) { unknown.push(c.id); continue; }
  const truthEligible = truth.why === null;
  const guess = classifyFromManifest(c);
  if (guess.eligible === truthEligible) agree += 1;
  else {
    disagreements.push(
      `  ${c.id}\n` +
      `    manifest says : ${guess.eligible ? 'ELIGIBLE' : 'not eligible'} (${guess.basis})\n` +
      `    source says   : ${truthEligible ? 'eligible' : `NOT eligible — ${truth.why}`}\n` +
      `    cite          : ${truth.cite}`
    );
  }
}

const scored = components.length - unknown.length;
console.log(`agreement: ${agree}/${scored}`);
if (unknown.length) console.log(`unclassified (no source truth recorded): ${unknown.join(', ')}`);
console.log('');

if (disagreements.length === 0) {
  console.log('P1 HELD — the manifest classifies every component correctly.\n');
} else {
  console.log(`P1 BROKEN — ${disagreements.length} component(s) the manifest cannot classify:\n`);
  console.log(disagreements.join('\n\n'));
  console.log('');
}

console.log('## Ports declaring a lane the implementation cannot earn\n');

const suspect = [];
for (const c of components) {
  const truth = SOURCE_TRUTH[c.id];
  if (!truth || truth.why === null) continue;
  for (const [port, l] of Object.entries(c.lanes ?? {})) {
    if (l.lane === 'canonical') {
      suspect.push(`  ${c.id}.${port} — declares CANONICAL but is disqualified by ${truth.why}\n    ${truth.cite}`);
    } else if (l.lane === 'conditional') {
      suspect.push(`  ${c.id}.${port} — declares CONDITIONAL on a value the runtime cannot compute (${truth.why})\n    ${truth.cite}`);
    }
  }
}
console.log(suspect.length ? suspect.join('\n\n') : '  none');
console.log('');

console.log('## P5 — is a graph transition set derivable statically?\n');

// GET /api/graphs returns SUMMARIES — nodeCount, not nodes. An earlier version
// of this loop read `.nodes` off the summary, found nothing, and printed
// nothing, which reads identically to "no boundaries found". Blank must never
// be inferred as a pass, so each graph is now fetched in detail and a missing
// node array is reported loudly.
const gRes = await fetch(`${RUNTIME}/api/graphs`, { headers });
const summaries = gRes.ok ? ((await gRes.json()).graphs ?? []) : [];

if (summaries.length === 0) {
  console.log('  no graphs loaded — P5 UNMEASURED, neither held nor broken');
} else {
  for (const s of summaries) {
    const dRes = await fetch(`${RUNTIME}/api/graphs/${s.id}`, { headers });
    if (!dRes.ok) {
      console.log(`  ${s.name}: DETAIL FETCH FAILED (${dRes.status}) — not measured`);
      continue;
    }
    const detail = await dRes.json();
    const def = detail.definition ?? detail;
    const nodes = def.nodes ?? [];
    if (!nodes.length) {
      console.log(`  ${s.name}: NO NODE ARRAY in detail response — not measured, not zero`);
      continue;
    }
    const unmapped = nodes.filter((n) => n.component && !SOURCE_TRUTH[n.component]);
    const boundary = nodes.filter((n) => {
      const t = n.component ? SOURCE_TRUTH[n.component] : undefined;
      return t ? t.why !== null : false;
    });
    console.log(`  ${def.name}: ${boundary.length} boundary node(s) of ${nodes.length}`);
    for (const n of boundary) {
      console.log(`    ${n.id} (${n.component}) — ${SOURCE_TRUTH[n.component].why}`);
    }
    if (unmapped.length) {
      console.log(`    WARNING: ${unmapped.length} node(s) with no source truth: ${unmapped.map((n) => n.component).join(', ')}`);
    }
  }
}
console.log('');
console.log('# Report broken predictions as broken.');
