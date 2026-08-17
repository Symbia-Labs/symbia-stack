/**
 * Speak MCP to the sidecar the way Claude Desktop would: spawn it, send
 * initialize + tools/list (+ one tool call), print what came back, exit.
 *
 * This is the measurement that matters for the sidecar — not "the process
 * started" but "a client got tools out of it over stdio".
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(here, "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "" },
});

let buf = "";
const seen = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined) seen.set(msg.id, msg);
    } catch {
      console.error("NON-JSON ON STDOUT (would corrupt MCP):", line.slice(0, 120));
    }
  }
});
child.stderr.on("data", (c) => process.stderr.write(c));

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
const wait = async (id, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (seen.has(id)) return seen.get(id);
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
};

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "1" } } });
const init = await wait(1);
console.log("initialize:", init?.result?.serverInfo ?? init?.error ?? "no response");

send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const list = await wait(2);
const tools = list?.result?.tools ?? [];
console.log(`tools/list: ${tools.length} tools`);
console.log("  " + tools.map((t) => t.name).join("\n  "));

send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "symbia_stack_health", arguments: {} } });
const health = await wait(3);
const text = health?.result?.content?.[0]?.text ?? JSON.stringify(health?.error ?? health);
console.log("\nsymbia_stack_health ->");
console.log(text.slice(0, 700));

child.kill();
process.exit(0);
