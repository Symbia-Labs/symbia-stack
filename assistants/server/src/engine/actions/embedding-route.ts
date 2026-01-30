/**
 * Embedding Route Action
 *
 * Fast semantic routing using embeddings.
 * Computes similarity between user message and assistant descriptions
 * to quickly route to the most appropriate assistant.
 *
 * Used in hybrid routing: embedding first, LLM fallback for low confidence.
 */

import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { getAllLoadedAssistants } from '../../services/assistant-loader.js';
import { invokeEmbedding } from '../../integrations-client.js';
import { shouldUseEmbeddingRouting, shouldUseLLMFallback } from '../../config/llm-config-resolver.js';

interface EmbeddingRouteParams {
  // Embedding configuration
  provider?: string;  // 'openai' default
  model?: string;     // 'text-embedding-3-small' default
  dimensions?: number; // Optional dimension reduction (512 for faster routing)

  // Similarity thresholds
  similarityThreshold?: number; // Minimum to consider (default 0.7)
  confidenceThreshold?: number; // Above this, skip LLM fallback (default 0.85)

  // Assistant filtering
  excludeAssistants?: string[]; // Don't route to these (e.g., 'coordinator')
  includeAssistants?: string[]; // Only consider these (if specified)

  // Caching
  cacheEmbeddings?: boolean; // Cache assistant description embeddings (default true)

  // Context storage
  resultKey?: string; // Where to store result (default: 'embeddingRouteDecision')

  // Observability
  reason?: string;
}

interface EmbeddingRouteResult {
  assistant: string;
  score: number;
  allScores: Record<string, number>;
  method: 'embedding';
  confidenceLevel: 'high' | 'medium' | 'low';
  needsLLMFallback: boolean;
  reason?: string;
}

// Cache for assistant description embeddings
const embeddingCache = new Map<string, {
  embedding: number[];
  timestamp: number;
  model: string;
}>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class EmbeddingRouteHandler extends BaseActionHandler {
  type = 'embedding.route';

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const startTime = Date.now();
    const params = config.params as EmbeddingRouteParams;

    try {
      // Check if embedding routing is enabled in config
      if (context.llmConfig && !shouldUseEmbeddingRouting(context.llmConfig)) {
        console.log('[EmbeddingRoute] Embedding routing disabled in config, skipping');
        return this.success({
          skipped: true,
          reason: 'Embedding routing disabled in configuration',
        }, Date.now() - startTime);
      }

      // Get user message
      const userMessage = context.message?.content;
      if (!userMessage) {
        return this.failure('No message content available', Date.now() - startTime);
      }

      // Get auth token
      const token = (context.metadata as Record<string, unknown>)?.token as string;
      if (!token) {
        console.warn('[EmbeddingRoute] No auth token, falling back to LLM routing');
        return this.success({
          skipped: true,
          needsLLMFallback: true,
          reason: 'No auth token for embedding service',
        }, Date.now() - startTime);
      }

      // Get embedding config
      const provider = params.provider || context.llmConfig?.embedding?.provider || 'openai';
      const model = params.model || context.llmConfig?.embedding?.model || 'text-embedding-3-small';
      const dimensions = params.dimensions || context.llmConfig?.embedding?.dimensions;

      // Get assistant descriptions
      const assistantDescriptions = this.getAssistantDescriptions(params);
      if (Object.keys(assistantDescriptions).length === 0) {
        return this.failure('No assistants available for routing', Date.now() - startTime);
      }

      console.log(`[EmbeddingRoute] Computing embeddings for ${Object.keys(assistantDescriptions).length} assistants`);

      // Compute embedding for user message
      const userEmbedding = await invokeEmbedding(token, {
        provider,
        model,
        input: userMessage,
        dimensions,
      });

      // Get/compute assistant embeddings (with caching)
      const assistantEmbeddings = await this.getAssistantEmbeddings(
        token,
        assistantDescriptions,
        { provider, model, dimensions },
        params.cacheEmbeddings !== false
      );

      // Compute similarity scores
      const scores = this.computeSimilarities(userEmbedding, assistantEmbeddings);

      // Find best match
      const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
      const [bestKey, bestScore] = sorted[0] || ['', 0];

      console.log(`[EmbeddingRoute] Best match: ${bestKey} (score: ${bestScore.toFixed(3)})`);

      // Determine thresholds
      const similarityThreshold = params.similarityThreshold
        ?? context.llmConfig?.routing?.similarityThreshold
        ?? 0.7;
      const confidenceThreshold = params.confidenceThreshold
        ?? context.llmConfig?.routing?.confidenceThreshold
        ?? 0.85;

      // Determine confidence level
      let confidenceLevel: 'high' | 'medium' | 'low';
      if (bestScore >= confidenceThreshold) {
        confidenceLevel = 'high';
      } else if (bestScore >= similarityThreshold) {
        confidenceLevel = 'medium';
      } else {
        confidenceLevel = 'low';
      }

      // Check if we need LLM fallback
      const needsLLMFallback = context.llmConfig
        ? shouldUseLLMFallback(context.llmConfig, bestScore)
        : bestScore < confidenceThreshold;

      // Prepare result
      const result: EmbeddingRouteResult = {
        assistant: bestScore >= similarityThreshold ? bestKey : '',
        score: bestScore,
        allScores: scores,
        method: 'embedding',
        confidenceLevel,
        needsLLMFallback,
        reason: params.reason || `Semantic similarity routing (score: ${bestScore.toFixed(3)})`,
      };

      // Store in context
      const resultKey = params.resultKey || 'embeddingRouteDecision';
      context.context[resultKey] = result;

      console.log(`[EmbeddingRoute] Result stored in context.${resultKey}:`, {
        assistant: result.assistant,
        score: result.score.toFixed(3),
        confidenceLevel,
        needsLLMFallback,
      });

      // If confidence too low, indicate fallback needed
      if (bestScore < similarityThreshold) {
        return this.success({
          ...result,
          routed: false,
          message: `No confident match (best: ${bestScore.toFixed(3)} < ${similarityThreshold})`,
        }, Date.now() - startTime);
      }

      return this.success(result, Date.now() - startTime);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Embedding routing failed';
      console.error('[EmbeddingRoute] Error:', message);
      // Return success with fallback flag rather than hard failure
      return this.success({
        skipped: true,
        needsLLMFallback: true,
        error: message,
        reason: 'Embedding routing failed, needs LLM fallback',
      }, Date.now() - startTime);
    }
  }

  /**
   * Get assistant descriptions for routing, excluding coordinator and filtered assistants
   */
  private getAssistantDescriptions(params: EmbeddingRouteParams): Record<string, string> {
    const descriptions: Record<string, string> = {};
    const exclude = new Set(params.excludeAssistants || ['coordinator']);
    const includeSet = params.includeAssistants ? new Set(params.includeAssistants) : null;

    for (const assistant of getAllLoadedAssistants()) {
      const key = assistant.resource.key;

      // Skip excluded assistants
      if (exclude.has(key)) continue;

      // If include list specified, only include those
      if (includeSet && !includeSet.has(key)) continue;

      // Build a rich description for better semantic matching
      const parts = [
        assistant.resource.description,
        assistant.resource.name,
      ];

      // Add alias for matching
      if (assistant.alias) {
        parts.push(`Also known as @${assistant.alias}`);
      }

      descriptions[key] = parts.filter(Boolean).join('. ');
    }

    return descriptions;
  }

  /**
   * Get embeddings for assistant descriptions, using cache when available
   */
  private async getAssistantEmbeddings(
    token: string,
    descriptions: Record<string, string>,
    config: { provider: string; model: string; dimensions?: number },
    useCache: boolean
  ): Promise<Record<string, number[]>> {
    const embeddings: Record<string, number[]> = {};
    const toCompute: Array<{ key: string; text: string }> = [];
    const cacheKey = (key: string) => `${config.model}:${key}`;

    // Check cache first
    for (const [key, description] of Object.entries(descriptions)) {
      const cached = useCache ? embeddingCache.get(cacheKey(key)) : null;

      if (cached && cached.model === config.model && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        embeddings[key] = cached.embedding;
      } else {
        toCompute.push({ key, text: description });
      }
    }

    // Batch compute missing embeddings
    if (toCompute.length > 0) {
      console.log(`[EmbeddingRoute] Computing ${toCompute.length} embeddings (${Object.keys(embeddings).length} cached)`);

      // Compute in parallel batches of 10
      const batchSize = 10;
      for (let i = 0; i < toCompute.length; i += batchSize) {
        const batch = toCompute.slice(i, i + batchSize);

        const results = await Promise.all(
          batch.map(async ({ key, text }) => {
            try {
              const embedding = await invokeEmbedding(token, {
                provider: config.provider,
                model: config.model,
                input: text,
                dimensions: config.dimensions,
              });
              return { key, embedding };
            } catch (error) {
              console.warn(`[EmbeddingRoute] Failed to embed ${key}:`, error);
              return { key, embedding: [] };
            }
          })
        );

        for (const { key, embedding } of results) {
          if (embedding.length > 0) {
            embeddings[key] = embedding;
            // Cache the result
            if (useCache) {
              embeddingCache.set(cacheKey(key), {
                embedding,
                timestamp: Date.now(),
                model: config.model,
              });
            }
          }
        }
      }
    }

    return embeddings;
  }

  /**
   * Compute cosine similarity scores between user embedding and all assistant embeddings
   */
  private computeSimilarities(
    userEmbedding: number[],
    assistantEmbeddings: Record<string, number[]>
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const [key, embedding] of Object.entries(assistantEmbeddings)) {
      scores[key] = this.cosineSimilarity(userEmbedding, embedding);
    }

    return scores;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

/**
 * Clear the embedding cache (for testing or config changes)
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  console.log('[EmbeddingRoute] Embedding cache cleared');
}
