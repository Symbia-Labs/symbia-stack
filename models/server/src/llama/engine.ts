/**
 * LLM Engine - node-llama-cpp wrapper
 *
 * Provides a unified interface for local model inference with:
 * - Lazy loading of models
 * - LRU cache with configurable max models
 * - Idle timeout for automatic unloading
 * - Memory tracking
 */

import { getLlama, LlamaChatSession, type Llama, type LlamaModel, type LlamaContext } from "node-llama-cpp";
import { readdir, stat, readFile, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { join } from "path";
import { config } from "../config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InferenceOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  /** Fixed sampling seed. Required for a run to be repeatable at temperature > 0. */
  seed?: number;
}

/**
 * Everything that has to be equal for two runs to be equal.
 *
 * Reported on every completion so a caller can record what it actually got
 * rather than what it asked for. `temperature` defaulted to 0.7 and no seed
 * existed, so identical inputs produced different outputs by design and
 * nothing in the response said so.
 *
 * `reproducible` is the honest summary, and it is deliberately conservative:
 * weights alone are not enough. Same digest on different hardware, kernels or
 * quantisation can still diverge, so this claims only that the parameters
 * WITHIN THIS SERVICE'S CONTROL were pinned. It is the `conditional` port lane
 * applied to inference — canonical only when the conditions hold, and the
 * conditions are named rather than assumed.
 */
export interface DecodeRecord {
  modelDigest?: string;
  temperature: number;
  seed?: number;
  topP?: number;
  maxTokens: number;
  engine: string;
  reproducible: boolean;
  /** Why not, when not. Written for someone reading a receipt. */
  reproducibilityNote?: string;
}

export interface ChatCompletionResult {
  content: string;
  /** What produced this, in terms that can be checked and re-run. */
  decode?: DecodeRecord;
  finishReason: "stop" | "length" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LocalModel {
  id: string;
  name: string;
  filename: string;
  filepath: string;
  /**
   * sha256 of the weights. THE MODEL'S ACTUAL IDENTITY.
   *
   * `id` is derived from the filename, which means identity has been a mutable
   * path: rename a file and it is a different model, drop different weights at
   * the same name and it is the same model. Nothing downstream could tell.
   *
   * Git's arrangement is the right one and it is the reason this is here.
   * Content addressing first; names are refs that point at a digest and are
   * allowed to move. `llama-3-8b` is a branch. `sha256:…` is the commit. A
   * receipt must cite the commit.
   *
   * This is what makes "reproducible" checkable rather than asserted. Two
   * parties can confirm they ran the same function before arguing about what
   * it returned — and a wrong answer from a named digest is a defect with a
   * reproduction, which is a thing engineering can hold. A wrong answer from a
   * moving name is not.
   */
  digest?: string;
  /** Bytes hashed, so a truncated or swapped file is visible without rehashing. */
  sizeBytes?: number;
  contextLength: number;
  capabilities: string[];
  status: "available" | "loading" | "loaded" | "error";
  loaded: boolean;
  memoryUsageMB: number;
  createdAt?: string;
  lastUsed?: Date;
}

interface LoadedModel {
  model: LlamaModel;
  context: LlamaContext;
  info: LocalModel;
  loadedAt: Date;
  lastUsed: Date;
  idleTimer?: NodeJS.Timeout;
}

/**
 * Hash the weights, with a cache keyed on what would change if they changed.
 *
 * A GGUF is gigabytes and the scan runs at boot, so hashing unconditionally
 * would make startup unusable and the digest would get dropped for being
 * expensive — which is how a correctness property becomes optional. Cached on
 * (path, size, mtime): the cheap facts that a swapped or truncated file
 * cannot leave untouched.
 *
 * The cache lives beside the weights, so it moves with them and cannot be
 * mistaken for authority — it is an index, not the record. Delete it and the
 * digests come back identical, which is the test that it is only a cache.
 */
const digestCache = new Map<string, { digest: string; size: number; mtimeMs: number }>();
let cacheLoaded = false;

async function digestModel(
  filepath: string,
  size: number,
  mtimeMs: number
): Promise<string | undefined> {
  const cachePath = join(config.modelsPath, '.digests.json');

  if (!cacheLoaded) {
    cacheLoaded = true;
    try {
      const raw = JSON.parse(await readFile(cachePath, 'utf8')) as Record<
        string,
        { digest: string; size: number; mtimeMs: number }
      >;
      for (const [k, v] of Object.entries(raw)) digestCache.set(k, v);
    } catch {
      // No cache yet. Not an error — the first scan pays for it.
    }
  }

  const hit = digestCache.get(filepath);
  if (hit && hit.size === size && hit.mtimeMs === mtimeMs) return hit.digest;

  try {
    const started = Date.now();
    const hash = createHash('sha256');
    await pipeline(createReadStream(filepath), hash);
    const digest = hash.digest('hex');
    console.log(`[llama] Hashed ${filepath} in ${Date.now() - started}ms -> sha256:${digest.slice(0, 16)}…`);

    digestCache.set(filepath, { digest, size, mtimeMs });
    try {
      await writeFile(cachePath, JSON.stringify(Object.fromEntries(digestCache), null, 2));
    } catch (err) {
      console.warn(`[llama] Could not write digest cache: ${err instanceof Error ? err.message : err}`);
    }
    return digest;
  } catch (err) {
    // UNDEFINED, NOT A PLACEHOLDER.
    //
    // A model whose weights could not be read has no identity, and inventing
    // one would put an unverifiable claim into every receipt that cites it.
    // Callers must treat `undefined` as "this model cannot be cited".
    console.error(`[llama] FAILED to hash ${filepath}: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

class LlamaEngine {
  private llama: Llama | null = null;
  private models: Map<string, LocalModel> = new Map();
  private loadedModels: Map<string, LoadedModel> = new Map();
  private initializing: Promise<void> | null = null;

  /**
   * Initialize the llama instance and scan for models
   */
  async initialize(): Promise<void> {
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this._doInitialize();
    return this.initializing;
  }

  private async _doInitialize(): Promise<void> {
    try {
      console.log("[llama] Initializing llama.cpp...");
      this.llama = await getLlama();
      console.log("[llama] llama.cpp initialized");

      // Scan models directory
      await this.scanModels();
    } catch (err) {
      console.error("[llama] Failed to initialize:", err);
      throw err;
    }
  }

  /**
   * Scan the models directory for GGUF files
   */
  async scanModels(): Promise<void> {
    try {
      const modelsPath = config.modelsPath;
      console.log(`[llama] Scanning for models in: ${modelsPath}`);

      let files: string[];
      try {
        files = await readdir(modelsPath);
      } catch (err) {
        console.warn(`[llama] Models directory not found: ${modelsPath}`);
        return;
      }

      const ggufFiles = files.filter((f) => f.endsWith(".gguf"));
      console.log(`[llama] Found ${ggufFiles.length} GGUF files`);

      for (const filename of ggufFiles) {
        const filepath = join(modelsPath, filename);
        const fileStat = await stat(filepath);

        // Derive model ID from filename
        const id = filename.replace(/\.gguf$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");

        const digest = await digestModel(filepath, fileStat.size, fileStat.mtimeMs);

        const model: LocalModel = {
          id,
          name: filename.replace(/\.gguf$/, ""),
          filename,
          filepath,
          digest,
          sizeBytes: fileStat.size,
          contextLength: 4096, // Default, will be updated when loaded
          capabilities: ["chat", "completion"],
          status: "available",
          loaded: false,
          memoryUsageMB: Math.round(fileStat.size / 1024 / 1024),
          createdAt: fileStat.birthtime.toISOString(),
        };

        this.models.set(id, model);
        console.log(
          `[llama] Registered model: ${id} (${model.memoryUsageMB}MB) ${digest ? `sha256:${digest.slice(0, 16)}…` : 'DIGEST UNAVAILABLE'}`
        );
      }
    } catch (err) {
      console.error("[llama] Error scanning models:", err);
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<LocalModel[]> {
    await this.initialize();
    return Array.from(this.models.values());
  }

  /**
   * Get a specific model
   */
  async getModel(id: string): Promise<LocalModel | undefined> {
    await this.initialize();
    return this.models.get(id);
  }

  /**
   * Load a model into memory
   */
  async loadModel(id: string): Promise<LoadedModel> {
    await this.initialize();

    // Check if already loaded
    const existing = this.loadedModels.get(id);
    if (existing) {
      this.resetIdleTimer(id);
      return existing;
    }

    // Find model info
    const modelInfo = this.models.get(id);
    if (!modelInfo) {
      throw new Error(`Model '${id}' not found`);
    }

    // Enforce max loaded models (LRU eviction)
    while (this.loadedModels.size >= config.maxLoadedModels) {
      const oldest = this.getLeastRecentlyUsed();
      if (oldest) {
        console.log(`[llama] Evicting LRU model: ${oldest}`);
        await this.unloadModel(oldest);
      }
    }

    console.log(`[llama] Loading model: ${id}`);
    modelInfo.status = "loading";

    try {
      if (!this.llama) {
        throw new Error("Llama not initialized");
      }

      const model = await this.llama.loadModel({
        modelPath: modelInfo.filepath,
        gpuLayers: config.defaultGpuLayers,
      });

      const context = await model.createContext({
        threads: config.defaultThreads,
        sequences: 4, // Allow up to 4 concurrent requests
      });

      const loaded: LoadedModel = {
        model,
        context,
        info: modelInfo,
        loadedAt: new Date(),
        lastUsed: new Date(),
      };

      this.loadedModels.set(id, loaded);
      modelInfo.status = "loaded";
      modelInfo.loaded = true;
      modelInfo.contextLength = model.trainContextSize || 4096;

      this.startIdleTimer(id);
      console.log(`[llama] Model loaded: ${id}`);

      return loaded;
    } catch (err) {
      modelInfo.status = "error";
      throw err;
    }
  }

  /**
   * Unload a model from memory
   */
  async unloadModel(id: string): Promise<void> {
    const loaded = this.loadedModels.get(id);
    if (!loaded) {
      return;
    }

    console.log(`[llama] Unloading model: ${id}`);

    // Clear idle timer
    if (loaded.idleTimer) {
      clearTimeout(loaded.idleTimer);
    }

    // Dispose resources
    try {
      await loaded.context.dispose();
      await loaded.model.dispose();
    } catch (err) {
      console.warn(`[llama] Error disposing model ${id}:`, err);
    }

    this.loadedModels.delete(id);

    // Update model info
    const modelInfo = this.models.get(id);
    if (modelInfo) {
      modelInfo.status = "available";
      modelInfo.loaded = false;
    }
  }

  /**
   * Run chat completion
   */
  async chatCompletion(
    modelId: string,
    messages: ChatMessage[],
    options: InferenceOptions = {},
    onToken?: (token: string) => void
  ): Promise<ChatCompletionResult> {
    const loaded = await this.loadModel(modelId);
    this.resetIdleTimer(modelId);
    loaded.lastUsed = new Date();

    // Build prompt from messages
    const systemPrompt = messages.find((m) => m.role === "system")?.content;
    const userMessages = messages.filter((m) => m.role !== "system");

    // Get a sequence for this request
    const sequence = loaded.context.getSequence();

    // Create a new session for this request
    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt,
    });

    let content = "";
    let completionTokens = 0;

    try {
      // Get the last user message
      const lastUserMessage = userMessages[userMessages.length - 1];
      if (!lastUserMessage || lastUserMessage.role !== "user") {
        throw new Error("No user message found");
      }

      // DEFAULT TO REPRODUCIBLE.
      //
      // This defaulted to 0.7 with no seed, so the same question answered
      // differently every time and nothing recorded that it had. A wrong
      // answer under those conditions is not a defect anyone can act on —
      // it cannot be reproduced, bisected, regression-tested, or shown to be
      // fixed. It is noise.
      //
      // At temperature 0 with a fixed seed a wrong answer is a bug: it has a
      // reproduction, it can be attached to a model digest, and it can be
      // proven fixed. That is the entire argument for determinism here, and it
      // is not an argument about accuracy. Callers wanting variety must now ask
      // for it, and the DecodeRecord will say they did.
      const temperature = options.temperature ?? 0;
      const seed = options.seed ?? 0;

      const response = await session.prompt(lastUserMessage.content, {
        maxTokens: options.maxTokens || 2048,
        temperature,
        seed,
        stopOnAbortSignal: true,
        onTextChunk: (text) => {
          content += text;
          completionTokens++;
          if (onToken) {
            onToken(text);
          }
        },
      });

      // Estimate prompt tokens (rough approximation)
      const promptText = messages.map((m) => m.content).join(" ");
      const promptTokens = Math.ceil(promptText.length / 4);

      const digest = loaded.info.digest;
      return {
        content: response || content,
        decode: {
          modelDigest: digest,
          temperature,
          seed,
          topP: options.topP,
          maxTokens: options.maxTokens || 2048,
          engine: 'node-llama-cpp',
          // Both conditions, and neither is sufficient alone. Pinned decoding
          // over unidentified weights cannot be re-run by anyone else; an
          // identified model sampled at temperature cannot be re-run by
          // anyone, including us.
          reproducible: Boolean(digest) && temperature === 0,
          reproducibilityNote: !digest
            ? 'weights could not be hashed, so this model cannot be cited'
            : temperature !== 0
              ? `sampled at temperature ${temperature}; the same input may not produce this output again`
              : undefined,
        },
        finishReason: "stop",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (err) {
      console.error(`[llama] Chat completion error:`, err);
      throw err;
    } finally {
      // Release the sequence back to the pool
      await sequence.dispose();
    }
  }

  /**
   * Generate embeddings (if model supports it)
   */
  async embed(modelId: string, inputs: string[]): Promise<number[][]> {
    // Note: node-llama-cpp embedding support varies by model
    // This is a placeholder - actual implementation depends on model capabilities
    throw new Error("Embeddings not yet implemented");
  }

  /**
   * Get the least recently used loaded model
   */
  private getLeastRecentlyUsed(): string | null {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [id, loaded] of this.loadedModels) {
      if (loaded.lastUsed.getTime() < oldestTime) {
        oldestTime = loaded.lastUsed.getTime();
        oldest = id;
      }
    }

    return oldest;
  }

  /**
   * Start idle timer for a model
   */
  private startIdleTimer(id: string): void {
    const loaded = this.loadedModels.get(id);
    if (!loaded) return;

    loaded.idleTimer = setTimeout(async () => {
      console.log(`[llama] Model ${id} idle timeout, unloading...`);
      await this.unloadModel(id);
    }, config.idleTimeoutMs);
  }

  /**
   * Reset idle timer for a model
   */
  private resetIdleTimer(id: string): void {
    const loaded = this.loadedModels.get(id);
    if (!loaded) return;

    if (loaded.idleTimer) {
      clearTimeout(loaded.idleTimer);
    }
    this.startIdleTimer(id);
  }
}

// Singleton instance
let engineInstance: LlamaEngine | null = null;

export function getEngine(): LlamaEngine {
  if (!engineInstance) {
    engineInstance = new LlamaEngine();
  }
  return engineInstance;
}

export async function initializeEngine(): Promise<void> {
  const engine = getEngine();
  await engine.initialize();
}
