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
import { createHash } from 'node:crypto';
import { preview } from './preview.js';
import { safeFetch } from '@symbia/egress';

export type Lane = 'canonical' | 'apocryphal';

/**
 * What a value ships alongside itself so a reader need not trust the runtime.
 *
 *   recipe   the operation and its resolved inputs, enough to compute the value
 *            again without this process. The receipt for a canonical value.
 *   witness  a digest of the bytes as they arrived, and where from. You cannot
 *            recompute a remote body; you can prove you received these bytes.
 *
 * A lane says what KIND of thing a value is. A receipt is the evidence for the
 * lane. Until this existed, `symbia.compute.arithmetic` shipped its expression
 * inside `value` because its author chose to, and nothing else shipped anything.
 */
export type ReceiptKind = 'recipe' | 'witness';

export interface Receipt {
  kind: ReceiptKind;
  /** What produced the value: a component id, a URL, a model identity. */
  source: string;
  /** Present when kind is 'recipe'. Enough to redo the work elsewhere. */
  recipe?: { operation: string; inputs: Record<string, unknown> };
  /** Present when kind is 'witness'. Enough to recognise the same bytes again. */
  witness?: { algorithm: string; digest: string; bytes?: number; transport?: string };
}

export interface FlowValue {
  value: unknown;
  lane: Lane;
  /** Evidence for the lane. Required for a declared-canonical port. */
  receipt?: Receipt;
  /**
   * Set by the executor when it assigned a lane the handler did not ask for.
   * A downgrade that says nothing is indistinguishable from a component that
   * was always apocryphal.
   */
  laneReason?: string;
}

export interface ComponentContext {
  nodeId: string;
  executionId: string;
  config: Record<string, unknown>;
  /**
   * Org that owns the graph this node belongs to. Sinks use it to attribute
   * what they persist, so a derived series lands where its owner can find it.
   */
  orgId?: string;
  /**
   * Stable identity of the graph (its catalog resource key). Stateful
   * operators key their state on it so state survives a restart — the
   * execution id cannot serve this purpose because it is regenerated on every
   * start.
   */
  graphKey?: string;
  log: (msg: string) => void;
}

/** A component returns the ports it wishes to emit on. */
export type ComponentHandler = (
  input: FlowValue,
  ctx: ComponentContext
) => Promise<Record<string, FlowValue | unknown>> | Record<string, FlowValue | unknown>;

/**
 * One configuration key, declared so it can be CHECKED rather than read.
 *
 * Every component's config was documented in its `description` string —
 * `config.keyField (default "key")`, `config.op: sum|mean|min|max`, and twelve
 * more. Prose is not a contract: nothing could validate a graph's node config
 * before running it, and a typo in `keyField` surfaced as a join that silently
 * never joined. The app manifest already had a typed `config` block; the
 * component manifest did not, and there was no reason for the asymmetry.
 */
export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  /** Allowed values, when the field is closed. */
  enum?: string[];
  description: string;
}

/**
 * Which lane a port emits on.
 *
 *   inherit     the value carries whatever lane arrived. Lanes only tighten,
 *               so this is the honest default for a pass-through.
 *   canonical   recomputable from the graph and its inputs.
 *   apocryphal  cannot be verified by recomputation.
 *   conditional decided by the data. `note` must say by what — an unexplained
 *               "it depends" is the thing this field exists to stop.
 */
export type PortLane = 'inherit' | 'canonical' | 'apocryphal' | 'conditional';

export interface PortLaneDeclaration {
  lane: PortLane;
  /** Required when lane is 'conditional'. */
  note?: string;
  /**
   * What this port must ship as evidence.
   *
   * OMISSION IS THE STRICT PATH. A port declared `canonical` requires a
   * `recipe` receipt unless it declares `receipt: 'none'` — and an opt-out
   * needs a `note`, so it is recorded in the public contract rather than
   * achieved by forgetting. A port that declares canonical and emits without
   * evidence is downgraded to apocryphal, and `laneReason` says so.
   *
   * The same shape as `symbia.state.rollup`: a partial total does not become
   * a refusal, it becomes apocryphal. No new failure path, one fewer claim.
   */
  receipt?: ReceiptKind | 'none';
}

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  /** Marks a component whose output cannot be verified by recomputation. */
  emitsApocryphal?: boolean;
  /**
   * Typed configuration contract, keyed by config key. Published in the
   * manifest, so a graph node can be validated against it at load time.
   */
  config?: Record<string, ConfigField>;
  /**
   * Lane emitted per output port, keyed by port name. Ports omitted here are
   * `inherit`.
   *
   * The runtime already knew this — `emitsApocryphal` is read by
   * `normaliseEmission` — but the catalog manifest, which is the PUBLIC
   * contract, carried the provenance lane only as a sentence in the
   * description. A consumer reading the contract could not tell a canonical
   * component from an apocryphal one without parsing English, which for a
   * platform whose central claim is provable provenance is the wrong thing to
   * leave in prose.
   */
  lanes?: Record<string, PortLaneDeclaration>;
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

/**
 * Normalise a handler's return into FlowValues, tightening the lane.
 *
 * WHY THIS TAKES THE COMPONENT. It used to take a boolean, so the per-port
 * `lanes` block — the thing published in the manifest as the public contract —
 * was never consulted here. Exactly one component set the boolean, and every
 * other declaration was enforced by its handler restating the lane by hand at
 * each return; `symbia.compute.arithmetic` does it five times. Measured 16 Aug
 * as D20: `symbia.state.aggregate`'s `pending` port declares apocryphal and
 * emitted canonical, because its handler returns a bare value and the
 * declaration reached nothing.
 *
 * The declaration is now the enforcement point. A handler may still tighten;
 * it can no longer widen, and it can no longer contradict its own manifest.
 */
export function normaliseEmission(
  emitted: Record<string, FlowValue | unknown>,
  incoming: FlowValue,
  component?: Pick<ComponentDefinition, 'id' | 'emitsApocryphal' | 'lanes'> | boolean
): Record<string, FlowValue> {
  // Callers predating the manifest passed a boolean. Kept so a component
  // registered through POST /api/components does not have to know about this.
  const legacyForce = component === true;
  const def = typeof component === 'object' ? component : undefined;
  const force = legacyForce || def?.emitsApocryphal === true;

  const out: Record<string, FlowValue> = {};
  for (const [port, raw] of Object.entries(emitted ?? {})) {
    const isFlow =
      raw && typeof raw === 'object' && 'value' in (raw as object) && 'lane' in (raw as object);
    const candidate: FlowValue = isFlow
      ? (raw as FlowValue)
      : { value: raw, lane: incoming.lane };

    const decl = def?.lanes?.[port];
    let lane: Lane =
      incoming.lane === 'apocryphal' || force || candidate.lane === 'apocryphal'
        ? 'apocryphal'
        : 'canonical';
    let laneReason: string | undefined;

    if (incoming.lane === 'apocryphal') {
      laneReason = 'the input arrived apocryphal; lanes only tighten';
    } else if (force) {
      laneReason = `${def?.id ?? 'this component'} declares that it cannot emit a recomputable value`;
    }

    // A declared apocryphal port is apocryphal whatever the handler returned.
    if (decl?.lane === 'apocryphal' && lane === 'canonical') {
      lane = 'apocryphal';
      laneReason = decl.note ?? `port "${port}" is declared apocryphal in the manifest`;
    }

    // NO RECEIPT, NO CANONICAL.
    const wants: ReceiptKind | 'none' | undefined =
      decl?.lane === 'canonical' ? (decl.receipt ?? 'recipe') : decl?.receipt;
    if (lane === 'canonical' && wants && wants !== 'none' && !candidate.receipt) {
      lane = 'apocryphal';
      laneReason =
        `port "${port}" is declared canonical and requires a ${wants} receipt; ` +
        `none was emitted, so the value is not verifiable by recomputation`;
    }

    out[port] = {
      value: candidate.value,
      lane,
      ...(candidate.receipt ? { receipt: candidate.receipt } : {}),
      ...(laneReason && lane !== candidate.lane ? { laneReason } : {}),
    };
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
  config: {},
  lanes: { out: { lane: 'inherit' } },
  handler: (input) => ({ out: input }),
});

registerComponent({
  id: 'symbia.io.collect',
  name: 'Collect',
  description: 'Terminal node. Collects results for the execution output.',
  inputs: ['in'],
  outputs: ['out'],
  config: {},
  lanes: { out: { lane: 'inherit' } },
  handler: (input) => ({ out: input }),
});

registerComponent({
  id: 'symbia.io.log',
  name: 'Log',
  description: 'Writes the value to the execution log and passes it through.',
  inputs: ['in'],
  outputs: ['out'],
  config: {},
  lanes: { out: { lane: 'inherit' } },
  handler: (input, ctx) => {
    ctx.log(`[${ctx.nodeId}] ${preview(input.value, 200)}`);
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
  config: {
    mapping: {
      type: 'object',
      required: false,
      default: {},
      description:
        'Output field to source field, {newKey: "sourceKey"}. Empty mapping passes the object through unchanged.',
    },
  },
  lanes: {
    out: { lane: 'inherit' },
    error: { lane: 'apocryphal', note: 'a refusal is not a recomputable value' },
  },
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
  config: {
    field: {
      type: 'string',
      required: false,
      description: 'Field to test. Omitted, the whole message value is tested.',
    },
    op: {
      type: 'string',
      required: false,
      default: 'exists',
      enum: ['eq', 'neq', 'gt', 'lt', 'contains', 'exists'],
      description: 'Comparison. Any unrecognised value falls through to "exists".',
    },
    value: {
      type: 'string',
      required: false,
      description: 'Value compared against. Unused by "exists".',
    },
  },
  lanes: { pass: { lane: 'inherit' }, fail: { lane: 'inherit' } },
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
  config: {
    field: {
      type: 'string',
      required: false,
      default: 'type',
      description: 'Field whose value names the output port.',
    },
    ports: {
      type: 'array',
      required: false,
      default: [],
      description:
        'Port names this switch may emit on. A value not listed here goes to "default" — the allowlist is what stops a message inventing a port.',
    },
  },
  lanes: { default: { lane: 'inherit' } },
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
  config: {
    expression: {
      type: 'string',
      required: true,
      description:
        // No domain vocabulary in a public contract. The first version of this
        // read `e.g. "{facility}/{it}"`, which is a data centre's language in
        // the manifest of a component that does arithmetic — the exact defect
        // the 6 Aug audit removed from symbia.state.join, reintroduced here on
        // 8 Aug and published to the catalog before anyone read it.
        'Arithmetic over {placeholders} resolved from fields of the incoming message, e.g. "({a} - {b}) / {a}". Only digits, whitespace and + - * / ( ) survive the guard.',
    },
  },
  lanes: {
    out: {
      lane: 'canonical',
      receipt: 'recipe',
      note: 'recomputable from the expression and its inputs, which the receipt carries',
    },
    error: { lane: 'apocryphal', note: 'a refusal is not a recomputable value' },
  },
  handler: (input, ctx) => {
    const expr = String(ctx.config.expression ?? '');
    const src = (input.value ?? {}) as Record<string, unknown>;

    // AN ABSENT INPUT IS NOT A ZERO.
    //
    // This read `Number(src[k] ?? 0)`, so a placeholder with no value became 0
    // BEFORE anything could object, and the result went out on the canonical
    // lane stamped `exact: true`. Measured 8 Aug 2026:
    //
    //   {facility}/{it}   numerator absent    -> 0/150  = 0         canonical
    //                     denominator absent  -> 210/0  = Infinity  canonical
    //   {a}+{b}+{c}       c absent            -> 5+5+0  = 10        canonical
    //
    // The last is a partial sum passing as the total, which is the rule
    // `symbia.state.rollup` exists to enforce and enforces correctly on the
    // apocryphal lane. Two components, one concern, opposite behaviour.
    //
    // A non-numeric STRING was already refused, because String(NaN) fails the
    // character guard below. Only absent and null slipped through, because
    // `undefined ?? 0` and `null ?? 0` are both 0 before the guard ever runs.
    // Absence is now detected first, and named.
    const referenced = [...expr.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const missing = referenced.filter((k) => src[k] === undefined || src[k] === null);
    if (missing.length > 0) {
      return {
        error: {
          value: {
            error: 'expression refused: inputs absent',
            missing,
            present: referenced.filter((k) => !missing.includes(k)),
            expression: expr,
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }

    const filled = expr.replace(/\{(\w+)\}/g, (_m, k) => String(Number(src[k])));
    if (!/^[\d\s+\-*/().]+$/.test(filled)) {
      // A REFUSAL SHOULD SAY WHAT IT ACCEPTS.
      //
      // This returned only 'non-arithmetic characters'. Measured 16 Aug: an
      // agent wrote `value.pages / value.hoursAvailable`, got that message,
      // and had no way to learn the {placeholder} form from it — the syntax
      // is declared in this component's own signed manifest, which the
      // error never mentioned. Naming the accepted form here turns three
      // steps into one.
      return {
        error: {
          value: {
            error: 'expression refused: non-arithmetic characters',
            expression: filled,
            afterSubstitution: filled !== expr ? `substituted from "${expr}"` : 'no placeholders were substituted',
            accepts:
              'Digits, whitespace and + - * / ( ) only, AFTER {placeholder} substitution. ' +
              'Reference message fields as {name}, e.g. "{pages} / {hoursAvailable}". ' +
              'Property paths like value.pages are not resolved and survive as letters, which is what this refusal is reporting.',
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict";return (${filled})`)();

      // INFINITY IS NOT A MEASUREMENT.
      //
      // Division by zero returned Infinity, and NaN returned NaN, both on the
      // canonical lane with `exact: true`. JSON.stringify then rendered either
      // as `null`, so a downstream reader saw a null it had no way to tell from
      // an absent field — a canonical, exact null.
      //
      // energy-pue's own description already claimed "division errors (e.g.
      // it_kw = 0) exit on the arithmetic error port". They did not. The graph
      // was right about what should happen and the component disagreed.
      if (!Number.isFinite(result)) {
        return {
          error: {
            value: {
              error: 'expression refused: result is not finite',
              result: String(result),
              expression: filled,
            },
            lane: 'apocryphal' as Lane,
          },
        };
      }

      // The recipe was already in `value` — `expression: filled` — because this
      // component's author put it there. Moving it into a receipt is what makes
      // it checkable by something that does not know what arithmetic is.
      return {
        out: {
          value: { result, method: 'arithmetic', expression: filled, exact: true },
          lane: 'canonical' as Lane,
          receipt: {
            kind: 'recipe',
            source: 'symbia.compute.arithmetic',
            recipe: {
              operation: expr,
              inputs: Object.fromEntries(referenced.map((k) => [k, src[k]])),
            },
          },
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
  config: {
    url: { type: 'string', required: true, description: 'Absolute URL to fetch.' },
    method: {
      type: 'string',
      required: false,
      default: 'GET',
      description: 'HTTP method.',
    },
  },
  lanes: {
    out: {
      lane: 'apocryphal',
      receipt: 'witness',
      note: 'a remote body cannot be recomputed from the graph; the witness records which bytes arrived, from where',
    },
    error: { lane: 'apocryphal' },
  },
  handler: async (_input, ctx) => {
    const url = String(ctx.config.url ?? '');
    const method = String(ctx.config.method ?? 'GET');
    if (!url) return { error: { value: { error: 'no url configured' }, lane: 'apocryphal' as Lane } };
    try {
      // R3: gate egress — config.url is graph-controlled; block SSRF to
      // loopback/private/link-local/metadata addresses.
      const res = await safeFetch(url, { method, signal: AbortSignal.timeout(10_000) });
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      // A witness over the bytes AS RECEIVED, before the JSON.parse above,
      // because the parse is lossy about whitespace and key order and the
      // thing worth recognising again is what came off the wire.
      return {
        out: {
          value: { status: res.status, body },
          lane: 'apocryphal' as Lane,
          receipt: {
            kind: 'witness',
            source: url,
            witness: {
              algorithm: 'sha256',
              digest: createHash('sha256').update(text).digest('hex'),
              bytes: Buffer.byteLength(text),
              transport: `${method} ${res.status}`,
            },
          },
        },
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
  config: {
    ms: {
      type: 'number',
      required: false,
      default: 100,
      description: 'Milliseconds to wait. Capped at 5000 by the handler.',
    },
  },
  lanes: { out: { lane: 'inherit' } },
  handler: async (input, ctx) => {
    const ms = Math.min(Number(ctx.config.ms ?? 100), 5000);
    await new Promise((r) => setTimeout(r, ms));
    return { out: input };
  },
});
