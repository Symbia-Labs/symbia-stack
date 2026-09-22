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
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
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

// PORT MODE: A DEPLOYED STACK WHERE EVERY SERVICE OWNS A PORT.
//
// symbia-mcp-server addresses services two ways (serviceBase, index.js):
// `<base>/svc/<id>` when SYMBIA_BASE_URL is set, and `host:port` per service
// when it is not. The second is how a docker/compose stack answers, and until
// now it was unreachable through this shim: leaving SYMBIA_BASE_URL unset is
// also the signal to SPAWN an owned host, and the spawn then assigns it. So
// the only stack this file could point at was a one-origin one.
//
// Measured 18 Aug against a live stack: identity..directory answer on
// 5001-5010, `/svc/<id>` is 404 on all of them, and :9000 is the admin UI, not
// a gateway. Pointing SYMBIA_BASE_URL at any of those cannot work — the shape
// is wrong, not the address.
//
// This flag says: spawn nothing, assign nothing, let serviceBase fall through
// to its port map. It is deliberately explicit rather than inferred, because
// the absence of a base URL already means something else here.
const PORT_MODE = process.env.SYMBIA_PORT_MODE === "1";

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

/**
 * Boot progress, published where the MCP server can read it.
 *
 * Same process — the shim `await import`s the MCP server — so the environment
 * is shared memory between the two. Every host-touching tool reads this when
 * it has no address yet, and says "still starting: <this>" instead of failing
 * with a refused socket.
 */
function status(s) {
  process.env.SYMBIA_BOOT_STATUS = s;
  return s;
}

/**
 * ASYNC, because a synchronous install would freeze the transport.
 *
 * This was `spawnSync`, which was correct while the MCP server was imported
 * last: nothing was listening, so blocking the event loop cost nothing. Now
 * the transport connects first and this runs behind it, and a spawnSync here
 * would stall the very thing the reorder exists to keep responsive — the
 * client would see a connected server that answers nothing, which is worse
 * than the timeout it replaced.
 */
async function ensureDependencies() {
  const root = depRoot();

  // THE SENTINEL WAS CHECKING THE WRONG THING.
  //
  // `node_modules/@symbia/crypto` is a vendored copy — see vendor-libs.sh —
  // and its presence is not contingent on `npm install` having completed.
  // Measured 18 Aug: two connectors (symbia-imagine, symbia-durable) sharing
  // one CLAUDE_PLUGIN_ROOT both reached this function within milliseconds on
  // a cold install, both ran `npm install` concurrently into the same
  // node_modules, and the result was 106 of 259 packages present — `ajv`
  // missing, both connectors crashing on the identical import inside
  // @modelcontextprotocol/sdk. The old sentinel would have reported that
  // half-installed tree as complete, because the vendored package it checked
  // was never the thing that raced.
  //
  // depsPresent() now checks a package that ONLY exists if npm's install
  // actually ran to completion — ajv is a transitive dependency of the SDK's
  // validation path and was the exact package missing in the corrupted run —
  // alongside the vendored copy, so both halves of the tree are covered.
  const depsPresent = () =>
    existsSync(join(root, "node_modules", "ajv", "package.json")) &&
    existsSync(join(root, "node_modules", "@symbia", "crypto"));

  if (depsPresent()) return true;

  // TWO CONNECTORS, ONE INSTALL: LOCK IT.
  //
  // mkdirSync on a fixed path is atomic — exactly one caller's mkdirSync can
  // succeed on a given path; every other concurrent caller gets EEXIST. That
  // makes the lock directory's existence itself the coordination, with no
  // separate lockfile protocol to get wrong. Whoever loses the race waits for
  // the winner's install to finish rather than starting a second one.
  const lockDir = join(root, ".install.lock");
  let owner = false;
  try {
    mkdirSync(lockDir);
    owner = true;
  } catch {
    owner = false;
  }

  if (!owner) {
    status("waiting for another connector to finish installing dependencies");
    log("another connector already owns the install lock at " + lockDir + " — waiting rather than racing it");
    const waitDeadline = Date.now() + 120000;
    while (Date.now() < waitDeadline) {
      await new Promise((r) => setTimeout(r, 1000));
      if (depsPresent()) {
        log("dependencies installed (by the other connector)");
        return true;
      }
      if (!existsSync(lockDir)) break; // released without finishing — fall through and try to take it
    }
    if (depsPresent()) return true;
    try {
      mkdirSync(lockDir);
      owner = true;
    } catch {
      owner = false;
    }
    if (!owner) {
      status("dependency install did not complete and is still locked by another connector");
      log("gave up waiting on " + lockDir + " — the other connector's install neither finished nor released the lock");
      return false;
    }
  }

  try {
    status("installing dependencies (one time, about 250 MB)");
    log("first run — installing dependencies (once; about 250 MB)");
    // NPM IS FOUND NEXT TO NODE, NOT ON PATH. Measured 18 Aug: a fresh
    // install under the Claude-spawned environment produced zero packages and
    // no error a user could see — the client launches node by absolute path
    // from its own config, but this spawn("npm") searched a PATH that did not
    // contain npm's directory, got ENOENT, and the failure surfaced only as a
    // host that never came up. The same command in a login shell worked
    // perfectly, which is exactly what made it invisible in development.
    // npm ships beside node; derive its path from the binary that is
    // provably present — the one running this file — and fall back to PATH
    // only if that neighbour does not exist.
    const npmBeside = join(dirname(process.execPath), "npm");
    const npmCmd = existsSync(npmBeside) ? npmBeside : "npm";
    const r = await new Promise((resolve) => {
      const p = spawn(npmCmd, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
        cwd: root,
        // NPM'S STDOUT GOES TO STDERR, BECAUSE STDOUT IS THE PROTOCOL.
        //
        // This was ["ignore", "inherit", "inherit"], which was safe for exactly
        // as long as the install ran BEFORE the MCP server was imported: nothing
        // was listening on stdout, so npm writing there cost nothing.
        //
        // The reorder made stdout the JSON-RPC channel while this is running.
        // Measured against a cold plugin: npm's progress output interleaved with
        // the protocol, the client could not parse the stream, and the handshake
        // never completed — a worse failure than the timeout being fixed, and
        // invisible except by running it.
        //
        // Both streams to stderr: the user still sees the install, and the
        // channel stays clean.
        stdio: ["ignore", process.stderr, process.stderr],
      });
      p.on("error", () => resolve({ status: -1 }));
      p.on("exit", (code) => resolve({ status: code }));
    });
    if (r.status !== 0) {
      status(`dependency install failed (npm exited ${r.status})`);
      log(`FAILED: npm install exited ${r.status} in ${root}. The sidecar cannot start without it.`);
      return false;
    }
    if (!depsPresent()) {
      log("dependencies installed, but the expected packages are still missing (ajv and/or the vendored @symbia/* copy) — check vendor-libs.sh ran");
      return false;
    }
    log("dependencies installed");
    return true;
  } finally {
    // Release even on failure — a lock held by a dead install would hang
    // every future attempt, including the ones that could actually succeed.
    try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* already gone */ }
  }
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

/**
 * EVERYTHING SLOW LIVES HERE, BEHIND THE TRANSPORT.
 *
 * The old order was: install (57 MB), boot ten services, THEN import the MCP
 * server and connect. Every one of those had to finish before the client got
 * a handshake, and MCP_TIMEOUT — 30 seconds, the client's, not ours — starts
 * when the process is spawned. So the first attach after an install could
 * time out, and a new user's first impression of the plugin was a connector
 * that failed. Nothing was broken; it was simply asked to prove itself before
 * it had finished getting dressed.
 *
 * Now this runs unawaited while the transport is already answering. The cost
 * of that inversion is that tools can be called before the host exists, so
 * every host-touching tool passes hostNotReady() and says what is happening
 * instead of failing. An agent can then tell the user something true — "your
 * stack is installing, once, about a minute" — which is a better first
 * sixty seconds than silence followed by an error.
 */
async function bringUpHost() {
  if (!(await ensureDependencies())) {
    status("dependency install failed — see stderr");
    log("dependencies could not be installed; the host cannot start");
    return;
  }

  let host = null;
  if (!STACK_BASE && !PORT_MODE) {
    // FIX 1 (18 Aug): SAY SO WHEN A DEPLOYED STACK IS ALREADY LISTENING.
    //
    // The most expensive setup failure observed in user testing was not an
    // error — it was silence: a user with a running docker stack installed
    // the plugin, got a working EPHEMERAL host, and had no way to know the
    // durable stack they wanted was one env var away. Probe the standard
    // identity port before spawning; if something answers, name the switch.
    // A hint, not a behavior change — the owned host still spawns, because
    // guessing the user's intent would be worse than telling them the option.
    try {
      const probe = await fetch("http://localhost:5001/", { signal: AbortSignal.timeout(1000) });
      if (probe.ok || probe.status === 404 || probe.status === 302) {
        log("NOTE: something is already listening on localhost:5001 (the standard Symbia identity port).");
        log("      If that is a deployed Symbia stack you want this connector to use, set");
        log('      "SYMBIA_PORT_MODE": "1" in this server\'s env block and restart the connector.');
        log("      Proceeding to spawn an ephemeral imagine host (writes there are sketches).");
      }
    } catch { /* nothing listening — the ordinary case; spawn silently */ }
    status("starting your stack (ten services in one process)");
    host = ATTACH ? await findHost() : await startOwnedHost();
  }

  if (!STACK_BASE && !PORT_MODE && !host) {
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
  // NOT process.exit. The transport is already connected and serving; killing
  // it here would turn a diagnosable failure into a client-side disconnect
  // with no message. Leave it up so the readiness gate can say what went wrong.
  status("the stack failed to start — see the plugin's stderr for the reason");
  return;
}

if (host) {
  log(`attached to ${host.base} — mode ${host.mode ?? "unknown"}, pid ${host.pid}, session ${host.session}${ATTACH ? " (shared, --attach)" : " (owned)"}`);
} else if (PORT_MODE) {
  // Nothing to ask and nothing to assert. The mode is a property of the stack
  // reached, and in port mode there is no single origin to ask — each service
  // answers for itself. Leaving SYMBIA_MODE unset lets the MCP server's own
  // `?? "unknown"` say so rather than this file inventing an answer.
  log(`port mode — each service addressed on its own port on ${process.env.SYMBIA_HOST ?? "localhost"}; spawning nothing, SYMBIA_BASE_URL left unset`);
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
// (SYMBIA_BASE_URL is assigned at the END of this function — see the note
// there. It is the readiness flag as well as the address, so it must not be
// set before the token and mode it needs to be useful.)
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

}

  // LAST, AND DELIBERATELY SO. hostNotReady() keys off SYMBIA_BASE_URL, so
  // this assignment is what flips every host-touching tool from "still
  // starting" to live. Setting it before the token and mode were published
  // would open the gate onto a half-configured transport.
  if (host) process.env.SYMBIA_BASE_URL = host.base;
  status("ready");
  log("stack ready");
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
// PICK THE ENTRY THAT CAN LOAD, NOT MERELY THE ONE THAT EXISTS.
//
// `find(existsSync)` chose the packaged path first, which is right in a plugin
// and wrong in a checkout: packaging STAGES a copy at imagine/mcp-server/, so
// in the repository both candidates exist — and the staged one resolves its
// SDK against imagine/node_modules, which is empty. The repository's own
// symbia-mcp-server/dist has node_modules beside it and loads fine.
//
// The consequence was not a clean failure. The shim concluded its dependencies
// were missing, took the blocking-install path, and Claude Desktop reported
// "MCP Symbia (imagine): Server disconnected" while a perfectly loadable
// connector sat one candidate further down the list.
//
// Existence was always a proxy for the real question. Ask the real one.
const canLoad = (p) => {
  try {
    createRequire(p).resolve("@modelcontextprotocol/sdk/server/mcp.js");
    return true;
  } catch {
    return false;
  }
};
const mcpEntry =
  MCP_CANDIDATES.filter(existsSync).find(canLoad) ?? MCP_CANDIDATES.find(existsSync);
if (!mcpEntry) {
  log("could not find symbia-mcp-server. Tried:");
  for (const c of MCP_CANDIDATES) log(`  ${c}`);
  log("In a checkout: npm run build -w symbia-mcp-server. In a plugin: the archive was built without it.");
  process.exit(1);
}
// CREDENTIAL DEFAULTS BEFORE THE IMPORT, ADDRESS AFTER.
//
// These two are static defaults for a locally-seeded principal, not facts
// about a host, so nothing is gained by discovering them late — and the
// reorder proved the cost of trying. The MCP server checks its credential
// ladder as it starts, and with these still unset it refused at once with
// "No credentials configured", before bringUpHost() had reached the line
// that used to set them. Measured against a cold plugin, not reasoned about.
//
// The rule the split follows: anything KNOWN before the host exists is set
// before the import; anything the host must publish — base URL, session
// token, mode — is set when it does.
// ONE VALUE, MINTED HERE, SHARED WITH THE HOST THIS SHIM SPAWNS.
//
// This used to default to the literal `password123`, matching the same literal
// in sidecar.mjs — two copies of a published constant agreeing by coincidence
// (finding F24, 23 Aug). It is now a per-spawn random value, and it must be set
// here rather than in the host: the MCP server checks its credential ladder as
// it starts, and the comment above records what happens when these are unset at
// that moment.
//
// The host inherits this environment, so `SYMBIA_PASSWORD` reaches
// sidecar.mjs, which hands it to identity's seed as the admin password. The
// shim and the host therefore hold the same value by descent instead of by
// sharing a constant.
process.env.SYMBIA_EMAIL = process.env.SYMBIA_EMAIL || "dev@example.com";
process.env.SYMBIA_PASSWORD =
  process.env.SYMBIA_PASSWORD || randomBytes(24).toString("base64url");

// THE INVERSION.
//
// bringUpHost() is started and deliberately NOT awaited: installing and
// booting now happen behind a transport that is already answering, instead of
// in front of a client that is counting down. The import below connects
// stdio, and from that moment the plugin is attached — with tools that say
// "still starting" until the address exists.
//
// A rejection here must not take the transport with it. An unhandled promise
// rejection in a stdio MCP server is a silent disconnect on the client side,
// which is the failure this whole reorder exists to remove.
// THE ORDER DEPENDS ON WHETHER THE CONNECTOR CAN EVEN LOAD.
//
// The inversion cannot be unconditional, and finding out why cost a cold run:
// the MCP server imports @modelcontextprotocol/sdk, which is installed by the
// very install being deferred. Connecting first on a cold tree fails with
// ERR_MODULE_NOT_FOUND before a single byte of protocol is written. The thing
// that answers cannot depend on the thing being installed — and today it does.
//
//   COLD (no node_modules): install first, as before. Unavoidable. Once per
//   install, and now 57 MB rather than 263 MB, which is the part of this work
//   that helped that path.
//
//   WARM (every launch after): connect immediately and boot behind it. This
//   is the case that actually matters, and it was mis-framed at first as a
//   first-run problem. Every conversation spawns its own host and boots ten
//   services — so on the old order EVERY conversation paid the boot wait
//   before the client got a handshake, not just the first one.
//
// Vendoring the connector's dependency closure would make the inversion
// unconditional, and is the right end state. It is a packaging project: 17
// transitive dependencies including express, hono, ajv and jose, and two of
// them are scoped, which the archive refuses in a path. Not tonight.
// ARM THE READINESS GATE, SYNCHRONOUSLY, ONLY WHEN WE OWN A HOST.
//
// The MCP server refuses host-touching tools while SYMBIA_BOOT_STATUS is set
// to anything but "ready". That flag has to exist BEFORE the transport starts
// answering, or the first call slips through to a host that is not up yet —
// and it must NOT exist when nobody is waiting on a boot, or it gates a stack
// that is already running. Measured: gating on the absence of a base URL
// instead broke port mode against a live docker stack completely.
//
// Set here, synchronously, in the one branch that spawns something. Stack mode
// (STACK_BASE given) leaves it unset, because the caller named a stack that is
// already up and there is nothing to wait for.
if (!STACK_BASE) status("starting");

// ASK WHETHER THE CONNECTOR CAN LOAD, NOT WHETHER A DIRECTORY EXISTS.
//
// This was `existsSync(depRoot()/node_modules/@modelcontextprotocol)`, which
// is the right question in the PACKAGED layout and the wrong one in a
// checkout. In the repository the MCP server lives at
// symbia-mcp-server/dist/index.js and resolves its SDK from that package's own
// node_modules — imagine/node_modules never has to exist. The check therefore
// reported "cold" on a tree where the transport could have connected
// instantly, took the blocking-install path, and the client gave up:
// "MCP Symbia (imagine): Server disconnected."
//
// Measured against the real Claude Desktop config, not reasoned about. The
// honest test is the one the next line performs anyway — can Node resolve the
// SDK from where the entry point sits.
let DEPS_PRESENT = false;
try {
  createRequire(mcpEntry).resolve("@modelcontextprotocol/sdk/server/mcp.js");
  DEPS_PRESENT = true;
} catch {
  DEPS_PRESENT = false;
}

if (DEPS_PRESENT) {
  // A rejection here must not take the transport with it: an unhandled
  // rejection in a stdio MCP server is a silent disconnect on the client side.
  bringUpHost().catch((err) => {
    status(`the stack failed to start: ${err?.message ?? err}`);
    log(`host bring-up threw: ${err?.stack ?? err}`);
  });
  await import(pathToFileURL(mcpEntry).href);
} else {
  log("cold install — the connector's own dependencies are not present yet, so the stack must be installed before the transport can start");
  await bringUpHost();
  await import(pathToFileURL(mcpEntry).href);
}
