#!/usr/bin/env node
/**
 * symbia-mcp-server — MCP access to the locally running Symbia stack.
 *
 * Read-only tools over the services registered in @symbia/sys, on localhost.
 * The service list is NOT restated here — it is read from the registry, so a
 * service cannot be swept by this tool without being registered, and cannot
 * linger here after being removed.
 *
 * Authenticates against the Identity service with SYMBIA_EMAIL /
 * SYMBIA_PASSWORD (SYMBIA_PASSWORD is required).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ServicePorts, RunningServices } from "@symbia/sys";
import { verifyBundle } from "@symbia/lineage";
import { runGate, buildPromotionRecord, promotionRecordKey, externalReferences, GATE_ID, GATE_VERSION, } from "./promotion-gate.js";
import { operationsFor, filterOperations, fillPath, resolveRefs, } from "./dispatcher.js";
// Auth, token-first (14 Aug 2026). SYMBIA_TOKEN is a pre-issued bearer — an
// Identity API key or a session token — and is the preferred path: no password
// in the MCP config, matching the wallet model and the .mcp.json integrations
// entry. SYMBIA_EMAIL/SYMBIA_PASSWORD is the legacy login flow, kept as a
// local-dev fallback only.
// SYMBIA_SESSION_TOKEN is the best path: a long-lived session token (minted via
// POST /api/auth/session) that this server resolves to a fresh short-lived JWT —
// revocable server-side, refreshable, no password. SYMBIA_TOKEN is a direct
// pre-issued bearer (API key). SYMBIA_PASSWORD is the legacy login fallback.
/**
 * An MCP config that declares `env` may pass a placeholder through verbatim when
 * the host does not expand it, so `"${SYMBIA_TOKEN}"` can arrive as those eleven
 * literal characters. Treated as set, that becomes a bearer token of `${...}`
 * and every call 401s with an authentication error that names no cause. Treated
 * as absent, it lands on the message below, which names the file to edit.
 */
function env(name) {
    const raw = process.env[name];
    if (!raw)
        return undefined;
    return /^\$\{[^}]*\}$/.test(raw.trim()) ? undefined : raw;
}
const SESSION_TOKEN = env("SYMBIA_SESSION_TOKEN");
const TOKEN = env("SYMBIA_TOKEN");
const EMAIL = env("SYMBIA_EMAIL") ?? "gap-probe@symbia.test";
const PASSWORD = env("SYMBIA_PASSWORD");
/**
 * A missing credential is reported, not fatal.
 *
 * This used to `process.exit(1)` before `server.connect`. A client renders that
 * as "failed to connect" and nothing else, while the explanation goes to a log
 * nobody opens — so the one process that knows the answer takes it with it.
 *
 * Measured 26 Aug: `symbia-durable` stopped connecting after a plugin install
 * and stayed down through four exchanges, because its `env` block in the
 * plugin's `.mcp.json` carries `SYMBIA_BASE_URL` and no credential. Nothing
 * visible anywhere said so.
 *
 * The server now starts, connects, and answers every call with this text. A
 * tool that reports its own misconfiguration is diagnosable from the outside;
 * one that refuses to exist is not. Measured the same day: startup validates
 * neither the credential nor the stack, so exiting bought no safety it was not
 * already declining to provide (F109).
 */
const CREDENTIAL_PROBLEM = !SESSION_TOKEN && !TOKEN && !PASSWORD
    ? "No credential is configured, so every call to this stack will fail.\n" +
        "\n" +
        "Set ONE of these, preferred first:\n" +
        "  SYMBIA_SESSION_TOKEN — session token (POST /api/auth/session), revocable, no password\n" +
        "  SYMBIA_TOKEN         — pre-issued bearer / API key\n" +
        "  SYMBIA_PASSWORD      — legacy email/password login (local dev)\n" +
        "\n" +
        "For the packaged plugin these belong in the `symbia-durable` env block of\n" +
        "the plugin's .mcp.json (source: imagine/plugin/mcp.json). Declaring `env`\n" +
        "there may replace the inherited environment rather than extend it, so a\n" +
        "credential exported in a shell will not necessarily reach this process.\n" +
        "\n" +
        "Measured 26 Aug: passing a value through as ${SYMBIA_TOKEN} does NOT work\n" +
        "on this host — the placeholder arrives unexpanded and is ignored\n" +
        "deliberately, because an unexpanded placeholder used as a bearer token\n" +
        "401s with no stated cause. Put the literal value in the env block."
    : null;
if (CREDENTIAL_PROBLEM)
    console.error(`symbia-mcp-server: ${CREDENTIAL_PROBLEM}`);
const HOST = process.env.SYMBIA_HOST ?? "localhost";
const CHARACTER_LIMIT = 25000;
// Derived from @symbia/sys. This was a hand-maintained map keyed by service
// name with its own copy of every port, in a tool whose entire job is to
// report the truth about a running stack — so a port change made it confidently
// wrong rather than obviously broken. `network: 5054` outlived the move to
// 5009 in exactly that way.
//
// RunningServices excludes `server`, which is registered but never listens.
const PORTS = Object.fromEntries(RunningServices.map((id) => [id, ServicePorts[id]]));
/**
 * Where a service answers.
 *
 * Two arrangements, one rule — ADDRESS BY ID, NEVER BY PORT (CLAUDE.md).
 * This file kept a port map and so could only ever talk to a stack where
 * every service owns a port. `SYMBIA_BASE_URL` switches it to the
 * one-origin form the console has always used, `<base>/svc/<id>`, which
 * is what the headless imagine sidecar serves: every service in one
 * process behind one origin.
 *
 *   SYMBIA_BASE_URL=http://localhost:7100  ->  http://localhost:7100/svc/catalog/api/…
 *   unset                                  ->  http://localhost:5003/api/…
 */
/**
 * READ AT CALL TIME, NOT AT IMPORT.
 *
 * This was `const BASE_URL = process.env.SYMBIA_BASE_URL…`, which forced the
 * whole startup order: the shim had to install dependencies and boot ten
 * services BEFORE importing this file, because the address does not exist
 * until the host publishes it. The MCP transport therefore connected last,
 * after everything slow.
 *
 * Measured 17 Aug: a first run installs 57 MB and boots ten services. The
 * client's MCP_TIMEOUT is 30 seconds and belongs to the client, not to us.
 * So the very first attach after install could time out, and a new user's
 * first impression was a connector that failed.
 *
 * A function instead of a const inverts that. The shim connects the
 * transport immediately, then installs and boots behind it, publishing the
 * address into the environment when ready. Same process, so this sees it.
 * Nothing here is cached, because the thing it reads arrives late by design.
 */
function baseUrl() {
    return process.env.SYMBIA_BASE_URL?.replace(/\/$/, "");
}
/** What the host is doing right now, for tools that cannot run without it. */
function bootStatus() {
    return process.env.SYMBIA_BOOT_STATUS ?? "starting";
}
/**
 * The one gate every host-touching tool passes through.
 *
 * A tool called before the stack is up must not return a connection error —
 * that reads as broken when the truth is "not yet". It says what is
 * happening, that it is one-time, and what to do, so the agent can tell the
 * user something true instead of retrying into a refused socket.
 */
function hostNotReady() {
    // THE GATE ARMS ONLY WHEN SOMETHING IS ACTUALLY BEING WAITED FOR.
    //
    // The first version returned "still starting" whenever baseUrl() was unset,
    // which treated a missing base URL as proof of an unfinished boot. That is
    // true in imagine mode and false everywhere else: in PORT MODE the services
    // each own a port, there is no base URL by design, and the stack is already
    // running.
    //
    // Measured against the real docker stack — thirteen containers, healthy for
    // twelve hours — every tool refused with "still starting: starting". The
    // reorder had silently broken stack mode altogether, and no amount of
    // testing against an imagine host would have shown it.
    //
    // SYMBIA_BOOT_STATUS is set by the shim, and only when it has taken
    // responsibility for bringing a host up. Unset means nobody is waiting on
    // anything: a docker stack, a direct run, port mode. Do not gate those.
    const status = process.env.SYMBIA_BOOT_STATUS;
    if (!status || status === "ready")
        return null;
    if (baseUrl())
        return null;
    return (`The Symbia stack for this conversation is still starting: ${bootStatus()}. ` +
        `Nothing is wrong. The first attach after installing the plugin also installs ` +
        `dependencies (about 57 MB, once per install) and then boots ten services in one ` +
        `process. Tell the user this is a one-time first-run cost, and try again in a few ` +
        `seconds — the tools that do not need the host, like symbia_list_operations, work now.`);
}
/**
 * A gateway cannot proxy to itself, so the front door is not behind its own
 * `/svc/` prefix.
 *
 * MEASURED 20 Aug 2026: `symbia_list_operations` reported `server: 404` on
 * every call against a deployed stack, and `symbia_stack_health` reported
 * "no health endpoint" for it. Both were asking `{base}/svc/server/…`, which
 * 404s by construction — `server` IS `{base}`, and `ProxiedServices` excludes
 * it for exactly this reason. The probe was reporting its own addressing
 * mistake as a fact about the service, three days running.
 *
 * Port mode is unaffected: there the service owns a port like any other.
 */
function serviceBase(service) {
    const b = baseUrl();
    if (!b)
        return `http://${HOST}:${PORTS[service]}`;
    return service === 'server' ? b : `${b}/svc/${service}`;
}
let token = TOKEN ?? null;
/**
 * The imagine host's session token, if we were attached to one.
 *
 * Two different questions are being answered by two different credentials here,
 * and collapsing them would be a mistake. `Authorization` says which principal
 * is acting, and the services check it. `x-imagine-token` says this process was
 * started by the user who owns the host, and the host's own gate checks that
 * before any service sees the request.
 *
 * A local stack reachable on loopback needs the second one: without it, any
 * process on the machine can ask the runtime what graphs are loaded. With it,
 * the answer requires having been able to read a 0600 file in that user's home
 * directory.
 *
 * Absent when talking to a deployed stack, where the network boundary is doing
 * this job — so it is added when present and never required.
 */
/**
 * READ AT CALL TIME. The fourth of these, and the one that got away.
 *
 * `const HOST_TOKEN = process.env.SYMBIA_HOST_TOKEN` was correct while the
 * shim imported this file last — the token was already published. The reorder
 * that connects the transport first made it undefined at import, so every
 * request went out with no `x-imagine-token`, the host's gate answered 401
 * before any route, and the failure surfaced as `Identity login failed (401)`
 * — a message pointing at credentials when the real cause was an empty header.
 *
 * baseUrl(), bootStatus() and SYMBIA_MODE were all converted for exactly this
 * reason and this one was missed, because nothing in the type system marks a
 * value as "arrives late". Found by looking for a missing receipt, not by
 * looking for an auth bug.
 */
const hostHeader = () => {
    const t = process.env.SYMBIA_HOST_TOKEN;
    return t ? { "x-imagine-token": t } : {};
};
async function login() {
    // The first place a caller can be told, in the response rather than in a log.
    if (CREDENTIAL_PROBLEM)
        throw new Error(CREDENTIAL_PROBLEM);
    // Preferred: resolve a session token to a fresh JWT. Refreshable (this runs
    // again on 401) and revocable server-side.
    if (SESSION_TOKEN) {
        const r = await fetch(`${serviceBase("identity")}/api/auth/session/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...hostHeader() },
            body: JSON.stringify({ token: SESSION_TOKEN }),
            signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) {
            throw new Error(`Session resolve failed (${r.status}). The SYMBIA_SESSION_TOKEN is invalid, expired, or revoked — mint a fresh one via POST /api/auth/session.`);
        }
        const j = (await r.json());
        if (!j.token)
            throw new Error("Session resolve returned no token");
        token = j.token;
        return token;
    }
    // A pre-issued direct bearer cannot be refreshed here; a 401 means it is
    // invalid or expired. Surface that instead of looping on a login we cannot do.
    if (TOKEN) {
        throw new Error("SYMBIA_TOKEN was rejected (401). Issue a fresh token (Identity API key or " +
            "session); this server does not fall back to password login when a token is set.");
    }
    const r = await fetch(`${serviceBase("identity")}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hostHeader() },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        signal: AbortSignal.timeout(10000),
    });
    // Before the throw: a failed login is still an exchange with the host, and
    // its response carries the chain position. Capturing here is what lets a
    // 401 come back with a receipt instead of floating free.
    captureAnchor(r);
    if (!r.ok) {
        throw new Error(`Identity login failed (${r.status}). Check SYMBIA_EMAIL / SYMBIA_PASSWORD and that the stack is running (docker-compose up).`);
    }
    const j = (await r.json());
    if (!j.token)
        throw new Error("Identity login returned no token");
    token = j.token;
    return token;
}
async function api(service, path, opts = {}) {
    // ONE GATE, AT THE ONE CHOKEPOINT.
    //
    // Every host-touching tool reaches the stack through this function, so the
    // readiness check belongs here rather than repeated in thirty handlers —
    // where the thirty-first would forget it and answer a first-run user with
    // ECONNREFUSED. Since the shim now connects the transport before the stack
    // exists, "not yet" is a normal state for the first minute of an install
    // and must read as such.
    const notReady = hostNotReady();
    if (notReady)
        throw new Error(notReady);
    // Learn the mode from the front door's handshake, once, on the first call
    // that reaches the stack. Cheap because it is memoised and skipped entirely
    // when there is no base URL to ask.
    await learnAnnouncedMode();
    if (!token && !opts.skipAuth)
        await login();
    const doFetch = async () => fetch(`${serviceBase(service)}${path}`, {
        method: opts.method ?? "GET",
        headers: {
            Accept: "application/json",
            ...hostHeader(),
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(token && !opts.skipAuth ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    let r;
    try {
        r = await doFetch();
    }
    catch (err) {
        // A TIMEOUT IS NOT A FAILURE, AND SAYING SO MATTERS.
        //
        // Measured 16 Aug: POST /api/models/pull "failed" with
        // "The operation was aborted due to timeout" after 15s. It had not
        // failed. It was downloading 668 MB, finished a minute later, wrote a
        // signed lineage event, and the model ran. An agent reading that error
        // would report the pull broken and be wrong — the worst kind of
        // confident negative, because the wrong conclusion is also actionable.
        if (err instanceof Error && (err.name === "TimeoutError" || /aborted due to timeout/i.test(err.message))) {
            throw new Error(`${service} ${path} did not respond within 15s. THIS IS NOT A FAILURE — the request was sent ` +
                `and the operation may still be running; long operations (model pulls, large downloads) routinely ` +
                `outlast this client timeout. Check the resulting state before concluding anything: for models, ` +
                `GET /api/models and GET /api/stats. Do not retry blindly, which would start the work twice.`);
        }
        // "fetch failed" alone is a confident negative: it reads as "the
        // service is broken" when it usually means "nothing answered at the
        // address I tried". Say which address, and what the transport said.
        const cause = err?.cause;
        throw new Error(`Could not reach ${service} at ${serviceBase(service)}${path} — ` +
            `${cause?.code ?? ""}${cause?.code ? ": " : ""}${cause?.message ?? (err instanceof Error ? err.message : String(err))}. ` +
            `This is a connectivity failure, not a service error: ` +
            `${baseUrl() ? `SYMBIA_BASE_URL=${baseUrl()}` : `port mode, host=${HOST}`}.`);
    }
    if (r.status === 401 && !opts.skipAuth) {
        await login();
        r = await doFetch();
    }
    // The anchor rides on headers the host sets after its gate, so reading it
    // costs nothing. Captured on every exchange including failures — where a
    // value ended up is most worth knowing when something went wrong.
    captureAnchor(r);
    const text = await r.text();
    if (!r.ok) {
        // AN ERROR IS THE MOST USEFUL THING A SERVICE EVER SENDS AN AGENT.
        //
        // This truncated at 300 characters, which was fine when errors were
        // "not found" and actively harmful once they started teaching. Measured
        // 16 Aug: the catalog's graph gate returns three problems, each with the
        // component manifest's own description of what it accepts — and the
        // agent saw one problem, half a hint, and no note.
        //
        // `respond()` learned this for SUCCESS payloads this morning and shrinks
        // them structurally. The failure path kept the naive slice, and failures
        // are where an agent has the least other information to work from.
        const ERROR_BUDGET = Number(process.env.SYMBIA_ERROR_BUDGET ?? 4000);
        const body = text.length <= ERROR_BUDGET
            ? text
            : `${text.slice(0, ERROR_BUDGET)}\n…[error truncated at ${ERROR_BUDGET} of ${text.length} characters]`;
        throw new Error(`${service} ${path} responded ${r.status}: ${body}`);
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
/**
 * The chain position of the most recent host answer.
 *
 * Captured from response headers rather than fetched, so a receipt costs no
 * round trip. Module-level because `respond()` is the single chokepoint for
 * tool results and does not otherwise see the HTTP exchange that produced
 * them — the alternative was threading it through thirty handlers, where the
 * thirty-first would forget.
 */
let lastAnchor = {};
/**
 * Capture the chain position from any host response.
 *
 * Called from every path that talks to the host, not just `api()`. Found the
 * hard way: the first version hooked only `api()`, and a test came back with
 * no receipt because the call had failed inside `login()` — which uses a bare
 * fetch. So the one exchange that happened carried an anchor nobody read, and
 * the result that most needed a position had none.
 */
function captureAnchor(r) {
    const head = r.headers.get("x-symbia-ledger-head");
    if (!head)
        return;
    lastAnchor = {
        head,
        entries: Number(r.headers.get("x-symbia-ledger-entries") ?? "") || undefined,
        session: r.headers.get("x-symbia-session") ?? undefined,
        mode: r.headers.get("x-symbia-mode") ?? undefined,
    };
}
/**
 * Serialize a tool result, staying PARSEABLE when it is too big.
 *
 * This used to cut the JSON string at a character count and append a
 * prose note, producing output no client could parse — measured 16 Aug
 * (security MAP, S18): a probe could not evaluate a catalog listing
 * because the answer was large, which is exactly when the answer matters.
 * Truncate the DATA and say so inside the JSON instead.
 */
/**
 * The receipt attached to every tool result.
 *
 * Deliberately small and deliberately modest about what it proves. It says
 * where in a signed chain this answer sits, and it does NOT claim the answer
 * is correct, complete, or that the work behind it was sound. `basis` states
 * that in the object itself, so a reader who finds this key without knowing
 * Symbia is not misled about what they are holding.
 */
function receipt() {
    if (!lastAnchor.head)
        return undefined;
    return {
        "com.symbia/receipt": {
            mode: lastAnchor.mode ?? SYMBIA_MODE_FN(),
            session: lastAnchor.session,
            ledgerHead: lastAnchor.head,
            entries: lastAnchor.entries,
            basis: "Anchors this answer to a position in the session's signed hash chain. " +
                "It asserts ordering and that the chain existed in this state — not that " +
                "the answer is correct or the work sound. In imagine mode a write is a " +
                "sketch, not a record.",
            verify: "symbia_seal exports the bundle; the chain verifies against the public key it publishes.",
        },
    };
}
/**
 * The anchor, in the payload, because `_meta` never reaches the model.
 *
 * MEASURED, not assumed. `com.symbia/receipt` is on the wire — verified from a
 * raw JSON-RPC client, and the SDK types `_meta` as `z.core.$loose` so nothing
 * strips it. Then the plugin was loaded into Claude Desktop and the agent
 * could not see it: the host application surfaces `content` to the model and
 * drops `_meta`.
 *
 * So the receipt was true and inert. An agent could not cite the chain
 * position, could not check whether `entries` advanced between two calls, and
 * could not decline a claim because the chain had not moved — every purpose
 * the thing exists for.
 *
 * `_meta` stays, because it is the protocol-correct location and machine
 * consumers read it. This adds one compact line to the payload so the agent
 * can actually use it in any client, today, without anyone's permission. The
 * duplication is deliberate and the reason is written here so nobody later
 * removes one of them for tidiness.
 *
 * Cheap on purpose: a short string rather than the full object, because it is
 * on every result and the payload has a budget that `_meta` does not.
 */
function anchorLine() {
    if (!lastAnchor.head)
        return {};
    const short = lastAnchor.head.replace(/^sha256:/, "").slice(0, 12);
    // The anchor's own mode comes off the wire, so it may still carry a legacy
    // spelling from an older host. Normalise before comparing, or the lifetime
    // warning below silently stops firing against exactly the hosts that need it.
    const mode = asHostMode(lastAnchor.mode) ?? SYMBIA_MODE_FN();
    // WHETHER THIS CHAIN SURVIVES THE PROCESS, ON EVERY ANSWER THAT CITES IT.
    //
    // MEASURED 20 Aug 2026: an agent registered predictions against an imagine
    // chain, worked through the day, and returned to find the chain reset to a
    // lower position — the earlier work reachable only from a sealed bundle.
    // Every response had carried a chain position and none had said the chain
    // was ephemeral, so the anchor read as durable storage. An anchor that
    // invites that reading is worse than no anchor.
    // The chain's lifetime is the backend's lifetime. Saying "durable" over a
    // memory backend is the reading this warning exists to prevent — on 20 Aug an
    // agent lost a day's predictions to a chain it had read as durable storage.
    const storage = SYMBIA_STORAGE_FN();
    const lifetime = mode === "ephemeral"
        ? " · EPHEMERAL: this chain dies with the host process — seal to keep it"
        : storage === "memory"
            ? " · IN-MEMORY: shared across conversations while this process lives, lost on restart — seal to keep it"
            : "";
    return {
        symbiaAnchor: `${mode} @${lastAnchor.entries ?? "?"} · ${short} · ` +
            `position in this session's signed chain; asserts ordering, not correctness${lifetime}`,
    };
}
function respond(data) {
    const _meta = receipt();
    // Merge rather than nest, so the anchor survives the shrink path below and
    // does not add a level to every payload an agent has to read past.
    if (data && typeof data === "object" && !Array.isArray(data)) {
        data = { ...data, ...anchorLine() };
    }
    let text = JSON.stringify(data, null, 2);
    if (text.length <= CHARACTER_LIMIT)
        return { content: [{ type: "text", text }], ...(_meta ? { _meta } : {}) };
    // Arrays are the usual cause: drop items until it fits, and record how
    // many were dropped so the caller can narrow deliberately.
    const shrink = (value) => {
        if (Array.isArray(value)) {
            const keep = Math.max(1, Math.floor(value.length / 4));
            return { _truncated: { of: value.length, shown: keep, note: "narrow with filters or limit/offset" }, items: value.slice(0, keep) };
        }
        if (value && typeof value === "object") {
            const out = {};
            for (const [k, v] of Object.entries(value))
                out[k] = Array.isArray(v) ? shrink(v) : v;
            return out;
        }
        return value;
    };
    let shrunk = shrink(data);
    text = JSON.stringify(shrunk, null, 2);
    if (text.length > CHARACTER_LIMIT) {
        // Still too large: return a valid JSON envelope rather than a broken one.
        text = JSON.stringify({
            _truncated: { note: "result exceeded the character limit even after shrinking; narrow the query" },
            preview: String(JSON.stringify(data)).slice(0, 2000),
        }, null, 2);
    }
    // The receipt survives truncation on purpose. A shrunk answer is exactly
    // when a reader most needs to know which chain position it came from, and
    // `_meta` does not count against the payload budget.
    return { content: [{ type: "text", text }], ...(_meta ? { _meta } : {}) };
}
function fail(error) {
    // THE FAILURE PATH NEEDS THE RECEIPT MORE THAN THE SUCCESS PATH DOES.
    //
    // I attached it to respond() first and left this alone, then could not find
    // the receipt in a test — because the call had failed and come through here.
    // Which is precisely backwards: where a value ended up in the chain matters
    // most when something went wrong, and an error with no position is the
    // hardest kind of event to place afterwards.
    const _meta = receipt();
    return {
        content: [
            {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
        ],
        isError: true,
        ...(_meta ? { _meta } : {}),
    };
}
const server = new McpServer({ name: "symbia-mcp-server", version: "1.0.0" });
const RO = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
server.registerTool("symbia_stack_health", {
    title: "Symbia Stack Health",
    description: 
    // Derived, not restated: a hardcoded "all nine" here outlived the tenth
    // service (directory, 5010) — the count read as a claim about the
    // platform while being a claim about nine services.
    `Check health and self-reported version of all ${RunningServices.length} registered Symbia services (${RunningServices.join(", ")}). Returns per-service status, port, latency in ms, and OpenAPI title/version. Use this first to confirm the stack is up.`,
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    // THE GATE HAS TO BE HERE TOO, AND THIS IS THE TOOL THAT PROVED IT.
    //
    // api() carries the readiness check for every tool that reaches the stack
    // through it. This one does not go through api() — it probes each service
    // directly — so on the first call of a warm-start conversation it fell
    // back to the port map and answered ECONNREFUSED on localhost:5001.
    //
    // Which is the worst possible tool to get this wrong. Its own description
    // says "use this first to confirm the stack is up", so it is what an agent
    // reaches for at second zero, and it was reporting a stack that was
    // seconds from ready as comprehensively dead.
    const notReady = hostNotReady();
    if (notReady)
        return respond({ ready: false, status: bootStatus(), detail: notReady });
    const entries = await Promise.all(Object.keys(PORTS).map(async (name) => {
        const t0 = Date.now();
        try {
            // WHAT A PROBE CAN AND CANNOT CONCLUDE.
            //
            // Trying both paths was the first fix (16 Aug) and was not enough,
            // because it still read every failure as death. Measured against a
            // live imagine host, 18 Aug:
            //
            //   identity, catalog          200 on /health
            //   messaging, runtime         200 on /api/health
            //   assistants                 200 on both
            //   logging                    401 on /api/health  — alive, gated
            //   integrations, directory,
            //   network, models,
            //   control-center, api        404 on both — no health route
            //
            // Most of those were reported "unreachable", so a working stack
            // described itself as mostly broken at the moment a user was
            // deciding whether the product works.
            //
            //   401/403  something answered AND enforced — that is alive
            //   404      the route is absent; says nothing about the service
            //   refused  nothing is listening. The only real failure.
            // A REFUSAL IS ONLY OURS IF THE THING REFUSING IS OURS.
            //
            // Measured 19 Aug: with the front door published on 5100, port-map
            // mode reported `server http://localhost:5000 healthy` while nothing
            // of ours was listening there. macOS AirPlay Receiver holds 5000 and
            // answers 403 with `Server: AirTunes/950.7.1` and an empty body. The
            // gated rule below reads any 401/403 as "answered and enforced, so
            // alive" — which is right for our own gated services and wrong for a
            // stranger, and the two are indistinguishable by status code alone.
            //
            // This is the argument against well-known ports in miniature: a port
            // is a namespace we share with everyone, and our own health check
            // could not tell Apple from Symbia.
            const looksLikeOurs = async (p) => {
                try {
                    const r = await fetch(`${serviceBase(name)}${p}`, {
                        signal: AbortSignal.timeout(4000),
                    });
                    const server = r.headers.get("server") ?? "";
                    // Anything announcing a foreign server is foreign. Named rather
                    // than pattern-guessed, so the check fails closed on the case it
                    // was built for and does not quietly widen.
                    if (/airtunes|airplay/i.test(server))
                        return false;
                    const ct = r.headers.get("content-type") ?? "";
                    if (ct.includes("application/json"))
                        return true;
                    // An empty-bodied refusal from an unidentified listener is not
                    // evidence of us. Our gated services answer with a JSON error.
                    return (r.headers.get("content-length") ?? "") !== "0";
                }
                catch {
                    return false;
                }
            };
            const probe = async (p) => {
                try {
                    await api(name, p, { skipAuth: true });
                    return "up";
                }
                catch (e) {
                    const m = e instanceof Error ? e.message : String(e);
                    if (/\b401\b|\b403\b/.test(m)) {
                        return (await looksLikeOurs(p)) ? "gated" : "foreign";
                    }
                    if (/\b404\b/.test(m))
                        return "absent";
                    // A service the host chose not to start is not a broken one.
                    // The sidecar answers 503 naming the optional capability and the
                    // command that enables it; passing that through as "unreachable"
                    // would report a deliberate omission as a fault, in the one tool
                    // a user reads before deciding whether the product works.
                    if (/optionalCapability/.test(m))
                        return "optional";
                    return "down";
                }
            };
            let verdict = await probe("/health");
            if (verdict !== "up" && verdict !== "gated" && verdict !== "foreign") {
                const second = await probe("/api/health");
                verdict = verdict === "absent" && second === "down" ? "absent" : second;
            }
            if (verdict === "down")
                throw new Error("nothing answered on /health or /api/health");
            // Reported as its own state rather than folded into "unreachable".
            // "Nothing is there" and "something else is there" call for different
            // actions — one is a service to start, the other is a port to take
            // back or an address to change — and collapsing them costs the reader
            // the only clue that distinguishes them.
            if (verdict === "foreign") {
                return {
                    service: name,
                    endpoint: serviceBase(name),
                    status: "foreign listener",
                    latencyMs: Date.now() - t0,
                    note: "Something is listening at this address and it is not this service. It refused the health probe without identifying as ours. " +
                        "Either another process holds the port, or this address is wrong.",
                };
            }
            if (verdict === "optional") {
                return {
                    service: name,
                    endpoint: serviceBase(name),
                    status: "not started (optional)",
                    latencyMs: Date.now() - t0,
                    note: "the host chose not to start this capability. Ask it directly for the command that enables it — this is a decision, not a fault.",
                };
            }
            if (verdict === "absent") {
                return {
                    service: name,
                    endpoint: serviceBase(name),
                    status: "no health endpoint",
                    latencyMs: Date.now() - t0,
                    note: "published no /health or /api/health route. Not a failure — this probe cannot speak for it.",
                };
            }
            let title;
            let version;
            try {
                const spec = await api(name, "/docs/openapi.json", { skipAuth: true });
                title = spec.info?.title;
                version = spec.info?.version;
            }
            catch { /* spec optional */ }
            return { service: name, endpoint: serviceBase(name), status: "healthy", latencyMs: Date.now() - t0, title, version };
        }
        catch (e) {
            return { service: name, endpoint: serviceBase(name), status: "unreachable", latencyMs: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
        }
    }));
    // THE SUMMARY IS THE PART ANYONE READS — AND IT MUST NAME WHERE IT LOOKED.
    //
    // "healthy: 5, total: 12" was the whole verdict and it was false twice
    // over: services alive but unprobeable counted as failures, and two of the
    // twelve are not part of an imagine deployment at all.
    //
    // `addressing` is not decoration. Diagnosing this, I ran a probe that
    // reported 12/12 healthy and spent an hour treating it as a false pass —
    // when the truth was that the call had fallen back to the port map and
    // answered honestly about the DOCKER stack, where all twelve are up. The
    // output could not distinguish which stack it had described. Now it says.
    const healthy = entries.filter((e) => e.status === "healthy").length;
    const noEndpoint = entries.filter((e) => e.status === "no health endpoint").length;
    const unreachable = entries.filter((e) => e.status === "unreachable").length;
    const optional = entries.filter((e) => e.status === "not started (optional)").length;
    return respond({
        summary: unreachable === 0
            ? `Nothing is down. ${healthy} answered a health check` +
                (noEndpoint ? `, ${noEndpoint} publish no health route, which this probe can read as neither up nor down` : "") +
                (optional ? `, ${optional} deliberately not started` : "") + "."
            : `${unreachable} unreachable — that is the number to act on. ${healthy} healthy, ${noEndpoint} without a health route.`,
        addressing: baseUrl() ? `one-origin: ${baseUrl()}/svc/<id>` : `port map on ${HOST}`,
        healthy,
        noHealthEndpoint: noEndpoint,
        notStartedOptional: optional,
        unreachable,
        total: entries.length,
        services: entries,
    });
});
const ListResourcesInput = z.object({
    type: z.string().optional().describe("Filter by resource type, e.g. 'integration', 'assistant', 'graph'"),
    tag: z.string().optional().describe("Filter by tag, e.g. 'ai', 'bootstrap'"),
    query: z.string().optional().describe("Case-insensitive substring match on key, name, description"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max results (default 20)"),
    offset: z.number().int().min(0).default(0).describe("Results to skip"),
}).strict();
server.registerTool("symbia_list_resources", {
    title: "List Catalog Resources",
    description: "List resources in the Symbia Catalog (the platform's registry of integrations, assistants, graphs, contexts, models). Supports filtering by type, tag, and free-text query, with limit/offset pagination. Returns id, key, name, type, status, and tags per resource.",
    inputSchema: ListResourcesInput,
    annotations: RO,
}, async (params) => {
    try {
        const all = await api("catalog", "/api/resources");
        const q = params.query?.toLowerCase();
        const filtered = all.filter((r) => (!params.type || r.type === params.type) &&
            (!params.tag || (Array.isArray(r.tags) && r.tags.includes(params.tag))) &&
            (!q || ["key", "name", "description"].some((f) => String(r[f] ?? "").toLowerCase().includes(q))));
        const page = filtered.slice(params.offset, params.offset + params.limit)
            .map((r) => ({ id: r.id, key: r.key, name: r.name, type: r.type, status: r.status, tags: r.tags }));
        return respond({ total: filtered.length, count: page.length, offset: params.offset, resources: page, has_more: filtered.length > params.offset + page.length });
    }
    catch (e) {
        return fail(e);
    }
});
const GetResourceInput = z.object({
    id: z.string().min(1).describe("Resource id or key from symbia_list_resources"),
}).strict();
server.registerTool("symbia_get_resource", {
    title: "Get Catalog Resource",
    description: "Fetch one Catalog resource by id, returning its full definition including content and metadata. Use symbia_list_resources first to find ids.",
    inputSchema: GetResourceInput,
    annotations: RO,
}, async (params) => {
    try {
        return respond(await api("catalog", `/api/resources/${encodeURIComponent(params.id)}`));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_assistants", {
    title: "List Assistants",
    description: "List all assistants registered in the Assistants service, with key, name, alias, description, status, and tags. These are the platform's AI assistant definitions (e.g. calculator, coordinator, gmail).",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("assistants", "/api/assistants"));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_log_streams", {
    title: "List Log Streams",
    description: "List all log streams in the Logging service (per-service telemetry streams with id, orgId, serviceId, name, level, retention). Stream ids from here feed symbia_query_logs.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("logging", "/api/logs/streams"));
    }
    catch (e) {
        return fail(e);
    }
});
const QueryLogsInput = z.object({
    streamIds: z.array(z.string()).optional().describe("Stream ids from symbia_list_log_streams; omit for all"),
    level: z.string().optional().describe("Minimum level, e.g. 'info', 'warn', 'error'"),
    search: z.string().optional().describe("Free-text search within log entries"),
    startTime: z.string().optional().describe("ISO 8601 lower bound, e.g. '2026-08-05T00:00:00Z'"),
    endTime: z.string().optional().describe("ISO 8601 upper bound"),
    limit: z.number().int().min(1).max(200).default(50).describe("Max entries (default 50)"),
    offset: z.number().int().min(0).default(0),
}).strict();
server.registerTool("symbia_query_logs", {
    title: "Query Logs",
    description: "Query log entries from the Logging service with optional stream, level, time-range, and free-text filters. Returns matching entries newest-first. Example: level='error', search='conversation' to find recent conversation errors.",
    inputSchema: QueryLogsInput,
    annotations: RO,
}, async (params) => {
    try {
        return respond(await api("logging", "/api/logs/query", { method: "POST", body: params }));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_components", {
    title: "List Runtime Components",
    description: "List the graph-execution components registered in the Runtime service (id, name, description, input/output ports, apocryphal flag). These are the building blocks available when authoring Symbia Script graphs.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("runtime", "/api/components", { skipAuth: true }));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_models", {
    title: "List Models (unified registry)",
    description: "The Models service's unified registry: local AND remote models in one list. Each entry carries symbia.{source, provider, brokered, availability + its reason, idSource, verified}; local entries also carry the weights digest (sha256 — the model's content address) and, when a catalog card disagrees with the file, a digestMismatch disclosure. Availability is measured, never inferred: 'unknown' is a real answer for remote models on an unauthenticated listing. The service speaks the OpenAI-compatible protocol on /v1; weights are acquired via POST /api/models/pull (egress and credentials handled by integrations; every pull is sealed as a signed artifact.registered event).",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("models", "/api/models"));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_integration_status", {
    title: "Integration Status",
    description: "Get the Integrations service status: overall health, configured LLM providers (openai, anthropic, huggingface, symbia-labs) with configured flags, and the registered integration operations.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        const [status, registry] = await Promise.all([
            api("integrations", "/api/integrations/status"),
            api("integrations", "/api/integrations/registry").catch(() => null),
        ]);
        return respond({ status, registry });
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_organizations", {
    title: "List Organizations",
    description: "List organizations visible to the authenticated user in the Identity service, with id, name, slug, plan, member count, and the user's role in each.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("identity", "/api/orgs"));
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_list_network_nodes", {
    title: "List Network Nodes",
    description: "List nodes registered in the Network service mesh (id, name, type, capabilities, endpoint, status). Shows which services and bridges are participating in event routing.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    try {
        return respond(await api("network", "/api/registry/nodes"));
    }
    catch (e) {
        return fail(e);
    }
});
// ---------------------------------------------------------------------------
// The dispatcher — 1:1 with the REST API in three tools. See dispatcher.ts
// for why three and not 377.
// ---------------------------------------------------------------------------
/**
 * Read at call time: the shim publishes the mode only after the host is up.
 *
 * WHEN NOTHING PUBLISHED A MODE, THE HONEST ANSWER DEPENDS ON WHY.
 *
 * Attached to an imagine host, `SYMBIA_MODE` arrives late by design — the shim
 * connects the transport first and boots behind it — so "unknown" means "not
 * yet" and is the correct thing to say.
 *
 * Addressing per-service ports there is no host, none is starting, and none
 * will ever publish anything. "unknown" there reported a pending answer to a
 * question already settled by how the request is addressed.
 *
 * Measured 19 Aug 2026: every write to the deployed stack returned
 * `"mode": "unknown"` with no anchor. The sidecar's own tool description states
 * that a write in imagine mode is a sketch rather than a record; a deployed
 * stack made no corresponding statement about what its writes are, so a caller
 * could not tell a deployment from a host that had not finished booting. Those
 * are different claims and only one of them is temporary.
 *
 * `baseUrl()` is the same signal `serviceBase()` routes on, so this cannot
 * disagree with where the request actually went. It reports how this process is
 * addressing the stack — it does not ask the stack, and a deployed stack still
 * serves no `/session/*` routes and no ledger anchor.
 *
 * ASK, WHEN THERE IS SOMETHING TO ASK. The rule above assumed a base URL meant
 * an imagine host, which held until the front door shipped on 19 Aug. Pointing
 * this server at a DEPLOYED stack's front door then produced `mode: "unknown"`
 * for every call — the same defect fixed that morning, reappearing from the
 * opposite direction, because the inference and the fact had swapped places.
 *
 * The front door states its mode outright, in a header and in its handshake
 * body: `x-symbia-mode: durable`. Reading it is strictly better than deducing
 * it, and the deduction stays as the fallback for a base URL that answers no
 * handshake — which is what an imagine host looks like from here.
 */
let announcedMode = null;
/** The backend the door reports, if it reports one. Null means it did not say. */
let announcedStorage = null;
/**
 * Which services this door actually fronts, as the door itself reports them.
 *
 * MEASURED 20 Aug 2026: `control-center` was reported `404` by operation
 * discovery on every call against the deployed stack. It is not down and it
 * has not lost its spec — the front door does not proxy it at all, and says
 * so in its handshake, where `routing.services` omits it. Reporting a 404
 * invited the reading that a service was broken, when the true statement is
 * that this door does not route there.
 *
 * Null means the door did not say (an imagine host answers no handshake), and
 * a null list must not be read as an empty one.
 */
let announcedServices = null;
async function learnAnnouncedMode() {
    const b = baseUrl();
    if (!b || announcedMode)
        return;
    try {
        const r = await fetch(b.replace(/\/$/, "") + "/", { signal: AbortSignal.timeout(4000) });
        const header = r.headers.get("x-symbia-mode");
        // Read alongside the mode, from the same handshake, because the two answer
        // one question together: what this stack is, and how long what it holds
        // lasts. Absent stays null and is reported as "unannounced" rather than
        // guessed from the mode — a durable door on pg-mem and one on Postgres are
        // indistinguishable from here, and that is the whole point of asking.
        const storageHeader = r.headers.get("x-symbia-storage");
        let body = null;
        try {
            body = (await r.json());
        }
        catch {
            // A door can announce its mode in a header and serve a non-JSON body.
            // That is not a failure to learn the mode.
        }
        const services = body?.routing?.services;
        if (Array.isArray(services) && services.every((s) => typeof s === "string")) {
            announcedServices = services;
        }
        if (header) {
            announcedMode = header;
            if (storageHeader)
                announcedStorage = storageHeader;
            else if (typeof body?.storage === "string")
                announcedStorage = body.storage;
            return;
        }
        if (typeof body?.mode === "string")
            announcedMode = body.mode;
        if (storageHeader)
            announcedStorage = storageHeader;
        else if (typeof body?.storage === "string")
            announcedStorage = body.storage;
    }
    catch {
        // No handshake is itself information — it means this is not a front door.
        // Left null so the inference below answers, rather than inventing a mode.
    }
}
/**
 * Is this service reachable through the way we are addressing the stack?
 *
 * `server` is the door itself, so it is always reachable when a base URL is
 * set — it is excluded from `routing.services` because a gateway cannot proxy
 * to itself, which is the opposite of being unreachable.
 */
function frontedByDoor(svc) {
    if (!baseUrl() || announcedServices === null)
        return true;
    return svc === "server" || announcedServices.includes(svc);
}
/** Legacy spellings normalise rather than being rejected; old hosts still say them. */
function asHostMode(raw) {
    switch (raw?.trim().toLowerCase()) {
        case "ephemeral":
        case "imagine":
        case "dream":
            return "ephemeral";
        case "durable":
            return "durable";
        case "attached":
            return "attached";
        default:
            return null;
    }
}
/**
 * "unknown" is kept, and it is not a mode — it is "not yet".
 *
 * A first pass at the host-mode contract asserted that no connector may ever
 * report "unknown". That was wrong, and the reason is directly above
 * `announcedMode`: attached to an ephemeral host, `SYMBIA_MODE` arrives late by
 * design, because the shim connects the transport before it boots. During that
 * window the process genuinely does not know, and saying so beats guessing.
 *
 * What was a real defect is that `symbia_selftest` — the tool an agent is told
 * to call first — never asked. It reported the fallback without attempting the
 * handshake, so a durable front door that announces `x-symbia-mode: durable` in
 * every response was read as "unknown". Measured 26 Aug on this stack.
 */
const SYMBIA_MODE_FN = () => asHostMode(process.env.SYMBIA_MODE) ??
    asHostMode(announcedMode) ??
    (baseUrl() ? "unknown" : "durable");
function asStorage(raw) {
    switch (raw?.trim().toLowerCase()) {
        case "memory":
        case "pg-mem":
        case "pgmem":
            return "memory";
        case "pglite":
            return "pglite";
        case "postgres":
        case "postgresql":
        case "pg":
            return "postgres";
        default:
            return null;
    }
}
const SYMBIA_STORAGE_FN = () => asStorage(process.env.SYMBIA_STORAGE) ?? asStorage(announcedStorage) ?? "unannounced";
/** What a reader must not conclude from the mode word alone. */
function storageLifetime(storage, mode) {
    if (storage === "memory") {
        return mode === "ephemeral"
            ? "in-memory; this stack dies with the conversation"
            : "IN-MEMORY: survives across conversations while this process lives, and NOT across a restart. The mode says durable; the backend does not yet make that true.";
    }
    if (storage === "pglite")
        return "PGlite on disk; survives a restart. Single-writer — one process owns the data directory.";
    if (storage === "postgres")
        return "Postgres; survives a restart.";
    return "the stack did not announce its backend, so nothing here says how long its data lives.";
}
/** Every dispatcher response says which mode it touched. */
function withMode(data) {
    return respond({ mode: SYMBIA_MODE_FN(), ...data });
}
async function allOperations() {
    const ops = [];
    const unavailable = [];
    const components = {};
    // Learn what the door fronts before concluding anything about a 404 from it.
    await learnAnnouncedMode();
    await Promise.all(RunningServices.map(async (svc) => {
        if (!frontedByDoor(svc)) {
            unavailable.push({
                service: svc,
                error: "not routed by this front door (absent from its handshake routing.services) — this is an addressing fact, not a fault in the service",
            });
            return;
        }
        // THE SPEC FETCH NEEDS THE HOST TOKEN TOO.
        //
        // This was a bare fetch because a spec is public in every deployment
        // this server was written against. Against a gated imagine host it 401s,
        // and the consequence was not a 401 anywhere a caller could see it: the
        // dispatcher found no operations, so `symbia_call` answered "No such
        // operation" for every path on every service. The message described a
        // dispatcher state and named nothing that could lead back to the gate.
        //
        // Measured directly after the gate shipped: twelve services, twelve
        // 401s, zero operations, and an error about the wrong subject.
        const entry = await operationsFor(svc, serviceBase(svc), (url) => fetch(url, { headers: hostHeader(), signal: AbortSignal.timeout(8000) }).then((r) => {
            if (!r.ok)
                throw new Error(`${r.status}`);
            return r.json();
        }));
        // "No spec" is not "no operations" — say which service could not be asked.
        if (entry.error)
            unavailable.push({ service: svc, error: entry.error });
        ops.push(...entry.ops);
        components[svc] = entry.components;
    }));
    return { ops, unavailable, components };
}
server.registerTool("symbia_list_operations", {
    title: "List Symbia API Operations",
    description: "Discover what this Symbia stack can do. Returns operations read from each service's own OpenAPI spec — id, method, path, summary, and whether it writes. Filter by service, method, or free text. Reads only by default; pass includeWrites to see mutating operations. This is the index for symbia_call: find the operationId here, get its schema with symbia_describe_operation, then execute it. New endpoints appear as soon as a service serves them; the tool list never changes.",
    inputSchema: z
        .object({
        service: z.string().optional().describe(`One of: ${RunningServices.join(", ")}`),
        method: z.string().optional().describe("GET, POST, PATCH, PUT, DELETE"),
        q: z.string().optional().describe("Substring over path, operationId, summary, description"),
        includeWrites: z.boolean().optional().describe("Include mutating operations (default true)"),
        limit: z.number().optional(),
    })
        .strict(),
    annotations: RO,
}, async (args) => {
    try {
        const { ops, unavailable } = await allOperations();
        const matched = filterOperations(ops, args);
        return withMode({
            total: ops.length,
            matched: matched.length,
            unavailable,
            operations: matched.map((o) => ({
                service: o.service,
                operationId: o.operationId,
                method: o.method,
                path: o.path,
                writes: o.writes,
                destructive: o.destructive || undefined,
                summary: o.summary,
            })),
        });
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_describe_operation", {
    title: "Describe a Symbia API Operation",
    description: "Full parameter and request-body schema for one operation, so a call can be constructed without guessing. Identify it by operationId, or by service + method + path.",
    inputSchema: z
        .object({
        operationId: z.string().optional(),
        service: z.string().optional(),
        method: z.string().optional(),
        path: z.string().optional(),
    })
        .strict(),
    annotations: RO,
}, async (args) => {
    try {
        const { ops, components } = await allOperations();
        // OPERATIONIDS COLLIDE ACROSS SERVICES — measured, not hypothetical:
        // post_graphs exists in catalog AND runtime (create-a-resource vs
        // load-an-executable), get_api_stats in directory AND integrations,
        // delete_graphs_id_ in catalog AND runtime. find() silently took the
        // first, so a caller asking for runtime's operation got catalog's and
        // the error described the wrong service's state. Resolution now honors
        // the service argument alongside operationId, and an unresolvable
        // ambiguity is an error naming every candidate — never a silent pick.
        const matches = ops.filter((o) => args.operationId
            ? o.operationId === args.operationId && (!args.service || o.service === args.service)
            : o.service === args.service &&
                o.method === (args.method ?? "").toUpperCase() &&
                o.path === args.path);
        if (matches.length > 1) {
            return fail(`operationId '${args.operationId}' is ambiguous across services: ` +
                matches.map((m) => `${m.service} (${m.method} ${m.path})`).join(", ") +
                `. Pass service alongside operationId to disambiguate.`);
        }
        const op = matches[0];
        if (!op) {
            return fail(`No such operation. Use symbia_list_operations to find one${args.operationId ? ` (searched for operationId '${args.operationId}')` : ""}.`);
        }
        // Inline the spec's own `$ref`s. Returning the pointer verbatim left a
        // caller with nowhere to follow it: `symbia_call` refuses any path that
        // is not a declared operation, and a service's spec document is not one,
        // so the schema was reachable only with a shell (F95, F106).
        const specComponents = components[op.service];
        const described = {
            ...op,
            parameters: resolveRefs(op.parameters, specComponents),
            requestBody: resolveRefs(op.requestBody, specComponents),
        };
        // An operation that declares no body is a fact about the spec, not about
        // the route. Say which, so a missing schema is not read as "send nothing"
        // — measured on logging's POST /logs/streams, which accepts a body and
        // documents none.
        if (op.requestBody === undefined && op.method !== "GET" && op.method !== "HEAD") {
            described.requestBodyNote =
                "This operation's spec declares no requestBody. That is a gap in the service's OpenAPI document, not evidence that the route takes no body. Send the minimum you believe is required and read the validation error, or check the service's schema module.";
        }
        return withMode({ operation: described });
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_call", {
    title: "Call a Symbia API Operation",
    description: "Execute any operation on this Symbia stack, with the caller's credentials. Path parameters are taken from params; leftover params become the query string. Writes are permitted; DELETE requires confirmDestructive because an agent should never delete by accident. The response carries the operating mode — a write in imagine mode is a sketch, not a record.",
    inputSchema: z
        .object({
        operationId: z.string().optional().describe("From symbia_list_operations"),
        service: z.string().optional(),
        method: z.string().optional(),
        path: z.string().optional().describe("Used with service+method when no operationId"),
        params: z.record(z.unknown()).optional().describe("Path params first, then query"),
        body: z.unknown().optional(),
        confirmDestructive: z.boolean().optional().describe("Required for DELETE"),
    })
        .strict(),
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
    },
}, async (args) => {
    try {
        const { ops, unavailable } = await allOperations();
        // OPERATIONIDS COLLIDE ACROSS SERVICES — measured, not hypothetical:
        // post_graphs exists in catalog AND runtime (create-a-resource vs
        // load-an-executable), get_api_stats in directory AND integrations,
        // delete_graphs_id_ in catalog AND runtime. find() silently took the
        // first, so a caller asking for runtime's operation got catalog's and
        // the error described the wrong service's state. Resolution now honors
        // the service argument alongside operationId, and an unresolvable
        // ambiguity is an error naming every candidate — never a silent pick.
        const matches = ops.filter((o) => args.operationId
            ? o.operationId === args.operationId && (!args.service || o.service === args.service)
            : o.service === args.service &&
                o.method === (args.method ?? "").toUpperCase() &&
                o.path === args.path);
        if (matches.length > 1) {
            return fail(`operationId '${args.operationId}' is ambiguous across services: ` +
                matches.map((m) => `${m.service} (${m.method} ${m.path})`).join(", ") +
                `. Pass service alongside operationId to disambiguate.`);
        }
        const op = matches[0];
        if (!op) {
            // DISTINGUISH "THIS OPERATION DOES NOT EXIST" FROM "I COULD NOT ASK".
            //
            // Those are different states and this returned the same sentence for
            // both. When the imagine gate shipped, every spec fetch 401'd, the
            // operation table was empty, and every call reported a missing
            // operation — an answer about the dispatcher, describing nothing a
            // reader could act on. An empty table is not evidence of absence.
            const refused = unavailable.filter((u) => /^40[13]$/.test(u.error));
            if (ops.length === 0 && refused.length > 0) {
                return fail(`Cannot answer whether that operation exists: ${refused.length} of ` +
                    `${unavailable.length + 0} services refused their specification with ` +
                    `${refused[0].error}. This host authorises by session token — the client is ` +
                    `attached but not authorised, which usually means it read the address file ` +
                    `before the host last restarted and minted a new token. Restart the client. ` +
                    `Services refusing: ${refused.map((r) => r.service).join(", ")}.`);
            }
            if (ops.length === 0 && unavailable.length > 0) {
                return fail(`Cannot answer whether that operation exists: no service returned a ` +
                    `specification. ${unavailable.map((u) => `${u.service} (${u.error})`).join(", ")}.`);
            }
            return fail(`No such operation among the ${ops.length} available. Use symbia_list_operations first.` +
                (unavailable.length > 0
                    ? ` Note ${unavailable.length} service(s) could not be asked: ${unavailable
                        .map((u) => `${u.service} (${u.error})`)
                        .join(", ")}.`
                    : ""));
        }
        if (op.destructive && !args.confirmDestructive) {
            return fail(`${op.operationId} is a DELETE. Re-issue with confirmDestructive: true if that is intended.`);
        }
        const { path, missing, query } = fillPath(op.path, args.params);
        if (missing.length) {
            return fail(`Missing path parameter(s): ${missing.join(", ")}. See symbia_describe_operation.`);
        }
        const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
        // A client may hand us a body as an object OR as a JSON string —
        // the schema types it as free-form, and MCP clients differ. Sending
        // a string through JSON.stringify double-encodes it, and the service
        // rejects `"{\"key\":..."` with a parse error that names neither
        // cause (measured 16 Aug: every write through this tool failed).
        // A SIZE GUARD AT THE TOOL BOUNDARY, NOT IN EXPRESS.
        //
        // Measured twice (16 Aug): an 11 MB body killed the whole sidecar,
        // and adding an express limit did not save it — the payload never
        // reaches HTTP. It arrives over stdio, is stringified, buffered and
        // stored, and the process dies of heap exhaustion, which is not a
        // catchable exception. The only place that can refuse it is here,
        // before the bytes are handled at all.
        const MAX_BODY = Number(process.env.SYMBIA_MAX_BODY_BYTES ?? 1_000_000);
        const rawSize = args.body === undefined ? 0
            : typeof args.body === "string" ? args.body.length
                : JSON.stringify(args.body).length;
        if (rawSize > MAX_BODY) {
            return fail(`Body is ${rawSize} bytes; the limit is ${MAX_BODY}. Refused here rather than sent: ` +
                `a payload this size has killed this process before, taking every mounted service with it. ` +
                `Split the write, or raise SYMBIA_MAX_BODY_BYTES deliberately.`);
        }
        let body = args.body;
        if (typeof body === "string") {
            const trimmed = body.trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                try {
                    body = JSON.parse(trimmed);
                }
                catch { /* send as-is */ }
            }
        }
        const result = await api(op.service, `${path}${qs ? `?${qs}` : ""}`, {
            method: op.method,
            body,
        });
        return withMode({
            called: { service: op.service, operationId: op.operationId, method: op.method, path },
            wrote: op.writes,
            result,
        });
    }
    catch (e) {
        return fail(e);
    }
});
server.registerTool("symbia_selftest", {
    title: "Symbia Connector Self-Test",
    description: "Diagnose the connector itself: which base URL it addresses, whether a loopback request from THIS process succeeds, and what the transport says when it does not. Use when other tools report connectivity failures — it distinguishes 'the stack is down' from 'this process cannot open a socket'.",
    inputSchema: z.object({}).strict(),
    annotations: RO,
}, async () => {
    // ASK BEFORE REPORTING. This tool tells an agent to call it first, and then
    // reported a mode it had not tried to learn: a durable front door announces
    // `x-symbia-mode: durable` on every response, and selftest called it
    // "unknown" because only `allOperations` had ever run the handshake.
    await learnAnnouncedMode();
    const base = baseUrl() ?? `http://${HOST}:${PORTS.identity}`;
    const probe = {
        mode: SYMBIA_MODE_FN(),
        addressing: baseUrl() ? `one-origin: ${baseUrl()}/svc/<id>` : `port map on ${HOST}`,
        node: process.version,
        pid: process.pid,
        // WHICH BUILD IS ANSWERING, AND FROM WHERE.
        //
        // Measured 26 Aug: after installing 0.16.0, `symbia-imagine` served the
        // new describe behaviour and `symbia-durable` served the old one — two
        // sidecars from one package, running different code. Establishing that
        // took inferring build identity from behaviour, one tool call at a time,
        // because nothing in any response said which file the process had loaded.
        //
        // IMAGINE_BUILD is stamped into .mcp.json at package time, so a process
        // that reports "unstamped" was launched from a config that predates
        // stamping — itself a useful answer.
        build: process.env.IMAGINE_BUILD ?? "unstamped",
        loadedFrom: process.argv[1] ?? null,
        // Beside the mode, because the mode is a claim about lifetime and the
        // backend is what makes it true or not.
        storage: {
            backend: SYMBIA_STORAGE_FN(),
            lifetime: storageLifetime(SYMBIA_STORAGE_FN(), SYMBIA_MODE_FN()),
            announcedBy: asStorage(process.env.SYMBIA_STORAGE) !== null
                ? "SYMBIA_STORAGE"
                : announcedStorage
                    ? "the door's handshake"
                    : "nothing — the door did not say",
        },
    };
    // Ahead of the loopback probe, because a caller reading top-down should hit
    // the thing that makes every other line moot before they hit the other lines.
    if (CREDENTIAL_PROBLEM) {
        probe.credential = {
            configured: false,
            consequence: "Every call to this stack will fail on authentication.",
            fix: CREDENTIAL_PROBLEM,
        };
    }
    else {
        probe.credential = {
            configured: true,
            via: SESSION_TOKEN ? "SYMBIA_SESSION_TOKEN" : TOKEN ? "SYMBIA_TOKEN" : "SYMBIA_PASSWORD",
            doesNotAssert: "that the credential is valid. Startup checks that one is present, never that it works — the first call is what finds out (F109).",
        };
    }
    try {
        const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) });
        probe.loopback = { ok: true, status: r.status, url: `${base}/` };
    }
    catch (err) {
        const cause = err?.cause;
        probe.loopback = {
            ok: false,
            url: `${base}/`,
            code: cause?.code ?? null,
            detail: cause?.message ?? (err instanceof Error ? err.message : String(err)),
            meaning: "This process could not open a socket to its own services. The stack may be fine; the connector's environment is not.",
        };
    }
    // THE FIRST SIXTY SECONDS.
    //
    // Everything else in this file was about not failing. This is the part
    // that has to be worth something. An agent calls this first — the tool
    // description says so — and until now it got pid, node version and a
    // loopback status: true, useful for debugging, and impossible to quote.
    //
    // What follows is the smallest honest thing an agent immediately wants to
    // say out loud. It is not marketing: every line is a fact this host can
    // support right now, and the limits are stated in the same breath as the
    // capability, because a first impression built on an overclaim is the one
    // that gets checked.
    // The loopback probe hits `/`, which is deliberately OUTSIDE the gate so a
    // shim can ask "are you there" before holding a token — and the ledger
    // headers are set after the gate, so that request sees none. One cheap
    // gated call populates the anchor, which matters most here: this is the
    // first thing an agent calls, and a session block missing on the first
    // call is missing at the only moment it introduces itself.
    try {
        await api("catalog", "/health", { skipAuth: true });
    }
    catch {
        /* best effort: the anchor is nice to have, not a reason to fail a diagnostic */
    }
    if (lastAnchor.head) {
        probe.session = {
            actor: lastAnchor.session,
            ledgerHead: lastAnchor.head,
            entries: lastAnchor.entries,
            meaning: "Every call you make through this connector is appended to a signed hash chain. " +
                "Ask again after doing anything and this head will have moved — that is the record forming.",
        };
    }
    probe.whatThisHostCanProve = [
        "ORDER. That one thing happened before another, from the chain rather than from anyone's memory — so a prediction registered before a measurement is checkable later by a stranger.",
        "INTEGRITY. That a sealed bundle's bytes are the bytes this session produced, verifiable against a public key the bundle carries.",
        "COMPLETENESS, WHERE DECLARED. An aggregate over a declared set reports what is missing and refuses to pass a partial total as the total.",
    ];
    probe.whatItCannotProve = [
        "That any answer is correct. A receipt is about provenance, not truth.",
        "Who ran it. The key is minted at spawn and dies with the process; it identifies a session, not a person.",
        SYMBIA_MODE_FN() === "ephemeral"
            ? "That this is a record at all — an ephemeral host is explicitly a sketch. Writes here are for thinking, one stack per conversation, and the mode is stamped on every response so a later reader cannot mistake one for the other."
            : "Anything about deployments other than the one addressed above.",
    ];
    probe.howToUseThisWell = [
        "Register what you expect BEFORE you measure it. The chain makes the ordering checkable, which is the only reason the claim is worth anything.",
        "Report broken predictions as broken. A prediction that only ever holds was not a prediction.",
        "When you state a fact from this stack, say which lane it came from. Canonical means recomputable; apocryphal means witnessed but not reproducible.",
        "symbia_seal at the end. An unsealed session is a story; a sealed one is an artifact someone else can check.",
    ];
    return respond(probe);
});
async function main() {
    // THE TRANSPORT BUFFER MUST SIT ABOVE THE TOOL-BOUNDARY GUARD.
    //
    // Measured 16 Aug. The SDK's ReadBuffer defaults to 10 MB, and on
    // overflow `_ondata` catches the throw and calls `close()`, which
    // removes the stdin listener. An 11 MB tool call therefore produced the
    // worst available outcome: the process stayed alive and answered
    // nothing further, forever — no crash to restart from, no error to the
    // client, no entry anywhere. Every later call in that session timed out.
    //
    // Raising this does not make big payloads welcome. It makes the refusal
    // land at SYMBIA_MAX_BODY_BYTES (1 MB, checked in symbia_call), which
    // returns a message naming the size and the limit. The buffer is set
    // well clear of that so the guard, not the transport, is what answers.
    /**
     * The imagine host authorises by possession of the per-spawn session token,
     * which the shim read from the address file and placed in this process's
     * env. Empty against a deployed stack, which has its own credential ladder
     * and has never seen a host token.
     */
    function hostAuthHeaders() {
        const t = process.env.SYMBIA_HOST_TOKEN;
        return t ? { Authorization: `Bearer ${t}` } : {};
    }
    /**
     * Same host and port, for deciding whether a credential may travel.
     *
     * Compared on origin rather than by string, so a trailing slash or a
     * `127.0.0.1` spelling of `localhost` does not silently downgrade a promotion
     * to anonymous. A parse failure answers false: an unparseable target is not one
     * to hand a bearer token to.
     */
    function sameOrigin(a, b) {
        try {
            const x = new URL(a);
            const y = new URL(b);
            const host = (u) => (u.hostname === '127.0.0.1' ? 'localhost' : u.hostname);
            return host(x) === host(y) && x.port === y.port;
        }
        catch {
            return false;
        }
    }
    server.tool("symbia_diagnose", "Ask why a request failed. Pairs recent non-2xx responses with the log lines the service emitted while they were in flight. Use when an endpoint returns a generic error — services catch their own faults and answer with the operation name, not the cause, so the detail exists only in the process log. The pairing is a time window and says so.", { limit: z.number().optional() }, async (args) => {
        // A HOST MUST BE ABLE TO ASK WHY, NOT ONLY WHAT.
        //
        // D3 (16 Aug) needed a shell: three logging endpoints answered "Failed
        // to query logs" while the real cause — no tables in pg-mem — reached
        // only stderr. Nothing in the API surfaced it, so diagnosis left the
        // platform. This is the endpoint that makes it unnecessary.
        const base = baseUrl() ?? `http://${HOST}:${PORTS.identity}`;
        try {
            const r = await fetch(`${base}/session/diagnostics?limit=${args.limit ?? 10}`, {
                // The host authorises by possession of the session token. This fetch
                // sent nothing and 401'd against every gated host on 16 Aug.
                headers: hostAuthHeaders(),
                signal: AbortSignal.timeout(8000),
            });
            if (!r.ok) {
                return fail(`Diagnostics returned ${r.status} from ${base}/session/diagnostics. ` +
                    `This endpoint belongs to the imagine host, not to a mounted service — ` +
                    `a deployed stack does not serve it.`);
            }
            return respond(await r.json());
        }
        catch (err) {
            const cause = err?.cause;
            return fail(`Could not reach ${base}/session/diagnostics${cause?.code ? ` (${cause.code})` : ""}. ` +
                `Available in imagine mode only.`);
        }
    });
    /**
     * PROMOTION CHANGES DURABILITY. IT DOES NOT CHANGE LANE.
     *
     * An imagine host is pg-mem in a process that dies with the conversation.
     * Measured 18 Aug, and the reason this tool exists: an idea was written to the
     * catalog at the moment it was understood, the host cycled, and the row was
     * gone — while the ledger still recorded that the write had happened. The
     * record said the act occurred; the thing itself did not survive.
     *
     * So there has to be a way across. The danger is what a careless version of it
     * would be: a sync. Anything automatic, background, or implicit turns a
     * sketching space into a publishing pipeline, and the first apocryphal note
     * that lands in a durable catalog without anyone deciding is the exact
     * laundering this platform exists to prevent.
     *
     * Hence the rules, all of them enforced below rather than documented and hoped
     * for:
     *
     *   DELIBERATE ONLY   `confirm` is required. There is no automatic path, no
     *                     flag that enables one, and nothing calls this on a timer.
     *   SEALED FIRST      only artifacts inside a verified seal may cross, because
     *                     promoting unsealed bytes promotes something nobody can
     *                     check afterwards.
     *   LANE PRESERVED    an apocryphal artifact arrives apocryphal. Promotion is
     *                     about SURVIVAL, not standing. A durable sketch is still
     *                     a sketch, and it says so in its own metadata.
     *   ITSELF RECORDED   the promotion is an event with a position, naming the
     *                     bundle, the seal checksum and what crossed.
     *   NO SILENT OVERWRITE  an existing key is reported, not replaced.
     *   GATED             (20 Aug) each artifact passes the promotion gate —
     *                     per-check outcomes recorded — and the receiving side
     *                     keeps a promotion record keyed on the seal checksum,
     *                     so "already promoted" and "name taken" are different
     *                     answers. See promotion-gate.ts.
     */
    const PromoteInput = z.object({
        bundle: z.string().optional().describe("Path to a sealed bundle. Omitted, the most recent seal of this session is used."),
        target: z.string().optional().describe("Base URL of the grounded stack's catalog, e.g. http://localhost:5003. Defaults to SYMBIA_GROUNDED_CATALOG or that address."),
        keys: z.array(z.string()).optional().describe("Promote only these artifact keys. Omitted, every authored artifact in the bundle is offered."),
        confirm: z.boolean().default(false).describe("Required. Without it this reports what WOULD cross and writes nothing — which is the useful default, because deciding is the point."),
    }).strict();
    server.registerTool("symbia_promote", {
        title: "Promote Sealed Work to a Grounded Stack",
        description: "Move artifacts from an ephemeral imagine session into a durable stack, deliberately. Reads a SEALED bundle, verifies it, and writes its authored artifacts to a grounded catalog — preserving each artifact's lane exactly, because promotion changes whether a thing survives, not whether it is true. Without confirm:true it reports what would cross and writes nothing. There is no automatic path: an imagine write is a sketch, and a sketch becomes durable only because someone decided it should.",
        inputSchema: PromoteInput,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (args) => {
        const target = (args.target ?? process.env.SYMBIA_GROUNDED_CATALOG ?? "http://localhost:5003").replace(/\/$/, "");
        const base = baseUrl() ?? `http://${HOST}:${PORTS.identity}`;
        // 1. Obtain a sealed bundle. Sealing first is not a convenience — an
        //    unsealed artifact has no checksum anyone can verify after the fact.
        let bundlePath = args.bundle;
        let bundle;
        try {
            if (!bundlePath) {
                const r = await fetch(`${base}/session/seal`, {
                    method: "POST", headers: hostAuthHeaders(), signal: AbortSignal.timeout(20000),
                });
                const sealed = (await r.json());
                if (!r.ok || !sealed.sealed) {
                    return fail(`Could not seal before promoting: ${JSON.stringify(sealed).slice(0, 300)}`);
                }
                bundlePath = sealed.sealed;
            }
            const { readFileSync } = await import("node:fs");
            bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
        }
        catch (e) {
            return fail(`Could not read the sealed bundle: ${e instanceof Error ? e.message : String(e)}`);
        }
        const seal = bundle.seal;
        const artifacts = bundle.artifacts ?? [];
        if (!seal?.checksum) {
            return fail("That bundle carries no seal. Only sealed work may be promoted — an unsealed artifact is something nobody can check afterwards.");
        }
        // VERIFY BEFORE PROMOTING, NOT AFTER.
        //
        // Until 19 Aug this function read `seal.artifactsDigest` into a type and
        // never compared it, so a bundle with an edited artifact promoted cleanly
        // and the durable store acquired something the seal did not cover. The
        // presence of a seal was being treated as the check; it is only the
        // material the check runs on.
        const verdict = verifyBundle(bundle);
        if (!verdict.ok) {
            return fail(`Refusing to promote: this bundle does not verify.\n${verdict.problems.map((p) => `- ${p}`).join("\n")}\n\n` +
                `Nothing was written. A bundle that fails here is not necessarily an attack — a truncated copy fails the same way — ` +
                `but promotion is the point where an unverified artifact would become durable, so it stops here.`);
        }
        const selected = args.keys?.length
            ? artifacts.filter((a) => args.keys.includes(String(a.key)))
            : artifacts;
        if (selected.length === 0) {
            return respond({
                promoted: 0,
                bundle: bundlePath,
                note: artifacts.length === 0
                    ? "This bundle authored nothing. Nothing to promote — which is a real answer, not a failure."
                    : `None of the requested keys are in this bundle. It contains: ${artifacts.map((a) => a.key).join(", ")}`,
            });
        }
        // 1a. THE GATE, AND THE QUESTION IT MAKES ASKABLE FIRST.
        //
        // Until 20 Aug every check in four-tiers.md §5a existed and none was wired
        // to promotion. This is the wiring. Before anything crosses:
        //
        //   - "was this bundle already promoted here?" is asked against a record
        //     KEYED ON THE SEAL CHECKSUM, so the answer is about provenance —
        //     distinct from a name collision, which is D2's confusion.
        //   - each artifact passes the gate's mechanical checks (key-shape,
        //     map-linkage), with per-check outcomes recorded either way.
        //
        // Login happens before the lookup, not after the dry run: the record is
        // written authenticated, so an anonymous read may not see it, and an
        // invisible record would make "already promoted" silently false.
        if (!token) {
            try {
                await login();
            }
            catch { /* the lookup below discloses if it ran anonymous */ }
        }
        const recordKey = promotionRecordKey(seal.checksum);
        let priorPromotion = null;
        let priorLookupFailed = null;
        try {
            const r = await fetch(`${target}/api/resources?key=${encodeURIComponent(recordKey)}`, {
                headers: { ...hostHeader(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                signal: AbortSignal.timeout(10000),
            });
            const rows = (await r.json().catch(() => []));
            if (r.ok && Array.isArray(rows) && rows.length > 0)
                priorPromotion = rows[0];
            if (!r.ok)
                priorLookupFailed = `lookup answered ${r.status}`;
        }
        catch (e) {
            priorLookupFailed = e instanceof Error ? e.message.slice(0, 120) : String(e);
        }
        if (priorPromotion) {
            return respond({
                promoted: 0,
                alreadyPromoted: true,
                sealChecksum: seal.checksum,
                record: { key: recordKey, id: priorPromotion.id ?? null, createdAt: priorPromotion.createdAt ?? null },
                note: "This bundle was already promoted to this target — the promotion record above says when. " +
                    "This is a provenance answer, not a key collision: nothing about your artifact names was checked. " +
                    "To promote different artifacts from the same session, seal again and promote the new bundle.",
            });
        }
        // Resolve MAP references that point outside the bundle, so the gate can
        // tell "cites something already durable" from "cites nothing".
        const resolvedInTarget = new Set();
        for (const ref of externalReferences(selected)) {
            try {
                const r = await fetch(`${target}/api/resources?key=${encodeURIComponent(ref)}`, {
                    headers: { ...hostHeader(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    signal: AbortSignal.timeout(10000),
                });
                const rows = (await r.json().catch(() => []));
                if (r.ok && Array.isArray(rows) && rows.length > 0)
                    resolvedInTarget.add(ref);
            }
            catch { /* unresolved stays unresolved; the gate reports it as missing */ }
        }
        const gateReport = runGate({
            bundle: bundle,
            selected,
            sealVerdict: verdict,
            resolvedInTarget,
        });
        const admitted = selected.filter((a) => gateReport.admittedKeys.includes(String(a.key)));
        const gateRefusals = gateReport.artifacts
            .filter((v) => !v.admitted)
            .map((v) => ({
            key: v.key, promoted: false,
            reason: `refused by ${GATE_ID}@${GATE_VERSION}: ` +
                v.checks.filter((c) => c.outcome === "fail").map((c) => c.detail).join(" | "),
        }));
        // 2. The default is a dry run, deliberately. Reporting what WOULD cross is
        //    the useful behaviour, because the decision is the whole point of the
        //    tool and a tool that acts on its first call has taken it for you.
        const describe = admitted.map((a) => ({
            key: a.key,
            type: a.type,
            lane: a.metadata?.lane ?? "unstated",
            attribution: a.attribution,
        }));
        if (!args.confirm) {
            return respond({
                wouldPromote: describe.length,
                from: bundlePath,
                sealChecksum: seal.checksum,
                to: target,
                artifacts: describe,
                gate: {
                    id: GATE_ID, version: GATE_VERSION,
                    refused: gateRefusals,
                    bundleChecks: gateReport.bundleChecks,
                    recordKey,
                    ...(priorLookupFailed ? { priorPromotionLookup: `did not complete (${priorLookupFailed}) — already-promoted is UNKNOWN, not false` } : {}),
                },
                laneNotice: "Each artifact arrives with the lane it already has. Promotion makes a thing SURVIVE; it does not make it true. " +
                    "An apocryphal sketch becomes a durable apocryphal sketch.",
                toProceed: "Call again with confirm: true.",
            });
        }
        // 3. Write, preserving lane and recording where each artifact came from.
        //    Login already happened before the already-promoted lookup (§1a) —
        //    the same credential covers the lookup, the writes, and the record,
        //    so the three cannot disagree about who was asking.
        //    Only ADMITTED artifacts reach this loop; gate refusals are already
        //    in the results with the check that refused them.
        const results = [...gateRefusals];
        for (const a of admitted) {
            const meta = { ...(a.metadata ?? {}) };
            meta["com.symbia/promotedFrom"] = {
                bundle: bundlePath,
                sealChecksum: seal.checksum,
                session: bundle.session?.actor ?? lastAnchor.session ?? null,
                attribution: a.attribution ?? null,
                promotedAt: new Date().toISOString(),
                lanePreserved: meta.lane ?? "unstated",
                meaning: "Promoted from an ephemeral imagine session into durable storage. The lane above is unchanged by that move: " +
                    "this artifact is exactly as trustworthy as it was, and now it survives.",
            };
            try {
                // /api/resources, NOT /api/contexts.
                //
                // Measured 19 Aug by promoting a real sealed bundle: the dry run
                // reported `type: "graph"`, the tool sent `type: "graph"`, and the
                // resource landed with `type: "context"`. The contexts route hardcodes
                // `type: 'context' as const` and ignores what it was sent. So a
                // promoted graph arrived as a context — bytes intact, definition
                // intact, and permanently unable to hydrate, because CatalogSync looks
                // for graph resources. Promotion reported success for something that
                // could never run.
                //
                // /api/resources preserves the type it is given and enforces the
                // key-prefix agreement, which is what the catalog's own convention
                // requires of a typed key like `graphs/…`.
                const r = await fetch(`${target}/api/resources`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...hostHeader(),
                        // AUTHORSHIP, AND ONLY TO A STACK WE ACTUALLY AUTHENTICATED WITH.
                        //
                        // Promoted resources were landing with createdBy: null — the same
                        // defect fixed for imagine writes this morning, in a second place.
                        // hostHeader() carries the imagine host token, which proves this
                        // process owns a loopback host and is not a principal anywhere
                        // else, so the target saw an anonymous write.
                        //
                        // `target` is caller-supplied, and a bearer token sent to an
                        // arbitrary URL is how tokens leak. It goes only to the stack this
                        // process logged into; against any other target the write stays
                        // anonymous and the result says so rather than quietly losing the
                        // author.
                        ...(token && sameOrigin(target, serviceBase("catalog"))
                            ? { Authorization: `Bearer ${token}` }
                            : {}),
                    },
                    body: JSON.stringify({
                        key: a.key, type: a.type ?? "context", name: a.name,
                        description: a.description, tags: a.tags, metadata: meta,
                    }),
                    signal: AbortSignal.timeout(15000),
                });
                const body = await r.json().catch(() => ({}));
                results.push(r.ok
                    ? { key: a.key, promoted: true, id: body.id ?? null }
                    : { key: a.key, promoted: false, status: r.status,
                        reason: r.status === 400 ? "a resource with this key already exists there — reported, not overwritten" : JSON.stringify(body).slice(0, 200) });
            }
            catch (e) {
                results.push({ key: a.key, promoted: false, reason: e instanceof Error ? e.message.slice(0, 160) : String(e) });
            }
        }
        const ok = results.filter((r) => r.promoted).length;
        // 3a. THE PROMOTION RECORD — §5b, the receiving side's account of why
        //     this arrived. Written even when 0 artifacts crossed, because a
        //     promotion that admitted nothing is a fact worth keeping too. If the
        //     record write fails, the response says so loudly: the chain
        //     deliberately does not carry the origin forward, so this record is
        //     the only thing that can.
        let recordWritten = false;
        let recordFailure = null;
        let recordId = null;
        try {
            const recordBody = buildPromotionRecord({
                report: gateReport, bundlePath, target, results,
            });
            const rr = await fetch(`${target}/api/resources`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...hostHeader(),
                    ...(token && sameOrigin(target, serviceBase("catalog"))
                        ? { Authorization: `Bearer ${token}` }
                        : {}),
                },
                body: JSON.stringify(recordBody),
                signal: AbortSignal.timeout(15000),
            });
            const rb = (await rr.json().catch(() => ({})));
            recordWritten = rr.ok;
            recordId = rb.id ?? null;
            if (!rr.ok)
                recordFailure = `target answered ${rr.status}`;
        }
        catch (e) {
            recordFailure = e instanceof Error ? e.message.slice(0, 160) : String(e);
        }
        // 4. The promotion is itself an act, so it gets a position in the chain
        //    the artifacts came from. Best effort: failing to record it must not
        //    make the caller believe the writes did not happen.
        try {
            await fetch(`${base}/session/note`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...hostAuthHeaders() },
                body: JSON.stringify({
                    note: `promoted ${ok} of ${selected.length} artifacts to ${target} from seal ${seal.checksum}`,
                }),
                signal: AbortSignal.timeout(8000),
            });
        }
        catch { /* the promotion happened whether or not the note landed */ }
        return respond({
            promoted: ok,
            of: selected.length,
            from: bundlePath,
            sealChecksum: seal.checksum,
            to: target,
            results,
            gate: {
                id: GATE_ID, version: GATE_VERSION,
                bundleChecks: gateReport.bundleChecks,
                admitted: gateReport.admittedKeys.length,
                refused: gateReport.refusedKeys.length,
                doesNotAssert: gateReport.doesNotAssert,
            },
            promotionRecord: recordWritten
                ? { key: recordKey, id: recordId, written: true }
                : {
                    key: recordKey, written: false, reason: recordFailure,
                    warning: "THE PROMOTION RECORD DID NOT LAND. The artifacts above crossed without the receiving side keeping " +
                        "an account of why — which is the copied-from-imagine failure again. Re-run promotion of this bundle " +
                        "will NOT detect it as already promoted.",
                },
            // Said in the past tense only when something actually crossed. This line
            // read "Promotion moved these artifacts into durable storage" on a run
            // that promoted 0 of 1 — a sentence asserting more than the result above
            // it, which is the failure this repository keeps finding in its own
            // reporting.
            lane: ok > 0
                ? "Preserved exactly. Promotion moved these artifacts into durable storage and changed nothing about their standing."
                : "Nothing crossed, so nothing changed standing. The results above say why each artifact did not.",
        });
    });
    server.tool("symbia_seal", "Seal this imagine session into a portable, signed bundle: every artifact the session authored, the full trace, and the public key that verifies the chain. The seal asserts these bytes came from this session unaltered — nothing about who ran it or whether the work is sound. Sealing is a cut, not an ending: the session continues and can be sealed again. Use before finishing work, before anything risky, or whenever the record so far should survive the process. Returns the bundle path and completeness.", {}, async () => {
        // EVERY CONVERSATION SHOULD END HOLDING A BUNDLE.
        //
        // Found 17 Aug, check 12 of the install smoke test: on an owned host the
        // session token is private to the shim–host pair — which is the
        // attachment hardening working — so NOTHING could ask for a seal: not an
        // outside process (locked out by design) and not the agent (no tool).
        // The doctrine says the sealed bundle is the keepable artifact of an
        // ephemeral session; this is the tool that makes that reachable from
        // inside the pair, where the credential already lives.
        const base = baseUrl() ?? `http://${HOST}:${PORTS.identity}`;
        try {
            const r = await fetch(`${base}/session/seal`, {
                method: "POST",
                headers: hostAuthHeaders(),
                signal: AbortSignal.timeout(20000),
            });
            const body = await r.json();
            if (!r.ok) {
                return fail(`Seal refused (${r.status}): ${JSON.stringify(body).slice(0, 400)}. ` +
                    `A refusal here usually means the ledger did not verify — which is itself the finding.`);
            }
            return respond(body);
        }
        catch (err) {
            const cause = err?.cause;
            return fail(`Could not reach ${base}/session/seal${cause?.code ? ` (${cause.code})` : ""}. ` +
                `Sealing belongs to the imagine host; a deployed stack does not serve it.`);
        }
    });
    const transport = new StdioServerTransport(process.stdin, process.stdout, {
        maxBufferSize: Number(process.env.SYMBIA_MAX_STDIO_BYTES ?? 64 * 1024 * 1024),
    });
    // An overflow past even that still kills the session silently. Say so on
    // stderr, which is the only channel left once stdin is detached.
    transport.onerror = (err) => {
        process.stderr.write(`[symbia-mcp] transport error (session may be dead): ${err.message}\n`);
    };
    await server.connect(transport);
    console.error(`symbia-mcp-server running (stack host: ${HOST}, user: ${EMAIL})`);
}
main().catch((error) => {
    console.error("symbia-mcp-server fatal:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map