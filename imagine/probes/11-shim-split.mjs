/**
 * Does splitting the process actually remove the restart?
 *
 * Predictions registered through the sidecar first:
 * `contexts/map-shim-split`, resource 4b855217-3bd2-4d0c-86a6-3c9748f36f40.
 *
 * S1 the shim survives a full host restart
 * S2 a call while the host is down names the host and the transport code
 * S3 the shim starts in under a second                     [expected wrong]
 * S4 state does NOT survive: pg-mem and the session identity are in the host
 * S5 one host serving two shims removes D7
 */
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAddress } from "../host-address.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const stand = join(here, "..", "standalone");
const NODE = "/opt/homebrew/bin/node";
const rec = (id, ok, note) => console.log(`${id} ${ok ? "HELD  " : "BROKEN"} ${note}`);

function connect(name) {
  const c = spawn(NODE, [join(stand, "shim.mjs")], {
    stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "" },
  });
  const seen = new Map();
  let buf = "", err = "";
  c.stdout.on("data", (d) => {
    buf += d.toString(); let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!l) continue;
      try { const m = JSON.parse(l); if (m.id !== undefined) seen.set(m.id, m); } catch {}
    }
  });
  c.stderr.on("data", (d) => { err += d.toString(); });
  let next = 1;
  const send = (o) => c.stdin.write(JSON.stringify(o) + "\n");
  const wait = async (id, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (seen.has(id)) return seen.get(id); await new Promise((r) => setTimeout(r, 100)); }
    return null;
  };
  return {
    name, proc: c,
    stderr: () => err,
    async init() {
      const id = next++;
      send({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name, version: "1" } } });
      const r = await wait(id, 20000);
      send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      return !!r;
    },
    async call(args) {
      const id = next++;
      send({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "symbia_call", arguments: args } });
      const r = await wait(id);
      const text = r?.result?.content?.[0]?.text ?? "no response";
      let data = null; try { data = JSON.parse(text); } catch {}
      return { isError: !!r?.result?.isError, text, data };
    },
  };
}

// --- boot a host -----------------------------------------------------------
const host = spawn(NODE, [join(stand, "host.mjs")], {
  stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, NODE_ENV: "", IMAGINE_HOST_MODE: "1" },
});
let hostErr = "";
host.stderr.on("data", (d) => { hostErr += d.toString(); });
for (let i = 0; i < 80 && !readAddress(); i += 1) await new Promise((r) => setTimeout(r, 500));
const addr1 = readAddress();
console.log(`host up: ${addr1?.base} pid ${addr1?.pid}\n`);
await new Promise((r) => setTimeout(r, 6000));

// --- S3: how long does a shim take to be usable? ---------------------------
const t0 = Date.now();
const a = connect("A");
await a.init();
const bootMs = Date.now() - t0;
rec("S3", bootMs < 1000, `shim ready in ${bootMs}ms`);

// Author something, so S4 has something to lose.
await a.call({ service: "catalog", method: "POST", path: "/api/resources", body: {
  key: "contexts/before-restart", name: "Before restart", type: "context", status: "draft", metadata: {},
} });
const before = await a.call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/before-restart" } });
const hadIt = (before.data?.result ?? []).length === 1;

// --- S5: a second shim, same host ------------------------------------------
const b = connect("B");
await b.init();
const seenByB = await b.call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/before-restart" } });
rec("S5", (seenByB.data?.result ?? []).length === 1,
  `shim B ${(seenByB.data?.result ?? []).length === 1 ? "sees" : "does NOT see"} what shim A wrote — one stack, two clients`);

// --- S2: kill the host, call anyway ----------------------------------------
host.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 3000));
const down = await a.call({ service: "catalog", method: "GET", path: "/api/resources" });
const named = /127\.0\.0\.1|localhost/.test(down.text) && /ECONNREFUSED|connect|reach/i.test(down.text);
rec("S2", down.isError && named, `while down: ${down.text.slice(0, 130).replace(/\s+/g, " ")}`);

// --- S1: restart the host, same shim ---------------------------------------
const host2 = spawn(NODE, [join(stand, "host.mjs")], {
  stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, NODE_ENV: "", IMAGINE_HOST_MODE: "1" },
});
for (let i = 0; i < 80 && !readAddress(); i += 1) await new Promise((r) => setTimeout(r, 500));
await new Promise((r) => setTimeout(r, 8000));
const after = await a.call({ service: "catalog", method: "GET", path: "/api/resources", params: { key: "contexts/before-restart" } });
rec("S1", !after.isError,
  `the SAME shim, never restarted, ${after.isError ? "cannot reach" : "reaches"} the new host`);

const survived = (after.data?.result ?? []).length === 1;
rec("S4", hadIt && !survived,
  `authored before the restart: ${hadIt ? "yes" : "no"}; present after: ${survived ? "yes — state SURVIVED" : "no — lost with the host, as predicted"}`);

a.proc.kill(); b.proc.kill(); host2.kill();
process.exit(0);
