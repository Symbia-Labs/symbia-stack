import { ServiceId, resolveServiceUrl } from "@symbia/sys";
const DEFAULT_TIMEOUT = 45000; // chat completions can be slow, same value integrations-client.ts used
/**
 * Client for the Symbia Models service.
 *
 * ENDPOINT RESOLUTION — a deliberate choice among three coexisting
 * conventions found in this codebase on 24 Aug 2026:
 *
 *   1. `resolveServiceUrl()` from @symbia/sys — reads `{ID}_SERVICE_URL`,
 *      falls back to `http://localhost:{port}`. Used by
 *      assistants/integrations-client.ts, service-call.ts, control-center.
 *   2. `resolveServiceHost()`/`resolveServiceTarget()` — reads `{ID}_HOST`,
 *      defaults to `localhost`, combines with the port registry. Built to fix
 *      a two-proxy-two-convention defect in identity's auth middleware.
 *   3. `symbia-catalog-client`'s own `{ID}_ENDPOINT` convention, bypassing
 *      @symbia/sys entirely.
 *
 * This client uses (1), because it is what both real production consumers of
 * this service already use (symbia-labs.ts, integrations-client.ts) — moving
 * them onto this client should change zero runtime behavior. Reconciling all
 * three conventions into one is a real platform gap and is out of scope for
 * this package; recorded separately rather than solved here by accident.
 */
export class ModelsClient {
    endpoint;
    token;
    orgId;
    timeout;
    onError;
    constructor(config = {}) {
        this.endpoint = (config.endpoint || resolveServiceUrl(ServiceId.MODELS)).replace(/\/$/, "");
        this.token = config.token;
        this.orgId = config.orgId;
        this.timeout = config.timeout || DEFAULT_TIMEOUT;
        this.onError = config.onError;
    }
    setToken(token) {
        this.token = token;
    }
    setOrgId(orgId) {
        this.orgId = orgId;
    }
    getHeaders(options) {
        const headers = {
            "Content-Type": "application/json",
            ...options?.headers,
        };
        if (this.token)
            headers["Authorization"] = `Bearer ${this.token}`;
        if (this.orgId)
            headers["X-Org-Id"] = this.orgId;
        return headers;
    }
    async request(method, path, body, options) {
        const controller = new AbortController();
        const timeout = options?.timeout ?? this.timeout;
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(`${this.endpoint}${path}`, {
                method,
                headers: this.getHeaders(options),
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.status === 204) {
                return undefined;
            }
            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                const message = errBody?.error &&
                    typeof errBody.error === "object"
                    ? errBody.error?.message
                    : (errBody.error ?? response.statusText);
                const error = new Error(`Models service error (${response.status}): ${message}`);
                this.onError?.(error);
                throw error;
            }
            return (await response.json());
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
                const timeoutError = new Error(`Models service request timed out after ${timeout}ms: ${method} ${path}`);
                this.onError?.(timeoutError);
                throw timeoutError;
            }
            throw error;
        }
    }
    // ---------------------------------------------------------------------
    // Chat completions — the OpenAI-compatible broker
    // ---------------------------------------------------------------------
    /**
     * Local models run in-process; remote models (provider-prefixed ids like
     * "openai/gpt-4o-mini") are forwarded to integrations, which holds the
     * credential. This method does not distinguish the two — the service does,
     * and reports which one ran via `response.symbia.source`.
     *
     * Streaming (`stream: true`) is refused by the service for remote models
     * (400) — only local models stream through this HTTP method. Use
     * `chatCompletionsStream` for local streaming if needed later; not wrapped
     * here yet because no current consumer streams through this client.
     */
    async chatCompletions(request, options) {
        return this.request("POST", "/v1/chat/completions", request, options);
    }
    // ---------------------------------------------------------------------
    // Model registry
    // ---------------------------------------------------------------------
    /** OpenAI-shaped model list, merged local + remote (unifiedRegistry). */
    async listModels(options) {
        return this.request("GET", "/v1/models", undefined, options);
    }
    async getModel(id, options) {
        return this.request("GET", `/v1/models/${encodeURIComponent(id)}`, undefined, options);
    }
    /**
     * Registry ids use two conventions at once: a remote model is qualified
     * ("openai/gpt-4o-mini"), a local one is bare
     * ("qwen2-5-0-5b-instruct-q4-k-m"). Given a provider + bare name, asks the
     * live registry which spelling it actually has rather than guessing —
     * measured 23 Aug 2026: guessing qualified-always sent local models under a
     * name the registry did not publish. Caches for 60s; callers needing a
     * force-refresh should call `listModels()` directly.
     */
    registryIdsCache = null;
    async resolveRegistryId(provider, model, options) {
        if (model.includes("/"))
            return model; // already qualified by the caller
        const qualified = `${provider}/${model}`;
        const fetchIds = async () => {
            try {
                const body = await this.listModels(options);
                const ids = new Set((body.data ?? []).map((m) => m?.id).filter(Boolean));
                this.registryIdsCache = { at: Date.now(), ids };
                return ids;
            }
            catch {
                return this.registryIdsCache?.ids ?? new Set();
            }
        };
        let ids = this.registryIdsCache && Date.now() - this.registryIdsCache.at < 60_000
            ? this.registryIdsCache.ids
            : await fetchIds();
        if (!ids.has(qualified) && !ids.has(model))
            ids = await fetchIds();
        if (ids.has(qualified))
            return qualified;
        if (ids.has(model))
            return model;
        return qualified;
    }
    // ---------------------------------------------------------------------
    // Model lifecycle (requires auth)
    // ---------------------------------------------------------------------
    async pullModel(body, options) {
        return this.request("POST", "/api/models/pull", body, options);
    }
    async loadModel(id, options) {
        return this.request("POST", `/api/models/${encodeURIComponent(id)}/load`, undefined, options);
    }
    async unloadModel(id, options) {
        return this.request("POST", `/api/models/${encodeURIComponent(id)}/unload`, undefined, options);
    }
    // ---------------------------------------------------------------------
    // Vision
    // ---------------------------------------------------------------------
    async visionStatus(options) {
        return this.request("GET", "/api/vision/status", undefined, options);
    }
    async visionClassify(request, options) {
        return this.request("POST", "/api/vision/classify", request, options);
    }
    // ---------------------------------------------------------------------
    // Misc
    // ---------------------------------------------------------------------
    /**
     * TODO stub in the service as of 24 Aug 2026 — returns zeros
     * unconditionally. Wrapped for shape-completeness; do not treat a zero
     * response as "no usage."
     */
    async stats(options) {
        return this.request("GET", "/api/stats", undefined, options);
    }
    /** Generic provider-execute passthrough (requires auth). */
    async execute(body, options) {
        return this.request("POST", "/api/integrations/execute", body, options);
    }
}
export function createModelsClient(config) {
    return new ModelsClient(config);
}
//# sourceMappingURL=client.js.map