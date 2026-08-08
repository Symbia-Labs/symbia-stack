/**
 * Stateful stream operators.
 *
 * The base components are stateless per-flow; these hold per-node state so
 * derivations over a stream (join-latest, windows, rollups) are expressible
 * in-graph instead of in an external runner.
 *
 * State is keyed by the graph's stable identity, not by execution id
 * (roadmap Phase 3). Execution ids are minted fresh on every start, so the
 * previous keying made state unreachable across a restart by construction —
 * a rehydrated pipeline always began with an empty join. Keying by
 * (graphKey, nodeId) is what allows a restarted execution to resume.
 *
 * Honesty rule carried over from the energy derive work: an aggregate that
 * has not seen every expected input is emitted on the apocryphal lane — a
 * partial "total" must not masquerade as the total.
 */
import { registerComponent, type ComponentContext } from './components.js';
import { getStateStore } from './state-store.js';

/** A node's slice of the store, with the Map-ish surface the operators use. */
interface NodeStateView {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  entries(): [string, unknown][];
}

function stateFor(ctx: ComponentContext): NodeStateView {
  const store = getStateStore();
  // Ad hoc graphs (loaded by POST rather than hydrated) have no catalog key;
  // the graph name is a stable enough identity for them.
  const graphKey = ctx.graphKey ?? 'adhoc';
  const nodeId = ctx.nodeId;
  return {
    get: (key) => store.get(graphKey, nodeId, key),
    set: (key, value) => store.set(graphKey, nodeId, key, value),
    has: (key) => store.get(graphKey, nodeId, key) !== undefined,
    entries: () => store.entries(graphKey, nodeId),
  };
}

function field(obj: unknown, name: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[name] : undefined;
}

registerComponent({
  id: 'symbia.state.latest',
  name: 'Latest By Key',
  description:
    'Remembers the most recent message per config.keyField (default "key") and passes the message through. The current snapshot {key: message} is available downstream via the "snapshot" port.',
  inputs: ['in'],
  outputs: ['out', 'snapshot'],
  config: {
    keyField: {
      type: 'string',
      required: false,
      default: 'key',
      description:
        'Field locating the key in each message. A message without it is passed through and remembered under nothing.',
    },
  },
  lanes: {
    out: { lane: 'inherit' },
    snapshot: {
      lane: 'conditional',
      note: 'the snapshot is as canonical as the messages that built it; it carries no freshness guarantee and a key may be arbitrarily stale',
    },
  },
  handler: (input, ctx) => {
    const keyField = String(ctx.config.keyField ?? 'key');
    const key = field(input.value, keyField);
    const state = stateFor(ctx);
    if (key !== undefined) state.set(String(key), input.value);
    return { out: input, snapshot: Object.fromEntries(state.entries()) };
  },
});

registerComponent({
  id: 'symbia.state.join',
  name: 'Join Latest',
  description:
    // D10 removed a data centre's electrical point names from this contract and
    // put a stock ticker in their place (9f6afcc). That satisfies "remove
    // energy's vocabulary" and not the rule it was serving, which is that a
    // platform contract carries no domain's vocabulary at all. Swapping one
    // domain for another is the same defect wearing different words.
    'Joins the latest values of selected keys from a keyed stream. config.select maps output fields to key values, e.g. {"x": "key.one", "y": "key.two"}; config.keyField (default "key") and config.valueField (default "value") locate key and value in each message. Emits the joined object on "out" once every selected key has been seen (then on every update); until then emits {have, need} on "pending".',
  inputs: ['in'],
  outputs: ['out', 'pending'],
  config: {
    select: {
      type: 'object',
      required: true,
      description:
        'Output field to key value, e.g. {"x": "key.one"}. Keys of this object become the fields of the joined result; an empty select can never complete.',
    },
    keyField: {
      type: 'string',
      required: false,
      default: 'key',
      description: 'Field locating the key in each message.',
    },
    valueField: {
      type: 'string',
      required: false,
      default: 'value',
      description: 'Field locating the value in each message.',
    },
  },
  lanes: {
    out: { lane: 'inherit' },
    pending: {
      lane: 'apocryphal',
      note: '{have, need} is a statement about coverage, not a joined value — it must never be mistaken for the join',
    },
  },
  handler: (input, ctx) => {
    const select = (ctx.config.select ?? {}) as Record<string, string>;
    const keyField = String(ctx.config.keyField ?? 'key');
    const valueField = String(ctx.config.valueField ?? 'value');
    const state = stateFor(ctx);

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
  config: {
    size: {
      type: 'number',
      required: false,
      default: 60,
      description: 'How many values the window keeps. Floored at 1.',
    },
    field: {
      type: 'string',
      required: false,
      default: 'value',
      description: 'Field holding the numeric value. Non-numeric exits on "error".',
    },
  },
  lanes: {
    out: {
      lane: 'conditional',
      note: 'the aggregate is only as canonical as the values that entered the window, and a window that has not filled reports over fewer values without saying so — read "count" against "size"',
    },
    error: { lane: 'apocryphal' },
  },
  handler: (input, ctx) => {
    const size = Math.max(1, Number(ctx.config.size ?? 60));
    const f = String(ctx.config.field ?? 'value');
    const v = Number(field(input.value, f));
    if (!Number.isFinite(v)) {
      return { error: { error: `field "${f}" is not numeric`, got: field(input.value, f) } };
    }
    const state = stateFor(ctx);
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
    'Aggregates the latest values of an expected key set (config.expected: [keys], config.op: sum|mean|min|max, keyField (default "key") / valueField as in join). Emits {value, op, coverage, present, missing} on "out". A rollup with missing inputs is emitted on the apocryphal lane: a partial total must not pass as the total.',
  inputs: ['in'],
  outputs: ['out'],
  config: {
    expected: {
      type: 'array',
      required: true,
      description:
        'The key set that constitutes a complete rollup. This is what makes "missing" meaningful — without it, coverage is 1 by vacuous default and every partial total looks complete.',
    },
    op: {
      type: 'string',
      required: false,
      default: 'sum',
      enum: ['sum', 'mean', 'min', 'max'],
      description: 'Aggregation applied to the present values.',
    },
    keyField: {
      type: 'string',
      required: false,
      default: 'key',
      description: 'Field locating the key in each message.',
    },
    valueField: {
      type: 'string',
      required: false,
      default: 'value',
      description: 'Field locating the numeric value in each message.',
    },
  },
  lanes: {
    out: {
      lane: 'conditional',
      note: 'canonical only when missing is empty; a rollup with any expected key absent is emitted apocryphal, because a partial total must not pass as the total',
    },
  },
  handler: (input, ctx) => {
    const expected = ((ctx.config.expected ?? []) as unknown[]).map(String);
    const op = String(ctx.config.op ?? 'sum');
    const keyField = String(ctx.config.keyField ?? 'key');
    const valueField = String(ctx.config.valueField ?? 'value');
    const state = stateFor(ctx);

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
