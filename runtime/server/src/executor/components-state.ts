/**
 * Stateful stream operators.
 *
 * The base components are stateless per-flow; these hold per-execution,
 * per-node state so derivations over a stream (join-latest, windows, rollups)
 * are expressible in-graph instead of in an external runner. State lives in
 * the executor process and is cleared when the execution stops — durability
 * across restarts is explicitly out of scope here.
 *
 * Honesty rule carried over from the energy derive work: an aggregate that
 * has not seen every expected input is emitted on the apocryphal lane — a
 * partial "total" must not masquerade as the total.
 */
import { registerComponent } from './components.js';

const store = new Map<string, Map<string, unknown>>();

function stateFor(executionId: string, nodeId: string): Map<string, unknown> {
  const key = `${executionId}:${nodeId}`;
  let m = store.get(key);
  if (!m) {
    m = new Map();
    store.set(key, m);
  }
  return m;
}

export function clearExecutionState(executionId: string): void {
  const prefix = `${executionId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function field(obj: unknown, name: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[name] : undefined;
}

registerComponent({
  id: 'symbia.state.latest',
  name: 'Latest By Key',
  description:
    'Remembers the most recent message per config.keyField (default "point") and passes the message through. The current snapshot {key: message} is available downstream via the "snapshot" port.',
  inputs: ['in'],
  outputs: ['out', 'snapshot'],
  handler: (input, ctx) => {
    const keyField = String(ctx.config.keyField ?? 'point');
    const key = field(input.value, keyField);
    const state = stateFor(ctx.executionId, ctx.nodeId);
    if (key !== undefined) state.set(String(key), input.value);
    return { out: input, snapshot: Object.fromEntries(state) };
  },
});

registerComponent({
  id: 'symbia.state.join',
  name: 'Join Latest',
  description:
    'Joins the latest values of selected keys from a keyed stream. config.select maps output fields to key values, e.g. {"facility_kw": "dc1.elec.utility.main.kw"}; config.keyField (default "point") and config.valueField (default "value") locate key and value in each message. Emits the joined object on "out" once every selected key has been seen (then on every update); until then emits {have, need} on "pending".',
  inputs: ['in'],
  outputs: ['out', 'pending'],
  handler: (input, ctx) => {
    const select = (ctx.config.select ?? {}) as Record<string, string>;
    const keyField = String(ctx.config.keyField ?? 'point');
    const valueField = String(ctx.config.valueField ?? 'value');
    const state = stateFor(ctx.executionId, ctx.nodeId);

    const key = field(input.value, keyField);
    const wantedFields = Object.entries(select)
      .filter(([, k]) => k === key)
      .map(([f]) => f);
    for (const f of wantedFields) state.set(f, field(input.value, valueField));

    const need = Object.keys(select);
    const missing = need.filter((f) => !state.has(f));
    if (missing.length > 0) {
      return { pending: { have: need.length - missing.length, need: need.length } };
    }
    if (wantedFields.length === 0) {
      // A non-selected key arrived after the join is complete: nothing changed.
      return {};
    }
    return { out: Object.fromEntries(need.map((f) => [f, state.get(f)])) };
  },
});

registerComponent({
  id: 'symbia.state.window',
  name: 'Rolling Window',
  description:
    'Keeps the last config.size (default 60) numeric values of config.field (default "value") and emits {count, sum, mean, min, max, last} on every input.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  handler: (input, ctx) => {
    const size = Math.max(1, Number(ctx.config.size ?? 60));
    const f = String(ctx.config.field ?? 'value');
    const v = Number(field(input.value, f));
    if (!Number.isFinite(v)) {
      return { error: { error: `field "${f}" is not numeric`, got: field(input.value, f) } };
    }
    const state = stateFor(ctx.executionId, ctx.nodeId);
    const values = (state.get('values') as number[] | undefined) ?? [];
    values.push(v);
    if (values.length > size) values.splice(0, values.length - size);
    state.set('values', values);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      out: {
        count: values.length,
        sum,
        mean: sum / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        last: v,
      },
    };
  },
});

registerComponent({
  id: 'symbia.state.rollup',
  name: 'Rollup Expected Set',
  description:
    'Aggregates the latest values of an expected key set (config.expected: [keys], config.op: sum|mean|min|max, keyField/valueField as in join). Emits {value, op, coverage, present, missing} on "out". A rollup with missing inputs is emitted on the apocryphal lane: a partial total must not pass as the total.',
  inputs: ['in'],
  outputs: ['out'],
  handler: (input, ctx) => {
    const expected = ((ctx.config.expected ?? []) as unknown[]).map(String);
    const op = String(ctx.config.op ?? 'sum');
    const keyField = String(ctx.config.keyField ?? 'point');
    const valueField = String(ctx.config.valueField ?? 'value');
    const state = stateFor(ctx.executionId, ctx.nodeId);

    const key = field(input.value, keyField);
    if (key !== undefined && expected.includes(String(key))) {
      const v = Number(field(input.value, valueField));
      if (Number.isFinite(v)) state.set(String(key), v);
    }

    const present = expected.filter((k) => state.has(k));
    const missing = expected.filter((k) => !state.has(k));
    const values = present.map((k) => state.get(k) as number);
    let value: number | null = null;
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      value =
        op === 'mean' ? sum / values.length :
        op === 'min' ? Math.min(...values) :
        op === 'max' ? Math.max(...values) : sum;
    }
    const payload = {
      value, op,
      coverage: expected.length === 0 ? 1 : present.length / expected.length,
      present: present.length,
      missing,
    };
    return missing.length > 0
      ? { out: { value: payload, lane: 'apocryphal' as const } }
      : { out: payload };
  },
});
