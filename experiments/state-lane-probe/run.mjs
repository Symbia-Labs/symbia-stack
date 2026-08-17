#!/usr/bin/env node
/**
 * D14 measurement: do stateful components launder lanes?
 *
 * Predictions are in docs/2026-08-14-state-lane-laundering-predictions.md and
 * were committed at e484adf BEFORE this ran. This file contains no expected
 * values, so it cannot quietly agree with itself.
 *
 * Same construction and caveats as experiments/lane-probe/run.mjs: ad-hoc graph
 * load, dev token from identity under DEV_NO_AUTH, nothing registered as a
 * platform capability.
 *
 * Usage: node experiments/state-lane-probe/run.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = (process.env.RUNTIME_ENDPOINT || 'http://localhost:5006').replace(/\/$/, '');
const IDENTITY = (process.env.IDENTITY_ENDPOINT || 'http://localhost:5001').replace(/\/$/, '');

let TOKEN = null;

async function devToken() {
  const res = await fetch(`${IDENTITY}/api/auth/me`);
  if (!res.ok) throw new Error(`identity /api/auth/me -> ${res.status}`);
  const body = await res.json();
  if (!body.token) throw new Error('identity returned no token; DEV_NO_AUTH probably off');
  return { token: body.token, issuedBy: body.tokenIssuedBy, as: body.user?.email };
}

async function call(method, url, body) {
  const res = await fetch(`${RUNTIME}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

function report(outputs) {
  const rows = [];
  for (const [node, fv] of Object.entries(outputs ?? {})) {
    const isFlow = fv && typeof fv === 'object' && 'lane' in fv;
    rows.push({
      node,
      lane: isFlow ? fv.lane : '(no lane in output)',
      value: isFlow ? fv.value : fv,
    });
  }
  return rows;
}

const def = JSON.parse(fs.readFileSync(path.join(here, 'state-lane.graph.json'), 'utf8'));

console.log('# D14 state lane-laundering measurement');
console.log(`# runtime: ${RUNTIME}`);
console.log(`# utc: ${new Date().toISOString()}`);

const auth = await devToken();
TOKEN = auth.token;
console.log(`# auth: ${auth.issuedBy} as ${auth.as}\n`);

const load = await call('POST', '/api/graphs', def);
console.log(`load -> ${load.status}`);
if (load.status >= 400) { console.log(JSON.stringify(load.body)); process.exit(1); }

const graphId = load.body.id ?? load.body.graphId;
const exec = await call('POST', `/api/graphs/${graphId}/execute`);
console.log(`exec -> ${exec.status}\n`);
if (exec.status >= 400) { console.log(JSON.stringify(exec.body)); process.exit(1); }

// Delivery 1 — the apoc path. The rollup expects p and q, gets only p, and so
// emits apocryphal. That apocryphal value enters the shared window and latest.
const d1 = await call('POST', '/api/ingress/state-lane-probe',
  { route: 'apoc', key: 'p', value: 1 });
console.log('— delivery 1: route=apoc {key:"p",value:1} — rollup incomplete —');
console.log(`  http ${d1.status}, hops ${d1.body?.hops}`);
console.log(`${JSON.stringify(report(d1.body?.outputs), null, 2)}\n`);

// Delivery 2 — the canon path. A plain canonical delivery into the SAME window
// and latest, which already hold a value that arrived apocryphal.
const d2 = await call('POST', '/api/ingress/state-lane-probe',
  { route: 'canon', key: 'fresh', value: 2 });
console.log('— delivery 2: route=canon {key:"fresh",value:2} — same window/latest —');
console.log(`  http ${d2.status}, hops ${d2.body?.hops}`);
console.log(`${JSON.stringify(report(d2.body?.outputs), null, 2)}\n`);

console.log('# P2: does win emit count:2 on the canonical lane, over a value');
console.log('#     that entered apocryphal? P3: same question for lat snapshot.');
