/**
 * Sources.
 *
 * The execution model is inject-driven: nothing inside a graph fires on its
 * own. The timer source closes that gap for polling/heartbeat shapes — the
 * executor (not the component) owns the interval: on startExecution it
 * schedules a flow from each timer node; stop/pause clears it, resume
 * restarts it. The component itself just shapes the tick payload.
 *
 * Push ingress (external systems delivering readings) is the HTTP route
 * POST /api/ingress/:graphName — see index.ts — which resolves the running
 * execution and injects at the graph's declared ingress node.
 */
import { registerComponent } from './components.js';

export const TIMER_COMPONENT = 'symbia.source.timer';

registerComponent({
  id: TIMER_COMPONENT,
  name: 'Timer Source',
  description:
    'Emits {tick, ts} on "out" every config.intervalMs milliseconds (default 5000, min 100) while the execution is running. config.payload (object) is merged into each tick. Driven by the executor; injecting into a timer node manually also works and emits one tick.',
  inputs: ['in'],
  outputs: ['out'],
  handler: (input) => ({ out: input }),
});
