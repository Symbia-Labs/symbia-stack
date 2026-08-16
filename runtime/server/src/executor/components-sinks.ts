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
import { preview } from './preview.js';
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
  /**
   * Write a log line. Returns false when the writer is known to be failing,
   * mirroring `metric` above.
   *
   * This returned `void` until 8 Aug 2026, which is why `sink.log` had no
   * error port: there was nothing to report a failure with. The silence went
   * all the way down — `@symbia/logging-client` discarded failures after
   * retries under a comment reading "Silent failure after retries exhausted".
   * Fixed there, surfaced here.
   */
  log: (
    level: string,
    message: string,
    metadata?: Record<string, unknown>
  ) => boolean;
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
    outputs: ['out', 'error'],
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
      out: { lane: 'inherit' },
      error: { lane: 'inherit' },
    },
    handler: (input, ctx) => {
      const level = String(ctx.config.level ?? 'info');
      const prefix = ctx.config.message ? String(ctx.config.message) + ' ' : '';
      const ok = deps.log(
        level,
        `${prefix}${preview(input.value, 500)}`,
        // WHAT PRODUCED THIS ENTRY, BY REFERENCE.
        //
        // The entry carried `node` and `lane` and nothing else, so tying a
        // log line back to the run that wrote it rested on timestamp
        // adjacency — correlation, not reference. Found 16 Aug 2026 by
        // Brian verifying a hello-world graph end to end: every other link
        // in the chain was measured and this one had to be assumed.
        //
        // The component whose whole job is persisting evidence must not be
        // the one that drops the pointer back to its cause. Both ids are
        // already on the context; they were simply never passed.
        {
          node: ctx.nodeId,
          lane: input.lane,
          executionId: ctx.executionId,
          ...(ctx.graphKey ? { graphKey: ctx.graphKey } : {}),
        }
      );
      // A persistence component that cannot fail is lying. This one used to
      // return `out` unconditionally, so a graph writing into a dead log path
      // reported success on every message — the same defect as a Save button
      // that persists nothing, in the component whose entire job is to persist.
      if (!ok) {
        return {
          error: {
            error: 'log write path is failing; the message was not persisted',
            level,
          },
        };
      }
      return { out: input };
    },
  });
}
