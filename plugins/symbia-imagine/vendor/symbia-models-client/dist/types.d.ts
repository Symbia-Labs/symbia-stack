/**
 * @symbia/models-client types
 *
 * Mirrors the shapes the models service actually returns (read from
 * models/server/src/routes.ts, handlers/chat-completions.ts and
 * handlers/models.ts on 24 Aug 2026) rather than the OpenAI spec at large.
 * Where the two diverge — the `symbia` extension block on every response —
 * this follows the service.
 */
export interface ModelsClientConfig {
    /** Full base URL, e.g. "http://localhost:5008". Overrides env resolution. */
    endpoint?: string;
    /** Bearer token forwarded as Authorization. Required for authenticated routes. */
    token?: string;
    /** Org id, sent as X-Org-Id when set. */
    orgId?: string;
    /** Per-request timeout in ms. Default 45000 (chat completions can be slow). */
    timeout?: number;
    onError?: (error: Error) => void;
}
export interface RequestOptions {
    timeout?: number;
    headers?: Record<string, string>;
}
export interface ChatMessage {
    role: string;
    content: string;
}
export interface ChatCompletionRequest {
    /**
     * The id the registry publishes. Remote models are qualified
     * ("openai/gpt-4o-mini"); local models are bare
     * ("qwen2-5-0-5b-instruct-q4-k-m"). The client does not guess between the
     * two — see ModelsClient.resolveRegistryId if the caller only knows a
     * provider and a bare name.
     */
    model: string;
    messages: ChatMessage[];
    /**
     * Deliberately optional with no client-side default. `temperature: 0.7`
     * injected as a default broke claude-sonnet-5 (deprecated the param) —
     * measured 12 Aug 2026. Absent means absent; let the broker or provider
     * apply its own default.
     */
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
}
export interface ChatCompletionChoice {
    index: number;
    message: {
        role: string;
        content: string;
    };
    finish_reason: string;
}
export interface ChatCompletionUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
export interface DroppedParam {
    param: string;
    reason: string;
}
export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: ChatCompletionChoice[];
    usage?: ChatCompletionUsage;
    /**
     * Present only when the call was brokered (remote provider via
     * integrations). `droppedParams` lists request fields the target model
     * rejected and the broker stripped rather than forwarding — surfaced here
     * so a caller who asked for temperature 0 can find out it silently didn't
     * apply, instead of it vanishing between here and the provider.
     */
    symbia?: {
        source: "local" | "remote";
        provider?: string;
        requestedModel?: string;
        ranModel?: string;
        droppedParams?: DroppedParam[];
    };
}
export interface ModelSymbiaInfo {
    source: "local" | "remote";
    provider?: string;
    /**
     * Listed does not mean callable. False for every remote model as of 24 Aug
     * 2026 — this path exists but chat completions for remote models are not
     * yet wired through it. Check this before assuming a listed model answers.
     */
    brokered: boolean;
    availability?: string;
    availabilityReason?: string;
    operations?: string[];
    idSource?: string;
    verified?: boolean;
    isProviderDefault?: boolean;
    digest?: string;
    digestMismatch?: boolean;
}
export interface ModelInfo {
    id: string;
    object: string;
    created: number;
    owned_by: string;
    permission?: unknown[];
    root?: string;
    parent?: string | null;
    capabilities?: string[];
    context_length?: number;
    status?: string;
    symbia?: ModelSymbiaInfo;
}
export interface ModelListResponse {
    object: "list";
    data: ModelInfo[];
}
export interface VisionStatus {
    ready: boolean;
    missing?: string[];
}
export interface VisionClassifyRequest {
    imageBase64: string;
    prompt?: string;
    source?: string;
}
export interface VisionClassifyResponse {
    [key: string]: unknown;
}
export interface PullModelRequest {
    id: string;
    [key: string]: unknown;
}
export interface ModelActionResponse {
    [key: string]: unknown;
}
/**
 * /api/stats is a TODO stub in the service as of 24 Aug 2026 — it returns
 * zeros unconditionally. Wrapped for shape-completeness and forward
 * compatibility, not because the numbers mean anything yet.
 */
export interface ModelsStats {
    [key: string]: unknown;
}
export interface IntegrationsExecuteRequest {
    provider: string;
    operation: string;
    params: Record<string, unknown>;
}
export interface IntegrationsExecuteResponse {
    success: boolean;
    data?: unknown;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map