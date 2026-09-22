/**
 * Inline `#/components/...` references so a described operation carries its
 * schema rather than a pointer to one.
 *
 * OpenAPI schemas are frequently self-referential, so this caps depth and
 * refuses to expand a ref already open on the current branch. A cycle is left
 * as the original `$ref` node with a note, which is honest about what was not
 * expanded instead of silently truncating or hanging.
 */
export function resolveRefs(node, components, open = new Set(), depth = 0) {
    if (!components || node === null || typeof node !== "object")
        return node;
    if (depth > 12)
        return { $unresolved: "depth limit", node };
    if (Array.isArray(node)) {
        return node.map((item) => resolveRefs(item, components, open, depth + 1));
    }
    const obj = node;
    const ref = obj.$ref;
    if (typeof ref === "string") {
        if (!ref.startsWith("#/components/"))
            return node;
        if (open.has(ref))
            return { $ref: ref, $note: "cycle; not expanded here" };
        const segments = ref.slice("#/components/".length).split("/");
        let target = components;
        for (const seg of segments) {
            target = target?.[seg];
            if (target === undefined) {
                return { $ref: ref, $note: "not present in this spec's components" };
            }
        }
        const nextOpen = new Set(open);
        nextOpen.add(ref);
        const expanded = resolveRefs(target, components, nextOpen, depth + 1);
        // Keep the pointer alongside the expansion: a reader can still tell what
        // the spec actually said, and two operations sharing a schema stay
        // recognisably the same schema.
        return typeof expanded === "object" && expanded !== null && !Array.isArray(expanded)
            ? { $ref: ref, ...expanded }
            : expanded;
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = resolveRefs(v, components, open, depth + 1);
    }
    return out;
}
const SPEC_TTL_MS = 60_000;
const cache = new Map();
/** Operations a service declares, from its own spec. Cached briefly. */
export async function operationsFor(service, base, fetchJson) {
    const hit = cache.get(service);
    if (hit && Date.now() - hit.at < SPEC_TTL_MS)
        return hit;
    let entry;
    try {
        const spec = (await fetchJson(`${base}/docs/openapi.json`));
        const ops = [];
        // A spec's server url may be a PATH PREFIX ("/api") or a whole ORIGIN
        // ("http://localhost:5007/api"). Only the path part is ours to keep:
        // the origin is wherever that service happened to be when the spec was
        // written, and prepending it to our own base produced
        // "/svc/integrationshttp://localhost:5007/..." — every integrations
        // operation unreachable (measured 16 Aug through the connector).
        const rawServer = (spec.servers?.[0]?.url ?? "").replace(/\/$/, "");
        const basePath = /^https?:\/\//i.test(rawServer)
            ? new URL(rawServer).pathname.replace(/\/$/, "")
            : rawServer;
        for (const [path, methods] of Object.entries(spec.paths ?? {})) {
            // OpenAPI allows parameters on the PATH ITEM, applying to every method
            // under it. Reading only `op.parameters` drops them: measured 26 Aug on
            // logging's /logs/streams, whose five required headers (org, service,
            // env, data class, policy ref) are declared at the path item and were
            // therefore invisible to symbia_describe_operation.
            const pathLevel = Array.isArray(methods.parameters)
                ? methods.parameters
                : [];
            for (const [method, op] of Object.entries(methods)) {
                if (!["get", "post", "put", "patch", "delete"].includes(method))
                    continue;
                const m = method.toUpperCase();
                const opLevel = Array.isArray(op.parameters) ? op.parameters : [];
                ops.push({
                    service,
                    operationId: op.operationId ?? `${method}${path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
                    method: m,
                    // The spec's server prefix is part of the address; a path alone
                    // is not callable, and guessing the prefix is how a dispatcher
                    // silently 404s.
                    path: basePath + path,
                    summary: op.summary,
                    description: op.description,
                    writes: m !== "GET" && m !== "HEAD",
                    destructive: m === "DELETE",
                    // Path-item parameters first, then the operation's own, so a method
                    // that redeclares one wins.
                    parameters: pathLevel.length || opLevel.length ? [...pathLevel, ...opLevel] : undefined,
                    requestBody: op.requestBody,
                });
            }
        }
        entry = { at: Date.now(), ops, components: spec.components };
    }
    catch (err) {
        // A spec that could not be read is NOT an empty service. Recorded as
        // an error so the listing can say which services it failed to ask.
        entry = { at: Date.now(), ops: [], error: err instanceof Error ? err.message : String(err) };
    }
    cache.set(service, entry);
    return entry;
}
export function filterOperations(all, f) {
    const q = f.q?.toLowerCase().trim();
    const scored = all
        .filter((o) => (f.service ? o.service === f.service : true))
        .filter((o) => (f.method ? o.method === f.method.toUpperCase() : true))
        .filter((o) => (f.includeWrites === false ? !o.writes : true))
        .slice(0, undefined);
    // ADDING A WORD MUST NOT NARROW TO NOTHING.
    //
    // This matched the whole query as one substring, so `q="message invoke
    // chat"` was looked for verbatim and found nowhere — while
    // post_webhook_message, summarised "Handle incoming message", sat in the
    // unfiltered list. Measured 16 Aug: an agent searching with synonyms got
    // zero results and nearly concluded the capability did not exist.
    //
    // A caller adding terms is describing the thing more fully, not
    // constraining it further. Score by how many terms hit and return
    // anything that matches at least one, best first.
    if (!q)
        return scored.slice(0, f.limit ?? 100);
    // Short words match everything. Measured: "send a message to an
    // assistant" returned every operation in the set, because "a" and "to"
    // are substrings of almost any path. Ranking still put the right one
    // first, but a list that includes everything has told the caller nothing.
    // Terms under three characters are dropped from matching; if that leaves
    // nothing, fall back to the whole query so a deliberate search for "id"
    // is not silently ignored.
    const words = q.split(/\s+/).filter(Boolean);
    const meaningful = words.filter((t) => t.length >= 3);
    const terms = meaningful.length ? meaningful : words;
    const hits = scored
        .map((o) => {
        const hay = [o.path, o.operationId, o.summary, o.description]
            .filter(Boolean)
            .map((s) => String(s).toLowerCase());
        const matched = terms.filter((t) => hay.some((h) => h.includes(t)));
        return { o, score: matched.length };
    })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
    return hits.slice(0, f.limit ?? 100).map((x) => x.o);
}
/** Substitute `{id}`-style path params, and report any left unfilled. */
export function fillPath(path, params) {
    const used = new Set();
    const filled = path.replace(/\{([^}]+)\}/g, (_m, name) => {
        const v = params?.[name];
        if (v === undefined || v === null)
            return `{${name}}`;
        used.add(name);
        return encodeURIComponent(String(v));
    });
    const missing = [...filled.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const query = {};
    for (const [k, v] of Object.entries(params ?? {}))
        if (!used.has(k))
            query[k] = v;
    return { path: filled, missing, query };
}
//# sourceMappingURL=dispatcher.js.map