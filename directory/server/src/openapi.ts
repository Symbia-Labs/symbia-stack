/**
 * The directory service's OpenAPI document.
 *
 * Written 16 Aug, from the twelve handlers in routes.ts. Until now this
 * service shipped no spec, which the MCP dispatcher reported as zero
 * operations — indistinguishable, to a caller, from a service that does
 * nothing. It has a control plane: the peer directory (BDT), the
 * foreign-node table (FDT), admission, and the forwarding-permission query
 * the bridge asks before it relays.
 *
 * The router mounts at `/api`, so every path here carries that prefix and
 * `servers` is left at the service root rather than declaring a second one.
 */
export const apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Directory Service",
    version: "1.0.0",
    description:
      "Control plane for federation. Peers, foreign nodes, admission and forwarding permission. No event passes through this service.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Offer", description: "What this installation is and will receive" },
    { name: "Peers", description: "The peer directory (BDT)" },
    { name: "Foreign nodes", description: "The foreign-node table (FDT)" },
  ],
  paths: {
    "/api/offer": {
      get: {
        tags: ["Offer"],
        summary: "What this installation is, and which event classes it will receive",
        description:
          "Public and passive. Reading an offer admits nothing — admission happens on POST /api/peers and nowhere else. Peers that are identical as apps are distinguished here by installation id, which is the disk-persisted service identity and is stable across restarts.",
        responses: { "200": { description: "The installation's declaration" } },
      },
    },
    "/api/stats": {
      get: {
        tags: ["Offer"],
        summary: "Counts held by this directory",
        responses: { "200": { description: "Directory counts" } },
      },
    },
    "/api/peers": {
      get: {
        tags: ["Peers"],
        summary: "List known peers",
        responses: { "200": { description: "Peer entries" } },
      },
      post: {
        tags: ["Peers"],
        summary: "Admit a peer",
        description: "This is the admission point. Reading an offer does not admit; writing a peer entry does.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "201": { description: "Peer admitted" },
          "400": { description: "Invalid peer entry" },
          "403": { description: "Admission refused" },
        },
      },
    },
    "/api/peers/{peerId}": {
      get: {
        tags: ["Peers"],
        summary: "Read one peer",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The peer" }, "404": { description: "No such peer" } },
      },
      delete: {
        tags: ["Peers"],
        summary: "Remove a peer",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Removed" }, "404": { description: "No such peer" } },
      },
    },
    "/api/peers/{peerId}/status": {
      patch: {
        tags: ["Peers"],
        summary: "Change a peer's status",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated" }, "404": { description: "No such peer" } },
      },
    },
    "/api/peers/{peerId}/allow": {
      get: {
        tags: ["Peers"],
        summary: "May the bridge forward to this peer?",
        description: "The question the bridge asks before it relays. A permission query, not a delivery.",
        parameters: [{ name: "peerId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The ruling" }, "404": { description: "No such peer" } },
      },
    },
    "/api/foreign-nodes": {
      get: {
        tags: ["Foreign nodes"],
        summary: "List foreign nodes",
        responses: { "200": { description: "Foreign node entries" } },
      },
      post: {
        tags: ["Foreign nodes"],
        summary: "Register a foreign node",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Registered" }, "400": { description: "Invalid entry" } },
      },
    },
    "/api/foreign-nodes/{nodeId}": {
      delete: {
        tags: ["Foreign nodes"],
        summary: "Remove a foreign node",
        parameters: [{ name: "nodeId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Removed" }, "404": { description: "No such node" } },
      },
    },
    "/api/foreign-nodes/{nodeId}/heartbeat": {
      post: {
        tags: ["Foreign nodes"],
        summary: "Record a foreign node heartbeat",
        parameters: [{ name: "nodeId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Recorded" }, "404": { description: "No such node" } },
      },
    },
  },
} as const;
