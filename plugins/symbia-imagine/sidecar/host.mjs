/**
 * Run the imagine STACK as a long-lived process you can restart on its own.
 *
 * Everything sidecar.mjs does except talk MCP: ten services, the session
 * ledger, seal, diagnostics — on a known port, with its address published
 * for a shim to find.
 *
 * Why this exists. Claude Desktop spawns the MCP server and owns its
 * lifecycle, so every rebuild of the sidecar meant quitting and reopening
 * Claude. Three times on 16 Aug. Splitting the process moves the restart to
 * something nobody has to close a chat window for.
 *
 * What it costs, stated plainly: the stack now outlives the client. "When
 * the client quits, the imagination goes with it" becomes something you do
 * on purpose rather than something the shape guarantees.
 */
export { ADDRESS_FILE, readAddress, clearAddress } from "./host-address.mjs";

if (process.argv[1] && process.argv[1].endsWith("host.mjs")) {
  process.env.IMAGINE_HOST_MODE = "1";
  await import("./sidecar.mjs");
}
