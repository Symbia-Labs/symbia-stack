/**
 * What exactly kills the sidecar on a large tool call?
 *
 * The tool-boundary guard added today never ran: the process was already
 * gone. This isolates the failure and reports the exit code, the signal,
 * and whatever stderr survived.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MB = Number(process.argv[2] ?? 11);

const child = spawn("/opt/homebrew/bin/node", [join(here, "..", "standalone", "sidecar.mjs")], {
  stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "" },
});
let out = "", err = "";
child.stdout.on("data", (c) => { out += c.toString(); });
child.stderr.on("data", (c) => { err += c.toString(); });
child.on("exit", (code, sig) => {
  console.log(`\nCHILD EXIT code=${code} signal=${sig}`);
  console.log("stderr tail:\n" + err.split("\n").slice(-25).join("\n"));
  process.exit(0);
});

const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "oversize", version: "1" } } });
await new Promise(r => setTimeout(r, 18000));
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

console.log(`sending a ${MB} MB body...`);
send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "symbia_call", arguments: {
  service: "catalog", method: "POST", path: "/api/resources",
  body: { key: "contexts/oversize", name: "O", type: "context", status: "draft", metadata: { blob: "x".repeat(MB * 1024 * 1024) } },
} } });

await new Promise(r => setTimeout(r, 20000));

// The security question is not whether the big message is answered. It is
// whether the SESSION survives it: after the oversized line, can a normal
// tool call still be made?
send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "symbia_selftest", arguments: {} } });
await new Promise(r => setTimeout(r, 15000));
console.log(`session usable after oversize (id=3 answered): ${/"id":3/.test(out)}`);

const responded = /"id":2/.test(out);
console.log(`responded to id=2: ${responded}`);
if (responded) {
  const line = out.split("\n").find(l => l.includes('"id":2'));
  console.log("response: " + (line || "").slice(0, 400));
}
console.log(`process alive: ${child.exitCode === null}`);
console.log("stderr tail:\n" + err.split("\n").slice(-15).join("\n"));
child.kill();
process.exit(0);
