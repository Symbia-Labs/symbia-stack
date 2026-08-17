/**
 * The thin half: MCP over stdio, pointed at a host that runs elsewhere.
 *
 * This is what Claude Desktop spawns. It imports no services, holds no
 * store, and boots in the time it takes to read one JSON file — so the
 * thing whose lifecycle the client owns is also the thing that never needs
 * to change. Rebuild the stack, restart the host, keep the chat window.
 *
 * ONE CONVERSATION, ONE HOST — decision of 17 Aug, reversing the 16 Aug
 * shape. The detached shared host bought rebuild-without-restarting-Claude
 * and paid for it the next morning: two conversations attached to one
 * stack, and a host that outlived its dead pipes screamed 4.2 million
 * signed EPIPEs into a 2.1 GB ledger. So the ordinary path is now: this
 * shim SPAWNS its own host on an ephemeral port with a private address
 * file, holds its stdin pipe, and the pipe closing is the host's shutdown
 * signal. The conversation ending ends the imagination — on purpose, and
 * by construction rather than by cleanup code. Federation between hosts
 * comes later; isolation comes first.
 *
 *   node shim.mjs                 spawn an owned host and attach to it
 *   node shim.mjs --attach        attach to a shared host at the default
 *                                 address file (dev; start one by hand
 *                                 with: node host.mjs)
 *   SYMBIA_BASE_URL=...           stack mode — talk to a deployed stack,
 *                                 spawn nothing
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readAddress, addressFile } from "./host-address.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.error("[shim]", ...a);
// stdout is the MCP protocol here too, and symbia-mcp-server is about to
// own it. Anything this file has to say goes to stderr.
console.log = console.error;

// --autostart is accepted and ignored: it described the old opt-in for
// booting a shared host, and installed plugins still pass it. Spawning an
// owned host is now the default, so the flag asks for what already happens.
const ATTACH = process.argv.includes("--attach") || process.env.IMAGINE_ATTACH === "1";

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

async function startOwnedHost() {
  // A private address file, in a directory only this pair knows. The shared
  // default file is exactly how two conversations ended up on one stack.
  process.env.IMAGINE_ADDRESS_FILE = join(mkdtempSync(join(tmpdir(), "imagine-")), "host.json");
  log("spawning an owned host — one conversation, one host; it dies with this one");
  const child = spawn(process.execPath, [join(here, "host.mjs")], {
    // stdin is a pipe this shim holds open and never writes to. It is the
    // host's lifeline in the literal sense: when this process exits — cleanly,
    // by crash, or by SIGKILL, which runs no cleanup code at all — the kernel
    // closes the pipe and the host takes itself down. Lifecycle by
    // construction, not by handler.
    stdio: ["pipe", "ignore", "inherit"],
    env: { ...process.env, IMAGINE_HOST_MODE: "1", IMAGINE_OWNED: "1" },
  });
  // NOT detached, NOT unref'd — the 16 Aug design inverted. Belt to the
  // pipe's braces: on any exit this process can act on, say goodbye first.
  process.on("exit", () => { try { child.kill("SIGTERM"); } catch { /* already gone */ } });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (child.exitCode !== null) {
      log(`the host exited (code ${child.exitCode}) before publishing an address — its stderr above is the diagnosis`);
      return null;
    }
    const addr = await findHost();
    if (addr) return addr;
  }
  return null;
}

if (!ensureDependencies()) process.exit(1);

// STACK MODE: A BASE URL THE CALLER SET IS AN INSTRUCTION, NOT A DEFAULT.
//
// symbia-mcp-server can address services two ways — `<base>/svc/<id>` when
// SYMBIA_BASE_URL is set, `host:port` per service when it is not (see
// serviceBase in its index.ts). That is the whole difference between talking
// to an imagine host and talking to a docker stack, and the switch has been
// there all along.
//
// Until 17 Aug this file assigned SYMBIA_BASE_URL unconditionally a few lines
// below, which closed the switch from the outside: no caller could reach it,
// so the plugin could only ever be pointed at an ephemeral host. Measured, not
// assumed — the assignment was `=`, not `??=`.
//
// A caller who sets it has named a stack that is already running. Nothing to
// find, nothing to autostart, and no session token to mint: the MCP server's
// own SYMBIA_SESSION_TOKEN / SYMBIA_TOKEN / SYMBIA_PASSWORD ladder is the
// credential path there, and it already refuses with a message naming all
// three when none is present.
const STACK_BASE = process.env.SYMBIA_BASE_URL?.replace(/\/$/, "") || null;

let host = null;
if (!STACK_BASE) {
  host = ATTACH ? await findHost() : await startOwnedHost();
}

if (!STACK_BASE && !host) {
  if (ATTACH) {
    const addr = readAddress();
    log(
      addr
        ? `--attach: an address is recorded at ${addressFile()} (${addr.base}, pid ${addr.pid}) but nothing answers there. ` +
          `The host died without cleaning up. Start one:  node ${join(here, "host.mjs")}`
        : `--attach: no shared host is running. Start one:  node ${join(here, "host.mjs")}`
    );
  } else {
    log("the owned host did not come up — its stderr above says why (a boot that fails must name its reason)");
  }
  process.exit(1);
}

if (host) {
  log(`attached to ${host.base} — mode ${host.mode ?? "unknown"}, pid ${host.pid}, session ${host.session}${ATTACH ? " (shared, --attach)" : " (owned)"}`);
} else {
  // Ask the named stack what it is rather than declaring it, for the reason
  // stated above alive(): the operating mode is a property of the thing
  // reached, and a transport that asserted one would keep asserting it after
  // the thing changed. If it answers with no mode, leave SYMBIA_MODE unset and
  // let the MCP server's own `?? "unknown"` say so.
  const hello = await alive(STACK_BASE);
  if (!hello) log(`WARNING: nothing answered at ${STACK_BASE} — starting anyway; every call will fail until it does`);
  else log(`stack mode — ${STACK_BASE}, mode ${hello.mode ?? "unreported"}`);
  if (hello?.mode) process.env.SYMBIA_MODE = hello.mode;
}

// The MCP server addresses services by id against a base URL. That is the
// whole coupling between these two processes — no shared memory, no shared
// module graph, one env var.
if (host) process.env.SYMBIA_BASE_URL = host.base;
// THE MODE COMES FROM THE HOST, NOT FROM THIS FILE.
//
// The first real call through a shim came back `"mode": "unknown"` where
// every previous one said `"imagine"` — the sidecar set SYMBIA_MODE before
// importing the MCP server, and splitting the process left nothing to set
// it. Every response carries this field, so it is the one piece of state a
// transport must not guess at: it is the difference between "a write here
// is a sketch" and "a write here is a record".
if (host) process.env.SYMBIA_MODE = host.mode ?? "unknown";

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
//
// None of that applies in stack mode. A docker stack mints no per-session
// token and has never seen this file, so sending SYMBIA_HOST_TOKEN there would
// be a credential for one gate offered to another.
if (host) {
  if (host.token) process.env.SYMBIA_HOST_TOKEN = host.token;
  else log("WARNING: the host published no token — it predates the gate, and its routes are open");

  // Retained for a host that still seeds a named principal. The open question
  // recorded in contexts/map-attachment-hardening is whether a distributed build
  // should have one at all, or whether the session token should BE the principal.
  process.env.SYMBIA_EMAIL = process.env.SYMBIA_EMAIL || "dev@example.com";
  process.env.SYMBIA_PASSWORD = process.env.SYMBIA_PASSWORD || "password123";
}

// WHERE THE MCP SERVER IS DEPENDS ON WHICH PACKAGING THIS IS.
//
// This was a single relative import two levels up, which was correct exactly
// once: from experiments/standalone/, where two levels up was the repository
// root. It survived two moves that each broke it silently.
//
// In the installed plugin it resolved to <plugins-dir>/symbia-mcp-server, one
// level above the plugin root — measured 17 Aug against the installed copy,
// ERR_MODULE_NOT_FOUND, which is why the connector could not start while the
// host it attaches to was running and healthy.
//
// The rename to imagine/ broke the repository case the same way, one level
// short, and nothing reported it: check-deps.mjs reads this file but collects
// bare package specifiers, and a relative path is not a package name.
//
// So: name the candidates, and if none exists say which were tried. A missing
// import that names nothing is the failure this repository keeps paying for.
const MCP_CANDIDATES = [
  join(here, "mcp-server", "index.js"),          // packaged, and the repo after a build
  join(here, "..", "symbia-mcp-server", "dist", "index.js"), // repository checkout
];
const mcpEntry = MCP_CANDIDATES.find((p) => existsSync(p));
if (!mcpEntry) {
  log("could not find symbia-mcp-server. Tried:");
  for (const c of MCP_CANDIDATES) log(`  ${c}`);
  log("In a checkout: npm run build -w symbia-mcp-server. In a plugin: the archive was built without it.");
  process.exit(1);
}
await import(pathToFileURL(mcpEntry).href);
