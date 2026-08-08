/**
 * Service-writing sinks.
 *
 * Until now the only outbound component was an unauthenticated GET fetch —
 * a graph could compute a value but never deliver it anywhere. These sinks
 * ride the runtime's own telemetry client (system-authenticated, batched,
 * idempotent metric creation) so a graph can persist derived series and
 * emit log lines as first-class nodes.
 *
 * Sinks pass their input through on "out" so chains continue after the
 * side effect. Registered from index.ts once the telemetry client exists.
 */
import { registerComponent } from './components.js';

interface SinkDeps {
  /**
   * Persist a data point. Returns false when the writer is known to be
   * failing, so the sink can route to its `error` port rather than report a
   * success it cannot vouch for. `orgId` attributes the series to the org that
   * owns the graph (defect D6).
   */
  metric: (
    name: string,
    value: number,
    labels?: Record<string, unknown>,
    orgId?: string
  ) => boolean;
  log: (level: string, message: string, metadata?: Record<string, unknown>) => void;
}

function field(obj: unknown, name: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[name] : undefined;
}

export function registerSinkComponents(deps: SinkDeps): void {
  registerComponent({
    id: 'symbia.sink.metric',
    name: 'Metric Sink',
    description:
      'Writes a numeric data point to the Logging metrics service, attributed to the org that owns the graph. config.name is the metric name (a gauge series is resolved or created on first use); config.valueField (default "value") locates the number in the message — dotted paths supported (e.g. "out.result"); config.labels attaches labels. Passes the input through on "out"; non-numeric values and failed writes exit on "error".',
    inputs: ['in'],
    outputs: ['out', 'error'],
    config: {
      name: {
        type: 'string',
        required: true,
        description:
          'Metric name. A gauge series is resolved or created on first use.',
      },
      valueField: {
        type: 'string',
        required: false,
        default: 'value',
        description: 'Locates the number in the message. Dotted paths supported, e.g. "out.result".',
      },
      labels: {
        type: 'object',
        required: false,
        default: {},
        description: 'Labels attached to the data point.',
      },
    },
    lanes: {
      out: { lane: 'inherit' },
      error: {
        lane: 'apocryphal',
        note: 'a write that failed, or a value that was not numeric — in neither case did the series receive what the graph computed',
      },
    },
    handler: (input, ctx) => {
      const name = String(ctx.config.name ?? '');
      if (!name) return { error: { error: 'config.name is required' } };
      const path = String(ctx.config.valueField ?? 'value').split('.');
      let v: unknown = input.value;
      for (const p of path) v = field(v, p);
      const num = Number(v);
      if (!Number.isFinite(num)) {
        return { error: { error: `valueField "${path.join('.')}" is not numeric`, got: v } };
      }
      const accepted = deps.metric(
        name,
        num,
        (ctx.config.labels ?? {}) as Record<string, unknown>,
        ctx.orgId
      );
      if (!accepted) {
        // A sink that reports success while the write path is broken is the
        // same defect as a Save button that persists nothing.
        return {
          error: { error: `metric write path is failing; "${name}" was not persisted`, value: num },
        };
      }
      ctx.log(`[metric] ${name} = ${num}${ctx.orgId ? ` (org ${ctx.orgId})` : ''}`);
      return { out: input };
    },
  });

  registerComponent({
    id: 'symbia.sink.log',
    name: 'Log Sink',
    description:
      'Writes the message to the Logging service log stream (config.level, default "info"; config.message template prefix optional) and passes the input through on "out". Unlike symbia.io.log, which only writes to the execution trace, this persists to the platform log store.',
    inputs: ['in'],
    outputs: ['out'],
    config: {
      level: {
        type: 'string',
        required: false,
        default: 'info',
        description: 'Log level written to the platform log store.',
      },
      message: {
        type: 'string',
        required: false,
        description: 'Optional prefix placed before the serialised message value.',
      },
    },
    lanes: {
      out: {
        lane: 'inherit',
        // Note this sink has no error port: unlike symbia.sink.metric it cannot
        // report a failed write. Recorded here rather than left to be noticed.
      },
    },
    handler: (input, ctx) => {
      const level = String(ctx.config.level ?? 'info');
      const prefix = ctx.config.message ? String(ctx.config.message) + ' ' : '';
      deps.log(level, `${prefix}${JSON.stringify(input.value)?.slice(0, 500)}`, {
        node: ctx.nodeId,
        lane: input.lane,
      });
      return { out: input };
    },
  });
}
