import { registerProvider, getProvider, getRegisteredProviders } from "./base.js";
import { openaiProvider } from "./openai.js";
import { huggingfaceProvider } from "./huggingface.js";
import { anthropicProvider } from "./anthropic.js";
import { symbiaLabsProvider } from "./symbia-labs.js";

export { registerProvider, getProvider, getRegisteredProviders };
export type { ProviderAdapter, ExecuteOptions, ModelInfo } from "./base.js";

/**
 * Initialize and register all built-in providers
 */
export function initializeProviders(): void {
  // Major providers
  registerProvider(openaiProvider);
  registerProvider(anthropicProvider);

  // Open-source / alternative (covers Google, Mistral, Cohere models via HuggingFace Inference API)
  registerProvider(huggingfaceProvider);

  // Local inference (symbia-models service)
  registerProvider(symbiaLabsProvider);

  console.log(`[integrations] Registered providers: ${getRegisteredProviders().join(", ")}`);
}
