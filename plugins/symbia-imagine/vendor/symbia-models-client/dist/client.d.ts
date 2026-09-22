import type { ModelsClientConfig, RequestOptions, ChatCompletionRequest, ChatCompletionResponse, ModelListResponse, ModelInfo, VisionStatus, VisionClassifyRequest, VisionClassifyResponse, PullModelRequest, ModelActionResponse, ModelsStats, IntegrationsExecuteRequest, IntegrationsExecuteResponse } from "./types.js";
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
export declare class ModelsClient {
    private endpoint;
    private token?;
    private orgId?;
    private timeout;
    private onError?;
    constructor(config?: ModelsClientConfig);
    setToken(token: string): void;
    setOrgId(orgId: string): void;
    private getHeaders;
    private request;
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
    chatCompletions(request: ChatCompletionRequest, options?: RequestOptions): Promise<ChatCompletionResponse>;
    /** OpenAI-shaped model list, merged local + remote (unifiedRegistry). */
    listModels(options?: RequestOptions): Promise<ModelListResponse>;
    getModel(id: string, options?: RequestOptions): Promise<ModelInfo>;
    /**
     * Registry ids use two conventions at once: a remote model is qualified
     * ("openai/gpt-4o-mini"), a local one is bare
     * ("qwen2-5-0-5b-instruct-q4-k-m"). Given a provider + bare name, asks the
     * live registry which spelling it actually has rather than guessing —
     * measured 23 Aug 2026: guessing qualified-always sent local models under a
     * name the registry did not publish. Caches for 60s; callers needing a
     * force-refresh should call `listModels()` directly.
     */
    private registryIdsCache;
    resolveRegistryId(provider: string, model: string, options?: RequestOptions): Promise<string>;
    pullModel(body: PullModelRequest, options?: RequestOptions): Promise<ModelActionResponse>;
    loadModel(id: string, options?: RequestOptions): Promise<ModelActionResponse>;
    unloadModel(id: string, options?: RequestOptions): Promise<ModelActionResponse>;
    visionStatus(options?: RequestOptions): Promise<VisionStatus>;
    visionClassify(request: VisionClassifyRequest, options?: RequestOptions): Promise<VisionClassifyResponse>;
    /**
     * TODO stub in the service as of 24 Aug 2026 — returns zeros
     * unconditionally. Wrapped for shape-completeness; do not treat a zero
     * response as "no usage."
     */
    stats(options?: RequestOptions): Promise<ModelsStats>;
    /** Generic provider-execute passthrough (requires auth). */
    execute(body: IntegrationsExecuteRequest, options?: RequestOptions): Promise<IntegrationsExecuteResponse>;
}
export declare function createModelsClient(config?: ModelsClientConfig): ModelsClient;
//# sourceMappingURL=client.d.ts.map