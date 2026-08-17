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
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAddress, ADDRESS_FILE } from "./host-address.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.error("[shim]", ...a);
// stdout is the MCP protocol here too, and symbia-mcp-server is about to
// own it. Anything this file has to say goes to stderr.
console.log = console.error;

const AUTOSTART = process.argv.includes("--autostart") || process.env.IMAGINE_AUTOSTART === "1";

/**
 * Is anything actually answering there, and what is it?
 *
 * Returns the host's own description or null. Asking rather than assuming
 * matters for the mode: the shim is a transport, and the operating mode is
 * a property of the stack it reached. A shim that hardcoded "imagine" would
 * keep saying so while attached to something else.
 */
async function alive(base) {
  try {
    const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * What this shim was built from. Compared against the host's own marker before
 * any call is issued — see the refusal below for why that ordering matters.
 */
const SHIM_BUILD = process.env.IMAGINE_BUILD || "dev";

async function findHost() {
  const addr = readAddress();
  if (!addr?.base) return null;
  const hello = await alive(addr.base);
  if (!hello) return null;

  // REFUSE A MISMATCHED HOST BEFORE ISSUING ANYTHING.
  //
  // The alternative is attaching and failing on the first real call, which
  // produces an error about whatever that call happened to be rather than
  // about the mismatch. Twice today a measurement was nearly filed against a
  // bundle that predated the code under test; both times what saved it was a
  // human habit of grepping a marker. A stranger has no such habit, so the
  // check moves here and fails loudly with the two versions named.
  if (hello.build && SHIM_BUILD !== "dev" && hello.build !== SHIM_BUILD) {
    log(
      `REFUSING: this shim is build ${SHIM_BUILD}, the host at ${addr.base} is build ${hello.build}. ` +
      `A client talking to a host built from different source reports failures that belong to ` +
      `neither. Restart the host from the same install.`
    );
    process.exit(1);
  }

  return { ...addr, mode: hello.mode, build: hello.build };
}

/**
 * Dependencies, on first run only.
 *
 * WHY THIS IS NOT SHIPPED PRE-INSTALLED. The installed tree is 150 MB, and
 * 114 MB of that is `googleapis` — pulled in by identity's Google OAuth path,
 * which an ephemeral local stack never reaches. Shipping it would make the
 * plugin fifty times its own size to carry code that does not run here.
 *
 * So the plugin carries source and bundles, about 2 MB, and the first
 * attachment installs. It happens once per install, it says what it is doing
 * on stderr, and a failure names the directory rather than surfacing later as
 * a module that cannot be found.
 *
 * The honest cost: first run needs a network and takes as long as npm takes.
 * That is stated in the README rather than discovered.
 */
function depRoot() {
  // The package.json sits beside this file in the repository and one level up
  // when packaged, because in the plugin the bundles are a SIBLING of this
  // directory and Node only resolves upward. Installing into sidecar/ there
  // put 241 packages somewhere services/*.mjs could never see them: measured,
  // 2 of 10 services mounted and eight failed on packages that were present.
  for (const c of [here, join(here, "..")]) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  return here;
}

function ensureDependencies() {
  const root = depRoot();
  if (existsSync(join(root, "node_modules", "@symbia", "crypto"))) return true;
  log("first run — installing dependencies (once; about 150 MB, mostly googleapis)");
  const r = spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    log(`FAILED: npm install exited ${r.status} in ${root}. The sidecar cannot start without it.`);
    return false;
  }
  // The workspace libraries are not on any registry. They travel with the
  // plugin as a vendored copy; this puts them where Node will look.
  if (!existsSync(join(root, "node_modules", "@symbia", "crypto"))) {
    log("dependencies installed, but @symbia/* are missing — the vendored copy did not ship");
    return false;
  }
  log("dependencies installed");
  return true;
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

if (!ensureDependencies()) process.exit(1);

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

log(`attached to ${host.base} — mode ${host.mode ?? "unknown"}, pid ${host.pid}, session ${host.session}`);

// The MCP server addresses services by id against a base URL. That is the
// whole coupling between these two processes — no shared memory, no shared
// module graph, one env var.
process.env.SYMBIA_BASE_URL = host.base;
// THE MODE COMES FROM THE HOST, NOT FROM THIS FILE.
//
// The first real call through a shim came back `"mode": "unknown"` where
// every previous one said `"imagine"` — the sidecar set SYMBIA_MODE before
// importing the MCP server, and splitting the process left nothing to set
// it. Every response carries this field, so it is the one piece of state a
// transport must not guess at: it is the difference between "a write here
// is a sketch" and "a write here is a record".
process.env.SYMBIA_MODE = host.mode ?? "unknown";

// THE TOKEN COMES FROM THE FILE, NOT FROM A CONFIG A USER EDITS.
//
// This is the line that makes the sidecar installable. Before it, attaching a
// client meant a bearer token pasted into .mcp.json — a long-lived secret in a
// file people commit by accident, which is exactly what happened in this
// repository at 303c2df and cost a rotation before its history could be
// pushed anywhere.
//
// Now the credential is minted by the host at spawn, readable only by the user
// who started it, and worthless the moment that process exits. Nobody types
// it, nobody stores it, nobody rotates it.
if (host.token) process.env.SYMBIA_HOST_TOKEN = host.token;
else log("WARNING: the host published no token — it predates the gate, and its routes are open");

// Retained for a host that still seeds a named principal. The open question
// recorded in contexts/map-attachment-hardening is whether a distributed build
// should have one at all, or whether the session token should BE the principal.
process.env.SYMBIA_EMAIL = process.env.SYMBIA_EMAIL || "dev@example.com";
process.env.SYMBIA_PASSWORD = process.env.SYMBIA_PASSWORD || "password123";

await import("../../symbia-mcp-server/dist/index.js");
