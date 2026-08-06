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
  metric: (name: string, value: number, labels?: Record<string, unknown>) => void;
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
      'Writes a numeric data point to the Logging metrics service via the runtime telemetry client. config.name is the metric name (created as a gauge on first use); config.valueField (default "value") locates the number in the message — dotted paths supported (e.g. "out.result"); config.labels attaches labels. Passes the input through on "out"; non-numeric values exit on "error".',
    inputs: ['in'],
    outputs: ['out', 'error'],
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
      deps.metric(name, num, (ctx.config.labels ?? {}) as Record<string, unknown>);
      ctx.log(`[metric] ${name} = ${num}`);
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
