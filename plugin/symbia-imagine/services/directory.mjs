// ../../directory/server/src/routes.ts
import { Router } from "express";
import { loadServiceIdentity } from "@symbia/crypto";

// ../../directory/server/src/registry.ts
import fs from "node:fs";
import path from "node:path";
var peers = /* @__PURE__ */ new Map();
var foreign = /* @__PURE__ */ new Map();
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var dataDir = process.env.DIRECTORY_DATA_DIR || path.join(process.cwd(), "data");
var journalPath = path.join(dataDir, "peers.jsonl");
function appendJournal(line) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(journalPath, JSON.stringify(line) + "\n");
  } catch (error) {
    console.error(`[directory] peer journal write failed (${journalPath}):`, error);
  }
}
function replayJournal() {
  let lines;
  try {
    lines = fs.readFileSync(journalPath, "utf-8").split("\n").filter(Boolean);
  } catch {
    return;
  }
  let applied = 0;
  for (const raw of lines) {
    try {
      const line = JSON.parse(raw);
      if (line.op === "upsert") peers.set(line.peer.peerId, line.peer);
      else if (line.op === "status") {
        const p = peers.get(line.peerId);
        if (p) {
          p.status = line.status;
          p.updatedAt = line.at;
        }
      } else if (line.op === "remove") peers.delete(line.peerId);
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
function upsertPeer(input) {
  const existing = peers.get(input.peerId);
  const peer = {
    peerId: input.peerId,
    endpoint: input.endpoint,
    acceptedEventTypes: input.acceptedEventTypes ?? existing?.acceptedEventTypes ?? [],
    status: existing?.status ?? "active",
    registeredAt: existing?.registeredAt ?? now(),
    updatedAt: now()
  };
  peers.set(peer.peerId, peer);
  appendJournal({ op: "upsert", peer });
  return peer;
}
function getPeer(peerId) {
  return peers.get(peerId);
}
function listPeers() {
  return [...peers.values()];
}
function setPeerStatus(peerId, status) {
  const peer = peers.get(peerId);
  if (!peer) return void 0;
  peer.status = status;
  peer.updatedAt = now();
  appendJournal({ op: "status", peerId, status, at: peer.updatedAt });
  return peer;
}
function removePeer(peerId) {
  const removed = peers.delete(peerId);
  if (removed) appendJournal({ op: "remove", peerId, at: now() });
  return removed;
}
function isForwardAllowed(peerId, eventType) {
  const peer = peers.get(peerId);
  if (!peer || peer.status !== "active") return false;
  return peer.acceptedEventTypes.includes(eventType);
}
function registerForeign(input) {
  const existing = foreign.get(input.nodeId);
  const node = {
    nodeId: input.nodeId,
    endpoint: input.endpoint,
    expiresAt: Date.now() + input.ttlSeconds * 1e3,
    registeredAt: existing?.registeredAt ?? now(),
    lastHeartbeat: now()
  };
  foreign.set(node.nodeId, node);
  return node;
}
function heartbeatForeign(nodeId, ttlSeconds) {
  const node = foreign.get(nodeId);
  if (!node) return void 0;
  node.expiresAt = Date.now() + ttlSeconds * 1e3;
  node.lastHeartbeat = now();
  return node;
}
function removeForeign(nodeId) {
  return foreign.delete(nodeId);
}
function evictExpiredForeign(nowMs = Date.now()) {
  const evicted = [];
  for (const [id, node] of foreign) {
    if (node.expiresAt <= nowMs) {
      foreign.delete(id);
      evicted.push(id);
    }
  }
  return evicted;
}
function listForeign() {
  evictExpiredForeign();
  return [...foreign.values()];
}

// ../../directory/server/src/config.ts
var config = {
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").filter(Boolean),
  /**
   * The one admission credential (design §6, phase 1). A peer or foreign node
   * presents it as `x-symbia-join-secret`; the directory checks it here and
   * nowhere else. This is where the network's open `node:register` stops.
   *
   * If unset, admission is OPEN — acceptable inside a trusted boundary (dev,
   * single VPC) and matching the platform's current within-network posture,
   * but the service says so loudly at boot so an open door is never silent.
   */
  joinSecret: process.env.DIRECTORY_JOIN_SECRET || "",
  /**
   * Event classes this installation offers to receive from peers, stated on
   * GET /api/offer. Empty would mean "offers nothing" — the default is the
   * one boring class the first seam crossing uses (topology mirroring), per
   * docs/2026-08-12-federation-predictions.md ruling 4.
   */
  offerAccepts: (process.env.DIRECTORY_OFFER_ACCEPTS || "network.topology").split(",").map((s) => s.trim()).filter(Boolean),
  /** How often expired foreign-node registrations are swept. */
  evictIntervalMs: parseInt(process.env.DIRECTORY_EVICT_INTERVAL_MS || "15000", 10),
  /** Default TTL applied when a foreign registration omits one. */
  defaultForeignTtlSeconds: parseInt(process.env.DIRECTORY_FOREIGN_TTL_SECONDS || "60", 10)
};

// ../../directory/server/src/admission.ts
function checkAdmission(req) {
  if (!config.joinSecret) return { ok: true };
  const presented = req.header("x-symbia-join-secret");
  if (!presented) {
    return { ok: false, reason: "missing x-symbia-join-secret" };
  }
  if (presented !== config.joinSecret) {
    return { ok: false, reason: "invalid join secret" };
  }
  return { ok: true };
}

// ../../directory/server/src/openapi.ts
var apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Directory Service",
    version: "1.0.0",
    description: "Control plane for federation. Peers, foreign nodes, admission and forwarding permission. No event passes through this service."
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Offer", description: "What this installation is and will receive" },
    { name: "Peers", description: "The peer directory (BDT)" },
    { name: "Foreign nodes", description: "The foreign-node table (FDT)" }
  ],
  paths: {
    "/api/offer": {
      get: {
        tags: ["Offer"],
        summary: "What this installation is, and which event classes it will receive",
        description: "Public and passive. Reading an offer admits nothing \u2014 admission happens on POST /api/peers and nowhere else. Peers that are identical as apps are distinguished here by installation id, which is the disk-persisted service identity and is stable across restarts.",
        responses: { "200": { description: "The installation's declaration" } }
      }
    },
    "/api/stats": {
      get: {
        tags: ["Offer"],
        summary: "Counts held by this directory",
        responses: { "200": { description: "Directory counts" } }
      }
    },
    "/api/peers": {
      get: {
        tags: ["Peers"],
        summary: "List known peers",
        responses: { "200": { description: "Peer entries" } }
      },
      post: {
        tags: ["Peers"],
        summary: "Admit a peer",
        description: "This is the admission point. Reading an offer does not admit; writing a peer entry does.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "201": { description: "Peer admitted" },
          "400": { description: "Invalid peer entry" },
          "403": { description: "Admission refused" }
        }
      }
    },
    "/api/peers/{peerId}": {
      get: {
        tags: ["Peers"],
        summary: "Read one peer",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The peer" }, "404": { description: "No such peer" } }
      },
      delete: {
        tags: ["Peers"],
        summary: "Remove a peer",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Removed" }, "404": { description: "No such peer" } }
      }
    },
    "/api/peers/{peerId}/status": {
      patch: {
        tags: ["Peers"],
        summary: "Change a peer's status",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated" }, "404": { description: "No such peer" } }
      }
    },
    "/api/peers/{peerId}/allow": {
      get: {
        tags: ["Peers"],
        summary: "May the bridge forward to this peer?",
        description: "The question the bridge asks before it relays. A permission query, not a delivery.",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The ruling" }, "404": { description: "No such peer" } }
      }
    },
    "/api/foreign-nodes": {
      get: {
        tags: ["Foreign nodes"],
        summary: "List foreign nodes",
        responses: { "200": { description: "Foreign node entries" } }
      },
      post: {
        tags: ["Foreign nodes"],
        summary: "Register a foreign node",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Registered" }, "400": { description: "Invalid entry" } }
      }
    },
    "/api/foreign-nodes/{nodeId}": {
      delete: {
        tags: ["Foreign nodes"],
        summary: "Remove a foreign node",
        parameters: [{ name: "nodeId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Removed" }, "404": { description: "No such node" } }
      }
    },
    "/api/foreign-nodes/{nodeId}/heartbeat": {
      post: {
        tags: ["Foreign nodes"],
        summary: "Record a foreign node heartbeat",
        parameters: [{ name: "nodeId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Recorded" }, "404": { description: "No such node" } }
      }
    }
  }
};

// ../../directory/server/src/routes.ts
function createRouter() {
  const router = Router();
  router.get("/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  router.get("/offer", (_req, res) => {
    const identity = loadServiceIdentity({ role: "directory" });
    res.json({
      installation: identity.id,
      fingerprint: identity.fingerprint,
      publicKeyPem: identity.publicKeyPem,
      accepts: config.offerAccepts,
      service: "directory"
    });
  });
  router.get("/stats", (_req, res) => {
    const peers2 = listPeers();
    res.json({
      totalPeers: peers2.length,
      activePeers: peers2.filter((p) => p.status === "active").length,
      foreignNodes: listForeign().length
    });
  });
  router.post("/peers", (req, res) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: "admission_denied", message: admit.reason });
    }
    const { peerId, endpoint, acceptedEventTypes } = req.body ?? {};
    if (typeof peerId !== "string" || !peerId) {
      return res.status(400).json({ error: "invalid_request", message: "peerId (string) required" });
    }
    if (typeof endpoint !== "string" || !endpoint) {
      return res.status(400).json({ error: "invalid_request", message: "endpoint (string) required" });
    }
    if (acceptedEventTypes !== void 0 && !Array.isArray(acceptedEventTypes)) {
      return res.status(400).json({ error: "invalid_request", message: "acceptedEventTypes must be an array" });
    }
    const peer = upsertPeer({ peerId, endpoint, acceptedEventTypes });
    return res.status(201).json({ peer });
  });
  router.get("/peers", (_req, res) => {
    res.json({ peers: listPeers() });
  });
  router.get("/peers/:peerId", (req, res) => {
    const peer = getPeer(req.params.peerId);
    if (!peer) return res.status(404).json({ error: "not_found" });
    res.json({ peer });
  });
  router.patch("/peers/:peerId/status", (req, res) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: "admission_denied", message: admit.reason });
    }
    const { status } = req.body ?? {};
    if (status !== "active" && status !== "suspended") {
      return res.status(400).json({ error: "invalid_request", message: "status must be 'active' or 'suspended'" });
    }
    const peer = setPeerStatus(req.params.peerId, status);
    if (!peer) return res.status(404).json({ error: "not_found" });
    res.json({ peer });
  });
  router.delete("/peers/:peerId", (req, res) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: "admission_denied", message: admit.reason });
    }
    const ok = removePeer(req.params.peerId);
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.status(204).end();
  });
  router.get("/peers/:peerId/allow", (req, res) => {
    const eventType = req.query.eventType;
    if (typeof eventType !== "string" || !eventType) {
      return res.status(400).json({ error: "invalid_request", message: "eventType query param required" });
    }
    res.json({ allowed: isForwardAllowed(req.params.peerId, eventType) });
  });
  router.post("/foreign-nodes", (req, res) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: "admission_denied", message: admit.reason });
    }
    const { nodeId, endpoint, ttlSeconds } = req.body ?? {};
    if (typeof nodeId !== "string" || !nodeId) {
      return res.status(400).json({ error: "invalid_request", message: "nodeId (string) required" });
    }
    if (typeof endpoint !== "string" || !endpoint) {
      return res.status(400).json({ error: "invalid_request", message: "endpoint (string) required" });
    }
    const ttl = typeof ttlSeconds === "number" && ttlSeconds > 0 ? ttlSeconds : config.defaultForeignTtlSeconds;
    const node = registerForeign({ nodeId, endpoint, ttlSeconds: ttl });
    return res.status(201).json({ node });
  });
  router.post("/foreign-nodes/:nodeId/heartbeat", (req, res) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: "admission_denied", message: admit.reason });
    }
    const { ttlSeconds } = req.body ?? {};
    const ttl = typeof ttlSeconds === "number" && ttlSeconds > 0 ? ttlSeconds : config.defaultForeignTtlSeconds;
    const node = heartbeatForeign(req.params.nodeId, ttl);
    if (!node) return res.status(404).json({ error: "not_found", message: "no such foreign node (may have expired)" });
    res.json({ node });
  });
  router.get("/foreign-nodes", (_req, res) => {
    res.json({ nodes: listForeign() });
  });
  router.delete("/foreign-nodes/:nodeId", (req, res) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: "admission_denied", message: admit.reason });
    }
    const ok = removeForeign(req.params.nodeId);
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.status(204).end();
  });
  return router;
}
async function registerRoutes(_httpServer, app) {
  app.use("/api", createRouter());
  app.get("/docs/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
}
export {
  createRouter,
  registerRoutes
};
