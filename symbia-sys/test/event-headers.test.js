/**
 * Header promotion + validation.
 *
 * The adversarial block is the reason this module exists: promoting a trust
 * field to a header without validating it creates two sources of truth, and an
 * attacker picks whichever one each hop reads.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADERS,
  eventHeaders,
  validateEventHeaders,
  eventHeaderValidator,
  HeaderMismatchError,
  isBoundary,
} from '../dist/event-headers.js';

const wrapper = (over = {}) => ({
  id: 'evt_1',
  runId: 'run_1',
  source: 'messaging',
  boundary: 'intra',
  ...over,
});

const mismatch = (fn, field) =>
  assert.throws(fn, (e) => {
    assert.ok(e instanceof HeaderMismatchError, `expected HeaderMismatchError, got ${e?.name}`);
    if (field) assert.equal(e.field, field);
    assert.equal(e.status, 400);
    return true;
  });

describe('promotion', () => {
  test('promotes boundary alongside the correlation ids', () => {
    const h = eventHeaders(wrapper({ boundary: 'extra' }));
    assert.equal(h[HEADERS.boundary], 'extra');
    assert.equal(h[HEADERS.eventId], 'evt_1');
    assert.equal(h[HEADERS.runId], 'run_1');
    assert.equal(h[HEADERS.source], 'messaging');
  });

  test('omits header-unsafe values rather than mangling them', () => {
    // A newline in a header value is a response-splitting vector.
    const h = eventHeaders(wrapper({ id: 'evt\r\nX-Injected: yes' }));
    assert.equal(HEADERS.eventId in h, false);
    assert.equal(h[HEADERS.boundary], 'intra', 'other headers still promoted');
  });

  test('omits empty and whitespace-padded values', () => {
    const h = eventHeaders(wrapper({ id: '', runId: ' padded ' }));
    assert.equal(HEADERS.eventId in h, false);
    assert.equal(HEADERS.runId in h, false);
  });
});

describe('validation — the attack surface', () => {
  test('accepts headers that agree with the body', () => {
    const w = wrapper({ boundary: 'inter' });
    assert.doesNotThrow(() => validateEventHeaders(eventHeaders(w), w));
  });

  test('REJECTS a boundary downgrade', () => {
    // The core attack: an `extra` event relabelled as internal-trust in transit.
    mismatch(
      () => validateEventHeaders({ [HEADERS.boundary]: 'intra' }, wrapper({ boundary: 'extra' })),
      'boundary'
    );
  });

  test('REJECTS a boundary upgrade', () => {
    mismatch(
      () => validateEventHeaders({ [HEADERS.boundary]: 'extra' }, wrapper({ boundary: 'intra' })),
      'boundary'
    );
  });

  test('REJECTS a stripped boundary header — absence is not a default', () => {
    // Defaulting to `intra` would make header-stripping a downgrade attack.
    mismatch(() => validateEventHeaders({}, wrapper({ boundary: 'extra' })), 'boundary');
  });

  test('rejects a boundary value outside the enum', () => {
    mismatch(() => validateEventHeaders({ [HEADERS.boundary]: 'trusted' }, wrapper()), 'boundary');
  });

  test('rejects a mismatched event id', () => {
    mismatch(
      () =>
        validateEventHeaders(
          { [HEADERS.boundary]: 'intra', [HEADERS.eventId]: 'evt_other' },
          wrapper()
        ),
      'id'
    );
  });

  test('rejects a mismatched run id', () => {
    mismatch(
      () =>
        validateEventHeaders(
          { [HEADERS.boundary]: 'intra', [HEADERS.runId]: 'run_other' },
          wrapper()
        ),
      'runId'
    );
  });

  test('tolerates absent correlation ids for older senders', () => {
    assert.doesNotThrow(() => validateEventHeaders({ [HEADERS.boundary]: 'intra' }, wrapper()));
  });

  test('is case-insensitive on header names', () => {
    assert.doesNotThrow(() =>
      validateEventHeaders({ 'x-symbia-boundary': 'intra' }, wrapper())
    );
  });

  test('handles array-valued headers', () => {
    assert.doesNotThrow(() => validateEventHeaders({ [HEADERS.boundary]: ['intra'] }, wrapper()));
  });

  test('requireBoundary:false allows a migration window', () => {
    assert.doesNotThrow(() =>
      validateEventHeaders({}, wrapper({ boundary: 'extra' }), { requireBoundary: false })
    );
    // ...but a present-and-wrong header is still rejected during migration.
    mismatch(
      () =>
        validateEventHeaders({ [HEADERS.boundary]: 'intra' }, wrapper({ boundary: 'extra' }), {
          requireBoundary: false,
        }),
      'boundary'
    );
  });

  test('round-trip holds for every boundary value', () => {
    for (const b of ['intra', 'inter', 'extra']) {
      const w = wrapper({ boundary: b });
      assert.doesNotThrow(() => validateEventHeaders(eventHeaders(w), w));
    }
  });
});

describe('isBoundary', () => {
  test('accepts the enum and rejects everything else', () => {
    for (const v of ['intra', 'inter', 'extra']) assert.equal(isBoundary(v), true);
    for (const v of ['INTRA', 'internal', '', null, undefined, 1, {}]) {
      assert.equal(isBoundary(v), false);
    }
  });
});

describe('express middleware', () => {
  const run = (headers, body) => {
    const req = { headers, body };
    let status = null;
    let payload = null;
    let nexted = false;
    const res = {
      status(c) {
        status = c;
        return this;
      },
      json(p) {
        payload = p;
        return this;
      },
    };
    eventHeaderValidator()(req, res, () => {
      nexted = true;
    });
    return { status, payload, nexted };
  };

  test('passes a consistent request through', () => {
    const w = wrapper();
    const r = run(eventHeaders(w), { wrapper: w });
    assert.equal(r.nexted, true);
    assert.equal(r.status, null);
  });

  test('rejects a mismatch with 400 and code -32020', () => {
    const r = run({ [HEADERS.boundary]: 'intra' }, { wrapper: wrapper({ boundary: 'extra' }) });
    assert.equal(r.nexted, false);
    assert.equal(r.status, 400);
    assert.equal(r.payload.error.code, -32020);
    assert.equal(r.payload.error.data.field, 'boundary');
  });

  test('ignores requests that are not events', () => {
    assert.equal(run({}, { something: 'else' }).nexted, true);
    assert.equal(run({}, undefined).nexted, true);
  });
});
