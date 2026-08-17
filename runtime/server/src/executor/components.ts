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

/**
 * strip-v1: the pinned text-extraction algorithm. The version IS the
 * behaviour — any change to this function is a new version string, because
 * a recipe that names "strip-v1" must reproduce byte-identical output
 * forever. That is the whole difference between an extraction and an
 * impression.
 */
const EXTRACT_TEXT_VERSION = 'strip-v1';
const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…',
};
function stripV1(html: string): string {
  let t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(\w+);/g, (m, n) => HTML_ENTITIES[n.toLowerCase()] ?? m);
  return t.replace(/\s+/g, ' ').trim();
}

registerComponent({
  id: 'symbia.transform.extract-text',
  name: 'Extract Text',
  description:
    'Deterministic HTML/text extraction (strip-v1): removes script/style/comments and tags, decodes entities, collapses whitespace. The recipe carries input and output sha256, so the derivation is recomputable by anyone holding the bytes — same input, same version, same output, forever.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  config: {
    field: {
      type: 'string',
      required: false,
      default: 'body',
      description:
        'Field of the incoming message holding the source string. Omitted, "body" — the shape symbia.io.http-request emits.',
    },
  },
  lanes: {
    out: {
      lane: 'canonical',
      receipt: 'recipe',
      note:
        'the DERIVATION is canonical — recomputable from the input bytes and the pinned algorithm version in the recipe. Content fetched apocryphal stays apocryphal by tightening; the receipt still proves the extraction was faithful to whatever arrived.',
    },
    error: { lane: 'apocryphal', note: 'a refusal is not a recomputable value' },
  },
  handler: (input, ctx) => {
    const field = String(ctx.config.field ?? 'body');
    const src = (input.value as Record<string, unknown>)?.[field];
    if (typeof src !== 'string') {
      return {
        error: {
          value: {
            error: `extract-text refused: field "${field}" is ${src === undefined ? 'absent' : typeof src}, not a string`,
            accepts: 'a message whose configured field holds the source markup or text',
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }
    const inputSha256 = createHash('sha256').update(src).digest('hex');
    const text = stripV1(src);
    const outputSha256 = createHash('sha256').update(text).digest('hex');
    return {
      out: {
        value: { text, sha256: outputSha256, chars: text.length, algorithm: EXTRACT_TEXT_VERSION },
        lane: 'canonical' as Lane,
        receipt: {
          kind: 'recipe',
          source: 'symbia.transform.extract-text',
          recipe: {
            algorithm: EXTRACT_TEXT_VERSION,
            inputSha256,
            outputSha256,
            inputChars: src.length,
            outputChars: text.length,
          },
        },
      },
    };
  },
});

registerComponent({
  id: 'symbia.canon.certify',
  name: 'Certify Canon',
  description:
    'Fixes a corpus before judgment: writes a canon manifest to the catalog and attaches each item\'s bytes as an artifact. The catalog computes its own sha256 per artifact; this component verifies that second witness against its own digest and refuses on mismatch. The certification is the manifest\'s ledger position — everything after it can be checked, nothing before it can be smuggled in.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  config: {
    keyPrefix: {
      type: 'string',
      required: false,
      default: 'canon',
      description: 'Catalog key prefix; the resource lands at <prefix>/<slug>.',
    },
  },
  lanes: {
    out: {
      lane: 'canonical',
      receipt: 'recipe',
      note:
        'the manifest is recomputable from the item digests the recipe carries. The certified CONTENT keeps whatever lane it arrived on — certification fixes bytes, it does not bless them.',
    },
    error: { lane: 'apocryphal', note: 'a refusal is not a recomputable value' },
  },
  handler: async (input, ctx) => {
    const v = (input.value ?? {}) as {
      slug?: string; title?: string;
      items?: Array<{ name: string; content: string; url?: string; mimeType?: string }>;
    };
    const items = Array.isArray(v.items) ? v.items : [];
    if (items.length === 0 || items.some((i) => !i?.name || typeof i?.content !== 'string')) {
      return {
        error: {
          value: {
            error: 'certify refused: items must be a non-empty array of {name, content}',
            accepts: '{slug?, title?, items: [{name, content, url?, mimeType?}]}',
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }
    const catalogUrl = process.env.CATALOG_SERVICE_URL;
    if (!catalogUrl) {
      return {
        error: { value: { error: 'certify refused: CATALOG_SERVICE_URL is not set — no catalog to certify into' }, lane: 'apocryphal' as Lane },
      };
    }
    const digests = items.map((i) => ({
      name: i.name,
      url: i.url,
      sha256: createHash('sha256').update(i.content).digest('hex'),
      bytes: Buffer.byteLength(i.content),
    }));
    const slug = (v.slug ?? `corpus-${Date.now()}`).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const headers = { 'content-type': 'application/json', 'X-Service-Auth': 'internal' };
    try {
      const rRes = await fetch(`${catalogUrl}/api/contexts`, {
        method: 'POST', headers,
        body: JSON.stringify({
          key: `${String(ctx.config.keyPrefix ?? 'canon')}/${slug}`,
          name: v.title ?? `Canon — ${slug}`,
          type: 'context',
          tags: ['canon', 'certified'],
          content: { certified: true, items: digests },
        }),
      });
      if (!rRes.ok) {
        return { error: { value: { error: `catalog refused the manifest: ${rRes.status}`, detail: (await rRes.text()).slice(0, 300) }, lane: 'apocryphal' as Lane } };
      }
      const resource = (await rRes.json()) as { id: string; key: string };
      const attached: Array<Record<string, unknown>> = [];
      for (const [idx, item] of items.entries()) {
        const aRes = await fetch(`${catalogUrl}/api/resources/${resource.id}/artifacts`, {
          method: 'POST', headers,
          body: JSON.stringify({
            name: item.name,
            // text/html is not in the catalog's MIME allowlist; canon text
            // travels as text/plain, and the manifest records the original.
            type: item.mimeType && item.mimeType !== 'text/html' ? item.mimeType : 'text/plain',
            content: Buffer.from(item.content).toString('base64'),
          }),
        });
        if (!aRes.ok) {
          return { error: { value: { error: `artifact upload refused for "${item.name}": ${aRes.status}`, detail: (await aRes.text()).slice(0, 300), resourceId: resource.id, attachedSoFar: attached.length }, lane: 'apocryphal' as Lane } };
        }
        const artifact = (await aRes.json()) as { id: string; checksum?: string };
        // THE SECOND WITNESS MUST AGREE. The catalog digested the same bytes
        // independently; a mismatch means corruption in transit or storage,
        // and a canon whose store disagrees with its manifest certifies
        // nothing.
        if (artifact.checksum && artifact.checksum !== digests[idx].sha256) {
          return { error: { value: { error: `checksum mismatch on "${item.name}": component ${digests[idx].sha256}, catalog ${artifact.checksum}`, meaning: 'the stored bytes are not the certified bytes; nothing was certified' }, lane: 'apocryphal' as Lane } };
        }
        attached.push({ name: item.name, sha256: digests[idx].sha256, artifactId: artifact.id, catalogChecksum: artifact.checksum, secondWitness: artifact.checksum === digests[idx].sha256 });
      }
      return {
        out: {
          value: { resourceId: resource.id, key: resource.key, items: attached },
          lane: 'canonical' as Lane,
          receipt: {
            kind: 'recipe',
            source: 'symbia.canon.certify',
            recipe: { items: digests.map(({ name, sha256 }) => ({ name, sha256 })) },
          },
        },
      };
    } catch (e) {
      return { error: { value: { error: `certify failed: ${(e as Error).message}` }, lane: 'apocryphal' as Lane } };
    }
  },
});

/**
 * check-v1: the pinned claim-checking algorithm. Two rules, both mechanical,
 * neither negotiable: a quote must appear verbatim in the source it cites,
 * and every number in a claim must appear somewhere in canon.
 *
 * The checker is deliberately stupid. It cannot be reasoned with, which is
 * the entire point — a verdict that could be argued into changing is not a
 * verdict, it is an opinion with extra steps.
 */
/**
 * check-v2. The version is part of the verdict digest, and that is the point:
 * a pinned algorithm name must mean one thing forever. v1 shipped with two
 * defects an external review found the same day — a quote of "the" passed,
 * and "14 employees" passed against a corpus whose only digits were a phone
 * number. Both are fixed below. Fixing them under the old name would have
 * silently changed what every published v1 verdict meant, so the name moved
 * instead. A v1 verdict remains exactly as true as it ever was, about v1.
 */
const CHECK_CLAIMS_VERSION = 'check-v2';

/** How many times a quote may occur across canon before it stops locating anything. */
const DEFAULT_MAX_QUOTE_OCCURRENCES = 3;

/** Non-overlapping occurrences of `needle` in `hay`. */
function occurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

export function normV1(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|trillion|million|thousand|percent|%))?/g;

export function numbersOf(text: string): string[] {
  const found = normV1(text).match(NUMBER_RE) ?? [];
  return Array.from(new Set(found.map((n) => n.trim()).filter((n) => /\d/.test(n))));
}

export function numberInCanon(n: string, canonAll: string): boolean {
  // A figure may be written with or without its currency mark, and "percent"
  // and "%" are the same number wearing different clothes. Nothing here
  // invents equivalences beyond that: 42 does not match 42.0, because a
  // checker that rounds is a checker that can be talked into things.
  //
  // A NUMBER INSIDE ANOTHER NUMBER IS NOT THAT NUMBER.
  //
  // v1 asked `canonAll.includes(v)`, which is substring matching, so "14"
  // was satisfied by the "14" inside a phone number's "514" and "43" by the
  // "43" inside "3435". Measured against a corpus whose only digits were
  // (202) 514-3435: the claim "14 employees were disciplined" passed with
  // nothing to support it. Digits now have to stand alone — no digit, comma
  // or decimal point may sit against either end.
  const variants = new Set([n, n.replace(/\$/g, ''), n.replace(/\s*percent/, '%'), n.replace(/%/, ' percent')]);
  for (const v of variants) {
    if (!v) continue;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The trailing guard rejects a digit, and a decimal point or thousands
    // comma ONLY when a digit follows it — so "14" is refused inside "14.5"
    // and "1,400", and accepted at the end of a sentence. The first version
    // of this fix used `(?![\d.,])` flatly and refused "82 percent." and
    // "$153 billion," for the crime of being followed by punctuation, which
    // the first test run caught immediately. Over-strict is still wrong.
    if (new RegExp(`(?<![\\d.,])${escaped}(?!\\d)(?![.,]\\d)`).test(canonAll)) return true;
  }
  return false;
}

export interface ClaimIn { id?: string; claim?: string; source?: string; quote?: string }
export interface ClaimVerdict { id: string; status: 'PASS' | 'FAIL'; problems: string[] }

export function checkClaimsCore(
  claims: ClaimIn[],
  canon: Record<string, string>,
  maxQuoteOccurrences: number = DEFAULT_MAX_QUOTE_OCCURRENCES
): { results: ClaimVerdict[]; passed: number; failed: number } {
  const normCanon: Record<string, string> = {};
  for (const [k, v] of Object.entries(canon)) normCanon[k] = normV1(v);
  const all = Object.values(normCanon).join(' || ');

  const results: ClaimVerdict[] = claims.map((c, i) => {
    const id = c.id ?? `claim-${i + 1}`;
    const problems: string[] = [];
    const src = String(c.source ?? '');
    const q = normV1(String(c.quote ?? ''));

    if (!q) {
      problems.push('no quote offered — a claim with no citation cannot be checked, which is not the same as being false');
    } else if (!(src in normCanon)) {
      problems.push(`cited source "${src}" is not in this canon`);
    } else if (!normCanon[src].includes(q)) {
      // MISATTRIBUTION IS ITS OWN FAILURE, AND THE MOST INTERESTING ONE.
      // A real quote pointed at the wrong document is the signature of
      // citation laundering, and it reads identically to honest sourcing
      // until something checks the pairing rather than the words.
      problems.push(
        all.includes(q)
          ? `quote is not in the cited source "${src}" — it appears in another canonical source, so this is a misattribution rather than an invention`
          : 'quote does not appear verbatim in any canonical source'
      );
    } else {
      // A CITATION THAT MATCHES EVERYWHERE POINTS AT NOTHING.
      //
      // v1 asked only whether the quote occurred in the cited source, so the
      // word "the" satisfied it and could be attached to any claim at all.
      // The variable is not length — a short quote that occurs once locates a
      // passage perfectly well — it is how many places the quote could have
      // come from. A quote found everywhere in the corpus carries no
      // information about where the claim came from, which is the only thing
      // a citation is for.
      const occ = occurrences(all, q);
      if (occ > maxQuoteOccurrences) {
        problems.push(
          `quote occurs ${occ} times across canon (limit ${maxQuoteOccurrences}) — it locates no particular passage, ` +
          `so it cannot show where this claim came from. Quote something distinctive enough to point at one place.`
        );
      }
    }
    for (const n of numbersOf(String(c.claim ?? ''))) {
      if (!numberInCanon(n, all)) problems.push(`number "${n}" does not appear anywhere in canon`);
    }
    return { id, status: problems.length === 0 ? 'PASS' : 'FAIL', problems };
  });

  return {
    results,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
  };
}

/**
 * A CHECKER THAT CANNOT SEE RED MUST NOT MOUNT.
 *
 * Four vectors against a fixed two-document canon: one honest claim and the
 * three failure modes this component exists to catch. They run at
 * registration, not in a test suite somebody remembers to invoke — because
 * the 17 Aug spike ran its control by operator discipline, and discipline is
 * exactly what a stranger installing a plugin does not inherit.
 *
 * A probe that reports success while refusing everything it touched has
 * measured nothing and reads identically to one that worked. So if these
 * four do not come out 1/3, the component still registers — and refuses every
 * invocation, naming the failure. Absent would be quieter and worse.
 */
const CONTROL_CANON: Record<string, string> = {
  'ctrl-a.txt': 'The first canonical document. Value: 42 percent of the total, per the register and the appendix.',
  'ctrl-b.txt': 'The second canonical document mentions a distinct phrase. Reach the office at (202) 514-3435 for the schedule.',
};
const CONTROL_CLAIMS: ClaimIn[] = [
  { id: 'honest', claim: 'The value is 42 percent.', source: 'ctrl-a.txt', quote: 'Value: 42 percent' },
  { id: 'fabricated-number', claim: 'The value is 99 percent.', source: 'ctrl-a.txt', quote: 'Value: 42 percent' },
  { id: 'paraphrase-as-quote', claim: 'The value is stated.', source: 'ctrl-a.txt', quote: 'the value equals forty-two' },
  { id: 'wrong-source', claim: 'A distinct phrase appears.', source: 'ctrl-a.txt', quote: 'mentions a distinct phrase' },
  // THE TWO v1 SHIPPED WITHOUT, WHICH IS WHY ITS CONTROL PROVED NOTHING.
  //
  // Every v1 vector used a quote of 17-26 distinctive characters — precisely
  // the case the matching handled correctly. An external review pointed out
  // that following the recommended procedure therefore produced three green
  // checks and false confidence. A control that only exercises the working
  // path is decoration. These two fail on v1 and pass on v2.
  { id: 'ubiquitous-quote', claim: 'Something was documented.', source: 'ctrl-a.txt', quote: 'the' },
  { id: 'substring-number', claim: 'There were 14 findings.', source: 'ctrl-b.txt', quote: 'mentions a distinct phrase' },
];
const CONTROL_EXPECTED: Record<string, 'PASS' | 'FAIL'> = {
  honest: 'PASS',
  'fabricated-number': 'FAIL',
  'paraphrase-as-quote': 'FAIL',
  'wrong-source': 'FAIL',
  'ubiquitous-quote': 'FAIL',
  'substring-number': 'FAIL',
};

const CHECK_CONTROL = (() => {
  try {
    const { results } = checkClaimsCore(CONTROL_CLAIMS, CONTROL_CANON);
    const got = Object.fromEntries(results.map((r) => [r.id, r.status]));
    const wrong = Object.entries(CONTROL_EXPECTED).filter(([k, v]) => got[k] !== v);
    return wrong.length === 0
      ? { ok: true, detail: `${CHECK_CLAIMS_VERSION} control: 1 honest claim passed, 5 planted failures caught (fabricated number, paraphrase-as-quote, wrong-source, ubiquitous quote, number inside another number)` }
      : { ok: false, detail: wrong.map(([k, v]) => `${k}: expected ${v}, got ${got[k] ?? 'no result'}`).join('; ') };
  } catch (e) {
    return { ok: false, detail: `control threw: ${(e as Error).message}` };
  }
})();
if (!CHECK_CONTROL.ok) {
  console.error(`[components] symbia.canon.check-claims CONTROL FAILED — ${CHECK_CONTROL.detail}. The component will refuse every invocation.`);
}

async function loadCanonFromCatalog(resourceId: string): Promise<Record<string, string>> {
  const catalogUrl = process.env.CATALOG_SERVICE_URL;
  if (!catalogUrl) throw new Error('CATALOG_SERVICE_URL is not set — no catalog to read canon from');
  const headers = { 'X-Service-Auth': 'internal' };
  const listRes = await fetch(`${catalogUrl}/api/resources/${resourceId}/artifacts`, { headers });
  if (!listRes.ok) throw new Error(`artifact list refused: ${listRes.status} ${(await listRes.text()).slice(0, 200)}`);
  const artifacts = (await listRes.json()) as Array<{ id: string; name: string; checksum?: string }>;
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error(`resource ${resourceId} carries no artifacts — nothing to check against`);
  const out: Record<string, string> = {};
  for (const a of artifacts) {
    const dRes = await fetch(`${catalogUrl}/api/artifacts/${a.id}/download`, { headers });
    if (!dRes.ok) throw new Error(`download refused for "${a.name}": ${dRes.status} ${(await dRes.text()).slice(0, 200)}`);
    out[a.name] = await dRes.text();
  }
  return out;
}

registerComponent({
  id: 'symbia.canon.check-claims',
  name: 'Check Claims Against Canon',
  description:
    'Mechanically checks a claim register against a certified corpus: every quote must appear verbatim in the source it cites, every number must appear somewhere in canon. Distinguishes invention from misattribution. Carries its own control vectors, run at registration — a checker that cannot detect a planted failure refuses to answer at all. The verdict is recomputable from the canon digests, the claims digest and the pinned algorithm version, all of which the recipe carries.',
  inputs: ['in'],
  outputs: ['out', 'error'],
  config: {
    canonResourceId: {
      type: 'string',
      required: false,
      description:
        'Catalog resource holding the certified canon as artifacts. May instead be supplied per-message as canonResourceId, or the canon passed inline as canon: [{name, text}].',
    },
  },
  lanes: {
    out: {
      lane: 'canonical',
      receipt: 'recipe',
      note:
        'the VERDICT is recomputable — same canon digests, same claims, same algorithm version, same result, forever. A verdict about claims that arrived apocryphal tightens to apocryphal like any derivation: the checking was faithful, the thing checked was not recomputable.',
    },
    error: { lane: 'apocryphal', note: 'a refusal is not a recomputable value' },
  },
  meta: {
    algorithm: CHECK_CLAIMS_VERSION,
    controlVectors: CONTROL_CLAIMS.length,
    controlStatus: CHECK_CONTROL.ok ? 'passing' : 'FAILING',
    controlDetail: CHECK_CONTROL.detail,
  },
  handler: async (input, ctx) => {
    if (!CHECK_CONTROL.ok) {
      return {
        error: {
          value: {
            error: 'check-claims refuses to answer: its own control vectors did not pass at registration',
            control: CHECK_CONTROL.detail,
            meaning:
              'A checker that cannot detect a planted failure would return PASS for everything, which is indistinguishable from working. No verdict was produced.',
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }

    const v = (input.value ?? {}) as {
      claims?: ClaimIn[];
      canon?: Array<{ name: string; text: string }>;
      canonResourceId?: string;
    };
    const claims = Array.isArray(v.claims) ? v.claims : [];
    if (claims.length === 0) {
      return {
        error: {
          value: {
            error: 'check-claims refused: no claims to check',
            accepts: '{claims: [{id?, claim, source, quote}], and either canon: [{name, text}] or canonResourceId}',
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }

    let canon: Record<string, string> = {};
    const rid = v.canonResourceId ?? (ctx.config.canonResourceId ? String(ctx.config.canonResourceId) : undefined);
    if (Array.isArray(v.canon) && v.canon.length > 0) {
      for (const c of v.canon) canon[String(c.name)] = String(c.text ?? '');
    } else if (rid) {
      try {
        canon = await loadCanonFromCatalog(rid);
      } catch (e) {
        return {
          error: {
            value: { error: `check-claims could not read its canon: ${(e as Error).message}`, canonResourceId: rid },
            lane: 'apocryphal' as Lane,
          },
        };
      }
    } else {
      return {
        error: {
          value: {
            error: 'check-claims refused: no canon supplied',
            meaning: 'Checking claims against nothing would pass everything. A corpus must be named before a verdict can mean anything.',
          },
          lane: 'apocryphal' as Lane,
        },
      };
    }

    const canonDigests: Record<string, string> = {};
    for (const [name, text] of Object.entries(canon)) {
      canonDigests[name] = createHash('sha256').update(text).digest('hex');
    }
    const { results, passed, failed } = checkClaimsCore(claims, canon);

    // The verdict digest covers the algorithm and the per-claim outcomes in
    // input order — constructed here rather than digesting the whole response,
    // so the same claims against the same canon produce the same digest on
    // any machine, whatever else the response happens to carry.
    const verdictBody = {
      algorithm: CHECK_CLAIMS_VERSION,
      results: results.map((r) => ({ id: r.id, status: r.status, problems: r.problems })),
    };
    const verdictSha256 = createHash('sha256').update(JSON.stringify(verdictBody)).digest('hex');
    const claimsSha256 = createHash('sha256')
      .update(JSON.stringify(claims.map((c) => ({ id: c.id ?? null, claim: c.claim ?? null, source: c.source ?? null, quote: c.quote ?? null }))))
      .digest('hex');

    return {
      out: {
        value: {
          clean: failed === 0,
          passed,
          failed,
          results,
          verdictSha256,
          algorithm: CHECK_CLAIMS_VERSION,
          canon: canonDigests,
        },
        lane: 'canonical' as Lane,
        receipt: {
          kind: 'recipe',
          source: 'symbia.canon.check-claims',
          recipe: {
            algorithm: CHECK_CLAIMS_VERSION,
            canon: canonDigests,
            claimsSha256,
            verdictSha256,
            control: CHECK_CONTROL.detail,
          },
        },
      },
    };
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
