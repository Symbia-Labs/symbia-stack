/**
 * @symbia/models-client
 *
 * Client library for the Symbia Models service: OpenAI-compatible chat
 * completions (local + brokered remote), the model registry, load/unload,
 * and vision classification.
 *
 * @example
 * ```typescript
 * import { createModelsClient } from '@symbia/models-client';
 *
 * const models = createModelsClient({ token: userToken });
 *
 * const res = await models.chatCompletions({
 *   model: await models.resolveRegistryId('openai', 'gpt-4o-mini'),
 *   messages: [{ role: 'user', content: 'hello' }],
 * });
 * ```
 */
export { ModelsClient, createModelsClient } from "./client.js";
export type { ModelsClientConfig, RequestOptions, ChatMessage, ChatCompletionRequest, ChatCompletionChoice, ChatCompletionUsage, ChatCompletionResponse, DroppedParam, ModelSymbiaInfo, ModelInfo, ModelListResponse, VisionStatus, VisionClassifyRequest, VisionClassifyResponse, PullModelRequest, ModelActionResponse, ModelsStats, IntegrationsExecuteRequest, IntegrationsExecuteResponse, } from "./types.js";
//# sourceMappingURL=index.d.ts.map