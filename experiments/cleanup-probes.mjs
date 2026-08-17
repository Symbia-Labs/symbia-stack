#!/usr/bin/env node
/**
 * Remove the measurement probes from a running runtime.
 *
 * The probes in experiments/lane-probe and experiments/state-lane-probe are
 * loaded ad hoc (POST /api/graphs) and would clear on a restart anyway. Leaving
 * them running is untidy rather than harmful — but "it clears on restart" is
 * how a stack accumulates state nobody put there deliberately.
 *
 * Only touches graphs whose metadata role is "probe". Anything else is left
 * alone, deliberately: a cleanup script that can delete a real graph is a
 * worse problem than the mess it tidies.
 *
 * Usage: node experiments/cleanup-probes.mjs
 */
const RUNTIME = (process.env.RUNTIME_URL || 'http://localhost:5006').replace(/\/$/, '');
const IDENTITY = (process.env.IDENTITY_URL || 'http://localhost:5001').replace(/\/$/, '');

const me = await (await fetch(`${IDENTITY}/api/auth/me`)).json();
if (!me.token) throw new Error('no dev token; DEV_NO_AUTH probably off');
const headers = { authorization: `Bearer ${me.token}`, 'content-type': 'application/json' };

const graphs = (await (await fetch(`${RUNTIME}/api/graphs`, { headers })).json()).graphs ?? [];
const probes = graphs.filter((g) => g.role === 'probe');

if (probes.length === 0) {
  console.log('no probe graphs loaded — nothing to do');
} else {
  console.log(`probe graphs: ${probes.map((g) => g.name).join(', ')}`);
}

const execBody = await (await fetch(`${RUNTIME}/api/executions`, { headers })).json();
const executions = execBody.executions ?? (Array.isArray(execBody) ? execBody : []);
const probeIds = new Set(probes.map((g) => g.id));

for (const e of executions) {
  if (!probeIds.has(e.graphId)) continue;
  const r = await fetch(`${RUNTIME}/api/executions/${e.id}/stop`, { method: 'POST', headers });
  console.log(`stop execution ${e.id} (${e.state}) -> ${r.status}`);
}

for (const g of probes) {
  const r = await fetch(`${RUNTIME}/api/graphs/${g.id}`, { method: 'DELETE', headers });
  console.log(`delete graph ${g.name} -> ${r.status}`);
}

const after = await (await fetch(`${RUNTIME}/api/graphs`, { headers })).json();
console.log(`\nloaded graphs: ${after.loadedGraphs}, active executions: ${after.activeExecutions}`);
