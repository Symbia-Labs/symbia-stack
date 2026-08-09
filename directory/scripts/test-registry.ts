#!/usr/bin/env tsx
/**
 * Directory registry unit tests — pure logic, no server, no network.
 *
 * Deliberately tests the control-plane rules that are easy to get wrong and
 * that the design's predictions ride on: capability-scoped forwarding (not
 * blind rebroadcast), suspended-peer denial, and TTL eviction where stale ==
 * gone. No assertion here shares an author's optimism with the code — each
 * checks a value the code does not get to define (a clock it cannot see, a
 * membership it must actually hold).
 */
import assert from 'node:assert/strict';
import * as registry from '../server/src/registry.js';

let passed = 0;
function test(name: string, fn: () => void) {
  registry._reset();
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test('peer upsert is idempotent on peerId and preserves registeredAt', () => {
  const a = registry.upsertPeer({ peerId: 'net-b', endpoint: 'http://b', acceptedEventTypes: ['x'] });
  const b = registry.upsertPeer({ peerId: 'net-b', endpoint: 'http://b2' });
  assert.equal(registry.listPeers().length, 1);
  assert.equal(b.endpoint, 'http://b2');
  assert.deepEqual(b.acceptedEventTypes, ['x'], 'omitted acceptedEventTypes preserves prior value');
  assert.equal(b.registeredAt, a.registeredAt, 'registeredAt is stable across upsert');
});

test('forwarding is denied unless the event type is declared', () => {
  registry.upsertPeer({ peerId: 'net-b', endpoint: 'http://b', acceptedEventTypes: ['order.margin'] });
  assert.equal(registry.isForwardAllowed('net-b', 'order.margin'), true);
  assert.equal(registry.isForwardAllowed('net-b', 'energy.demand'), false, 'undeclared type is not forwarded');
  assert.equal(registry.isForwardAllowed('unknown', 'order.margin'), false, 'unknown peer is not forwarded');
});

test('a suspended peer is denied without being forgotten', () => {
  registry.upsertPeer({ peerId: 'net-b', endpoint: 'http://b', acceptedEventTypes: ['x'] });
  registry.setPeerStatus('net-b', 'suspended');
  assert.equal(registry.isForwardAllowed('net-b', 'x'), false);
  assert.ok(registry.getPeer('net-b'), 'peer still present while suspended');
  registry.setPeerStatus('net-b', 'active');
  assert.equal(registry.isForwardAllowed('net-b', 'x'), true, 'reactivation restores forwarding');
});

test('foreign node evicts exactly when its TTL lapses, not before', () => {
  // Assert against the node's OWN expiresAt, not a separately-captured clock —
  // the registry stamps expiry from its internal Date.now(), which drifts from
  // a t0 read in the test. Comparing to the real value is deterministic.
  const node = registry.registerForeign({ nodeId: 'runtime@edge', endpoint: 'http://edge', ttlSeconds: 10 });
  const exp = node.expiresAt;
  assert.deepEqual(registry.evictExpiredForeign(exp - 1), [], 'alive 1ms before expiry');
  assert.equal(registry.listForeign().length, 1);
  assert.deepEqual(registry.evictExpiredForeign(exp), ['runtime@edge'], 'evicted at expiry');
  assert.equal(registry.listForeign().length, 0);
});

test('heartbeat extends the TTL later than the original', () => {
  const node = registry.registerForeign({ nodeId: 'n', endpoint: 'http://n', ttlSeconds: 10 });
  const origExp = node.expiresAt;
  const renewed = registry.heartbeatForeign('n', 30);
  assert.ok(renewed);
  assert.ok(renewed!.expiresAt > origExp, 'heartbeat pushed expiry later');
  assert.deepEqual(registry.evictExpiredForeign(origExp), [], 'not evicted at the original expiry after a heartbeat');
  assert.deepEqual(registry.evictExpiredForeign(renewed!.expiresAt), ['n'], 'evicted at the renewed expiry');
});

test('heartbeat on an unknown/expired node returns undefined', () => {
  assert.equal(registry.heartbeatForeign('ghost', 10), undefined);
});

test('listForeign never returns a corpse', () => {
  const node = registry.registerForeign({ nodeId: 'n', endpoint: 'http://n', ttlSeconds: 0.01 });
  // Spin until the wall clock is past this node's own expiry.
  while (Date.now() <= node.expiresAt) { /* brief spin */ }
  assert.equal(registry.listForeign().length, 0, 'expired node is swept on read');
});

console.log(`\n${passed} directory registry tests passed`);
