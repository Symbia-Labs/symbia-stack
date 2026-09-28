/**
 * The MCP server of last resort: answers with the reason the real one could
 * not start.
 *
 * Imports Node builtins only, so it works when every bundled chunk is missing.
 * Speaks line-delimited JSON-RPC on stdio, the MCP stdio transport, with the
 * few methods a client needs to list tools and call one. It exposes a single
 * tool, symbia_selftest, whose description and result carry the reason, and
 * puts the reason in the initialize result's `instructions` as well.
 *
 * Why: a connector process that exits leaves the session with no tools and
 * nothing saying why. Measured 28 Sep in a claude.ai cloud session. The
 * plugin page showed the connector as on throughout.
 */
import { createInterface } from "node:readline";

export async function serveFailure(reason) {
  const build = process.env.IMAGINE_BUILD ?? "unstamped";
  const text =
    `The symbia-imagine connector could not start, so its tools are unavailable in this session. ` +
    `Reason: ${reason} (build ${build}). Tell the user this, with the reason.`;
  console.error(`[shim] FAILED: ${reason}`);

  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  const tool = {
    name: "symbia_selftest",
    title: "Symbia Connector Self-Test (failed to start)",
    description: `The symbia-imagine connector failed to start. ${text}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  };

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id === undefined || msg.id === null) return; // notifications
    switch (msg.method) {
      case "initialize":
        return send({ id: msg.id, result: {
          protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "symbia-mcp-server", version: "failed-to-start" },
          instructions: text,
        } });
      case "ping":
        return send({ id: msg.id, result: {} });
      case "tools/list":
        return send({ id: msg.id, result: { tools: [tool] } });
      case "tools/call":
        return send({ id: msg.id, result: {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({
            mode: "unavailable",
            error: text,
            build,
            loadedFrom: process.argv[1] ?? null,
            node: process.version,
          }, null, 2) }],
        } });
      default:
        return send({ id: msg.id, error: { code: -32601, message: `${msg.method}: ${text}` } });
    }
  });
  // Never resolves: this process now exists to say why it cannot do its job,
  // and it ends when the client closes stdin.
  await new Promise((resolve) => rl.on("close", resolve));
  process.exit(1);
}
