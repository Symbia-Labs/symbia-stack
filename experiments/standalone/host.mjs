/**
 * The imagine STACK, as a long-lived process you can restart on its own.
 *
 * Everything sidecar.mjs does except talk MCP: ten services, the session
 * ledger, seal, diagnostics — listening on a KNOWN port, written to a file
 * the shim reads.
 *
 * Why this exists. Claude Desktop spawns the MCP server and owns its
 * lifecycle, so every rebuild of the sidecar meant quitting and reopening
 * Claude. Three times today. Splitting the process moves the restart to
 * something nobody has to close a chat window for.
 *
 * What it costs, stated plainly: the stack now outlives the client. When a
 * client quits, the imagination no longer goes with it — that has to be
 * done deliberately (`--once`, or killing the host). The mode's claim
 * becomes "ephemeral by instruction" rather than "ephemeral by
 * construction", which is weaker and worth knowing.
 */
import { spawn } from "node:child_process";
import { writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ADDRESS_FILE = join(here, ".session", "host.json");

/**
 * Where the host is listening, or null.
 *
 * The file is written on boot and removed on takedown, so a stale file
 * means the host died without cleaning up. Callers must treat "file exists"
 * as a hint, not a fact, and confirm with a request — which is why this
 * returns the address rather than a boolean.
 */
export function readAddress() {
  if (!existsSync(ADDRESS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(ADDRESS_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function clearAddress() {
  try { unlinkSync(ADDRESS_FILE); } catch { /* already gone */ }
}

// Run directly: boot the stack, publish the address, wait.
if (process.argv[1] && process.argv[1].endsWith("host.mjs")) {
  process.env.IMAGINE_HOST_MODE = "1";
  // sidecar.mjs boots everything and, in host mode, skips the MCP import
  // and writes its address here instead.
  await import("./sidecar.mjs");
}
