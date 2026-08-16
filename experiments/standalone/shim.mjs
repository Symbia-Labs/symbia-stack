/**
 * The thin half: MCP over stdio, pointed at a host that runs elsewhere.
 *
 * This is what Claude Desktop spawns. It imports no services, holds no
 * store, and boots in the time it takes to read one JSON file — so the
 * thing whose lifecycle the client owns is also the thing that never needs
 * to change. Rebuild the stack, restart the host, keep the chat window.
 *
 * The only judgement here is what to do when the host is absent. A shim
 * that starts one silently would make "the stack is down" and "I started
 * you a fresh empty one" indistinguishable, which is the confident-negative
 * failure this repo keeps finding. So: attach if a host is there, say so
 * plainly if not, and start one only when asked.
 *
 *   node shim.mjs                 attach, or explain why not
 *   node shim.mjs --autostart     attach, or boot a host and then attach
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAddress, ADDRESS_FILE } from "./host-address.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.error("[shim]", ...a);
// stdout is the MCP protocol here too, and symbia-mcp-server is about to
// own it. Anything this file has to say goes to stderr.
console.log = console.error;

const AUTOSTART = process.argv.includes("--autostart") || process.env.IMAGINE_AUTOSTART === "1";

/** Is anything actually answering there? A file is a hint, not a fact. */
async function alive(base) {
  try {
    const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function findHost() {
  const addr = readAddress();
  if (addr?.base && (await alive(addr.base))) return addr;
  return null;
}

async function startHost() {
  log("no host answering — starting one");
  const child = spawn("/opt/homebrew/bin/node", [join(here, "host.mjs")], {
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, IMAGINE_HOST_MODE: "1" },
  });
  // Detached on purpose: the host must outlive this shim, which is the
  // entire point of the split.
  child.unref();

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const addr = await findHost();
    if (addr) return addr;
  }
  return null;
}

let host = await findHost();
if (!host && AUTOSTART) host = await startHost();

if (!host) {
  const addr = readAddress();
  log(
    addr
      ? `A host address is recorded at ${ADDRESS_FILE} (${addr.base}, pid ${addr.pid}) but nothing answers there. ` +
        `The host died without cleaning up. Start one:  node ${join(here, "host.mjs")}`
      : `No imagine host is running. Start one:  node ${join(here, "host.mjs")}\n` +
        `        or run this shim with --autostart to have it boot one.`
  );
  process.exit(1);
}

log(`attached to ${host.base} (pid ${host.pid}, session ${host.session})`);

// The MCP server addresses services by id against a base URL. That is the
// whole coupling between these two processes — no shared memory, no shared
// module graph, one env var.
process.env.SYMBIA_BASE_URL = host.base;
process.env.SYMBIA_EMAIL = process.env.SYMBIA_EMAIL || "dev@example.com";
process.env.SYMBIA_PASSWORD = process.env.SYMBIA_PASSWORD || "password123";

await import("../../symbia-mcp-server/dist/index.js");
