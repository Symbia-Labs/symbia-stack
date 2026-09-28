import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  ServiceId,
  resolveServiceUrl
} from "./chunk-B6I54FM5.mjs";
import {
  __export
} from "./chunk-JCYRGLK6.mjs";

// build/plugin/symbia-imagine/vendor/symbia-models-client/dist/client.js
var DEFAULT_TIMEOUT = 45e3;
var ModelsClient = class {
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
      ...options?.headers
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
        body: body !== void 0 ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 204) {
        return void 0;
      }
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const message = errBody?.error && typeof errBody.error === "object" ? errBody.error?.message : errBody.error ?? response.statusText;
        const error = new Error(`Models service error (${response.status}): ${message}`);
        this.onError?.(error);
        throw error;
      }
      return await response.json();
    } catch (error) {
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
    return this.request("GET", "/v1/models", void 0, options);
  }
  async getModel(id, options) {
    return this.request("GET", `/v1/models/${encodeURIComponent(id)}`, void 0, options);
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
      return model;
    const qualified = `${provider}/${model}`;
    const fetchIds = async () => {
      try {
        const body = await this.listModels(options);
        const ids2 = new Set((body.data ?? []).map((m) => m?.id).filter(Boolean));
        this.registryIdsCache = { at: Date.now(), ids: ids2 };
        return ids2;
      } catch {
        return this.registryIdsCache?.ids ?? /* @__PURE__ */ new Set();
      }
    };
    let ids = this.registryIdsCache && Date.now() - this.registryIdsCache.at < 6e4 ? this.registryIdsCache.ids : await fetchIds();
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
    return this.request("POST", `/api/models/${encodeURIComponent(id)}/load`, void 0, options);
  }
  async unloadModel(id, options) {
    return this.request("POST", `/api/models/${encodeURIComponent(id)}/unload`, void 0, options);
  }
  // ---------------------------------------------------------------------
  // Vision
  // ---------------------------------------------------------------------
  async visionStatus(options) {
    return this.request("GET", "/api/vision/status", void 0, options);
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
    return this.request("GET", "/api/stats", void 0, options);
  }
  /** Generic provider-execute passthrough (requires auth). */
  async execute(body, options) {
    return this.request("POST", "/api/integrations/execute", body, options);
  }
};
function createModelsClient(config) {
  return new ModelsClient(config);
}

// build/plugin/symbia-imagine/vendor/symbia-redact/dist/outbound.js
var outbound_exports = {};
__export(outbound_exports, {
  REDACTED: () => REDACTED,
  VALUE_PATTERNS: () => VALUE_PATTERNS,
  redactOutbound: () => redactOutbound,
  scan: () => scan
});
var SENSITIVE_KEYS = [
  "api[_-]?key",
  "secret",
  "token",
  "password",
  "passwd",
  "credential",
  "authorization",
  "auth",
  "private[_-]?key",
  "client[_-]?secret",
  "stream[_-]?key",
  "refresh[_-]?token",
  "access[_-]?token",
  "bearer"
];
var VALUE_PATTERNS = [
  ["bearer", /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/gi],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g],
  ["aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{16,}/g],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{16,}/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["google-key", /\bAIza[0-9A-Za-z_-]{30,}/g],
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  // TWITCH STREAM KEY. Absent from the Python rule set, which was measured on
  // 24 Aug against four shapes of a real key and fired on none of them — the
  // one credential guaranteed to be on a streamer's machine was the one the
  // gate could not see. Recorded as F41.
  ["twitch-stream-key", /\blive_\d{6,}_[A-Za-z0-9]{20,}/g],
  // An RTMP ingest URL carries the key in its path, where no key=value rule
  // reaches it. Measured again on 25 Aug from the other direction: ffmpeg
  // printed exactly this shape to stderr when it could not open the output.
  ["rtmp-ingest-url", /\brtmps?:\/\/[^\s/]+\/[^\s/]+\/[A-Za-z0-9_-]{16,}/g],
  ["email", /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g],
  // `key: value` / `key=value` where the key is sensitive. Takes the value to
  // the end of the token run, which over-matches rather than under-matches.
  ["labelled-secret", new RegExp(`\\b(?:${SENSITIVE_KEYS.join("|")})\\b\\s*[:=]\\s*\\S+`, "gi")]
];
var REDACTED = "[REDACTED]";
function scan(text) {
  if (!text)
    return [];
  return VALUE_PATTERNS.filter(([, rx]) => {
    rx.lastIndex = 0;
    return rx.test(text);
  }).map(([name]) => name);
}
function redactOutbound(text) {
  if (!text)
    return { text, fired: [], clean: true };
  const fired = [];
  let out = text;
  for (const [name, rx] of VALUE_PATTERNS) {
    rx.lastIndex = 0;
    if (!rx.test(out))
      continue;
    fired.push(name);
    rx.lastIndex = 0;
    out = out.replace(rx, REDACTED);
  }
  return { text: out, fired, clean: fired.length === 0 };
}

export {
  createModelsClient,
  outbound_exports
};
