/**
 * Runtime service schema (roadmap Phase 3 — durable executions).
 *
 * Applied to the `runtime` database by db-bootstrap, and used as the pg-mem
 * schema when the service runs without Postgres.
 *
 * The design decision that matters is the key on `operator_state`.
 *
 * Operator state was previously held in a process Map keyed by **execution
 * id**. An execution id is minted fresh every time a graph is stood up, so a
 * restart could never inherit anything: the state was not merely volatile, it
 * was unreachable by construction. Keying by (graph_key, node_id) — the
 * graph's stable catalog identity and the node inside it — is what lets a
 * rehydrated execution resume the join/window/rollup it left behind.
 *
 * `graph_key` is the catalog resource key for hydrated graphs, falling back to
 * the graph name for graphs loaded ad hoc. Two different graphs cannot collide;
 * the same graph across restarts deliberately does.
 */
export const MEMORY_SCHEMA_SQL = `
CREATE TABLE "graph_executions" (
  "id" varchar PRIMARY KEY,
  "graph_key" text NOT NULL,
  "graph_name" text NOT NULL,
  "org_id" varchar,
  "state" text NOT NULL,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" jsonb,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "graph_executions_graph_key_idx" ON "graph_executions" ("graph_key");
CREATE INDEX "graph_executions_state_idx" ON "graph_executions" ("state");

CREATE TABLE "operator_state" (
  "graph_key" text NOT NULL,
  "node_id" text NOT NULL,
  "state_key" text NOT NULL,
  "value" jsonb NOT NULL,
  "org_id" varchar,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("graph_key", "node_id", "state_key")
);

CREATE INDEX "operator_state_graph_key_idx" ON "operator_state" ("graph_key");
`;
