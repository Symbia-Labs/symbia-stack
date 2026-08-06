/**
 * Component Registry
 *
 * The thing whose absence made the executor pointless: `grep -c
 * registerComponent` against the shipped bundle returned 0, and
 * GET /api/components 404'd while the service's own docs advertised it. A
 * completed executor with no components would still have had nothing to run.
 *
 * A component is a black box with typed ports. It receives a message and
 * returns a map of {port -> value}. ONLY the ports it emits fire their
 * outgoing edges — that is what gives Symbia Script real branching rather
 * than straight-line flow.
 *
 * Lanes (from symbia-seed axioms.md): every value carries `canonical` or
 * `apocryphal`. Lanes only ever TIGHTEN as data flows — one apocryphal hop
 * marks everything downstream. Promotion back to canonical is not a flow
 * operation; it is a recorded uplift decision made elsewhere. Enforcing this
 * in the message type rather than by convention is deliberate: in the
 * reference implementation, flags left to author discipline were dropped at
 * two separate nodes, while the lane rule never once broke.
 */

export type Lane = 'canonical' | 'apocryphal';

export interface FlowValue {
  value: unknown;
  lane: Lane;
}

export interface ComponentContext {
  nodeId: string;
  config: Record<string, unknown>;
  log: (msg: string) => void;
}

/** A component returns the ports it wishes to emit on. */
export type ComponentHandler = (
  input: FlowValue,
  ctx: ComponentContext
) => Promise<Record<string, FlowValue | unknown>> | Record<string, FlowValue | unknown>;

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  /** Marks a component whose output cannot be verified by recomputation. */
  emitsApocryphal?: boolean;
  /** Declarative metadata for components registered via POST /api/components. */
  meta?: Record<string, unknown>;
  handler: ComponentHandler;
}

const registry = new Map<string, ComponentDefinition>();

export function registerComponent(def: ComponentDefinition): void {
  registry.set(def.id, def);
}

export function getComponent(id: string): ComponentDefinition | undefined {
  return registry.get(id);
}

export function listComponents(): Omit<ComponentDefinition, 'handler'>[] {
  return Array.from(registry.values()).map(({ handler: _h, ...rest }) => rest);
}

/** Normalise a handler's return into FlowValues, tightening the lane. */
export function normaliseEmission(
  emitted: Record<string, FlowValue | unknown>,
  incoming: FlowValue,
  forceApocryphal = false
): Record<string, FlowValue> {
  const out: Record<string, FlowValue> = {};
  for (const [port, raw] of Object.entries(emitted ?? {})) {
    const isFlow =
      raw && typeof raw === 'object' && 'value' in (raw as object) && 'lane' in (raw as object);
    const candidate: FlowValue = isFlow
      ? (raw as FlowValue)
      : { value: raw, lane: incoming.lane };
    // Lanes only tighten. Never widen back to canonical.
    const lane: Lane =
      incoming.lane === 'apocryphal' || forceApocryphal || candidate.lane === 'apocryphal'
        ? 'apocryphal'
        : 'canonical';
    out[port] = { value: candidate.value, lane };
  }
  return out;
}

// ── built-in components ───────────────────────────────────────────────────

registerComponent({
  id: 'symbia.io.passthrough',
  name: 'Passthrough',
  description: 'Emits its input unchanged. Graph entry point.',
  inputs: ['in'],
  outputs: ['out'],
  handler: (input) => ({ out: input }),
});

registerComponent({
  id: 'symbia.io.collect',
  name: 'Collect',
  description: 'Terminal node. Collects results for the execution output.',
  inputs: ['in'],
  outputs: ['out'],
  handler: (input) => ({ out: input }),
});

registerComponent({
  id: 'symbia.io.log',
  name: 'Log',
  description: 'Writes the value to the execution log and passes it through.',
  inputs: ['in'],
  outputs: ['out'],
  handler: (input, ctx) => {
    ctx.log(`[${ctx.nodeId}] ${JSON.stringify(input.value).slice(0, 200)}`);
    return { out: input };
  },
});

registerComponent({
  id: 'symbia.transform.map',
  name: 'Map Fields',
  description:
    'Reshapes an object using config.mapping — {newKey: "sourceKey"}. Deterministic.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  handler: (input, ctx) => {
    const mapping = (ctx.config.mapping ?? {}) as Record<string, string>;
    const src = input.value as Record<string, unknown>;
    if (typeof src !== 'object' || src === null) {
      return { error: { value: { error: 'map expects an object' }, lane: 'apocryphal' as Lane } };
    }
    const out: Record<string, unknown> = {};
    for (const [to, from] of Object.entries(mapping)) out[to] = src[from];
    return { out: Object.keys(mapping).length ? out : src };
  },
});

registerComponent({
  id: 'symbia.logic.filter',
  name: 'Filter',
  description:
    'Routes on a predicate: config.field / config.op (eq,neq,gt,lt,contains,exists) / config.value.',
  inputs: ['in'],
  outputs: ['pass', 'fail'],
  handler: (input, ctx) => {
    const { field, op = 'exists', value } = ctx.config as {
      field?: string; op?: string; value?: unknown;
    };
    const src = input.value as Record<string, unknown>;
    const actual = field ? src?.[field] : src;
    let ok = false;
    switch (op) {
      case 'eq': ok = actual === value; break;
      case 'neq': ok = actual !== value; break;
      case 'gt': ok = Number(actual) > Number(value); break;
      case 'lt': ok = Number(actual) < Number(value); break;
      case 'contains': ok = String(actual ?? '').includes(String(value)); break;
      default: ok = actual !== undefined && actual !== null;
    }
    return ok ? { pass: input } : { fail: input };
  },
});

registerComponent({
  id: 'symbia.logic.switch',
  name: 'Switch',
  description:
    'Emits on the port named by config.field\'s value, if that port is listed in config.ports; otherwise "default".',
  inputs: ['in'],
  outputs: ['default'],
  handler: (input, ctx) => {
    const { field = 'type', ports = [] } = ctx.config as { field?: string; ports?: string[] };
    const src = input.value as Record<string, unknown>;
    const key = String(src?.[field] ?? '');
    return ports.includes(key) ? { [key]: input } : { default: input };
  },
});

registerComponent({
  id: 'symbia.compute.arithmetic',
  name: 'Arithmetic',
  description:
    'Exact arithmetic over config.expression with {placeholders} from the message. Canonical: recomputable.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  handler: (input, ctx) => {
    const expr = String(ctx.config.expression ?? '');
    const src = (input.value ?? {}) as Record<string, unknown>;
    const filled = expr.replace(/\{(\w+)\}/g, (_m, k) => String(Number(src[k] ?? 0)));
    if (!/^[\d\s+\-*/().]+$/.test(filled)) {
      return {
        error: {
          value: { error: 'expression refused: non-arithmetic characters', expression: filled },
          lane: 'apocryphal' as Lane,
        },
      };
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict";return (${filled})`)();
      return {
        out: {
          value: { result, method: 'arithmetic', expression: filled, exact: true },
          lane: 'canonical' as Lane,
        },
      };
    } catch (e) {
      return {
        error: { value: { error: (e as Error).message }, lane: 'apocryphal' as Lane },
      };
    }
  },
});

registerComponent({
  id: 'symbia.io.http-request',
  name: 'HTTP Request',
  description:
    'Fetches config.url. Output is apocryphal: a remote body cannot be recomputed from the graph.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  emitsApocryphal: true,
  handler: async (_input, ctx) => {
    const url = String(ctx.config.url ?? '');
    const method = String(ctx.config.method ?? 'GET');
    if (!url) return { error: { value: { error: 'no url configured' }, lane: 'apocryphal' as Lane } };
    try {
      const res = await fetch(url, { method, signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      return {
        out: { value: { status: res.status, body }, lane: 'apocryphal' as Lane },
      };
    } catch (e) {
      return { error: { value: { error: (e as Error).message }, lane: 'apocryphal' as Lane } };
    }
  },
});

registerComponent({
  id: 'symbia.io.delay',
  name: 'Delay',
  description: 'Waits config.ms milliseconds, then passes through.',
  inputs: ['in'],
  outputs: ['out'],
  handler: async (input, ctx) => {
    const ms = Math.min(Number(ctx.config.ms ?? 100), 5000);
    await new Promise((r) => setTimeout(r, ms));
    return { out: input };
  },
});
