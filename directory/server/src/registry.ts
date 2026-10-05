/**
 * Federation directory — in-memory state.
 *
 * Two tables, both keyed by id, both in memory (matching the network service's
 * registry; persistence is deliberately deferred — see
 * docs/2026-08-09-network-bridge-bbmd.md §8):
 *
 *  - PEERS  — the BDT analogue: the peer networks this one federates with.
 *  - FOREIGN — the FDT analogue: partial nodes registered with a TTL.
 *
 * This module holds NO transport and NO forwarding. It is the control plane:
 * who may federate, with whom, over what. The bridge (data plane) consults it
 * and carries no policy of its own.
 */
import fs from 'node:fs';
import path from 'node:path';

export type PeerStatus = 'active' | 'suspended';

export interface Peer {
  /** Stable id of the peer network (its network id, not a bridge socket id). */
  peerId: string;
  /** Where the peer's bridge is reached. Opaque to this service. */
  endpoint: string;
  /**
   * Event classes this directory will let a bridge forward TO this peer.
   * Empty means "nothing is forwarded yet" — never "everything". Blind
   * rebroadcast is the BBMD behaviour we are deliberately not copying.
   */
  acceptedEventTypes: string[];
  status: PeerStatus;
  registeredAt: string;
  updatedAt: string;
}

export interface ForeignNode {
  nodeId: string;
  endpoint: string;
  /** Absolute epoch-ms after which this registration is stale. */
  expiresAt: number;
  registeredAt: string;
  lastHeartbeat: string;
}

const peers = new Map<string, Peer>();
const foreign = new Map<string, ForeignNode>();

const now = () => new Date().toISOString();

// --- Peer persistence (JSONL, the standing dev constraint) ------------------
//
// A peer declaration is a recorded decision; letting a process restart forget
// it broke federation twice on 12 Aug (a routine service reload emptied the
// table and every forward failed closed as `denied`). Append-only journal,
// replayed at boot. Foreign nodes are deliberately NOT persisted: the FDT is
// TTL-leased and a lapse across a restart is correct behaviour.

type PeerJournalLine =
  | { op: 'upsert'; peer: Peer }
  | { op: 'status'; peerId: string; status: PeerStatus; at: string }
  | { op: 'remove'; peerId: string; at: string };

const dataDir = process.env.DIRECTORY_DATA_DIR || path.join(process.cwd(), 'data');
const journalPath = path.join(dataDir, 'peers.jsonl');

function appendJournal(line: PeerJournalLine): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(journalPath, JSON.stringify(line) + '\n');
  } catch (error) {
    // Persistence failure must not take down admission, but it must be loud:
    // a directory that silently stops journalling is a directory whose state
    // is unrecoverable without anyone deciding that.
    console.error(`[directory] peer journal write failed (${journalPath}):`, error);
  }
}

function replayJournal(): void {
  let lines: string[];
  try {
    lines = fs.readFileSync(journalPath, 'utf-8').split('\n').filter(Boolean);
  } catch {
    return; // first boot — nothing to replay
  }
  let applied = 0;
  for (const raw of lines) {
    try {
      const line = JSON.parse(raw) as PeerJournalLine;
      if (line.op === 'upsert') peers.set(line.peer.peerId, line.peer);
      else if (line.op === 'status') {
        const p = peers.get(line.peerId);
        if (p) {
          p.status = line.status;
          p.updatedAt = line.at;
        }
      } else if (line.op === 'remove') peers.delete(line.peerId);
      applied++;
    } catch {
      console.error(`[directory] skipping unparseable journal line`);
    }
  }
  if (applied > 0) {
    console.log(`[directory] replayed ${applied} peer journal entries -> ${peers.size} peer(s)`);
  }
}

replayJournal();

// --- Peers (BDT) -----------------------------------------------------------

export function upsertPeer(input: {
  peerId: string;
  endpoint: string;
  acceptedEventTypes?: string[];
}): Peer {
  const existing = peers.get(input.peerId);
  const peer: Peer = {
    peerId: input.peerId,
    endpoint: input.endpoint,
    acceptedEventTypes: input.acceptedEventTypes ?? existing?.acceptedEventTypes ?? [],
    status: existing?.status ?? 'active',
    registeredAt: existing?.registeredAt ?? now(),
    updatedAt: now(),
  };
  peers.set(peer.peerId, peer);
  appendJournal({ op: 'upsert', peer });
  return peer;
}

export function getPeer(peerId: string): Peer | undefined {
  return peers.get(peerId);
}

export function listPeers(): Peer[] {
  return [...peers.values()];
}

export function setPeerStatus(peerId: string, status: PeerStatus): Peer | undefined {
  const peer = peers.get(peerId);
  if (!peer) return undefined;
  peer.status = status;
  peer.updatedAt = now();
  appendJournal({ op: 'status', peerId, status, at: peer.updatedAt });
  return peer;
}

export function removePeer(peerId: string): boolean {
  const removed = peers.delete(peerId);
  if (removed) appendJournal({ op: 'remove', peerId, at: now() });
  return removed;
}

/**
 * Whether a bridge may forward an event of `eventType` to `peerId`. The single
 * point that answers "is this federation allowed" — capability-scoped, not a
 * broadcast. A suspended peer is denied without being forgotten.
 */
export function isForwardAllowed(peerId: string, eventType: string): boolean {
  const peer = peers.get(peerId);
  if (!peer || peer.status !== 'active') return false;
  return peer.acceptedEventTypes.includes(eventType);
}

// --- Foreign nodes (FDT) ---------------------------------------------------

export function registerForeign(input: {
  nodeId: string;
  endpoint: string;
  ttlSeconds: number;
}): ForeignNode {
  const existing = foreign.get(input.nodeId);
  const node: ForeignNode = {
    nodeId: input.nodeId,
    endpoint: input.endpoint,
    expiresAt: Date.now() + input.ttlSeconds * 1000,
    registeredAt: existing?.registeredAt ?? now(),
    lastHeartbeat: now(),
  };
  foreign.set(node.nodeId, node);
  return node;
}

/** Renew a foreign registration's TTL. Returns undefined if not registered. */
export function heartbeatForeign(nodeId: string, ttlSeconds: number): ForeignNode | undefined {
  const node = foreign.get(nodeId);
  if (!node) return undefined;
  node.expiresAt = Date.now() + ttlSeconds * 1000;
  node.lastHeartbeat = now();
  return node;
}

export function removeForeign(nodeId: string): boolean {
  return foreign.delete(nodeId);
}

/**
 * Evict expired foreign nodes and return the ids evicted. Observation, not
 * inference: a node that stopped heartbeating is *stale*, which is not the
 * same as *gone on purpose* — but for the FDT they are treated alike, exactly
 * as BACnet's foreign-device registration lapses.
 */
export function evictExpiredForeign(nowMs: number = Date.now()): string[] {
  const evicted: string[] = [];
  for (const [id, node] of foreign) {
    if (node.expiresAt <= nowMs) {
      foreign.delete(id);
      evicted.push(id);
    }
  }
  return evicted;
}

/** Live foreign nodes. Evicts expired ones first so a caller never sees a corpse. */
export function listForeign(): ForeignNode[] {
  evictExpiredForeign();
  return [...foreign.values()];
}

// --- test/introspection helper --------------------------------------------

/** Clear both tables. For tests only. */
export function _reset(): void {
  peers.clear();
  foreign.clear();
}
