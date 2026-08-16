var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../models/server/src/config.ts
var config;
var init_config = __esm({
  "../../models/server/src/config.ts"() {
    "use strict";
    config = {
      // Server
      host: process.env.HOST || "0.0.0.0",
      nodeEnv: process.env.NODE_ENV || "development",
      // Service URLs
      identityServiceUrl: process.env.IDENTITY_SERVICE_URL || "http://localhost:5001",
      catalogServiceUrl: process.env.CATALOG_SERVICE_URL || "http://localhost:5003",
      /**
       * Integrations holds the credentials, and keeps holding them.
       *
       * Ruling 12 Aug: this service brokers model exchanges; it does NOT become a
       * second vault. Remote execution is delegated so secret handling stays in one
       * place. This URL is for asking integrations what it can reach and, from
       * stage 1, for handing it calls to run.
       */
      integrationsServiceUrl: process.env.INTEGRATIONS_SERVICE_URL || "http://localhost:5007",
      // Models storage
      modelsPath: process.env.MODELS_PATH || "./data/models",
      // Model loading
      maxLoadedModels: parseInt(process.env.MAX_LOADED_MODELS || "2", 10),
      idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS || "300000", 10),
      // 5 minutes
      defaultGpuLayers: parseInt(process.env.DEFAULT_GPU_LAYERS || "0", 10),
      defaultThreads: parseInt(process.env.DEFAULT_THREADS || "4", 10),
      // No third-party credential lives here. `huggingfaceToken` sat in this
      // config from February to 15 Aug 2026 with zero readers — a vault slot in
      // the one service the 12 Aug ruling says must never become a second
      // vault. Credentials for gated repos belong to integrations; the pull
      // path forwards the caller's bearer and integrations attaches the key.
      // Provider name for catalog registration
      providerName: "symbia-labs"
    };
  }
});

// ../../models/server/src/lineage-ledger.ts
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadServiceIdentity,
  identityId
} from "@symbia/crypto";
import {
  GENESIS,
  sealArtifactEvent,
  lineageLine
} from "@symbia/lineage";
function serviceIdentity() {
  if (cachedIdentity === void 0) {
    try {
      cachedIdentity = loadServiceIdentity({ role: "models" });
    } catch {
      cachedIdentity = null;
    }
  }
  return cachedIdentity;
}
function chainHead() {
  const p = ledgerPath();
  if (!existsSync(p)) return GENESIS;
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return GENESIS;
  try {
    const last = JSON.parse(lines[lines.length - 1]);
    return typeof last.checksum === "string" ? last.checksum.replace(/^sha256:/, "") : GENESIS;
  } catch {
    throw new Error(`ledger tail is not parseable JSON: ${p}`);
  }
}
function sourceForDigest(digestHex) {
  const p = ledgerPath();
  if (!existsSync(p)) return null;
  const want = `sha256:${digestHex}`;
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const ev = JSON.parse(lines[i]);
      if (ev.event_type !== "artifact.registered") continue;
      const payload = ev.payload;
      if (payload?.digest === want && payload.source) return payload.source;
    } catch {
      continue;
    }
  }
  return null;
}
function appendArtifactRegistered(payload) {
  const sid = serviceIdentity();
  if (!sid) {
    console.warn("[ledger] no service identity \u2014 registration not recorded");
    return null;
  }
  const actor = identityId("service:models", sid.identity.fingerprint);
  const sealed = sealArtifactEvent({
    eventType: "artifact.registered",
    payload,
    actor,
    chain: chainHead(),
    parents: [null],
    identity: sid.identity
  });
  appendFileSync(ledgerPath(), lineageLine(sealed.event));
  if (!existsSync(pubKeyPath())) {
    writeFileSync(pubKeyPath(), sid.identity.publicKeyPem);
  }
  return sealed.event;
}
var cachedIdentity, ledgerPath, pubKeyPath;
var init_lineage_ledger = __esm({
  "../../models/server/src/lineage-ledger.ts"() {
    "use strict";
    init_config();
    ledgerPath = () => join(config.modelsPath, ".lineage.jsonl");
    pubKeyPath = () => join(config.modelsPath, ".lineage.pub.pem");
  }
});

// ../../models/server/src/catalog/model-sync.ts
var model_sync_exports = {};
__export(model_sync_exports, {
  buildModelKey: () => buildModelKey,
  fetchCardDigest: () => fetchCardDigest,
  modelToCatalogResource: () => modelToCatalogResource,
  publisherFor: () => publisherFor,
  queryModelsFromCatalog: () => queryModelsFromCatalog,
  removeModelFromCatalog: () => removeModelFromCatalog,
  syncModelsToCatalog: () => syncModelsToCatalog
});
function publisherFor(model) {
  if (model.digest) {
    const source = sourceForDigest(model.digest);
    const owner = source?.repo?.split("/")[0];
    if (owner) return owner.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  }
  return "local";
}
function buildModelKey(modelId, publisher = "local") {
  return `models/${publisher}/${modelId}`;
}
function modelToCatalogResource(model) {
  const source = model.digest && sourceForDigest(model.digest) || { type: "local" };
  const publisher = publisherFor(model);
  const metadata = {
    provider: config.providerName,
    modelId: model.id,
    filename: model.filename,
    contextWindow: model.contextLength,
    capabilities: model.capabilities,
    supportedOperations: ["chat.completions", "completions"],
    source,
    runtime: {
      framework: "node-llama-cpp",
      gpuLayers: config.defaultGpuLayers,
      threads: config.defaultThreads
    },
    // Artifact identity — durable, so it belongs on the card (unlike the
    // live fields removed below). `sha256:<hex>` of the weights file.
    ...model.digest ? { digest: `sha256:${model.digest}` } : {},
    ...model.sizeBytes ? { sizeBytes: model.sizeBytes } : {}
    // No `loaded`, `status`, or `memoryUsageMB` here. The card describes the
    // ARTIFACT; whether it is loaded right now is the registry's answer
    // (12 Aug ruling: real-time point instances never live in the catalog).
    // Those three fields were written on every boot until 15 Aug 2026 —
    // see experiments/model-derivation/DEFECTS.md §5.
  };
  return {
    key: buildModelKey(model.id, publisher),
    name: model.name,
    type: "model",
    status: "published",
    // A runtime upsert is not a seed file. `true` here conflated the two,
    // which is STATUS §6.1's territory.
    isBootstrap: false,
    tags: ["ai", "llm", config.providerName, publisher, "gguf"],
    metadata,
    accessPolicy: {
      visibility: "public",
      actions: {
        read: { anyOf: ["public"] },
        write: { anyOf: ["cap:registry.write", "role:admin"] },
        delete: { anyOf: ["role:admin"] },
        publish: { anyOf: ["cap:registry.publish", "role:publisher"] }
      }
    }
  };
}
async function syncModelsToCatalog(models) {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) {
    console.warn("[model-sync] CATALOG_SERVICE_URL not configured, skipping sync");
    return;
  }
  console.log(`[model-sync] Syncing ${models.length} models to catalog...`);
  for (const model of models) {
    try {
      const resource = modelToCatalogResource(model);
      await upsertCatalogResource(resource);
      console.log(`[model-sync] Synced model: ${model.id}`);
    } catch (err) {
      console.error(`[model-sync] Failed to sync model ${model.id}:`, err);
    }
  }
  console.log("[model-sync] Catalog sync complete");
}
async function findResourceByKey(key) {
  const catalogUrl = config.catalogServiceUrl;
  const response = await fetch(
    `${catalogUrl}/api/resources?key=${encodeURIComponent(key)}`,
    {
      headers: { "X-Service-Auth": "internal" },
      signal: AbortSignal.timeout(5e3)
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to query resources by key: ${response.status}`);
  }
  const body = await response.json();
  const rows = Array.isArray(body) ? body.filter((r) => r.key === key) : [];
  return rows[0] ?? null;
}
async function upsertCatalogResource(resource) {
  const catalogUrl = config.catalogServiceUrl;
  const existing = await findResourceByKey(resource.key);
  if (existing) {
    const response = await fetch(`${catalogUrl}/api/resources/${existing.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal"
      },
      body: JSON.stringify({
        name: resource.name,
        tags: resource.tags,
        metadata: resource.metadata,
        status: resource.status,
        accessPolicy: resource.accessPolicy
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to update resource: ${response.status}`);
    }
  } else {
    const response = await fetch(`${catalogUrl}/api/resources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal"
      },
      body: JSON.stringify(resource)
    });
    if (!response.ok) {
      throw new Error(`Failed to create resource: ${response.status}`);
    }
  }
}
async function fetchCardDigest(modelId, fileDigestHex) {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return null;
  try {
    const publisher = publisherFor({ digest: fileDigestHex });
    let row = await findResourceByKey(buildModelKey(modelId, publisher));
    if (!row) {
      row = await findResourceByKey(`integrations/${config.providerName}/models/${modelId}`);
    }
    const digest = row?.metadata?.digest;
    return typeof digest === "string" ? digest : null;
  } catch {
    return null;
  }
}
async function removeModelFromCatalog(modelId) {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return;
  try {
    const row = await findResourceByKey(buildModelKey(modelId, publisherFor({ digest: void 0 }))) ?? await findResourceByKey(`integrations/${config.providerName}/models/${modelId}`);
    if (!row) return;
    await fetch(`${catalogUrl}/api/resources/${row.id}`, {
      method: "DELETE",
      headers: {
        "X-Service-Auth": "internal"
      }
    });
    console.log(`[model-sync] Removed model from catalog: ${modelId}`);
  } catch (err) {
    console.error(`[model-sync] Failed to remove model:`, err);
  }
}
async function queryModelsFromCatalog() {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return [];
  try {
    const prefix = `integrations/${config.providerName}/models`;
    const response = await fetch(
      `${catalogUrl}/api/resources?type=integration&prefix=${encodeURIComponent(prefix)}`,
      {
        headers: {
          "X-Service-Auth": "internal"
        }
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to query catalog: ${response.status}`);
    }
    const data = await response.json();
    return data.resources || [];
  } catch (err) {
    console.error("[model-sync] Failed to query catalog:", err);
    return [];
  }
}
var init_model_sync = __esm({
  "../../models/server/src/catalog/model-sync.ts"() {
    "use strict";
    init_config();
    init_lineage_ledger();
  }
});

// ../../models/server/src/auth.ts
init_config();
import { createAuthMiddleware } from "@symbia/auth";
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["models:admin", "cap:models.admin"],
  enableImpersonation: true,
  logger: (level, msg) => console.log(`[models-auth] ${msg}`)
});
var {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  authClient
} = auth;

// ../../models/server/src/handlers/chat-completions.ts
import { z } from "zod";

// ../../models/server/src/llama/engine.ts
init_config();
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { readdir, stat, readFile, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { join as join2 } from "path";
function attemptsPath() {
  return join2(config.modelsPath, ".load-attempts.json");
}
async function readAttempts() {
  try {
    return JSON.parse(await readFile(attemptsPath(), "utf8"));
  } catch {
    return {};
  }
}
async function writeAttempts(all) {
  try {
    await writeFile(attemptsPath(), JSON.stringify(all, null, 2));
  } catch (err) {
    console.warn(`[llama] Could not write load journal: ${err instanceof Error ? err.message : err}`);
  }
}
async function recordLoadAttempt(id, digest, reason) {
  const all = await readAttempts();
  all[id] = { startedAt: (/* @__PURE__ */ new Date()).toISOString(), digest, ...reason ? { reason } : {} };
  await writeAttempts(all);
}
async function clearLoadAttempt(id) {
  const all = await readAttempts();
  if (!(id in all)) return;
  delete all[id];
  await writeAttempts(all);
}
var digestCache = /* @__PURE__ */ new Map();
var cacheLoaded = false;
async function digestModel(filepath, size, mtimeMs) {
  const cachePath = join2(config.modelsPath, ".digests.json");
  if (!cacheLoaded) {
    cacheLoaded = true;
    try {
      const raw = JSON.parse(await readFile(cachePath, "utf8"));
      for (const [k, v] of Object.entries(raw)) digestCache.set(k, v);
    } catch {
    }
  }
  const hit = digestCache.get(filepath);
  if (hit && hit.size === size && hit.mtimeMs === mtimeMs) return hit.digest;
  try {
    const started = Date.now();
    const hash = createHash("sha256");
    await pipeline(createReadStream(filepath), hash);
    const digest = hash.digest("hex");
    console.log(`[llama] Hashed ${filepath} in ${Date.now() - started}ms -> sha256:${digest.slice(0, 16)}\u2026`);
    digestCache.set(filepath, { digest, size, mtimeMs });
    try {
      await writeFile(cachePath, JSON.stringify(Object.fromEntries(digestCache), null, 2));
    } catch (err) {
      console.warn(`[llama] Could not write digest cache: ${err instanceof Error ? err.message : err}`);
    }
    return digest;
  } catch (err) {
    console.error(`[llama] FAILED to hash ${filepath}: ${err instanceof Error ? err.message : err}`);
    return void 0;
  }
}
var LlamaEngine = class {
  llama = null;
  models = /* @__PURE__ */ new Map();
  loadedModels = /* @__PURE__ */ new Map();
  initializing = null;
  /**
   * Initialize the llama instance and scan for models
   */
  async initialize() {
    if (this.initializing) {
      return this.initializing;
    }
    this.initializing = this._doInitialize();
    return this.initializing;
  }
  async _doInitialize() {
    try {
      console.log("[llama] Initializing llama.cpp...");
      this.llama = await getLlama();
      console.log("[llama] llama.cpp initialized");
      await this.scanModels();
    } catch (err) {
      console.error("[llama] Failed to initialize:", err);
      throw err;
    }
  }
  /**
   * Scan the models directory for GGUF files
   */
  async scanModels() {
    try {
      const modelsPath = config.modelsPath;
      console.log(`[llama] Scanning for models in: ${modelsPath}`);
      let files;
      try {
        files = await readdir(modelsPath);
      } catch (err) {
        console.warn(`[llama] Models directory not found: ${modelsPath}`);
        return;
      }
      const ggufFiles = files.filter((f) => f.endsWith(".gguf"));
      console.log(`[llama] Found ${ggufFiles.length} GGUF files`);
      const attempts = await readAttempts();
      for (const filename of ggufFiles) {
        const filepath = join2(modelsPath, filename);
        const fileStat = await stat(filepath);
        const id = filename.replace(/\.gguf$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const digest = await digestModel(filepath, fileStat.size, fileStat.mtimeMs);
        const model = {
          id,
          name: filename.replace(/\.gguf$/, ""),
          filename,
          filepath,
          digest,
          sizeBytes: fileStat.size,
          contextLength: 4096,
          // Default, will be updated when loaded
          capabilities: ["chat", "completion"],
          status: "available",
          loaded: false,
          memoryUsageMB: Math.round(fileStat.size / 1024 / 1024),
          createdAt: fileStat.birthtime.toISOString(),
          // An attempt still in the journal was never completed by the
          // process that wrote it.
          loadFailure: attempts[id] ? {
            at: attempts[id].startedAt,
            reason: attempts[id].reason ?? "a previous load did not finish \u2014 the process ended while loading these weights (host memory is the usual cause)"
          } : void 0
        };
        if (model.loadFailure) {
          model.status = "error";
          console.warn(`[llama] ${id}: ${model.loadFailure.reason}`);
        }
        this.models.set(id, model);
        console.log(
          `[llama] Registered model: ${id} (${model.memoryUsageMB}MB) ${digest ? `sha256:${digest.slice(0, 16)}\u2026` : "DIGEST UNAVAILABLE"}`
        );
      }
    } catch (err) {
      console.error("[llama] Error scanning models:", err);
    }
  }
  /**
   * List all available models
   */
  async listModels() {
    await this.initialize();
    return Array.from(this.models.values());
  }
  /**
   * Get a specific model
   */
  async getModel(id) {
    await this.initialize();
    return this.models.get(id);
  }
  /**
   * Load a model into memory
   */
  async loadModel(id) {
    await this.initialize();
    const existing = this.loadedModels.get(id);
    if (existing) {
      this.resetIdleTimer(id);
      return existing;
    }
    const modelInfo = this.models.get(id);
    if (!modelInfo) {
      throw new Error(`Model '${id}' not found`);
    }
    while (this.loadedModels.size >= config.maxLoadedModels) {
      const oldest = this.getLeastRecentlyUsed();
      if (oldest) {
        console.log(`[llama] Evicting LRU model: ${oldest}`);
        await this.unloadModel(oldest);
      }
    }
    console.log(`[llama] Loading model: ${id}`);
    modelInfo.status = "loading";
    await recordLoadAttempt(id, modelInfo.digest);
    try {
      const { fetchCardDigest: fetchCardDigest2 } = await Promise.resolve().then(() => (init_model_sync(), model_sync_exports));
      const cardDigest = await fetchCardDigest2(id, modelInfo.digest);
      if (cardDigest && modelInfo.digest) {
        const fileDigest = `sha256:${modelInfo.digest}`;
        if (cardDigest !== fileDigest) {
          modelInfo.cardDigestMismatch = { card: cardDigest, file: fileDigest };
          console.warn(
            `[llama] DIGEST MISMATCH for ${id}: card says ${cardDigest.slice(0, 24)}\u2026, file is ${fileDigest.slice(0, 24)}\u2026 \u2014 loading anyway, disclosed on the registry entry`
          );
        } else {
          modelInfo.cardDigestMismatch = void 0;
        }
      }
    } catch (err) {
      console.warn(
        `[llama] Card digest check skipped: ${err instanceof Error ? err.message : err}`
      );
    }
    try {
      if (!this.llama) {
        throw new Error("Llama not initialized");
      }
      const model = await this.llama.loadModel({
        modelPath: modelInfo.filepath,
        gpuLayers: config.defaultGpuLayers
      });
      const context = await model.createContext({
        threads: config.defaultThreads,
        sequences: 4
        // Allow up to 4 concurrent requests
      });
      const loaded = {
        model,
        context,
        info: modelInfo,
        loadedAt: /* @__PURE__ */ new Date(),
        lastUsed: /* @__PURE__ */ new Date()
      };
      this.loadedModels.set(id, loaded);
      modelInfo.status = "loaded";
      modelInfo.loaded = true;
      modelInfo.contextLength = model.trainContextSize || 4096;
      this.startIdleTimer(id);
      console.log(`[llama] Model loaded: ${id}`);
      await clearLoadAttempt(id);
      modelInfo.loadFailure = void 0;
      return loaded;
    } catch (err) {
      modelInfo.status = "error";
      const reason = err instanceof Error ? err.message : String(err);
      modelInfo.loadFailure = { at: (/* @__PURE__ */ new Date()).toISOString(), reason };
      await recordLoadAttempt(id, modelInfo.digest, reason);
      throw err;
    }
  }
  /**
   * Unload a model from memory
   */
  async unloadModel(id) {
    const loaded = this.loadedModels.get(id);
    if (!loaded) {
      return;
    }
    console.log(`[llama] Unloading model: ${id}`);
    if (loaded.idleTimer) {
      clearTimeout(loaded.idleTimer);
    }
    try {
      await loaded.context.dispose();
      await loaded.model.dispose();
    } catch (err) {
      console.warn(`[llama] Error disposing model ${id}:`, err);
    }
    this.loadedModels.delete(id);
    const modelInfo = this.models.get(id);
    if (modelInfo) {
      modelInfo.status = "available";
      modelInfo.loaded = false;
    }
  }
  /**
   * Run chat completion
   */
  async chatCompletion(modelId, messages, options = {}, onToken) {
    const loaded = await this.loadModel(modelId);
    this.resetIdleTimer(modelId);
    loaded.lastUsed = /* @__PURE__ */ new Date();
    const systemPrompt = messages.find((m) => m.role === "system")?.content;
    const userMessages = messages.filter((m) => m.role !== "system");
    const sequence = loaded.context.getSequence();
    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt
    });
    let content = "";
    let completionTokens = 0;
    try {
      const lastUserMessage = userMessages[userMessages.length - 1];
      if (!lastUserMessage || lastUserMessage.role !== "user") {
        throw new Error("No user message found");
      }
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
        }
      });
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
          engine: "node-llama-cpp",
          // Both conditions, and neither is sufficient alone. Pinned decoding
          // over unidentified weights cannot be re-run by anyone else; an
          // identified model sampled at temperature cannot be re-run by
          // anyone, including us.
          reproducible: Boolean(digest) && temperature === 0,
          reproducibilityNote: !digest ? "weights could not be hashed, so this model cannot be cited" : temperature !== 0 ? `sampled at temperature ${temperature}; the same input may not produce this output again` : void 0
        },
        finishReason: "stop",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        }
      };
    } catch (err) {
      console.error(`[llama] Chat completion error:`, err);
      throw err;
    } finally {
      await sequence.dispose();
    }
  }
  /**
   * Generate embeddings (if model supports it)
   */
  async embed(modelId, inputs) {
    throw new Error("Embeddings not yet implemented");
  }
  /**
   * Get the least recently used loaded model
   */
  getLeastRecentlyUsed() {
    let oldest = null;
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
  startIdleTimer(id) {
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
  resetIdleTimer(id) {
    const loaded = this.loadedModels.get(id);
    if (!loaded) return;
    if (loaded.idleTimer) {
      clearTimeout(loaded.idleTimer);
    }
    this.startIdleTimer(id);
  }
};
var engineInstance = null;
function getEngine() {
  if (!engineInstance) {
    engineInstance = new LlamaEngine();
  }
  return engineInstance;
}

// ../../models/server/src/remote.ts
init_config();
var REMOTE_PROVIDERS = /* @__PURE__ */ new Set(["openai", "anthropic", "huggingface"]);
function canBroker(provider) {
  return REMOTE_PROVIDERS.has(provider);
}
var UNSUPPORTED_PARAMS = [
  {
    modelPrefix: "claude-sonnet-5",
    param: "temperature",
    reason: "Anthropic rejects `temperature` for this model (measured 12 Aug 2026)"
  },
  {
    modelPrefix: "claude-opus-5",
    param: "temperature",
    reason: "same family as claude-sonnet-5; not separately measured"
  }
];
function applyParameterRules(req) {
  const request = { ...req };
  const dropped = [];
  for (const rule of UNSUPPORTED_PARAMS) {
    if (!req.model.startsWith(rule.modelPrefix)) continue;
    if (request[rule.param] === void 0) continue;
    delete request[rule.param];
    dropped.push({ param: String(rule.param), reason: rule.reason });
  }
  return { request, dropped };
}
async function executeRemoteChat(req, auth2) {
  const { request, dropped } = applyParameterRules(req);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth2.token}`
  };
  if (auth2.orgId) headers["X-Org-Id"] = auth2.orgId;
  const response = await fetch(`${config.integrationsServiceUrl}/api/integrations/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: request.provider,
      operation: "chat.completions",
      params: {
        model: request.model,
        messages: request.messages,
        // Absent means absent. Let the provider apply its own default rather
        // than inventing one — the habit that produced three separate failures
        // on 12 Aug: openai as a provider default, a stale model id, and a
        // temperature nobody asked for.
        ...request.temperature !== void 0 ? { temperature: request.temperature } : {},
        ...request.maxTokens !== void 0 ? { maxTokens: request.maxTokens } : {}
      }
    }),
    signal: AbortSignal.timeout(45e3)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(
      `integrations ${response.status}: ${body.error ?? response.statusText}`
    );
  }
  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || "remote chat completion failed");
  }
  return {
    content: result.data.content,
    // WHAT ANSWERED, NOT WHAT WAS ASKED FOR. The provider reports the model it
    // actually used; a receipt naming the requested one would be describing an
    // intention rather than an event.
    model: result.data.model,
    usage: result.data.usage,
    finishReason: result.data.finishReason,
    droppedParams: dropped
  };
}

// ../../models/server/src/handlers/chat-completions.ts
async function handleRemote(req, res, opts) {
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0;
  if (!bearer) {
    res.status(401).json({
      error: {
        message: `Remote model '${opts.provider}/${opts.model}' requires an Authorization header. Credentials are resolved per user and organisation by the integrations service; this service forwards your token and holds no key of its own.`,
        type: "invalid_request_error",
        code: "authentication_required"
      }
    });
    return;
  }
  if (opts.stream) {
    res.status(400).json({
      error: {
        message: "Streaming is not yet supported for remote models. The integrations execute API returns a complete response; streaming remote completions is not built.",
        type: "invalid_request_error",
        code: "streaming_unsupported"
      }
    });
    return;
  }
  const orgId = req.headers["x-org-id"];
  const result = await executeRemoteChat(
    {
      provider: opts.provider,
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens
    },
    { token: bearer, orgId: typeof orgId === "string" ? orgId : void 0 }
  );
  console.log(
    `[chat] brokered ${opts.provider}/${opts.model} -> ran ${result.model}` + (result.droppedParams.length ? ` \u2014 dropped ${result.droppedParams.map((d) => `${d.param} (${d.reason})`).join(", ")}` : "")
  );
  res.json({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model: result.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.content },
        finish_reason: result.finishReason ?? "stop"
      }
    ],
    usage: result.usage ? {
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens ?? result.usage.promptTokens + result.usage.completionTokens
    } : void 0,
    // Receipt material the OpenAI shape has no room for. Parameters the broker
    // refused to send are part of what happened, and a caller that asked for
    // temperature 0 and silently got the provider default could never find out.
    symbia: {
      source: "remote",
      provider: opts.provider,
      requestedModel: `${opts.provider}/${opts.model}`,
      ranModel: result.model,
      droppedParams: result.droppedParams
    }
  });
}
var chatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string()
    })
  ),
  // ABSENT MEANS ABSENT — no default.
  //
  // This read `.default(0.7)`, so every request that did not mention
  // temperature acquired one. That is the precise failure measured on 12 Aug
  // against claude-sonnet-5 ("`temperature` is deprecated for this model"),
  // and it was sitting in the front door of the service meant to prevent it.
  //
  // A default nobody asked for is not a convenience; it is an unrequested
  // claim about how the caller wants the model to behave, and for some models
  // it is a hard error.
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional().default(false),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional()
});
async function handleChatCompletions(req, res) {
  try {
    const parsed = chatCompletionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          message: "Invalid request body",
          type: "invalid_request_error",
          details: parsed.error.issues
        }
      });
      return;
    }
    const { model, messages, temperature, max_tokens, stream, stop } = parsed.data;
    const slash = model.indexOf("/");
    const maybeProvider = slash > 0 ? model.slice(0, slash) : null;
    if (maybeProvider && REMOTE_PROVIDERS.has(maybeProvider)) {
      await handleRemote(req, res, {
        provider: maybeProvider,
        model: model.slice(slash + 1),
        messages,
        temperature,
        maxTokens: max_tokens,
        stream
      });
      return;
    }
    const engine = getEngine();
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      const requestId = `chatcmpl-${Date.now()}`;
      let totalTokens = 0;
      try {
        await engine.chatCompletion(
          model,
          messages,
          {
            temperature,
            maxTokens: max_tokens,
            stop: typeof stop === "string" ? [stop] : stop
          },
          (token) => {
            totalTokens++;
            const chunk = {
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1e3),
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: token },
                  finish_reason: null
                }
              ]
            };
            res.write(`data: ${JSON.stringify(chunk)}

`);
          }
        );
        const finalChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1e3),
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop"
            }
          ]
        };
        res.write(`data: ${JSON.stringify(finalChunk)}

`);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (err) {
        const errorChunk = {
          error: {
            message: err instanceof Error ? err.message : "Streaming error",
            type: "server_error"
          }
        };
        res.write(`data: ${JSON.stringify(errorChunk)}

`);
        res.end();
      }
    } else {
      const startTime = Date.now();
      const result = await engine.chatCompletion(model, messages, {
        temperature,
        maxTokens: max_tokens,
        stop: typeof stop === "string" ? [stop] : stop
      });
      const response = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1e3),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.content
            },
            finish_reason: result.finishReason || "stop"
          }
        ],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens
        }
      };
      res.json(response);
    }
  } catch (err) {
    console.error("[chat-completions] Error:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Internal server error",
        type: "server_error"
      }
    });
  }
}

// ../../models/server/src/registry.ts
init_config();
async function remoteProviders(auth2) {
  const url = `${config.integrationsServiceUrl}/api/integrations/providers`;
  let body;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5e3) });
    if (!r.ok) {
      throw new Error(`${r.status} ${r.statusText}`);
    }
    body = await r.json();
  } catch (err) {
    console.warn(
      `[registry] could not reach integrations at ${url}: ${err instanceof Error ? err.message : String(err)} \u2014 remote models are UNLISTED, which is not the same as absent`
    );
    return [];
  }
  const providers = body.providers ?? [];
  const entries = await Promise.all(
    providers.map(async (p) => {
      const measured = auth2 ? await measuredModels(p.name, auth2) : null;
      if (measured && measured.length) {
        return measured.map((m, i) => ({
          id: `${p.name}/${m.id}`,
          source: "remote",
          provider: p.name,
          brokered: canBroker(p.name),
          availability: "unknown",
          availabilityReason: "listed by the provider adapter; whether this org holds a credential is a separate question",
          capabilities: m.capabilities,
          contextLength: m.contextWindow,
          operations: p.supportedOperations,
          idSource: "measured",
          verified: true,
          // The adapter orders by what answered. First is the working default.
          isProviderDefault: i === 0
        }));
      }
      return [
        {
          id: p.defaultModel ? `${p.name}/${p.defaultModel}` : p.name,
          source: "remote",
          provider: p.name,
          // Stage 1 flipped this. It is now answered by the same list the
          // chat router uses, so "advertised as brokered" and "actually
          // routable" cannot drift apart.
          brokered: canBroker(p.name),
          availability: "unknown",
          availabilityReason: "remote credentials are per-organisation; this listing carries no org context",
          operations: p.supportedOperations,
          idSource: "provider-config",
          // The id above is what configuration ADVERTISES. It has not been
          // checked against the provider, and for anthropic it is known to
          // disagree with what runs.
          verified: false,
          isProviderDefault: true
        }
      ];
    })
  );
  return entries.flat();
}
async function measuredModels(provider, auth2) {
  const url = `${config.integrationsServiceUrl}/api/integrations/providers/${encodeURIComponent(
    provider
  )}/models`;
  try {
    const headers = { Authorization: `Bearer ${auth2.token}` };
    if (auth2.orgId) headers["X-Org-Id"] = auth2.orgId;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(5e3) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const body = await r.json();
    return body.models ?? null;
  } catch (err) {
    console.warn(
      `[registry] could not list ${provider} models: ${err instanceof Error ? err.message : String(err)} \u2014 falling back to the ADVERTISED default, marked unverified`
    );
    return null;
  }
}
async function localModels() {
  try {
    const models = await getEngine().listModels();
    return models.map((m) => ({
      id: m.id,
      source: "local",
      provider: config.providerName,
      brokered: true,
      // Loaded is available; a failed attempt is unavailable WITH ITS
      // REASON; anything else on disk is standby.
      availability: m.status === "loaded" ? "available" : m.loadFailure ? "unavailable" : "standby",
      availabilityReason: m.status === "loaded" ? "loaded and serving" : m.loadFailure ? `load failed ${m.loadFailure.at.slice(0, 16).replace("T", " ")} \u2014 ${m.loadFailure.reason}` : "on disk; loads on first request",
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      status: m.status,
      createdAt: m.createdAt,
      idSource: "local",
      verified: true,
      digest: m.digest ? `sha256:${m.digest}` : void 0,
      digestMismatch: m.cardDigestMismatch
    }));
  } catch (err) {
    console.warn(
      `[registry] local engine unavailable: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}
async function unifiedRegistry(auth2) {
  const [local, remote] = await Promise.all([localModels(), remoteProviders(auth2)]);
  return [...local, ...remote];
}

// ../../models/server/src/handlers/models.ts
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
async function handleListModels(req, res) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0;
    const orgId = req.headers["x-org-id"];
    const entries = await unifiedRegistry(
      bearer ? { token: bearer, orgId: typeof orgId === "string" ? orgId : void 0 } : void 0
    );
    const response = {
      object: "list",
      data: entries.map((e) => ({
        id: e.id,
        object: "model",
        created: e.createdAt ? Math.floor(new Date(e.createdAt).getTime() / 1e3) : 0,
        owned_by: e.provider,
        permission: [],
        root: e.id,
        parent: null,
        // Extended fields, kept for existing readers
        capabilities: e.capabilities,
        context_length: e.contextLength,
        status: e.status,
        // Symbia-native, in one place
        symbia: {
          source: e.source,
          provider: e.provider,
          brokered: e.brokered,
          availability: e.availability,
          availabilityReason: e.availabilityReason,
          operations: e.operations,
          // Where this id came from, and whether anything checked it.
          idSource: e.idSource,
          verified: e.verified,
          isProviderDefault: e.isProviderDefault,
          // Which bytes. Absent for remote models; mismatch present only
          // when the card and the file disagree (disclosed, not refused).
          digest: e.digest,
          digestMismatch: e.digestMismatch
        }
      }))
    };
    res.json(response);
  } catch (err) {
    console.error("[models] Error listing models:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to list models",
        type: "server_error"
      }
    });
  }
}
async function handleGetModel(req, res) {
  try {
    const id = getParam(req.params, "id");
    const engine = getEngine();
    const model = await engine.getModel(id);
    if (!model) {
      res.status(404).json({
        error: {
          message: `Model '${id}' not found`,
          type: "invalid_request_error",
          code: "model_not_found"
        }
      });
      return;
    }
    res.json({
      id: model.id,
      object: "model",
      created: model.createdAt ? Math.floor(new Date(model.createdAt).getTime() / 1e3) : 0,
      owned_by: "symbia-labs",
      capabilities: model.capabilities,
      context_length: model.contextLength,
      status: model.status,
      loaded: model.loaded,
      memory_usage_mb: model.memoryUsageMB,
      // Which bytes this id names right now. The live fields above are the
      // registry's business; this one is the artifact's identity.
      digest: model.digest ? `sha256:${model.digest}` : void 0,
      digest_mismatch: model.cardDigestMismatch
    });
  } catch (err) {
    console.error("[models] Error getting model:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to get model",
        type: "server_error"
      }
    });
  }
}
async function handleLoadModel(req, res) {
  try {
    const id = getParam(req.params, "id");
    const engine = getEngine();
    const known = await engine.getModel(id);
    if (!known) {
      res.status(404).json({
        error: {
          message: `Model '${id}' not found`,
          type: "invalid_request_error"
        }
      });
      return;
    }
    console.log(`[models] Loading model: ${id}`);
    await engine.loadModel(id);
    const model = await engine.getModel(id);
    res.json({
      success: true,
      model: {
        id: model?.id,
        status: model?.status,
        loaded: model?.loaded,
        memory_usage_mb: model?.memoryUsageMB
      }
    });
  } catch (err) {
    console.error("[models] Error loading model:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to load model",
        type: "server_error"
      }
    });
  }
}
async function handleUnloadModel(req, res) {
  try {
    const id = getParam(req.params, "id");
    const engine = getEngine();
    const known = await engine.getModel(id);
    if (!known) {
      res.status(404).json({
        error: {
          message: `Model '${id}' not found`,
          type: "invalid_request_error"
        }
      });
      return;
    }
    console.log(`[models] Unloading model: ${id}`);
    await engine.unloadModel(id);
    res.json({
      success: true,
      message: `Model '${id}' unloaded`
    });
  } catch (err) {
    console.error("[models] Error unloading model:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to unload model",
        type: "server_error"
      }
    });
  }
}

// ../../models/server/src/handlers/execute.ts
import { z as z2 } from "zod";
init_config();
var executeRequestSchema = z2.object({
  provider: z2.string(),
  operation: z2.string(),
  params: z2.object({
    model: z2.string(),
    messages: z2.array(
      z2.object({
        role: z2.enum(["system", "user", "assistant"]),
        content: z2.string()
      })
    ).optional(),
    prompt: z2.string().optional(),
    temperature: z2.number().optional(),
    maxTokens: z2.number().optional(),
    input: z2.union([z2.string(), z2.array(z2.string())]).optional()
  })
});
async function handleExecute(req, res) {
  const startTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  try {
    const parsed = executeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        errorCategory: "validation",
        retryable: false,
        requestId,
        durationMs: Date.now() - startTime
      });
      return;
    }
    const { provider, operation, params } = parsed.data;
    if (provider !== config.providerName && provider !== "local") {
      res.status(400).json({
        success: false,
        error: `Provider '${provider}' not supported by this service`,
        errorCategory: "validation",
        retryable: false,
        requestId,
        durationMs: Date.now() - startTime
      });
      return;
    }
    const engine = getEngine();
    if (operation === "chat.completions" || operation === "messages") {
      const messages = params.messages || [
        { role: "user", content: params.prompt || "" }
      ];
      const result = await engine.chatCompletion(params.model, messages, {
        temperature: params.temperature,
        maxTokens: params.maxTokens
      });
      res.json({
        success: true,
        data: {
          provider: config.providerName,
          model: params.model,
          content: result.content,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens
          },
          finishReason: result.finishReason || "stop"
        },
        requestId,
        durationMs: Date.now() - startTime
      });
    } else if (operation === "embeddings") {
      const input = params.input ? Array.isArray(params.input) ? params.input : [params.input] : [];
      const embeddings = await engine.embed(params.model, input);
      res.json({
        success: true,
        data: {
          provider: config.providerName,
          model: params.model,
          embeddings,
          usage: {
            promptTokens: input.join(" ").split(/\s+/).length,
            totalTokens: input.join(" ").split(/\s+/).length
          }
        },
        requestId,
        durationMs: Date.now() - startTime
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Operation '${operation}' not supported`,
        errorCategory: "validation",
        retryable: false,
        requestId,
        durationMs: Date.now() - startTime
      });
    }
  } catch (err) {
    console.error("[execute] Error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Internal server error",
      errorCategory: "internal",
      retryable: true,
      requestId,
      durationMs: Date.now() - startTime
    });
  }
}

// ../../models/server/src/handlers/pull.ts
import { z as z3 } from "zod";
import { createHash as createHash2 } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, stat as stat2, unlink } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import { join as join3 } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline as pipeline2 } from "node:stream/promises";
import { registeredPayload } from "@symbia/lineage";
init_config();
init_lineage_ledger();
init_model_sync();
var pullSchema = z3.object({
  /** HuggingFace `owner/repo`. */
  repo: z3.string().regex(/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/),
  /** A GGUF filename — no path separators, so it cannot escape MODELS_PATH. */
  file: z3.string().regex(/^[A-Za-z0-9][\w.-]*\.gguf$/),
  revision: z3.string().regex(/^[\w.-]+$/).default("main")
});
function modelIdFor(filename) {
  return filename.replace(/\.gguf$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
async function handlePullModel(req, res) {
  const parsed = pullSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "repo and file required (file must be a plain .gguf name)", details: parsed.error.issues } });
    return;
  }
  const { repo, file, revision } = parsed.data;
  const dest = join3(config.modelsPath, file);
  const id = modelIdFor(file);
  if (existsSync2(dest)) {
    const existing = await getEngine().getModel(id);
    res.status(200).json({
      id,
      alreadyPresent: true,
      digest: existing?.digest ? `sha256:${existing.digest}` : void 0
    });
    return;
  }
  const partial = `${dest}.partial`;
  const hash = createHash2("sha256");
  let bytes = 0;
  try {
    const upstream = await fetch(`${config.integrationsServiceUrl}/api/integrations/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...req.headers.authorization ? { Authorization: req.headers.authorization } : {},
        ...req.headers.cookie ? { Cookie: req.headers.cookie } : {}
      },
      body: JSON.stringify({ provider: "huggingface", repo, file, revision })
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      res.status(502).json({ error: { message: `integrations download returned ${upstream.status}: ${detail.slice(0, 200)}` } });
      return;
    }
    const sourceUrl = upstream.headers.get("x-source-url") ?? `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
    const hasher = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        bytes += chunk.length;
        cb(null, chunk);
      }
    });
    await pipeline2(Readable.fromWeb(upstream.body), hasher, createWriteStream(partial));
    await rename(partial, dest);
    const digestHex = hash.digest("hex");
    const fileStat = await stat2(dest);
    const engine = getEngine();
    await engine.scanModels();
    const model = await engine.getModel(id);
    if (!model) {
      res.status(500).json({ error: { message: "pulled file did not register on rescan" } });
      return;
    }
    if (model.digest && model.digest !== digestHex) {
      res.status(500).json({ error: { message: `stream digest ${digestHex.slice(0, 16)}\u2026 != scanned digest ${model.digest.slice(0, 16)}\u2026 \u2014 file altered between write and scan` } });
      return;
    }
    const event = appendArtifactRegistered(
      registeredPayload({
        digest: `sha256:${digestHex}`,
        bytes: fileStat.size,
        format: "gguf",
        source: { type: "huggingface", repo, file, url: sourceUrl }
      })
    );
    await syncModelsToCatalog([model]);
    res.status(201).json({
      id,
      digest: `sha256:${digestHex}`,
      bytes: fileStat.size,
      source: { repo, file, revision },
      registered: event ? { eventId: event.event_id, checksum: event.checksum, signed: event.signature != null } : null
    });
  } catch (err) {
    await unlink(partial).catch(() => {
    });
    res.status(500).json({ error: { message: err instanceof Error ? err.message : "pull failed" } });
  }
}

// ../../models/server/src/vision.ts
init_config();
import { existsSync as existsSync3 } from "node:fs";
import path from "node:path";
import { createHash as createHash3 } from "node:crypto";
function modelPaths() {
  const dir = config.modelsPath;
  const model = process.env.VISION_MODEL;
  const mmproj = process.env.VISION_MMPROJ;
  return {
    model: model ? path.resolve(dir, model) : void 0,
    mmproj: mmproj ? path.resolve(dir, mmproj) : void 0
  };
}
function visionReadiness() {
  const { model, mmproj } = modelPaths();
  const missing = [];
  if (!model) missing.push("VISION_MODEL not set");
  else if (!existsSync3(model)) missing.push(`VISION_MODEL not found at ${model}`);
  if (!mmproj) missing.push("VISION_MMPROJ not set (multimodal projector)");
  else if (!existsSync3(mmproj)) missing.push(`VISION_MMPROJ not found at ${mmproj}`);
  return missing;
}
async function classifyImage(req) {
  const bytes = Buffer.byteLength(req.imageBase64, "base64");
  const imageDigest = createHash3("sha256").update(req.imageBase64).digest("hex").slice(0, 16);
  const missing = visionReadiness();
  if (missing.length > 0) {
    return {
      ok: false,
      arena: "REFUSED",
      reason: "No vision model is loaded, so this frame was not looked at.",
      missing,
      imageDigest,
      bytes,
      remedy: "Place a vision GGUF and its mmproj projector in MODELS_PATH, then set VISION_MODEL and VISION_MMPROJ. Nothing else here needs to change."
    };
  }
  return {
    ok: false,
    arena: "REFUSED",
    reason: "A vision model is configured but the inference path is not implemented yet.",
    missing: ["node-llama-cpp multimodal invocation"],
    imageDigest,
    bytes,
    remedy: "Implement the LlamaContext image path in models/server/src/vision.ts. The model files are present, so this is the only remaining step."
  };
}

// ../../models/server/src/openapi.ts
var apiDocumentation = {
  openapi: "3.1.0",
  info: {
    title: "Symbia Models Service",
    version: "1.0.0",
    description: `Local LLM inference service using node-llama-cpp.

Provides OpenAI-compatible API endpoints for chat completions and model management.
Models are automatically registered with the Catalog service for discovery.

## Features
- OpenAI-compatible /v1/chat/completions endpoint
- Automatic model discovery from /data/models directory
- LRU caching with configurable max loaded models
- Idle timeout for automatic unloading
- Streaming support via Server-Sent Events
- Catalog integration for model registry

## Provider Name
When using through the Integrations service, use provider: "symbia-labs"`
  },
  servers: [
    {
      url: "http://localhost:5008",
      description: "Local development"
    }
  ],
  paths: {
    "/v1/chat/completions": {
      post: {
        operationId: "createChatCompletion",
        summary: "Create chat completion",
        description: "OpenAI-compatible chat completion endpoint. Supports both streaming and non-streaming responses.",
        tags: ["OpenAI Compatible"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ChatCompletionRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful completion",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ChatCompletionResponse"
                }
              },
              "text/event-stream": {
                schema: {
                  type: "string",
                  description: "SSE stream of completion chunks"
                }
              }
            }
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/v1/models": {
      get: {
        operationId: "listModels",
        summary: "List available models",
        description: "Returns a list of all available local GGUF models.",
        tags: ["OpenAI Compatible"],
        responses: {
          "200": {
            description: "List of models",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelListResponse"
                }
              }
            }
          }
        }
      }
    },
    "/v1/models/{id}": {
      get: {
        operationId: "getModel",
        summary: "Get model details",
        description: "Returns details about a specific model including load status and capabilities.",
        tags: ["OpenAI Compatible"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            },
            description: "Model ID"
          }
        ],
        responses: {
          "200": {
            description: "Model details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelInfo"
                }
              }
            }
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/models": {
      get: {
        operationId: "listModelsApi",
        summary: "List all models",
        description: "Returns all available models with detailed metadata.",
        tags: ["Model Management"],
        responses: {
          "200": {
            description: "List of models",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelListResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/models/pull": {
      post: {
        operationId: "pullModel",
        summary: "Pull weights through the platform, receipted",
        description: "Acquire a GGUF weights artifact. The bytes enter through the integrations service (egress-gated; any HuggingFace credential comes from the vault and never touches this service), are sha256-digested during the stream, sealed as a signed artifact.registered lineage event in the ledger beside the weights, and registered in the catalog. Idempotent: re-pulling a present file answers 200 alreadyPresent with the digest. Auth required; the caller's own credential (bearer or session cookie) is forwarded to integrations.",
        tags: ["Model Management"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["repo", "file"],
                properties: {
                  repo: { type: "string", description: "HuggingFace owner/repo" },
                  file: { type: "string", description: "A plain .gguf filename \u2014 no path separators" },
                  revision: { type: "string", default: "main" }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Pulled. Carries id, digest (sha256 of the artifact), bytes, source, and the signed registration event's id and checksum."
          },
          "200": { description: "Already present; digest included." },
          "401": { description: "No usable credential presented." },
          "502": { description: "Upstream or integrations failure, with the status observed." }
        }
      }
    },
    "/api/models/{id}": {
      get: {
        operationId: "getModelApi",
        summary: "Get model details",
        description: "Returns detailed information about a specific model, including the weights digest (sha256 \u2014 the model's content address) and, when the catalog card and the file disagree, a digest_mismatch disclosure.",
        tags: ["Model Management"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            },
            description: "Model ID"
          }
        ],
        responses: {
          "200": {
            description: "Model details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelInfo"
                }
              }
            }
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/models/{id}/load": {
      post: {
        operationId: "loadModel",
        summary: "Load model into memory",
        description: "Loads a model into memory for inference. Requires authentication.",
        tags: ["Model Management"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            },
            description: "Model ID"
          }
        ],
        responses: {
          "200": {
            description: "Model loaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    model: { $ref: "#/components/schemas/ModelInfo" }
                  }
                }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/models/{id}/unload": {
      post: {
        operationId: "unloadModel",
        summary: "Unload model from memory",
        description: "Unloads a model from memory to free resources. Requires authentication.",
        tags: ["Model Management"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string"
            },
            description: "Model ID"
          }
        ],
        responses: {
          "200": {
            description: "Model unloaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" }
                  }
                }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/integrations/execute": {
      post: {
        operationId: "execute",
        summary: "Execute Symbia integration",
        description: "Symbia-compatible execute endpoint for use via the Integrations service.",
        tags: ["Symbia Integration"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ExecuteRequest"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Execution result",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ExecuteResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/api/stats": {
      get: {
        operationId: "getStats",
        summary: "Get service statistics",
        description: "Returns statistics about loaded models and memory usage.",
        tags: ["Stats"],
        responses: {
          "200": {
            description: "Service statistics",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/StatsResponse"
                }
              }
            }
          }
        }
      }
    },
    "/health/live": {
      get: {
        operationId: "healthLive",
        summary: "Liveness check",
        description: "Returns 200 if the service is alive.",
        tags: ["Health"],
        responses: {
          "200": {
            description: "Service is alive",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/health/ready": {
      get: {
        operationId: "healthReady",
        summary: "Readiness check",
        description: "Returns 200 if the service is ready to handle requests.",
        tags: ["Health"],
        responses: {
          "200": {
            description: "Service is ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "JWT token from Identity service"
      }
    },
    schemas: {
      ChatCompletionRequest: {
        type: "object",
        required: ["model", "messages"],
        properties: {
          model: {
            type: "string",
            description: "Model ID to use for completion",
            example: "llama-3-2-3b-q4-k-m"
          },
          messages: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ChatMessage"
            },
            description: "Conversation messages"
          },
          temperature: {
            type: "number",
            minimum: 0,
            maximum: 2,
            default: 0.7,
            description: "Sampling temperature"
          },
          max_tokens: {
            type: "integer",
            minimum: 1,
            default: 2048,
            description: "Maximum tokens to generate"
          },
          stream: {
            type: "boolean",
            default: false,
            description: "Enable streaming response via SSE"
          },
          top_p: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Nucleus sampling probability"
          },
          stop: {
            type: "array",
            items: { type: "string" },
            description: "Stop sequences"
          }
        }
      },
      ChatMessage: {
        type: "object",
        required: ["role", "content"],
        properties: {
          role: {
            type: "string",
            enum: ["system", "user", "assistant"],
            description: "Message role"
          },
          content: {
            type: "string",
            description: "Message content"
          }
        }
      },
      ChatCompletionResponse: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Completion ID"
          },
          object: {
            type: "string",
            example: "chat.completion"
          },
          created: {
            type: "integer",
            description: "Unix timestamp"
          },
          model: {
            type: "string",
            description: "Model used"
          },
          choices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                message: { $ref: "#/components/schemas/ChatMessage" },
                finish_reason: {
                  type: "string",
                  enum: ["stop", "length", "error"]
                }
              }
            }
          },
          usage: {
            type: "object",
            properties: {
              prompt_tokens: { type: "integer" },
              completion_tokens: { type: "integer" },
              total_tokens: { type: "integer" }
            }
          }
        }
      },
      ModelInfo: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Model ID"
          },
          object: {
            type: "string",
            example: "model"
          },
          name: {
            type: "string",
            description: "Display name"
          },
          filename: {
            type: "string",
            description: "GGUF filename"
          },
          filepath: {
            type: "string",
            description: "Full path to model file"
          },
          contextLength: {
            type: "integer",
            description: "Context window size"
          },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "Model capabilities (chat, completion, etc.)"
          },
          status: {
            type: "string",
            enum: ["available", "loading", "loaded", "error"],
            description: "Current status"
          },
          loaded: {
            type: "boolean",
            description: "Whether model is loaded in memory"
          },
          memoryUsageMB: {
            type: "integer",
            description: "Estimated memory usage in MB"
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "File creation timestamp"
          },
          lastUsed: {
            type: "string",
            format: "date-time",
            description: "Last inference timestamp"
          }
        }
      },
      ModelListResponse: {
        type: "object",
        properties: {
          object: {
            type: "string",
            example: "list"
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ModelInfo"
            }
          }
        }
      },
      ExecuteRequest: {
        type: "object",
        required: ["provider", "operation", "params"],
        properties: {
          provider: {
            type: "string",
            enum: ["symbia-labs", "local"],
            description: "Provider name"
          },
          operation: {
            type: "string",
            enum: ["chat.completions", "completions"],
            description: "Operation to execute"
          },
          params: {
            type: "object",
            description: "Operation parameters",
            properties: {
              model: { type: "string" },
              messages: {
                type: "array",
                items: { $ref: "#/components/schemas/ChatMessage" }
              },
              temperature: { type: "number" },
              maxTokens: { type: "integer" }
            }
          }
        }
      },
      ExecuteResponse: {
        type: "object",
        properties: {
          provider: { type: "string" },
          model: { type: "string" },
          content: { type: "string" },
          usage: {
            type: "object",
            properties: {
              promptTokens: { type: "integer" },
              completionTokens: { type: "integer" },
              totalTokens: { type: "integer" }
            }
          },
          finishReason: {
            type: "string",
            enum: ["stop", "length", "error"]
          },
          metadata: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      StatsResponse: {
        type: "object",
        properties: {
          loadedModels: {
            type: "integer",
            description: "Number of models currently loaded"
          },
          memoryUsageMB: {
            type: "integer",
            description: "Total memory used by loaded models"
          },
          totalRequests: {
            type: "integer",
            description: "Total inference requests processed"
          }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              message: { type: "string" },
              type: { type: "string" },
              code: { type: "string", nullable: true }
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: "OpenAI Compatible",
      description: "OpenAI-compatible endpoints for drop-in replacement"
    },
    {
      name: "Model Management",
      description: "Endpoints for managing model lifecycle"
    },
    {
      name: "Symbia Integration",
      description: "Symbia platform integration endpoints"
    },
    {
      name: "Stats",
      description: "Service statistics and metrics"
    },
    {
      name: "Health",
      description: "Health check endpoints"
    }
  ]
};

// ../../models/server/src/routes.ts
async function registerRoutes(httpServer, app) {
  app.get("/docs/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.post("/v1/chat/completions", handleChatCompletions);
  app.get("/v1/models", handleListModels);
  app.get("/v1/models/:id", handleGetModel);
  app.post("/api/integrations/execute", requireAuth, handleExecute);
  app.get("/api/models", handleListModels);
  app.post("/api/models/pull", requireAuth, handlePullModel);
  app.get("/api/vision/status", (_req, res) => {
    const missing = visionReadiness();
    res.json({ ready: missing.length === 0, missing });
  });
  app.post("/api/vision/classify", async (req, res) => {
    const { imageBase64, prompt, source } = req.body ?? {};
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    res.json(await classifyImage({ imageBase64, prompt, source }));
  });
  app.get("/api/models/:id", handleGetModel);
  app.post("/api/models/:id/load", requireAuth, handleLoadModel);
  app.post("/api/models/:id/unload", requireAuth, handleUnloadModel);
  app.get("/api/stats", (req, res) => {
    res.json({
      loadedModels: 0,
      memoryUsageMB: 0,
      totalRequests: 0
    });
  });
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    console.error(`[models] Error: ${err.message}`);
    res.status(status).json({
      error: {
        message: err.message || "Internal server error",
        type: err.type || "internal_error",
        code: err.code || null
      }
    });
  });
}
export {
  registerRoutes
};
