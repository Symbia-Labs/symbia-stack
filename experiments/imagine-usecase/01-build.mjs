/**
 * Build a use case in imagine mode, through the API alone.
 *
 * Every step goes through the MCP dispatcher into the headless sidecar —
 * no direct writes, no seed-file edits, no shell into a service. That
 * constraint is the experiment: the governing rule says anything that
 * cannot be built through the Symbia API is a platform defect, and this
 * finds out where that line actually falls.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "" },
});

let buf = "";
const seen = new Map();
child.stdout.on("data", (c) => {
  buf += c.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { const m = JSON.parse(line); if (m.id !== undefined) seen.set(m.id, m); } catch {}
  }
});
child.stderr.on("data", () => {});

let nextId = 10;
const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
const wait = async (id, ms = 45000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (seen.has(id)) return seen.get(id);
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};
async function call(name, args) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  const r = await wait(id);
  const text = r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? "no response");
  try { return { ok: !r?.result?.isError, data: JSON.parse(text) }; }
  catch { return { ok: !r?.result?.isError, data: text }; }
}
const api = (service, method, path, body, params) =>
  call("symbia_call", { service, method, path, ...(body ? { body } : {}), ...(params ? { params } : {}) });

const results = [];
const record = (name, verdict, detail) => {
  results.push({ name, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${name}${detail ? " — " + detail : ""}`);
};

// --- boot -------------------------------------------------------------------
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "usecase-spike", version: "1" } } });
await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
await new Promise((r) => setTimeout(r, 4000));

// --- PU1: author a component manifest ---------------------------------------
const manifest = {
  key: "components/verify.computed",
  name: "Computed Verification",
  type: "component",
  status: "published",
  tags: ["verify", "canonical"],
  metadata: {
    manifest: {
      id: "symbia.verify.computed",
      name: "Computed Verification",
      description:
        "Recompute a claimed value from its stated inputs and report agreement. Canonical: the check is redoable by anyone holding the inputs.",
      inputs: ["in"],
      outputs: ["verified", "refuted", "error"],
      config: {
        expression: { type: "string", required: true, description: "Arithmetic over {placeholders} from the message." },
        claimField: { type: "string", required: true, description: "Field holding the claimed value to compare against." },
      },
      lanes: {
        verified: { lane: "canonical", note: "recomputed from stated inputs" },
        refuted: { lane: "canonical", note: "a disagreement is as checkable as an agreement" },
        error: { lane: "apocryphal", note: "a refusal is not a recomputable value" },
      },
    },
  },
};
const pu1 = await api("catalog", "POST", "/api/resources", manifest);
record("PU1 component manifest authorable", pu1.ok ? "HELD" : "BROKEN",
  pu1.ok ? `created ${pu1.data?.result?.key}` : String(JSON.stringify(pu1.data)).slice(0, 160));

// --- PU2: can the runtime execute it? ---------------------------------------
const comps = await api("runtime", "GET", "/api/components");
const list = comps.data?.result?.components ?? comps.data?.result ?? [];
const runnable = Array.isArray(list) && list.some((c) => (c.id ?? c) === "symbia.verify.computed");
record("PU2 runtime executes an API-authored component",
  runnable ? "HELD (unexpected)" : "BROKEN (as predicted)",
  runnable ? "registered in the executor" : `executor knows ${Array.isArray(list) ? list.length : "?"} components, none of them the new one`);

// --- PU3: compose EXISTING components ---------------------------------------
const graph = {
  key: "graphs/verifiable-brief-demo",
  name: "Verifiable Brief (demo slice)",
  type: "graph",
  status: "published",
  tags: ["demo", "imagine"],
  metadata: {
    definition: {
      name: "verifiable-brief-demo",
      nodes: [
        { id: "tick", component: "symbia.source.timer", config: { intervalMs: 60000 } },
        { id: "check", component: "symbia.compute.arithmetic", config: { expression: "({claimed} - {computed})" } },
        { id: "out", component: "symbia.io.log", config: {} },
      ],
      edges: [
        { from: "tick", fromPort: "out", to: "check", toPort: "in" },
        { from: "check", fromPort: "out", to: "out", toPort: "in" },
      ],
    },
  },
};
const pu3a = await api("catalog", "POST", "/api/resources", graph);
record("PU3a graph of existing components authorable", pu3a.ok ? "HELD" : "BROKEN",
  pu3a.ok ? `created ${pu3a.data?.result?.key}` : String(JSON.stringify(pu3a.data)).slice(0, 160));

const graphsSeen = await api("runtime", "GET", "/api/graphs");
const gs = graphsSeen.data?.result;
record("PU3b runtime sees the graph", Array.isArray(gs) || gs?.graphs ? "measured" : "unclear",
  JSON.stringify(gs).slice(0, 140));

// --- PU4: author an assistant -----------------------------------------------
const assistant = {
  key: "assistants/verifier",
  name: "Verifier",
  type: "assistant",
  status: "published",
  tags: ["demo", "imagine"],
  metadata: {
    alias: "verifier",
    llm: { provider: "symbia-labs", model: "qwen2-5-0-5b-instruct-q4-k-m", temperature: 0 },
    rules: [
      {
        id: "route-numeric-claims",
        name: "Numeric claims go to the computed check",
        enabled: true,
        priority: 100,
        trigger: "message.received",
        conditions: { field: "content", operator: "matches", value: "\\d" },
        actions: [{ id: "step-verify", type: "tool.invoke", params: { tool: "symbia.verify.computed" } }],
      },
    ],
  },
};
const pu4 = await api("catalog", "POST", "/api/resources", assistant);
record("PU4 assistant authorable", pu4.ok ? "HELD" : "BROKEN",
  pu4.ok ? `created ${pu4.data?.result?.key}` : String(JSON.stringify(pu4.data)).slice(0, 160));

const loaded = await api("assistants", "GET", "/api/assistants");
const names = (loaded.data?.result?.assistants ?? []).map((a) => a.key ?? a.name);
record("PU4b assistant loads into the service", names.length ? "measured" : "empty",
  names.length ? names.join(", ") : "loader did not pick it up");

// --- PU5: lanes visible ------------------------------------------------------
const compDetail = await api("runtime", "GET", "/api/components/{id}", null, { id: "symbia.compute.arithmetic" });
const lanes = compDetail.data?.result?.lanes ?? compDetail.data?.result?.component?.lanes;
record("PU5 lanes visible on a component", lanes ? "HELD" : "BROKEN",
  lanes ? JSON.stringify(lanes).slice(0, 120) : String(JSON.stringify(compDetail.data)).slice(0, 120));

writeFileSync(join(here, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length} checks recorded -> results.json`);
child.kill();
process.exit(0);
