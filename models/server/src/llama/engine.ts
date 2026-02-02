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
import { readdir, stat } from "fs/promises";
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
}

export interface ChatCompletionResult {
  content: string;
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

        const model: LocalModel = {
          id,
          name: filename.replace(/\.gguf$/, ""),
          filename,
          filepath,
          contextLength: 4096, // Default, will be updated when loaded
          capabilities: ["chat", "completion"],
          status: "available",
          loaded: false,
          memoryUsageMB: Math.round(fileStat.size / 1024 / 1024),
          createdAt: fileStat.birthtime.toISOString(),
        };

        this.models.set(id, model);
        console.log(`[llama] Registered model: ${id} (${model.memoryUsageMB}MB)`);
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

      const response = await session.prompt(lastUserMessage.content, {
        maxTokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.7,
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

      return {
        content: response || content,
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
