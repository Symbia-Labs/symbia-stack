/**
 * W3C Trace Context conformance + Symbia migration behaviour.
 * The rejection cases are the important ones: accepting a malformed traceparent
 * silently merges unrelated traces, which is worse than having no trace at all.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTraceparent,
  formatTraceparent,
  newTraceContext,
  traceIdFromRunId,
  contextForEvent,
  traceHeaders,
  traceFromHeaders,
} from '../dist/trace-context.js';

const VALID = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

describe('parseTraceparent — acceptance', () => {
  test('parses the W3C spec example', () => {
    const c = parseTraceparent(VALID);
    assert.equal(c.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(c.spanId, '00f067aa0ba902b7');
    assert.equal(c.sampled, true);
  });

  test('reads the sampled flag', () => {
    assert.equal(parseTraceparent(VALID.replace(/-01$/, '-00')).sampled, false);
    assert.equal(parseTraceparent(VALID.replace(/-01$/, '-03')).sampled, true); // bit 0 set
  });

  test('tolerates surrounding whitespace', () => {
    assert.ok(parseTraceparent(`  ${VALID}  `));
  });

  test('accepts a future version on a best-effort basis', () => {
    const c = parseTraceparent(VALID.replace(/^00/, '01'));
    assert.equal(c.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
  });
});

describe('parseTraceparent — rejection', () => {
  const bad = {
    'all-zero trace id': `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`,
    'all-zero span id': `00-4bf92f3577b34da6a3ce929d0e0e4736-${'0'.repeat(16)}-01`,
    'version ff (reserved invalid)': VALID.replace(/^00/, 'ff'),
    'trace id too short': '00-4bf92f3577b34da6-00f067aa0ba902b7-01',
    'span id too long': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b777-01',
    'uppercase hex': VALID.toUpperCase(),
    'missing field': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7',
    'extra field': `${VALID}-extra`,
    'non-hex': '00-zzf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    'empty string': '',
  };

  for (const [name, value] of Object.entries(bad)) {
    test(`rejects ${name}`, () => assert.equal(parseTraceparent(value), null));
  }

  test('rejects null, undefined and non-strings', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      assert.equal(parseTraceparent(v), null);
    }
  });
});

describe('format and round-trip', () => {
  test('round-trips', () => {
    const c = parseTraceparent(VALID);
    assert.equal(formatTraceparent(c), VALID);
  });

  test('newTraceContext produces a parseable value', () => {
    const c = newTraceContext();
    assert.ok(parseTraceparent(formatTraceparent(c)));
  });

  test('newTraceContext is not all-zero and is unique', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const c = newTraceContext();
      assert.notEqual(c.traceId, '0'.repeat(32));
      assert.notEqual(c.spanId, '0'.repeat(16));
      seen.add(c.traceId);
    }
    assert.equal(seen.size, 200, 'trace ids must not collide');
  });

  test('unsampled formats with 00 flags', () => {
    assert.match(formatTraceparent(newTraceContext(false)), /-00$/);
  });
});

describe('traceIdFromRunId — migrating existing data', () => {
  test('converts a bare UUID', () => {
    assert.equal(
      traceIdFromRunId('4bf92f35-77b3-4da6-a3ce-929d0e0e4736'),
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
  });

  test('extracts a UUID from a prefixed runId — the case messaging drops today', () => {
    assert.equal(
      traceIdFromRunId('run_msg_4bf92f35-77b3-4da6-a3ce-929d0e0e4736'),
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
  });

  test('is deterministic — the same runId always maps to the same trace', () => {
    const id = 'run_msg_4bf92f35-77b3-4da6-a3ce-929d0e0e4736';
    assert.equal(traceIdFromRunId(id), traceIdFromRunId(id));
  });

  test('normalizes case', () => {
    assert.equal(
      traceIdFromRunId('4BF92F35-77B3-4DA6-A3CE-929D0E0E4736'),
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
  });

  test('returns null when there is no UUID to recover', () => {
    for (const v of ['run_msg_abc', '', null, undefined, 'not-a-uuid']) {
      assert.equal(traceIdFromRunId(v), null);
    }
  });

  /**
   * Found by mutation testing. The nil UUID is a common "no value" sentinel and
   * converts to an all-zero trace ID, which W3C defines as invalid. Propagating
   * it would merge every sentinel-valued run into one enormous fake trace.
   */
  test('rejects the nil UUID rather than minting an all-zero trace', () => {
    assert.equal(traceIdFromRunId('00000000-0000-0000-0000-000000000000'), null);
    assert.equal(traceIdFromRunId('run_msg_00000000-0000-0000-0000-000000000000'), null);
  });

  test('a nil-UUID runId still yields a usable fresh trace', () => {
    const { context } = contextForEvent({ runId: '00000000-0000-0000-0000-000000000000' });
    assert.notEqual(context.traceId, '0'.repeat(32));
    assert.ok(parseTraceparent(formatTraceparent(context)));
  });
});

describe('contextForEvent — precedence', () => {
  test('inbound traceparent wins and becomes the parent span', () => {
    const { context, parentSpanId } = contextForEvent({
      inboundTraceparent: VALID,
      runId: 'run_msg_11111111-1111-4111-8111-111111111111',
    });
    assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(parentSpanId, '00f067aa0ba902b7');
    assert.notEqual(context.spanId, '00f067aa0ba902b7', 'must mint a new span');
  });

  test('falls back to a UUID runId', () => {
    const { context, parentSpanId } = contextForEvent({
      runId: 'run_msg_4bf92f35-77b3-4da6-a3ce-929d0e0e4736',
    });
    assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(parentSpanId, undefined);
  });

  test('mints a fresh trace when there is nothing to inherit', () => {
    const { context } = contextForEvent({ runId: 'run_msg_abc' });
    assert.ok(parseTraceparent(formatTraceparent(context)));
  });

  test('ignores a malformed inbound traceparent rather than trusting it', () => {
    const { context, parentSpanId } = contextForEvent({
      inboundTraceparent: `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`,
      runId: '4bf92f35-77b3-4da6-a3ce-929d0e0e4736',
    });
    assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(parentSpanId, undefined);
  });

  test('propagates tracestate', () => {
    const { context } = contextForEvent({ inboundTraceparent: VALID, tracestate: 'vendor=x' });
    assert.equal(context.tracestate, 'vendor=x');
  });
});

describe('http headers', () => {
  test('emits traceparent', () => {
    const h = traceHeaders(parseTraceparent(VALID));
    assert.equal(h.traceparent, VALID);
    assert.equal('tracestate' in h, false);
  });

  test('emits tracestate only when non-empty', () => {
    const c = parseTraceparent(VALID);
    assert.equal('tracestate' in traceHeaders({ ...c, tracestate: '   ' }), false);
    assert.equal(traceHeaders({ ...c, tracestate: 'a=1' }).tracestate, 'a=1');
  });

  test('reads inbound headers case-insensitively', () => {
    assert.ok(traceFromHeaders({ traceparent: VALID }));
    assert.ok(traceFromHeaders({ TRACEPARENT: VALID }));
  });

  test('handles array-valued headers', () => {
    assert.ok(traceFromHeaders({ traceparent: [VALID] }));
  });

  test('returns null when absent or malformed', () => {
    assert.equal(traceFromHeaders({}), null);
    assert.equal(traceFromHeaders({ traceparent: 'garbage' }), null);
  });

  test('round-trips through headers', () => {
    const out = traceHeaders({ ...parseTraceparent(VALID), tracestate: 'a=1' });
    const back = traceFromHeaders(out);
    assert.equal(back.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(back.tracestate, 'a=1');
  });
});
