// ../../runtime/server/src/service.ts
import { createTelemetryClient } from "@symbia/logging-client";

// ../../runtime/server/src/config.ts
import dotenv from "dotenv";
import { resolveServicePort, resolveServiceUrl, ServiceId } from "@symbia/sys";
dotenv.config();
var config = {
  port: resolveServicePort(ServiceId.RUNTIME),
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.RUNTIME,
  serviceName: process.env.SERVICE_NAME || "Symbia Runtime",
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "*").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean),
  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  // Runtime-specific configuration
  runtime: {
    // Maximum concurrent graph executions
    maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || "100", 10),
    // Default execution timeout (ms)
    defaultExecutionTimeout: parseInt(process.env.DEFAULT_EXECUTION_TIMEOUT || "300000", 10),
    // Maximum messages in backpressure queue per port
    maxBackpressureQueue: parseInt(process.env.MAX_BACKPRESSURE_QUEUE || "10000", 10),
    // Isolate pool size for V8 instances
    isolatePoolSize: parseInt(process.env.ISOLATE_POOL_SIZE || "10", 10),
    // Enable metrics collection
    enableMetrics: process.env.ENABLE_METRICS !== "false",
    // How hard to enforce that a graph node's component has a registered
    // catalog manifest: strict (refuse to load) | warn (log and load) | off.
    // Strict is the default deliberately — a gate that can be skipped by
    // default is not a gate.
    manifestEnforcement: process.env.RUNTIME_MANIFEST_ENFORCEMENT || "strict"
  },
  // Catalog -> runtime edge (roadmap Phase 1). The catalog is the source of
  // truth for components and graphs; the runtime is the handler.
  catalog: {
    // Publish this runtime's component manifests to the catalog on boot.
    registerManifests: process.env.RUNTIME_REGISTER_MANIFESTS !== "false",
    // Load published graph resources from the catalog on boot.
    hydrateGraphs: process.env.RUNTIME_HYDRATE_GRAPHS !== "false",
    // Auto-execute hydrated graphs declaring a pipeline/service role with an
    // ingress. This is what removes the "someone must stand the execution up"
    // concession.
    autoExecute: process.env.RUNTIME_AUTO_EXECUTE !== "false",
    // Reconciliation poll interval (ms). 0 disables the loop (boot-only sync).
    // Polling is the interim; the roadmap's end state drives this off Network
    // service events.
    reconcileIntervalMs: parseInt(process.env.RUNTIME_RECONCILE_INTERVAL_MS || "30000", 10),
    // Fail service startup if the boot-time catalog sync fails. Off by default
    // so a catalog outage degrades the runtime rather than removing it — but
    // strict manifest enforcement still refuses to load graphs, so the
    // degradation is loud, not silent.
    failFast: process.env.RUNTIME_CATALOG_FAIL_FAST === "true",
    // Register each hydrated graph's ingress as a catalog resource, so a
    // delivery surface is declared and discoverable rather than implicit.
    registerIngress: process.env.RUNTIME_REGISTER_INGRESS !== "false"
  },
  // Ingress authorization (roadmap Phase 2). strict = enforce the declared
  // gate, warn = log what would be refused and allow, off = authenticate only.
  // Strict by default: authentication is not authorization, and an ingress
  // that any logged-in principal can post to is not a gated capability.
  ingressEnforcement: process.env.RUNTIME_INGRESS_ENFORCEMENT || "strict"
};

// ../../runtime/server/src/executor/preview.ts
function preview(value, max = 200) {
  let text;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = "[unserialisable]";
  }
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}

// ../../runtime/server/src/executor/components.ts
import { createHash } from "node:crypto";
import { safeFetch } from "@symbia/egress";
var registry = /* @__PURE__ */ new Map();
function registerComponent(def) {
  registry.set(def.id, def);
}
function getComponent(id) {
  return registry.get(id);
}
function listComponents() {
  return Array.from(registry.values()).map(({ handler: _h, ...rest }) => rest);
}
function normaliseEmission(emitted, incoming, component) {
  const legacyForce = component === true;
  const def = typeof component === "object" ? component : void 0;
  const force = legacyForce || def?.emitsApocryphal === true;
  const out = {};
  for (const [port, raw] of Object.entries(emitted ?? {})) {
    const isFlow = raw && typeof raw === "object" && "value" in raw && "lane" in raw;
    const candidate = isFlow ? raw : { value: raw, lane: incoming.lane };
    const decl = def?.lanes?.[port];
    let lane = incoming.lane === "apocryphal" || force || candidate.lane === "apocryphal" ? "apocryphal" : "canonical";
    let laneReason;
    if (incoming.lane === "apocryphal") {
      laneReason = "the input arrived apocryphal; lanes only tighten";
    } else if (force) {
      laneReason = `${def?.id ?? "this component"} declares that it cannot emit a recomputable value`;
    }
    if (decl?.lane === "apocryphal" && lane === "canonical") {
      lane = "apocryphal";
      laneReason = decl.note ?? `port "${port}" is declared apocryphal in the manifest`;
    }
    const wants = decl?.lane === "canonical" ? decl.receipt ?? "recipe" : decl?.receipt;
    if (lane === "canonical" && wants && wants !== "none" && !candidate.receipt) {
      lane = "apocryphal";
      laneReason = `port "${port}" is declared canonical and requires a ${wants} receipt; none was emitted, so the value is not verifiable by recomputation`;
    }
    out[port] = {
      value: candidate.value,
      lane,
      ...candidate.receipt ? { receipt: candidate.receipt } : {},
      ...laneReason && lane !== candidate.lane ? { laneReason } : {}
    };
  }
  return out;
}
registerComponent({
  id: "symbia.io.passthrough",
  name: "Passthrough",
  description: "Emits its input unchanged. Graph entry point.",
  inputs: ["in"],
  outputs: ["out"],
  config: {},
  lanes: { out: { lane: "inherit" } },
  handler: (input) => ({ out: input })
});
registerComponent({
  id: "symbia.io.collect",
  name: "Collect",
  description: "Terminal node. Collects results for the execution output.",
  inputs: ["in"],
  outputs: ["out"],
  config: {},
  lanes: { out: { lane: "inherit" } },
  handler: (input) => ({ out: input })
});
registerComponent({
  id: "symbia.io.log",
  name: "Log",
  description: "Writes the value to the execution log and passes it through.",
  inputs: ["in"],
  outputs: ["out"],
  config: {},
  lanes: { out: { lane: "inherit" } },
  handler: (input, ctx) => {
    ctx.log(`[${ctx.nodeId}] ${preview(input.value, 200)}`);
    return { out: input };
  }
});
registerComponent({
  id: "symbia.transform.map",
  name: "Map Fields",
  description: 'Reshapes an object using config.mapping \u2014 {newKey: "sourceKey"}. Deterministic.',
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    mapping: {
      type: "object",
      required: false,
      default: {},
      description: 'Output field to source field, {newKey: "sourceKey"}. Empty mapping passes the object through unchanged.'
    }
  },
  lanes: {
    out: { lane: "inherit" },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: (input, ctx) => {
    const mapping = ctx.config.mapping ?? {};
    const src = input.value;
    if (typeof src !== "object" || src === null) {
      return { error: { value: { error: "map expects an object" }, lane: "apocryphal" } };
    }
    const out = {};
    for (const [to, from] of Object.entries(mapping)) out[to] = src[from];
    return { out: Object.keys(mapping).length ? out : src };
  }
});
registerComponent({
  id: "symbia.logic.filter",
  name: "Filter",
  description: "Routes on a predicate: config.field / config.op (eq,neq,gt,lt,contains,exists) / config.value.",
  inputs: ["in"],
  outputs: ["pass", "fail"],
  config: {
    field: {
      type: "string",
      required: false,
      description: "Field to test. Omitted, the whole message value is tested."
    },
    op: {
      type: "string",
      required: false,
      default: "exists",
      enum: ["eq", "neq", "gt", "lt", "contains", "exists"],
      description: 'Comparison. Any unrecognised value falls through to "exists".'
    },
    value: {
      type: "string",
      required: false,
      description: 'Value compared against. Unused by "exists".'
    }
  },
  lanes: { pass: { lane: "inherit" }, fail: { lane: "inherit" } },
  handler: (input, ctx) => {
    const { field: field3, op = "exists", value } = ctx.config;
    const src = input.value;
    const actual = field3 ? src?.[field3] : src;
    let ok = false;
    switch (op) {
      case "eq":
        ok = actual === value;
        break;
      case "neq":
        ok = actual !== value;
        break;
      case "gt":
        ok = Number(actual) > Number(value);
        break;
      case "lt":
        ok = Number(actual) < Number(value);
        break;
      case "contains":
        ok = String(actual ?? "").includes(String(value));
        break;
      default:
        ok = actual !== void 0 && actual !== null;
    }
    return ok ? { pass: input } : { fail: input };
  }
});
registerComponent({
  id: "symbia.logic.switch",
  name: "Switch",
  description: `Emits on the port named by config.field's value, if that port is listed in config.ports; otherwise "default".`,
  inputs: ["in"],
  outputs: ["default"],
  config: {
    field: {
      type: "string",
      required: false,
      default: "type",
      description: "Field whose value names the output port."
    },
    ports: {
      type: "array",
      required: false,
      default: [],
      description: 'Port names this switch may emit on. A value not listed here goes to "default" \u2014 the allowlist is what stops a message inventing a port.'
    }
  },
  lanes: { default: { lane: "inherit" } },
  handler: (input, ctx) => {
    const { field: field3 = "type", ports = [] } = ctx.config;
    const src = input.value;
    const key = String(src?.[field3] ?? "");
    return ports.includes(key) ? { [key]: input } : { default: input };
  }
});
registerComponent({
  id: "symbia.compute.arithmetic",
  name: "Arithmetic",
  description: "Exact arithmetic over config.expression with {placeholders} from the message. Canonical: recomputable.",
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    expression: {
      type: "string",
      required: true,
      description: (
        // No domain vocabulary in a public contract. The first version of this
        // read `e.g. "{facility}/{it}"`, which is a data centre's language in
        // the manifest of a component that does arithmetic — the exact defect
        // the 6 Aug audit removed from symbia.state.join, reintroduced here on
        // 8 Aug and published to the catalog before anyone read it.
        'Arithmetic over {placeholders} resolved from fields of the incoming message, e.g. "({a} - {b}) / {a}". Only digits, whitespace and + - * / ( ) survive the guard.'
      )
    }
  },
  lanes: {
    out: {
      lane: "canonical",
      receipt: "recipe",
      note: "recomputable from the expression and its inputs, which the receipt carries"
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: (input, ctx) => {
    const expr = String(ctx.config.expression ?? "");
    const src = input.value ?? {};
    const referenced = [...expr.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const missing = referenced.filter((k) => src[k] === void 0 || src[k] === null);
    if (missing.length > 0) {
      return {
        error: {
          value: {
            error: "expression refused: inputs absent",
            missing,
            present: referenced.filter((k) => !missing.includes(k)),
            expression: expr
          },
          lane: "apocryphal"
        }
      };
    }
    const filled = expr.replace(/\{(\w+)\}/g, (_m, k) => String(Number(src[k])));
    if (!/^[\d\s+\-*/().]+$/.test(filled)) {
      return {
        error: {
          value: {
            error: "expression refused: non-arithmetic characters",
            expression: filled,
            afterSubstitution: filled !== expr ? `substituted from "${expr}"` : "no placeholders were substituted",
            accepts: 'Digits, whitespace and + - * / ( ) only, AFTER {placeholder} substitution. Reference message fields as {name}, e.g. "{pages} / {hoursAvailable}". Property paths like value.pages are not resolved and survive as letters, which is what this refusal is reporting.'
          },
          lane: "apocryphal"
        }
      };
    }
    try {
      const result = Function(`"use strict";return (${filled})`)();
      if (!Number.isFinite(result)) {
        return {
          error: {
            value: {
              error: "expression refused: result is not finite",
              result: String(result),
              expression: filled
            },
            lane: "apocryphal"
          }
        };
      }
      return {
        out: {
          value: { result, method: "arithmetic", expression: filled, exact: true },
          lane: "canonical",
          receipt: {
            kind: "recipe",
            source: "symbia.compute.arithmetic",
            recipe: {
              operation: expr,
              inputs: Object.fromEntries(referenced.map((k) => [k, src[k]]))
            }
          }
        }
      };
    } catch (e) {
      return {
        error: { value: { error: e.message }, lane: "apocryphal" }
      };
    }
  }
});
registerComponent({
  id: "symbia.io.http-request",
  name: "HTTP Request",
  description: "Fetches config.url. Output is apocryphal: a remote body cannot be recomputed from the graph.",
  inputs: ["in"],
  outputs: ["out", "error"],
  emitsApocryphal: true,
  config: {
    url: { type: "string", required: true, description: "Absolute URL to fetch." },
    method: {
      type: "string",
      required: false,
      default: "GET",
      description: "HTTP method."
    }
  },
  lanes: {
    out: {
      lane: "apocryphal",
      receipt: "witness",
      note: "a remote body cannot be recomputed from the graph; the witness records which bytes arrived, from where"
    },
    error: { lane: "apocryphal" }
  },
  handler: async (_input, ctx) => {
    const url = String(ctx.config.url ?? "");
    const method = String(ctx.config.method ?? "GET");
    if (!url) return { error: { value: { error: "no url configured" }, lane: "apocryphal" } };
    try {
      const res = await safeFetch(url, { method, signal: AbortSignal.timeout(1e4) });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
      }
      return {
        out: {
          value: { status: res.status, body },
          lane: "apocryphal",
          receipt: {
            kind: "witness",
            source: url,
            witness: {
              algorithm: "sha256",
              digest: createHash("sha256").update(text).digest("hex"),
              bytes: Buffer.byteLength(text),
              transport: `${method} ${res.status}`
            }
          }
        }
      };
    } catch (e) {
      return { error: { value: { error: e.message }, lane: "apocryphal" } };
    }
  }
});
registerComponent({
  id: "symbia.io.delay",
  name: "Delay",
  description: "Waits config.ms milliseconds, then passes through.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    ms: {
      type: "number",
      required: false,
      default: 100,
      description: "Milliseconds to wait. Capped at 5000 by the handler."
    }
  },
  lanes: { out: { lane: "inherit" } },
  handler: async (input, ctx) => {
    const ms = Math.min(Number(ctx.config.ms ?? 100), 5e3);
    await new Promise((r) => setTimeout(r, ms));
    return { out: input };
  }
});

// ../../runtime/server/src/executor/components-sinks.ts
function field(obj, name) {
  return obj && typeof obj === "object" ? obj[name] : void 0;
}
function registerSinkComponents(deps) {
  registerComponent({
    id: "symbia.sink.metric",
    name: "Metric Sink",
    description: 'Writes a numeric data point to the Logging metrics service, attributed to the org that owns the graph. config.name is the metric name (a gauge series is resolved or created on first use); config.valueField (default "value") locates the number in the message \u2014 dotted paths supported (e.g. "out.result"); config.labels attaches labels. Passes the input through on "out"; non-numeric values and failed writes exit on "error".',
    inputs: ["in"],
    outputs: ["out", "error"],
    config: {
      name: {
        type: "string",
        required: true,
        description: "Metric name. A gauge series is resolved or created on first use."
      },
      valueField: {
        type: "string",
        required: false,
        default: "value",
        description: 'Locates the number in the message. Dotted paths supported, e.g. "out.result".'
      },
      labels: {
        type: "object",
        required: false,
        default: {},
        description: "Labels attached to the data point."
      }
    },
    lanes: {
      out: { lane: "inherit" },
      error: {
        lane: "apocryphal",
        note: "a write that failed, or a value that was not numeric \u2014 in neither case did the series receive what the graph computed"
      }
    },
    handler: (input, ctx) => {
      const name = String(ctx.config.name ?? "");
      if (!name) return { error: { error: "config.name is required" } };
      const path2 = String(ctx.config.valueField ?? "value").split(".");
      let v = input.value;
      for (const p of path2) v = field(v, p);
      const num = Number(v);
      if (!Number.isFinite(num)) {
        return { error: { error: `valueField "${path2.join(".")}" is not numeric`, got: v } };
      }
      const accepted = deps.metric(
        name,
        num,
        ctx.config.labels ?? {},
        ctx.orgId
      );
      if (!accepted) {
        return {
          error: { error: `metric write path is failing; "${name}" was not persisted`, value: num }
        };
      }
      ctx.log(`[metric] ${name} = ${num}${ctx.orgId ? ` (org ${ctx.orgId})` : ""}`);
      return { out: input };
    }
  });
  registerComponent({
    id: "symbia.sink.log",
    name: "Log Sink",
    description: 'Writes the message to the Logging service log stream (config.level, default "info"; config.message template prefix optional) and passes the input through on "out". Unlike symbia.io.log, which only writes to the execution trace, this persists to the platform log store.',
    inputs: ["in"],
    outputs: ["out", "error"],
    config: {
      level: {
        type: "string",
        required: false,
        default: "info",
        description: "Log level written to the platform log store."
      },
      message: {
        type: "string",
        required: false,
        description: "Optional prefix placed before the serialised message value."
      }
    },
    lanes: {
      out: { lane: "inherit" },
      error: { lane: "inherit" }
    },
    handler: (input, ctx) => {
      const level = String(ctx.config.level ?? "info");
      const prefix = ctx.config.message ? String(ctx.config.message) + " " : "";
      const ok = deps.log(
        level,
        `${prefix}${preview(input.value, 500)}`,
        // WHAT PRODUCED THIS ENTRY, BY REFERENCE.
        //
        // The entry carried `node` and `lane` and nothing else, so tying a
        // log line back to the run that wrote it rested on timestamp
        // adjacency — correlation, not reference. Found 16 Aug 2026 by
        // Brian verifying a hello-world graph end to end: every other link
        // in the chain was measured and this one had to be assumed.
        //
        // The component whose whole job is persisting evidence must not be
        // the one that drops the pointer back to its cause. Both ids are
        // already on the context; they were simply never passed.
        {
          node: ctx.nodeId,
          lane: input.lane,
          executionId: ctx.executionId,
          ...ctx.graphKey ? { graphKey: ctx.graphKey } : {}
        }
      );
      if (!ok) {
        return {
          error: {
            error: "log write path is failing; the message was not persisted",
            level
          }
        };
      }
      return { out: input };
    }
  });
}

// ../../runtime/server/src/executor/metric-writer.ts
import { fetchBootstrapConfig } from "@symbia/sys";
function normalizeEndpoint(raw) {
  const trimmed = raw.replace(/\/$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
var MetricWriter = class {
  endpoint;
  serviceId;
  env;
  maxBatch;
  onError;
  auth = null;
  /** metric id cache keyed `${orgId}:${name}`. */
  ids = /* @__PURE__ */ new Map();
  queue = [];
  timer;
  flushing = false;
  /** Set when a write fails, so callers can see the writer is unhealthy. */
  lastError = null;
  constructor(opts = {}) {
    this.endpoint = normalizeEndpoint(
      opts.endpoint ?? process.env.TELEMETRY_ENDPOINT ?? process.env.LOGGING_SERVICE_URL ?? "http://localhost:5002"
    );
    this.serviceId = opts.serviceId ?? process.env.SERVICE_ID ?? "runtime";
    this.env = opts.env ?? (process.env.NODE_ENV === "production" ? "production" : "dev");
    this.maxBatch = opts.maxBatch ?? 500;
    this.onError = opts.onError ?? ((m) => console.error(`[MetricWriter] ${m}`));
    const interval = opts.flushIntervalMs ?? 5e3;
    this.timer = setInterval(() => void this.flush(), interval);
    this.timer.unref?.();
  }
  getLastError() {
    return this.lastError;
  }
  /** Queue a point. Returns false if the writer is known to be failing. */
  write(point) {
    this.queue.push(point);
    if (this.queue.length >= this.maxBatch) void this.flush();
    return this.lastError === null;
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = void 0;
  }
  async ensureAuth() {
    if (this.auth) return this.auth;
    const cfg = await fetchBootstrapConfig();
    if (!cfg?.secret || !cfg?.orgId) {
      this.lastError = "identity bootstrap returned no system credential";
      this.onError(this.lastError);
      return null;
    }
    this.auth = { secret: cfg.secret, orgId: cfg.orgId, serviceId: cfg.serviceId ?? "system" };
    return this.auth;
  }
  headers(auth2, orgId) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth2.secret}`,
      "X-Org-Id": orgId,
      "X-Service-Id": this.serviceId,
      "X-Env": this.env,
      "X-Data-Class": "none",
      "X-Policy-Ref": "policy/default"
    };
  }
  /**
   * Resolve a series id for (org, name), reusing an existing series when one
   * exists. Creating blindly is what produced a new series per restart (D7).
   */
  async ensureMetricId(auth2, orgId, name) {
    const cacheKey = `${orgId}:${name}`;
    const cached = this.ids.get(cacheKey);
    if (cached) return cached;
    const headers = this.headers(auth2, orgId);
    try {
      const res = await fetch(`${this.endpoint}/metrics`, { headers });
      if (res.ok) {
        const body = await res.json();
        const list = Array.isArray(body) ? body : body?.metrics ?? [];
        const match = list.find(
          (m) => m.name === name && (!m.serviceId || m.serviceId === this.serviceId)
        );
        if (match?.id) {
          this.ids.set(cacheKey, match.id);
          return match.id;
        }
      }
    } catch {
    }
    try {
      const res = await fetch(`${this.endpoint}/metrics`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          metricType: "gauge",
          description: `Runtime graph metric ${name}`
        })
      });
      if (!res.ok) {
        this.lastError = `create series "${name}" -> ${res.status} ${(await res.text()).slice(0, 200)}`;
        this.onError(this.lastError);
        return null;
      }
      const created = await res.json();
      if (!created?.id) {
        this.lastError = `create series "${name}" returned no id`;
        this.onError(this.lastError);
        return null;
      }
      this.ids.set(cacheKey, created.id);
      return created.id;
    } catch (error) {
      this.lastError = `create series "${name}" failed: ${error.message}`;
      this.onError(this.lastError);
      return null;
    }
  }
  async flush() {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.maxBatch);
    try {
      const auth2 = await this.ensureAuth();
      if (!auth2) {
        return;
      }
      const grouped = /* @__PURE__ */ new Map();
      for (const p of batch) {
        const org = p.orgId || auth2.orgId;
        const key = `${org}\0${p.name}`;
        const list = grouped.get(key);
        if (list) list.push(p);
        else grouped.set(key, [p]);
      }
      for (const [key, points] of grouped) {
        const [orgId, name] = key.split("\0");
        const metricId = await this.ensureMetricId(auth2, orgId, name);
        if (!metricId) continue;
        const dataPoints = points.map((p) => ({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          value: p.value,
          labels: p.labels ?? {}
        }));
        const res = await fetch(`${this.endpoint}/metrics/ingest`, {
          method: "POST",
          headers: this.headers(auth2, orgId),
          body: JSON.stringify({ metricId, dataPoints })
        });
        if (!res.ok) {
          this.lastError = `ingest "${name}" -> ${res.status} ${(await res.text()).slice(0, 200)}`;
          this.onError(this.lastError);
          continue;
        }
        this.lastError = null;
      }
    } finally {
      this.flushing = false;
    }
  }
};

// ../../runtime/server/src/executor/state-store.ts
var StateStore = class {
  pool;
  durable;
  onError;
  /** cache keyed `${graphKey} ${nodeId}` */
  cache = /* @__PURE__ */ new Map();
  /** pending writes as `${graphKey} ${nodeId} ${stateKey}` */
  dirty = /* @__PURE__ */ new Set();
  /** graph keys whose persisted state has been loaded into cache */
  loaded = /* @__PURE__ */ new Set();
  orgs = /* @__PURE__ */ new Map();
  timer;
  flushing = false;
  lastError = null;
  constructor(opts) {
    this.pool = opts.pool;
    this.durable = opts.durable && Boolean(opts.pool);
    this.onError = opts.onError ?? ((m) => console.error(`[StateStore] ${m}`));
    if (this.durable) {
      this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs ?? 2e3);
      this.timer.unref?.();
    }
  }
  isDurable() {
    return this.durable;
  }
  getLastError() {
    return this.lastError;
  }
  cacheKey(graphKey, nodeId) {
    return `${graphKey}\0${nodeId}`;
  }
  /**
   * Load everything persisted for a graph into the cache. Called when an
   * execution for that graph starts, so the first message already sees prior
   * state rather than re-accumulating it.
   */
  async hydrateGraph(graphKey, orgId) {
    this.orgs.set(graphKey, orgId);
    if (!this.durable || !this.pool) return 0;
    if (this.loaded.has(graphKey)) return 0;
    try {
      const res = await this.pool.query(
        "SELECT node_id, state_key, value FROM operator_state WHERE graph_key = $1",
        [graphKey]
      );
      for (const row of res.rows) {
        const key = this.cacheKey(graphKey, row.node_id);
        let node = this.cache.get(key);
        if (!node) {
          node = /* @__PURE__ */ new Map();
          this.cache.set(key, node);
        }
        node.set(row.state_key, row.value);
      }
      this.loaded.add(graphKey);
      return res.rowCount ?? 0;
    } catch (error) {
      this.lastError = `hydrate "${graphKey}" failed: ${error.message}`;
      this.onError(this.lastError);
      return 0;
    }
  }
  get(graphKey, nodeId, stateKey) {
    return this.cache.get(this.cacheKey(graphKey, nodeId))?.get(stateKey);
  }
  set(graphKey, nodeId, stateKey, value) {
    const key = this.cacheKey(graphKey, nodeId);
    let node = this.cache.get(key);
    if (!node) {
      node = /* @__PURE__ */ new Map();
      this.cache.set(key, node);
    }
    node.set(stateKey, value);
    if (this.durable) this.dirty.add(`${graphKey}\0${nodeId}\0${stateKey}`);
  }
  /** All state for a node, for operators that scan (join, rollup). */
  entries(graphKey, nodeId) {
    const node = this.cache.get(this.cacheKey(graphKey, nodeId));
    return node ? Array.from(node.entries()) : [];
  }
  /**
   * Drop everything for a graph. Used when a graph is unloaded because it was
   * removed from the catalog — not on ordinary stop/restart, where the whole
   * point is that state outlives the execution.
   */
  async clearGraph(graphKey) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${graphKey}\0`)) this.cache.delete(key);
    }
    for (const key of Array.from(this.dirty)) {
      if (key.startsWith(`${graphKey}\0`)) this.dirty.delete(key);
    }
    this.loaded.delete(graphKey);
    if (!this.durable || !this.pool) return;
    try {
      await this.pool.query("DELETE FROM operator_state WHERE graph_key = $1", [graphKey]);
    } catch (error) {
      this.lastError = `clear "${graphKey}" failed: ${error.message}`;
      this.onError(this.lastError);
    }
  }
  async flush() {
    if (!this.durable || !this.pool || this.flushing || this.dirty.size === 0) return;
    this.flushing = true;
    const batch = Array.from(this.dirty);
    this.dirty.clear();
    try {
      for (const composite of batch) {
        const [graphKey, nodeId, stateKey] = composite.split("\0");
        const value = this.cache.get(this.cacheKey(graphKey, nodeId))?.get(stateKey);
        if (value === void 0) continue;
        await this.pool.query(
          `INSERT INTO operator_state (graph_key, node_id, state_key, value, org_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (graph_key, node_id, state_key)
           DO UPDATE SET value = EXCLUDED.value, org_id = EXCLUDED.org_id, updated_at = now()`,
          [graphKey, nodeId, stateKey, JSON.stringify(value), this.orgs.get(graphKey) ?? null]
        );
      }
      this.lastError = null;
    } catch (error) {
      for (const k of batch) this.dirty.add(k);
      this.lastError = `flush failed: ${error.message}`;
      this.onError(this.lastError);
    } finally {
      this.flushing = false;
    }
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = void 0;
    await this.flush();
  }
};
var active;
function setStateStore(store2) {
  active = store2;
}
function getStateStore() {
  if (!active) {
    active = new StateStore({ durable: false });
  }
  return active;
}

// ../../runtime/server/src/db.ts
import { initializeDatabase } from "@symbia/db";

// ../../runtime/server/src/memory-schema.ts
var MEMORY_SCHEMA_SQL = `
CREATE TABLE "graph_executions" (
  "id" varchar PRIMARY KEY,
  "graph_key" text NOT NULL,
  "graph_name" text NOT NULL,
  "org_id" varchar,
  "state" text NOT NULL,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" jsonb,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "graph_executions_graph_key_idx" ON "graph_executions" ("graph_key");
CREATE INDEX "graph_executions_state_idx" ON "graph_executions" ("state");

CREATE TABLE "operator_state" (
  "graph_key" text NOT NULL,
  "node_id" text NOT NULL,
  "state_key" text NOT NULL,
  "value" jsonb NOT NULL,
  "org_id" varchar,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("graph_key", "node_id", "state_key")
);

CREATE INDEX "operator_state_graph_key_idx" ON "operator_state" ("graph_key");
`;

// ../../runtime/server/src/db.ts
var database = initializeDatabase({
  serviceId: "runtime-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "RUNTIME_USE_MEMORY_DB"
});
var { db, pool, isMemory, close } = database;
var isDurable = !isMemory;

// ../../runtime/server/src/executor/components-state.ts
function stateFor(ctx) {
  const store2 = getStateStore();
  const graphKey = ctx.graphKey ?? "adhoc";
  const nodeId = ctx.nodeId;
  return {
    get: (key) => store2.get(graphKey, nodeId, key),
    set: (key, value) => store2.set(graphKey, nodeId, key, value),
    has: (key) => store2.get(graphKey, nodeId, key) !== void 0,
    entries: () => store2.entries(graphKey, nodeId)
  };
}
function field2(obj, name) {
  return obj && typeof obj === "object" ? obj[name] : void 0;
}
registerComponent({
  id: "symbia.state.latest",
  name: "Latest By Key",
  description: 'Remembers the most recent message per config.keyField (default "key") and passes the message through. The current snapshot {key: message} is available downstream via the "snapshot" port.',
  inputs: ["in"],
  outputs: ["out", "snapshot"],
  config: {
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Field locating the key in each message. A message without it is passed through and remembered under nothing."
    }
  },
  lanes: {
    out: { lane: "inherit" },
    snapshot: {
      lane: "conditional",
      note: "the snapshot is as canonical as the messages that built it; it carries no freshness guarantee and a key may be arbitrarily stale"
    }
  },
  handler: (input, ctx) => {
    const keyField = String(ctx.config.keyField ?? "key");
    const key = field2(input.value, keyField);
    const state = stateFor(ctx);
    if (key !== void 0) state.set(String(key), input.value);
    return { out: input, snapshot: Object.fromEntries(state.entries()) };
  }
});
registerComponent({
  id: "symbia.state.join",
  name: "Join Latest",
  description: (
    // D10 removed a data centre's electrical point names from this contract and
    // put a stock ticker in their place (9f6afcc). That satisfies "remove
    // energy's vocabulary" and not the rule it was serving, which is that a
    // platform contract carries no domain's vocabulary at all. Swapping one
    // domain for another is the same defect wearing different words.
    'Joins the latest values of selected keys from a keyed stream. config.select maps output fields to key values, e.g. {"x": "key.one", "y": "key.two"}; config.keyField (default "key") and config.valueField (default "value") locate key and value in each message. Emits the joined object on "out" once every selected key has been seen (then on every update); until then emits {have, need} on "pending".'
  ),
  inputs: ["in"],
  outputs: ["out", "pending"],
  config: {
    select: {
      type: "object",
      required: true,
      description: 'Output field to key value, e.g. {"x": "key.one"}. Keys of this object become the fields of the joined result; an empty select can never complete.'
    },
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Field locating the key in each message."
    },
    valueField: {
      type: "string",
      required: false,
      default: "value",
      description: "Field locating the value in each message."
    }
  },
  lanes: {
    out: { lane: "inherit" },
    pending: {
      lane: "apocryphal",
      note: "{have, need} is a statement about coverage, not a joined value \u2014 it must never be mistaken for the join"
    }
  },
  handler: (input, ctx) => {
    const select = ctx.config.select ?? {};
    const keyField = String(ctx.config.keyField ?? "key");
    const valueField = String(ctx.config.valueField ?? "value");
    const state = stateFor(ctx);
    const key = field2(input.value, keyField);
    const wantedFields = Object.entries(select).filter(([, k]) => k === key).map(([f]) => f);
    for (const f of wantedFields) state.set(f, field2(input.value, valueField));
    const need = Object.keys(select);
    const missing = need.filter((f) => !state.has(f));
    if (missing.length > 0) {
      return { pending: { have: need.length - missing.length, need: need.length } };
    }
    if (wantedFields.length === 0) {
      return {};
    }
    return { out: Object.fromEntries(need.map((f) => [f, state.get(f)])) };
  }
});
registerComponent({
  id: "symbia.state.window",
  name: "Rolling Window",
  description: 'Keeps the last config.size (default 60) numeric values of config.field (default "value") and emits {count, sum, mean, min, max, last} on every input.',
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    size: {
      type: "number",
      required: false,
      default: 60,
      description: "How many values the window keeps. Floored at 1."
    },
    field: {
      type: "string",
      required: false,
      default: "value",
      description: 'Field holding the numeric value. Non-numeric exits on "error".'
    }
  },
  lanes: {
    out: {
      lane: "conditional",
      note: 'the aggregate is only as canonical as the values that entered the window, and a window that has not filled reports over fewer values without saying so \u2014 read "count" against "size"'
    },
    error: { lane: "apocryphal" }
  },
  handler: (input, ctx) => {
    const size = Math.max(1, Number(ctx.config.size ?? 60));
    const f = String(ctx.config.field ?? "value");
    const v = Number(field2(input.value, f));
    if (!Number.isFinite(v)) {
      return { error: { error: `field "${f}" is not numeric`, got: field2(input.value, f) } };
    }
    const state = stateFor(ctx);
    const values = state.get("values") ?? [];
    values.push(v);
    if (values.length > size) values.splice(0, values.length - size);
    state.set("values", values);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      out: {
        count: values.length,
        sum,
        mean: sum / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        last: v
      }
    };
  }
});
registerComponent({
  id: "symbia.state.rollup",
  name: "Rollup Expected Set",
  description: 'Aggregates the latest values of an expected key set (config.expected: [keys], config.op: sum|mean|min|max, keyField (default "key") / valueField as in join). Emits {value, op, coverage, present, missing} on "out". A rollup with missing inputs is emitted on the apocryphal lane: a partial total must not pass as the total.',
  inputs: ["in"],
  outputs: ["out"],
  config: {
    expected: {
      type: "array",
      required: true,
      description: 'The key set that constitutes a complete rollup. This is what makes "missing" meaningful \u2014 without it, coverage is 1 by vacuous default and every partial total looks complete.'
    },
    op: {
      type: "string",
      required: false,
      default: "sum",
      enum: ["sum", "mean", "min", "max"],
      description: "Aggregation applied to the present values."
    },
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Field locating the key in each message."
    },
    valueField: {
      type: "string",
      required: false,
      default: "value",
      description: "Field locating the numeric value in each message."
    }
  },
  lanes: {
    out: {
      lane: "conditional",
      note: "canonical only when missing is empty; a rollup with any expected key absent is emitted apocryphal, because a partial total must not pass as the total"
    }
  },
  handler: (input, ctx) => {
    const expected = (ctx.config.expected ?? []).map(String);
    const op = String(ctx.config.op ?? "sum");
    const keyField = String(ctx.config.keyField ?? "key");
    const valueField = String(ctx.config.valueField ?? "value");
    const state = stateFor(ctx);
    const key = field2(input.value, keyField);
    if (key !== void 0 && expected.includes(String(key))) {
      const v = Number(field2(input.value, valueField));
      if (Number.isFinite(v)) state.set(String(key), v);
    }
    const present = expected.filter((k) => state.has(k));
    const missing = expected.filter((k) => !state.has(k));
    const values = present.map((k) => state.get(k));
    let value = null;
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      value = op === "mean" ? sum / values.length : op === "min" ? Math.min(...values) : op === "max" ? Math.max(...values) : sum;
    }
    const payload = {
      value,
      op,
      coverage: expected.length === 0 ? 1 : present.length / expected.length,
      present: present.length,
      missing
    };
    return missing.length > 0 ? { out: { value: payload, lane: "apocryphal" } } : { out: payload };
  }
});

// ../../runtime/server/src/executor/components-sources.ts
var TIMER_COMPONENT = "symbia.source.timer";
registerComponent({
  id: TIMER_COMPONENT,
  name: "Timer Source",
  description: `Emits {tick, offsetMs, t0} on "out" every config.intervalMs milliseconds (default 5000, min 100) while the execution is running. config.payload (object) is merged into each tick. t0 is one clock reading taken at execution start; offsetMs is the tick's position in the spine, not a reading of when it fired. Driven by the executor; injecting into a timer node manually also works, and emits apocryphal because an injected message has no position in any spine.`,
  inputs: ["in"],
  outputs: ["out"],
  config: {
    intervalMs: {
      type: "number",
      required: false,
      default: 5e3,
      description: "Milliseconds between ticks. Floored at 100 by the executor, which owns the interval."
    },
    payload: {
      type: "object",
      required: false,
      default: {},
      description: "Merged into each tick alongside {tick, ts}."
    }
  },
  lanes: {
    out: {
      lane: "canonical",
      receipt: "recipe",
      note: "a tick is its position in the spine \u2014 t0 + n\xB7intervalMs \u2014 recomputable from the anchor and the config, which the recipe carries. The anchor itself is one clock reading, taken once per execution, and it is the apocryphal part"
    }
  },
  handler: (input) => ({ out: input })
});

// ../../runtime/server/src/executor/graph-executor.ts
import { v4 as uuid } from "uuid";
import { EventEmitter } from "events";
var GraphExecutor = class extends EventEmitter {
  loadedGraphs = /* @__PURE__ */ new Map();
  executions = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  config;
  /** Start intervals for every timer-source node of a running execution. */
  startTimers(execution, graph) {
    const handles = [];
    for (const node of graph.definition.nodes) {
      if (node.component !== TIMER_COMPONENT) continue;
      const cfg = node.config ?? {};
      const intervalMs = Math.max(100, Number(cfg.intervalMs ?? 5e3));
      let tick = 0;
      const t0 = (/* @__PURE__ */ new Date()).toISOString();
      handles.push(setInterval(() => {
        const current = this.executions.get(execution.id);
        if (!current || current.state !== "running") return;
        tick += 1;
        const payload = {
          tick,
          // Offset from the anchor, not a reading. `setInterval` drifts, so
          // this is where the tick BELONGS in the spine, which is a different
          // and more defensible claim than when it happened to fire.
          offsetMs: tick * intervalMs,
          t0,
          ...cfg.payload ?? {}
        };
        void this.runFlow(current, graph, node.id, "in", {
          value: payload,
          lane: "canonical",
          receipt: {
            kind: "recipe",
            source: TIMER_COMPONENT,
            recipe: {
              operation: "t0 + n * intervalMs",
              inputs: { t0, intervalMs, n: tick }
            }
          }
        }).catch((err) => {
          console.error(`[GraphExecutor] timer flow failed (${node.id}):`, err);
        });
      }, intervalMs));
    }
    if (handles.length > 0) this.timers.set(execution.id, handles);
  }
  clearTimers(executionId) {
    for (const h of this.timers.get(executionId) ?? []) clearInterval(h);
    this.timers.delete(executionId);
  }
  constructor(executorConfig = {}) {
    super();
    this.config = {
      maxConcurrentExecutions: executorConfig.maxConcurrentExecutions ?? config.runtime.maxConcurrentExecutions,
      defaultTimeout: executorConfig.defaultTimeout ?? config.runtime.defaultExecutionTimeout,
      maxBackpressureQueue: executorConfig.maxBackpressureQueue ?? config.runtime.maxBackpressureQueue,
      enableMetrics: executorConfig.enableMetrics ?? config.runtime.enableMetrics,
      manifestResolver: executorConfig.manifestResolver ?? (() => void 0),
      manifestEnforcement: executorConfig.manifestEnforcement ?? config.runtime.manifestEnforcement
    };
  }
  /**
   * Load a graph definition
   */
  async loadGraph(definition, opts = {}) {
    const graphId = uuid();
    this.validateGraph(definition);
    const topology = this.buildTopology(definition);
    const loadedGraph = {
      id: graphId,
      definition,
      topology,
      loadedAt: /* @__PURE__ */ new Date(),
      orgId: opts.orgId,
      key: opts.key ?? definition.name
    };
    this.loadedGraphs.set(graphId, loadedGraph);
    console.log(`[GraphExecutor] Loaded graph: ${definition.name} (${graphId})`);
    return loadedGraph;
  }
  /**
   * Unload a graph
   */
  async unloadGraph(graphId) {
    for (const execution of this.executions.values()) {
      if (execution.graphId === graphId) {
        await this.stopExecution(execution.id);
      }
    }
    this.loadedGraphs.delete(graphId);
    console.log(`[GraphExecutor] Unloaded graph: ${graphId}`);
  }
  /**
   * Get a loaded graph
   */
  getGraph(graphId) {
    return this.loadedGraphs.get(graphId);
  }
  /**
   * Get all loaded graphs
   */
  getAllGraphs() {
    return Array.from(this.loadedGraphs.values());
  }
  /**
   * Run one message through the graph from a starting node.
   *
   * The execution model the stub was pending. Semantics ported from the
   * reference implementation in symbia-workbench (graph.py), which has been
   * running this same schema against real traffic:
   *
   *   - a component returns {port: value}; ONLY emitted ports fire their
   *     outgoing edges, which is what makes branching real
   *   - nodes are visited in topological order, so a node sees every input
   *     that can reach it before it runs
   *   - every value carries a lane, and lanes only tighten (see components.ts)
   *   - terminal emissions (no outgoing edge for that port) become outputs
   *
   * Returns the collected outputs and a per-hop trace.
   */
  async runFlow(execution, graph, startNodeId, startPort, seed) {
    const def = graph.definition;
    const nodeById = new Map(def.nodes.map((n) => [n.id, n]));
    const edgesFrom = /* @__PURE__ */ new Map();
    for (const e of def.edges) {
      const key = `${e.source.node}:${e.source.port}`;
      if (!edgesFrom.has(key)) edgesFrom.set(key, []);
      edgesFrom.get(key).push(e);
    }
    const inbox = /* @__PURE__ */ new Map();
    inbox.set(startNodeId, [{ port: startPort, msg: seed }]);
    const outputs = {};
    const trace = [];
    const order = graph.topology.sorted;
    const startIdx = Math.max(0, order.indexOf(startNodeId));
    for (const nodeId of order.slice(startIdx)) {
      const pending = inbox.get(nodeId);
      if (!pending || pending.length === 0) continue;
      const node = nodeById.get(nodeId);
      const component = node.component ? getComponent(node.component) : void 0;
      for (const { msg } of pending) {
        const t0 = Date.now();
        execution.metrics.messagesProcessed++;
        execution.metrics.nodeInvocations++;
        let emitted;
        try {
          if (!component) {
            throw new Error(
              `component not registered: ${node.component ?? "(none)"}`
            );
          }
          execution.metrics.componentInvocations++;
          const raw = await component.handler(msg, {
            nodeId,
            executionId: execution.id,
            orgId: graph.orgId,
            graphKey: graph.key,
            config: node.config ?? {},
            log: (m) => trace.push({ node: nodeId, port: "log", lane: msg.lane, ms: 0, summary: m })
          });
          emitted = normaliseEmission(raw, msg, component);
        } catch (err) {
          execution.metrics.errorCount++;
          emitted = {
            error: { value: { error: err.message }, lane: "apocryphal" }
          };
        }
        const ms = Date.now() - t0;
        execution.metrics.totalLatencyMs += ms;
        execution.metrics.maxLatencyMs = Math.max(execution.metrics.maxLatencyMs, ms);
        const inst = execution.instances.get(nodeId);
        if (inst) {
          inst.metrics.invocations++;
          inst.metrics.totalLatencyMs += ms;
          inst.metrics.avgLatencyMs = inst.metrics.totalLatencyMs / inst.metrics.invocations;
        }
        for (const [port, outMsg] of Object.entries(emitted)) {
          trace.push({
            node: nodeId,
            port,
            lane: outMsg.lane,
            ms,
            summary: preview(outMsg.value, 160),
            ...outMsg.receipt ? { receipt: outMsg.receipt.kind } : {},
            ...outMsg.laneReason ? { laneReason: outMsg.laneReason } : {}
          });
          const targets = edgesFrom.get(`${nodeId}:${port}`) ?? [];
          if (targets.length === 0) {
            outputs[`${nodeId}:${port}`] = outMsg;
            continue;
          }
          for (const edge of targets) {
            const list = inbox.get(edge.target.node) ?? [];
            list.push({ port: edge.target.port, msg: outMsg });
            inbox.set(edge.target.node, list);
            execution.metrics.messagesEmitted++;
            this.emit("port:emit", {
              id: uuid(),
              executionId: execution.id,
              sourceNodeId: nodeId,
              sourcePort: port,
              targetNodeId: edge.target.node,
              targetPort: edge.target.port,
              value: outMsg.value,
              timestamp: Date.now(),
              sequence: execution.metrics.messagesEmitted
            });
          }
        }
      }
      inbox.set(nodeId, []);
    }
    execution.metrics.avgLatencyMs = execution.metrics.nodeInvocations > 0 ? execution.metrics.totalLatencyMs / execution.metrics.nodeInvocations : 0;
    execution.metrics.lastActivityTime = Date.now();
    return { outputs, trace };
  }
  /**
   * Start executing a graph.
   */
  async startExecution(graphId) {
    const graph = this.loadedGraphs.get(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    if (this.executions.size >= this.config.maxConcurrentExecutions) {
      throw new Error(`Maximum concurrent executions reached: ${this.config.maxConcurrentExecutions}`);
    }
    const executionId = uuid();
    const instances = /* @__PURE__ */ new Map();
    for (const n of graph.definition.nodes) {
      instances.set(n.id, {
        id: n.id,
        componentId: n.component ?? "",
        state: "running",
        metrics: { invocations: 0, totalLatencyMs: 0, avgLatencyMs: 0, errorCount: 0 }
      });
    }
    const execution = {
      id: executionId,
      graphId,
      state: "running",
      instances,
      metrics: {
        messagesProcessed: 0,
        messagesEmitted: 0,
        nodeInvocations: 0,
        componentInvocations: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
        maxLatencyMs: 0,
        errorCount: 0,
        backpressureEvents: 0,
        startTime: Date.now(),
        lastActivityTime: Date.now()
      },
      startedAt: /* @__PURE__ */ new Date(),
      createdAt: /* @__PURE__ */ new Date()
    };
    this.executions.set(executionId, execution);
    const store2 = getStateStore();
    const restored = await store2.hydrateGraph(graph.key ?? graph.definition.name, graph.orgId);
    if (restored > 0) {
      console.log(
        `[GraphExecutor] restored ${restored} operator state entries for "${graph.definition.name}"`
      );
    }
    this.startTimers(execution, graph);
    this.emit("execution:started", execution);
    console.log(`[GraphExecutor] Started execution: ${executionId} (${graph.definition.nodes.length} nodes)`);
    return execution;
  }
  /**
   * Inject a message into an execution — and actually process it.
   *
   * Previously this logged "(NOTE: processing stubbed)" and dropped the
   * message while returning success. That shape is worse than an error:
   * callers cannot distinguish work done from work discarded.
   */
  async injectMessage(executionId, nodeId, port, value) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (execution.state !== "running") {
      throw new Error(`Execution not running: ${executionId} (state: ${execution.state})`);
    }
    const graph = this.loadedGraphs.get(execution.graphId);
    if (!graph) {
      throw new Error(`Graph not loaded: ${execution.graphId}`);
    }
    if (!graph.definition.nodes.some((n) => n.id === nodeId)) {
      throw new Error(`Node not in graph: ${nodeId}`);
    }
    const seed = { value, lane: "canonical" };
    const result = await this.runFlow(execution, graph, nodeId, port, seed);
    if (this.config.enableMetrics) {
      this.emit("metrics:update", executionId, execution.metrics);
    }
    console.log(
      `[GraphExecutor] ${executionId}: ${result.trace.length} hops, ${execution.metrics.nodeInvocations} invocations, ${Object.keys(result.outputs).length} output(s)`
    );
    return result;
  }
  /** Components available to graphs. */
  listComponents() {
    return listComponents();
  }
  /**
   * Pause execution
   */
  async pauseExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (execution.state !== "running") {
      throw new Error(`Cannot pause: execution not running (state: ${execution.state})`);
    }
    execution.state = "paused";
    this.emit("execution:paused", execution);
    console.log(`[GraphExecutor] Paused execution: ${executionId}`);
  }
  /**
   * Resume execution
   */
  async resumeExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (execution.state !== "paused") {
      throw new Error(`Cannot resume: execution not paused (state: ${execution.state})`);
    }
    execution.state = "running";
    this.emit("execution:resumed", execution);
    console.log(`[GraphExecutor] Resumed execution: ${executionId}`);
  }
  /**
   * Stop execution
   */
  async stopExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return;
    }
    execution.state = "cancelled";
    execution.completedAt = /* @__PURE__ */ new Date();
    this.clearTimers(executionId);
    void getStateStore().flush();
    this.emit("execution:completed", execution);
    console.log(`[GraphExecutor] Stopped execution: ${executionId}`);
  }
  /**
   * Get execution status
   */
  getExecution(executionId) {
    return this.executions.get(executionId);
  }
  /**
   * Get all executions
   */
  getAllExecutions() {
    return Array.from(this.executions.values());
  }
  /**
   * Get executor stats
   */
  getStats() {
    let totalMessagesProcessed = 0;
    for (const execution of this.executions.values()) {
      totalMessagesProcessed += execution.metrics.messagesProcessed;
    }
    return {
      loadedGraphs: this.loadedGraphs.size,
      activeExecutions: this.executions.size,
      totalMessagesProcessed
    };
  }
  // Private methods
  validateGraph(definition) {
    if (!definition.symbia) {
      throw new Error("Graph missing symbia version");
    }
    if (!definition.name) {
      throw new Error("Graph missing name");
    }
    if (!definition.nodes || !Array.isArray(definition.nodes)) {
      throw new Error("Graph missing nodes array");
    }
    if (!definition.edges || !Array.isArray(definition.edges)) {
      throw new Error("Graph missing edges array");
    }
    const nodeIds = /* @__PURE__ */ new Set();
    for (const node of definition.nodes) {
      if (!node.id) {
        throw new Error("Node missing id");
      }
      if (nodeIds.has(node.id)) {
        throw new Error(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);
    }
    for (const edge of definition.edges) {
      if (!nodeIds.has(edge.source.node)) {
        throw new Error(`Edge references unknown source node: ${edge.source.node}`);
      }
      if (!nodeIds.has(edge.target.node)) {
        throw new Error(`Edge references unknown target node: ${edge.target.node}`);
      }
    }
    this.resolveComponents(definition);
  }
  /**
   * Resolve every node's component against (a) the in-process implementation
   * registry and (b) the catalog's registered manifests.
   *
   * Both checks happen at LOAD time. Previously an unknown component was only
   * discovered when a message reached that node — a graph could sit "loaded"
   * and apparently healthy while containing a node that could never run. A
   * contract that is only checked on the happy path is not a contract.
   *
   * The manifest check is the Phase 1 edge: the catalog is the source of truth
   * for what a component *is*, and the runtime refuses to run a node whose
   * contract was never registered, even though the implementation happens to
   * be compiled into this very bundle.
   */
  resolveComponents(definition) {
    const missingImpl = [];
    for (const node of definition.nodes) {
      if (!node.component) {
        throw new Error(`Node "${node.id}" has no component`);
      }
      if (!getComponent(node.component)) {
        missingImpl.push(`${node.id} -> ${node.component}`);
      }
    }
    if (missingImpl.length > 0) {
      throw new Error(
        `Graph references components with no registered implementation: ${missingImpl.join(", ")}`
      );
    }
    const enforcement = this.config.manifestEnforcement;
    if (enforcement === "off") return;
    const manifested = this.config.manifestResolver();
    if (manifested === void 0) {
      const msg2 = "Component manifests unavailable (catalog not reached) \u2014 cannot verify graph components against the registry";
      if (enforcement === "strict") {
        throw new Error(
          `${msg2}. Set RUNTIME_MANIFEST_ENFORCEMENT=warn to load graphs against the in-process registry alone.`
        );
      }
      console.warn(`[GraphExecutor] ${msg2} (enforcement=warn, loading anyway)`);
      return;
    }
    const unmanifested = definition.nodes.filter((n) => !manifested.has(n.component)).map((n) => `${n.id} -> ${n.component}`);
    if (unmanifested.length === 0) return;
    const msg = `Graph references components with no registered catalog manifest: ${unmanifested.join(", ")}`;
    if (enforcement === "strict") throw new Error(msg);
    console.warn(`[GraphExecutor] ${msg} (enforcement=warn, loading anyway)`);
  }
  buildTopology(definition) {
    const nodeIds = definition.nodes.map((n) => n.id);
    const adjacency = /* @__PURE__ */ new Map();
    const inDegree = /* @__PURE__ */ new Map();
    for (const nodeId of nodeIds) {
      adjacency.set(nodeId, []);
      inDegree.set(nodeId, 0);
    }
    for (const edge of definition.edges) {
      adjacency.get(edge.source.node).push(edge.target.node);
      inDegree.set(edge.target.node, (inDegree.get(edge.target.node) || 0) + 1);
    }
    const sorted = [];
    const queue = [];
    const levels = /* @__PURE__ */ new Map();
    const inputNodes = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
        inputNodes.push(nodeId);
        levels.set(nodeId, 0);
      }
    }
    while (queue.length > 0) {
      const node = queue.shift();
      sorted.push(node);
      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
          levels.set(neighbor, (levels.get(node) || 0) + 1);
        }
      }
    }
    if (sorted.length !== nodeIds.length) {
      throw new Error("Graph contains cycles");
    }
    const outputNodes = nodeIds.filter((id) => (adjacency.get(id) || []).length === 0);
    return {
      sorted,
      levels,
      inputNodes,
      outputNodes
    };
  }
};

// ../../runtime/server/src/catalog/client.ts
import { resolveServiceUrl as resolveServiceUrl2, ServiceId as ServiceId2 } from "@symbia/sys";
var CatalogUnavailableError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "CatalogUnavailableError";
  }
};
var RuntimeCatalogClient = class {
  endpoint;
  serviceToken;
  timeoutMs;
  constructor(opts = {}) {
    this.endpoint = (opts.endpoint ?? process.env.CATALOG_ENDPOINT ?? resolveServiceUrl2(ServiceId2.CATALOG)).replace(/\/$/, "");
    this.serviceToken = opts.serviceToken ?? process.env.CATALOG_INTERNAL_SERVICE_TOKEN ?? "internal";
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.CATALOG_TIMEOUT_MS ?? 1e4);
  }
  async request(path2, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}${path2}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Service-Auth": this.serviceToken,
          ...init.headers ?? {}
        }
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : void 0;
      if (!res.ok) {
        const err = new Error(
          `Catalog ${init.method ?? "GET"} ${path2} -> ${res.status}: ${body?.error ?? text}`
        );
        err.status = res.status;
        throw err;
      }
      return body;
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || "code" in error)) {
        throw new CatalogUnavailableError(
          `Catalog unreachable at ${this.endpoint} (${error.message})`,
          error
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  /**
   * List resources of a type, paginating until exhausted.
   *
   * GET /api/resources returns a BARE ARRAY. The MCP wrapper over the same
   * endpoint returns {resources, total, has_more}, and assuming that envelope
   * here cost a full debug cycle: the parser silently produced [], the sync
   * concluded nothing was registered, and every create came back
   * "already exists". Both shapes are accepted so neither surface can break
   * this again, and pagination stops on a short page rather than trusting a
   * has_more flag the REST endpoint never sends.
   */
  async listResources(params = {}) {
    const pageSize = params.limit ?? 100;
    const out = [];
    let offset = 0;
    for (; ; ) {
      const qs = new URLSearchParams();
      if (params.type) qs.set("type", params.type);
      if (params.status) qs.set("status", params.status);
      qs.set("limit", String(pageSize));
      qs.set("offset", String(offset));
      const page = await this.request(`/api/resources?${qs.toString()}`);
      const items = Array.isArray(page) ? page : page?.resources ?? [];
      out.push(...items);
      const more = Array.isArray(page) ? items.length === pageSize : Boolean(page?.has_more);
      if (!more || items.length === 0) break;
      offset += items.length;
    }
    return out;
  }
  async createResource(resource) {
    return this.request("/api/resources", {
      method: "POST",
      body: JSON.stringify(resource)
    });
  }
  async updateResource(id, patch) {
    return this.request(`/api/resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }
  async health() {
    try {
      await this.request("/health");
      return true;
    } catch {
      return false;
    }
  }
};

// ../../runtime/server/src/catalog/manifests.ts
import {
  loadServiceIdentity,
  signDocument,
  verifyDocument,
  identityFromPublicPem
} from "@symbia/crypto";
var COMPONENT_KEY_PREFIX = "components/";
var COMPONENT_CONTRACT_VERSION = process.env.RUNTIME_COMPONENT_CONTRACT_VERSION ?? "1.5.0";
var COMPONENT_CAPABILITY = process.env.RUNTIME_COMPONENT_CAPABILITY ?? "cap:runtime.execute";
var PUBLIC_READ_GATED_WRITE = {
  visibility: "public",
  actions: {
    read: { anyOf: ["public"] },
    write: { anyOf: ["cap:registry.write", "role:admin"] },
    publish: { anyOf: ["cap:registry.publish", "role:publisher", "role:admin"] },
    delete: { anyOf: ["role:admin"] }
  }
};
function buildManifests() {
  return listComponents().map((c) => ({
    key: c.id,
    version: COMPONENT_CONTRACT_VERSION,
    implementation: "builtin",
    inputs: c.inputs.map((name) => ({ name })),
    outputs: c.outputs.map((name) => {
      const declared = c.lanes?.[name];
      const lane = declared?.lane ?? (c.emitsApocryphal ? "apocryphal" : "inherit");
      const receipt = declared?.receipt ?? (lane === "canonical" ? "recipe" : void 0);
      return {
        name,
        lane,
        ...declared?.note ? { laneNote: declared.note } : {},
        ...receipt ? { receipt } : {}
      };
    }),
    config: c.config,
    capability: COMPONENT_CAPABILITY,
    description: c.description
  }));
}
var cachedIdentity;
function signingIdentity() {
  if (cachedIdentity !== void 0) return cachedIdentity;
  try {
    cachedIdentity = loadServiceIdentity({ role: "runtime" });
  } catch {
    cachedIdentity = null;
  }
  return cachedIdentity;
}
function signManifest(manifest) {
  const sid = signingIdentity();
  if (!sid) return void 0;
  return {
    signature: signDocument(manifest, sid.identity),
    signer: {
      id: sid.id,
      role_claimed: sid.role_claimed,
      fingerprint: sid.fingerprint,
      publicKeyPem: sid.publicKeyPem
    }
  };
}
function signatureCurrent(resource, manifest) {
  const meta = resource.metadata;
  const block = meta?.manifestSignature;
  if (!block?.signature || !block.signer?.publicKeyPem) return false;
  const sid = signingIdentity();
  if (sid && block.signer.fingerprint !== sid.fingerprint) return false;
  try {
    const pub = identityFromPublicPem(block.signer.publicKeyPem);
    return verifyDocument({ ...manifest, signature: block.signature }, pub.publicKey);
  } catch {
    return false;
  }
}
function manifestOf(resource) {
  const meta = resource.metadata;
  const m = meta?.manifest;
  return m && typeof m.key === "string" ? m : void 0;
}
function portsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every(
    (p, i) => p.name === b[i]?.name && (p.lane ?? "inherit") === (b[i]?.lane ?? "inherit") && (p.laneNote ?? "") === (b[i]?.laneNote ?? "") && (p.receipt ?? "none") === (b[i]?.receipt ?? "none")
  );
}
function canonical(value) {
  if (value === void 0) return "\0undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
function configEqual(a, b) {
  if (a === void 0 || b === void 0) return a === b;
  return canonical(a) === canonical(b);
}
function manifestChanged(existing, next) {
  return existing.version !== next.version || existing.implementation !== next.implementation || existing.capability !== next.capability || existing.description !== next.description || !portsEqual(existing.inputs ?? [], next.inputs) || !portsEqual(existing.outputs ?? [], next.outputs) || !configEqual(existing.config, next.config);
}
async function syncComponentManifests(catalog) {
  const result = {
    registered: [],
    updated: [],
    unchanged: [],
    failed: [],
    unsigned: []
  };
  const existing = await catalog.listResources({ type: "component" });
  const byKey = /* @__PURE__ */ new Map();
  for (const r of existing) byKey.set(r.key, r);
  for (const manifest of buildManifests()) {
    const catalogKey = `${COMPONENT_KEY_PREFIX}${manifest.key}`;
    const found = byKey.get(catalogKey);
    const manifestSignature = signManifest(manifest);
    if (!manifestSignature) result.unsigned.push(manifest.key);
    try {
      if (!found) {
        await catalog.createResource({
          key: catalogKey,
          name: manifest.key,
          description: manifest.description,
          type: "component",
          status: "published",
          tags: ["runtime", "component", "builtin", manifest.key.split(".")[1] ?? "core"],
          // Public read, gated write. The gate belongs on registration, not on
          // discovery: a contract nobody can read is not a contract, and the
          // catalog's default private policy made the manifests invisible to
          // every reader that had not already authenticated as a writer.
          accessPolicy: PUBLIC_READ_GATED_WRITE,
          metadata: { manifest, ...manifestSignature ? { manifestSignature } : {} }
        });
        result.registered.push(manifest.key);
        continue;
      }
      const current = manifestOf(found);
      const policyDrifted = found.accessPolicy?.visibility !== "public";
      const signatureDrifted = manifestSignature !== void 0 && !signatureCurrent(found, manifest);
      if (current && !manifestChanged(current, manifest) && !policyDrifted && !signatureDrifted) {
        result.unchanged.push(manifest.key);
        continue;
      }
      await catalog.updateResource(found.id, {
        name: manifest.key,
        description: manifest.description,
        accessPolicy: PUBLIC_READ_GATED_WRITE,
        metadata: {
          ...found.metadata ?? {},
          manifest,
          ...manifestSignature ? { manifestSignature } : {}
        }
      });
      result.updated.push(manifest.key);
    } catch (error) {
      result.failed.push({ key: manifest.key, error: error.message });
    }
  }
  return result;
}
async function fetchManifestedComponentKeys(catalog) {
  const resources = await catalog.listResources({ type: "component" });
  const keys = /* @__PURE__ */ new Set();
  for (const r of resources) {
    const manifest = manifestOf(r);
    if (manifest) keys.add(manifest.key);
    else if (r.key.startsWith(COMPONENT_KEY_PREFIX)) {
      keys.add(r.key.slice(COMPONENT_KEY_PREFIX.length));
    }
  }
  return keys;
}

// ../../runtime/server/src/catalog/ingress.ts
var INGRESS_KEY_PREFIX = "ingress/";
function readIngress(definition) {
  const meta = definition.metadata ?? {};
  const raw = meta.ingress;
  if (!raw) return void 0;
  return {
    node: String(raw.node ?? "entry"),
    port: String(raw.port ?? "in"),
    capability: raw.capability ? String(raw.capability) : void 0,
    description: raw.description ? String(raw.description) : void 0
  };
}
var PUBLIC_READ_GATED_WRITE2 = {
  visibility: "public",
  actions: {
    read: { anyOf: ["public"] },
    write: { anyOf: ["cap:registry.write", "role:admin"] },
    publish: { anyOf: ["cap:registry.publish", "role:publisher", "role:admin"] },
    delete: { anyOf: ["role:admin"] }
  }
};
async function registerIngress(catalog, params) {
  const key = `${INGRESS_KEY_PREFIX}${params.graphName}`;
  const metadata = {
    kind: "runtime.ingress",
    ...params.app ? { app: params.app } : {},
    graph: params.graphName,
    graphKey: params.graphKey,
    endpoint: `/api/ingress/${params.graphName}`,
    method: "POST",
    node: params.ingress.node,
    port: params.ingress.port,
    capability: params.ingress.capability ?? null,
    // Recorded explicitly so the gate is legible from the registry alone,
    // rather than only from the code that enforces it.
    authorization: params.ingress.capability ? `member of org ${params.orgId ?? "(none)"} AND holds ${params.ingress.capability}` : `member of org ${params.orgId ?? "(none)"}`
  };
  const body = {
    key,
    name: `${params.graphName} ingress`,
    description: params.ingress.description ?? `Delivery surface for graph "${params.graphName}" (${params.ingress.node}/${params.ingress.port})`,
    type: "integration",
    status: "published",
    tags: ["runtime", "ingress", params.graphName],
    accessPolicy: PUBLIC_READ_GATED_WRITE2,
    metadata
  };
  if (params.existing) {
    await catalog.updateResource(params.existing.id, {
      name: body.name,
      description: body.description,
      status: body.status,
      tags: body.tags,
      accessPolicy: PUBLIC_READ_GATED_WRITE2,
      metadata
    });
    return;
  }
  await catalog.createResource(body);
}
function checkIngressAccess(input) {
  const { caller, ingress, graphOrgId, enforcement } = input;
  if (enforcement === "off") return { allowed: true };
  if (caller.isSuperAdmin) return { allowed: true };
  const entitlements = caller.entitlements ?? [];
  const orgs = (caller.organizations ?? []).map((o) => o.id);
  if (ingress.capability && !entitlements.includes(ingress.capability)) {
    return refuse(
      `caller does not hold the capability declared by this ingress (${ingress.capability})`,
      enforcement
    );
  }
  if (graphOrgId) {
    if (!orgs.includes(graphOrgId)) {
      return refuse(`caller is not a member of the org that owns this graph`, enforcement);
    }
    return { allowed: true };
  }
  if (ingress.capability) return { allowed: true };
  return refuse(
    "this graph declares no owning org and no ingress capability, so delivery cannot be authorised",
    enforcement
  );
}
function refuse(reason, enforcement) {
  if (enforcement === "warn") {
    console.warn(`[Ingress] would refuse (enforcement=warn): ${reason}`);
    return { allowed: true, reason };
  }
  return { allowed: false, reason };
}

// ../../runtime/server/src/catalog/sync.ts
var STANDING_ROLES = /* @__PURE__ */ new Set(["pipeline", "service"]);
function definitionOf(resource) {
  const meta = resource.metadata ?? {};
  const candidate = meta.definition ?? meta.graph ?? meta;
  const def = candidate;
  if (def && typeof def === "object" && Array.isArray(def.nodes) && Array.isArray(def.edges)) {
    return def;
  }
  return void 0;
}
function roleOf(resource, definition) {
  const fromDef = definition.metadata ?? {};
  const fromRes = resource.metadata ?? {};
  const role = fromRes.role ?? fromDef.role;
  return role;
}
function hasIngress(definition) {
  const meta = definition.metadata ?? {};
  return Boolean(meta.ingress);
}
function revisionOf(resource) {
  return String(resource.updatedAt ?? resource.createdAt ?? "");
}
var CatalogSync = class {
  catalog;
  executor;
  hydrated = /* @__PURE__ */ new Map();
  /** undefined = catalog never successfully read; distinct from empty. */
  manifestedKeys;
  timer;
  running = false;
  constructor(executor, catalog = new RuntimeCatalogClient()) {
    this.executor = executor;
    this.catalog = catalog;
  }
  /**
   * The set of component keys the catalog manifests, for the executor's
   * load-time resolution. Undefined until a successful read — the executor
   * treats that as "cannot verify" rather than "nothing is manifested".
   */
  getManifestedKeys = () => this.manifestedKeys;
  /**
   * Owning org for a hydrated graph, by graph name. The ingress gate needs it
   * to decide whether a caller may deliver. Undefined for graphs loaded ad hoc
   * rather than hydrated from the catalog.
   */
  getGraphOrg = (graphName) => {
    for (const entry of this.hydrated.values()) {
      if (entry.name === graphName) return entry.orgId;
    }
    return void 0;
  };
  /** Boot sequence: register manifests, then hydrate, then start reconciling. */
  async start() {
    const report = await this.syncOnce({ registerManifests: config.catalog.registerManifests });
    if (config.catalog.reconcileIntervalMs > 0) {
      this.timer = setInterval(() => {
        if (this.running) return;
        void this.syncOnce({ registerManifests: false }).catch((err) => {
          console.error("[CatalogSync] reconcile failed:", err.message);
        });
      }, config.catalog.reconcileIntervalMs);
      this.timer.unref?.();
      console.log(
        `[CatalogSync] reconciling every ${config.catalog.reconcileIntervalMs}ms (polling \u2014 Network-event-driven is the target)`
      );
    }
    return report;
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = void 0;
  }
  async syncOnce(opts) {
    this.running = true;
    const report = {
      graphsLoaded: [],
      graphsUnloaded: [],
      graphsStarted: [],
      errors: []
    };
    try {
      if (opts.registerManifests) {
        const result = await syncComponentManifests(this.catalog);
        report.manifests = {
          registered: result.registered.length,
          updated: result.updated.length,
          unchanged: result.unchanged.length,
          failed: result.failed.length
        };
        for (const f of result.failed) {
          report.errors.push({ key: `component:${f.key}`, error: f.error });
        }
        console.log(
          `[CatalogSync] component manifests \u2014 registered ${result.registered.length}, updated ${result.updated.length}, unchanged ${result.unchanged.length}, failed ${result.failed.length}` + (result.unsigned.length ? `, UNSIGNED ${result.unsigned.length} (no service identity \u2014 these manifests carry no signature)` : "")
        );
      }
      this.manifestedKeys = await fetchManifestedComponentKeys(this.catalog);
      if (config.catalog.hydrateGraphs) {
        await this.reconcileGraphs(report);
      }
    } catch (error) {
      if (error instanceof CatalogUnavailableError) {
        console.error(`[CatalogSync] ${error.message}`);
        report.errors.push({ key: "catalog", error: error.message });
        if (config.catalog.failFast) throw error;
      } else {
        throw error;
      }
    } finally {
      this.running = false;
    }
    return report;
  }
  async reconcileGraphs(report) {
    const resources = (await this.catalog.listResources({ type: "graph", status: "published" })).filter((r) => r.type === "graph");
    const ingressResources = /* @__PURE__ */ new Map();
    if (config.catalog.registerIngress) {
      for (const r of await this.catalog.listResources({ type: "integration" })) {
        if (r.key.startsWith(INGRESS_KEY_PREFIX)) ingressResources.set(r.key, r);
      }
    }
    const seen = /* @__PURE__ */ new Set();
    for (const resource of resources) {
      seen.add(resource.id);
      const definition = definitionOf(resource);
      if (!definition) {
        report.errors.push({
          key: resource.key,
          error: "graph resource has no usable definition under metadata.definition"
        });
        continue;
      }
      const existing = this.hydrated.get(resource.id);
      const revision = revisionOf(resource);
      if (existing && existing.revision === revision) continue;
      try {
        if (existing) {
          await this.executor.unloadGraph(existing.graphId);
          this.hydrated.delete(resource.id);
          report.graphsUnloaded.push(existing.name);
        }
        if (!resource.orgId) {
          console.warn(
            `[CatalogSync] graph "${resource.key}" has no orgId \u2014 anything it derives will be attributed to the system org`
          );
        }
        const loaded = await this.executor.loadGraph(definition, {
          orgId: resource.orgId ?? void 0,
          // The catalog key is the graph's stable identity across restarts,
          // and is what its operator state is keyed on.
          key: resource.key
        });
        this.hydrated.set(resource.id, {
          resourceId: resource.id,
          graphId: loaded.id,
          revision,
          name: definition.name,
          key: resource.key,
          orgId: resource.orgId ?? void 0
        });
        report.graphsLoaded.push(definition.name);
        const ingress = readIngress(definition);
        if (ingress && config.catalog.registerIngress) {
          try {
            await registerIngress(this.catalog, {
              graphName: definition.name,
              graphKey: resource.key,
              orgId: resource.orgId ?? void 0,
              // Inherit the graph's owning app so the ingress is claimed too.
              app: (resource.metadata ?? {}).app,
              ingress,
              existing: ingressResources.get(`${INGRESS_KEY_PREFIX}${definition.name}`)
            });
          } catch (error) {
            report.errors.push({
              key: `ingress:${definition.name}`,
              error: error.message
            });
          }
        }
        const role = roleOf(resource, definition);
        const shouldStand = config.catalog.autoExecute && role !== void 0 && STANDING_ROLES.has(role);
        if (shouldStand) {
          if (!hasIngress(definition)) {
            console.warn(
              `[CatalogSync] graph "${definition.name}" declares role=${role} but no metadata.ingress \u2014 starting it, but nothing can deliver to it`
            );
          }
          await this.executor.startExecution(loaded.id);
          report.graphsStarted.push(definition.name);
          console.log(
            `[CatalogSync] stood up "${definition.name}" (role=${role}) \u2014 external producers can POST /api/ingress/${definition.name}`
          );
        }
      } catch (error) {
        report.errors.push({ key: resource.key, error: error.message });
        console.error(`[CatalogSync] failed to hydrate "${resource.key}": ${error.message}`);
      }
    }
    for (const [resourceId, entry] of Array.from(this.hydrated.entries())) {
      if (seen.has(resourceId)) continue;
      await this.executor.unloadGraph(entry.graphId);
      await getStateStore().clearGraph(entry.key);
      this.hydrated.delete(resourceId);
      report.graphsUnloaded.push(entry.name);
      console.log(
        `[CatalogSync] unloaded "${entry.name}" and dropped its operator state \u2014 no longer published in the catalog`
      );
    }
  }
};

// ../../runtime/server/src/executor.ts
var catalogSync;
var graphExecutor = new GraphExecutor({
  maxConcurrentExecutions: config.runtime.maxConcurrentExecutions,
  defaultTimeout: config.runtime.defaultExecutionTimeout,
  maxBackpressureQueue: config.runtime.maxBackpressureQueue,
  enableMetrics: config.runtime.enableMetrics,
  manifestEnforcement: config.runtime.manifestEnforcement,
  manifestResolver: () => catalogSync?.getManifestedKeys()
});
catalogSync = new CatalogSync(graphExecutor);

// ../../runtime/server/src/routes.ts
import express from "express";
import path from "path";

// ../../runtime/server/src/auth.ts
import {
  createAuthMiddleware
} from "@symbia/auth";
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["runtime:admin"],
  enableImpersonation: false
});
var {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient
} = auth;
var introspectToken = authClient.introspectToken;
var verifyApiKey = authClient.verifyApiKey;
var verifySessionCookie = authClient.verifySessionCookie;

// ../../runtime/server/src/doc-routes.ts
import { registerDocRoutes } from "@symbia/md";

// ../../runtime/server/src/openapi.ts
var openApiSpec = {
  "openapi": "3.1.0",
  "info": {
    "title": "Symbia Runtime API",
    "version": "1.0.0",
    "description": "Graph execution engine for Symbia Script workflows.\n\nThe Runtime service executes dataflow graphs defined in Symbia Script format, managing component lifecycle, message routing, and execution state."
  },
  "servers": [
    {
      "url": "/api",
      "description": "Runtime API"
    }
  ],
  "tags": [
    { "name": "health" },
    { "name": "bootstrap" },
    { "name": "graphs" },
    { "name": "executions" },
    { "name": "components" }
  ],
  "security": [
    { "bearerAuth": [] },
    { "apiKeyAuth": [] }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": ["health"],
        "summary": "Health check",
        "security": [],
        "responses": {
          "200": {
            "description": "Service health",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Health" }
              }
            }
          }
        }
      }
    },
    "/bootstrap/service": {
      "get": {
        "tags": ["bootstrap"],
        "summary": "Service bootstrap",
        "security": [],
        "responses": {
          "200": {
            "description": "Service metadata",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Bootstrap" }
              }
            }
          }
        }
      }
    },
    "/graphs": {
      "get": {
        "tags": ["graphs"],
        "summary": "List loaded graphs",
        "responses": {
          "200": {
            "description": "Graph list",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/GraphList" }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["graphs"],
        "summary": "Load a graph definition",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/GraphDefinition" }
            },
            "application/x-yaml": {
              "schema": { "type": "string" }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Graph loaded",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/LoadedGraph" }
              }
            }
          },
          "400": {
            "description": "Invalid graph definition"
          }
        }
      }
    },
    "/graphs/{id}": {
      "get": {
        "tags": ["graphs"],
        "summary": "Get graph details",
        "parameters": [
          { "$ref": "#/components/parameters/GraphId" }
        ],
        "responses": {
          "200": {
            "description": "Graph details",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/GraphDetail" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      },
      "delete": {
        "tags": ["graphs"],
        "summary": "Unload a graph",
        "parameters": [
          { "$ref": "#/components/parameters/GraphId" }
        ],
        "responses": {
          "204": { "description": "Graph unloaded" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/graphs/{id}/execute": {
      "post": {
        "tags": ["graphs"],
        "summary": "Start graph execution",
        "parameters": [
          { "$ref": "#/components/parameters/GraphId" }
        ],
        "responses": {
          "201": {
            "description": "Execution started",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionStarted" }
              }
            }
          },
          "400": { "description": "Failed to start execution" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions": {
      "get": {
        "tags": ["executions"],
        "summary": "List all executions",
        "responses": {
          "200": {
            "description": "Execution list",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionList" }
              }
            }
          }
        }
      }
    },
    "/executions/{id}": {
      "get": {
        "tags": ["executions"],
        "summary": "Get execution status",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": {
            "description": "Execution status",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionDetail" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/metrics": {
      "get": {
        "tags": ["executions"],
        "summary": "Get execution metrics",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": {
            "description": "Execution metrics",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionMetrics" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/inject": {
      "post": {
        "tags": ["executions"],
        "summary": "Inject message into execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/InjectRequest" }
            }
          }
        },
        "responses": {
          "200": { "description": "Message injected" },
          "400": { "description": "Invalid request" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/pause": {
      "post": {
        "tags": ["executions"],
        "summary": "Pause execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": { "description": "Execution paused" },
          "400": { "description": "Cannot pause" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/resume": {
      "post": {
        "tags": ["executions"],
        "summary": "Resume execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": { "description": "Execution resumed" },
          "400": { "description": "Cannot resume" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/stop": {
      "post": {
        "tags": ["executions"],
        "summary": "Stop execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": { "description": "Execution stopped" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/components": {
      "get": {
        "tags": ["components"],
        "summary": "List available components",
        "responses": {
          "200": {
            "description": "Component list",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ComponentList" }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["components"],
        "summary": "Register custom component",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/ComponentDefinition" }
            }
          }
        },
        "responses": {
          "201": { "description": "Component registered" },
          "400": { "description": "Invalid component definition" }
        }
      }
    },
    "/components/{id}": {
      "get": {
        "tags": ["components"],
        "summary": "Get component definition",
        "parameters": [
          { "$ref": "#/components/parameters/ComponentId" }
        ],
        "responses": {
          "200": {
            "description": "Component definition",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ComponentDefinition" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      },
      "apiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key"
      }
    },
    "parameters": {
      "GraphId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": { "type": "string", "format": "uuid" }
      },
      "ExecutionId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": { "type": "string", "format": "uuid" }
      },
      "ComponentId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": { "type": "string" }
      }
    },
    "responses": {
      "NotFound": {
        "description": "Not found",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/Error" }
          }
        }
      }
    },
    "schemas": {
      "Health": {
        "type": "object",
        "properties": {
          "status": { "type": "string" },
          "service": { "type": "string" }
        },
        "required": ["status", "service"]
      },
      "Bootstrap": {
        "type": "object",
        "properties": {
          "service": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "endpoints": { "type": "object" },
          "websocketEvents": { "type": "object" }
        },
        "required": ["service", "version"]
      },
      "GraphDefinition": {
        "type": "object",
        "properties": {
          "symbia": { "type": "string" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "nodes": { "type": "array", "items": { "$ref": "#/components/schemas/GraphNode" } },
          "edges": { "type": "array", "items": { "$ref": "#/components/schemas/GraphEdge" } }
        },
        "required": ["symbia", "name", "version", "nodes", "edges"]
      },
      "GraphNode": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "component": { "type": "string" },
          "version": { "type": "string" },
          "config": { "type": "object" }
        },
        "required": ["id", "component"]
      },
      "GraphEdge": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "source": {
            "type": "object",
            "properties": {
              "node": { "type": "string" },
              "port": { "type": "string" }
            },
            "required": ["node", "port"]
          },
          "target": {
            "type": "object",
            "properties": {
              "node": { "type": "string" },
              "port": { "type": "string" }
            },
            "required": ["node", "port"]
          }
        },
        "required": ["source", "target"]
      },
      "GraphList": {
        "type": "object",
        "properties": {
          "loadedGraphs": { "type": "integer" },
          "activeExecutions": { "type": "integer" },
          "graphs": { "type": "array", "items": { "type": "object" } }
        }
      },
      "LoadedGraph": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "nodeCount": { "type": "integer" },
          "edgeCount": { "type": "integer" },
          "topology": { "type": "object" },
          "loadedAt": { "type": "string", "format": "date-time" }
        }
      },
      "GraphDetail": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "nodes": { "type": "array" },
          "edges": { "type": "array" },
          "topology": { "type": "object" },
          "loadedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ExecutionStarted": {
        "type": "object",
        "properties": {
          "executionId": { "type": "string", "format": "uuid" },
          "graphId": { "type": "string", "format": "uuid" },
          "state": { "type": "string" },
          "startedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ExecutionList": {
        "type": "object",
        "properties": {
          "executions": { "type": "array" },
          "total": { "type": "integer" }
        }
      },
      "ExecutionDetail": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "graphId": { "type": "string" },
          "state": { "type": "string" },
          "instances": { "type": "array" },
          "metrics": { "$ref": "#/components/schemas/ExecutionMetrics" },
          "error": { "type": "object" },
          "startedAt": { "type": "string", "format": "date-time" },
          "completedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ExecutionMetrics": {
        "type": "object",
        "properties": {
          "messagesProcessed": { "type": "integer" },
          "messagesEmitted": { "type": "integer" },
          "componentInvocations": { "type": "integer" },
          "avgLatencyMs": { "type": "number" },
          "maxLatencyMs": { "type": "number" },
          "errorCount": { "type": "integer" },
          "backpressureEvents": { "type": "integer" }
        }
      },
      "InjectRequest": {
        "type": "object",
        "properties": {
          "nodeId": { "type": "string" },
          "port": { "type": "string" },
          "value": {}
        },
        "required": ["nodeId", "port", "value"]
      },
      "ComponentList": {
        "type": "object",
        "properties": {
          "components": { "type": "array" },
          "stats": { "type": "object" }
        }
      },
      "ComponentDefinition": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "category": { "type": "string" },
          "ports": { "type": "object" },
          "config": { "type": "object" },
          "execution": { "type": "object" }
        },
        "required": ["id", "name", "version", "ports", "execution"]
      },
      "Error": {
        "type": "object",
        "properties": {
          "error": { "type": "string" }
        },
        "required": ["error"]
      }
    }
  }
};
{
  const __autoDocumentedPaths = {
    "/stats": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "List stats",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/ingress/{graphName}": {
      "post": {
        "tags": [
          "Ingress"
        ],
        "summary": "Create ingress",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "graphName",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/routines": {
      "post": {
        "tags": [
          "Routines"
        ],
        "summary": "Create routines",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/routines/preview": {
      "post": {
        "tags": [
          "Routines"
        ],
        "summary": "Preview routines preview",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/routines/validate": {
      "post": {
        "tags": [
          "Routines"
        ],
        "summary": "Validate routines validate",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = openApiSpec.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../runtime/server/src/doc-routes.ts
function setupDocRoutes(app) {
  registerDocRoutes(app, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false
  });
}

// ../../runtime/server/src/routes/graphs.ts
import { Router } from "express";
import { parse as parseYaml } from "yaml";

// ../../runtime/server/src/types/routine.ts
function isRoutineDefinition(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  const def = obj;
  return def.symbia === "routine/1.0" && Array.isArray(def.routines);
}

// ../../runtime/server/src/compiler/routine-compiler.ts
var STEP_TYPE_TO_COMPONENT = {
  say: "symbia.routine.say",
  ask: "symbia.routine.ask",
  think: "symbia.routine.think",
  remember: "symbia.routine.remember",
  recall: "symbia.routine.recall",
  wait: "symbia.routine.wait",
  check: "symbia.routine.check",
  call: "symbia.routine.call",
  repeat: "symbia.routine.repeat",
  stop: "symbia.routine.stop"
};
var RoutineCompiler = class {
  options;
  constructor(options = {}) {
    this.options = {
      debug: false,
      optimize: true,
      sourceMap: false,
      ...options
    };
  }
  /**
   * Validate a routine definition
   */
  validate(definition) {
    const errors = [];
    const warnings = [];
    if (!definition.symbia || definition.symbia !== "routine/1.0") {
      errors.push({
        path: "symbia",
        message: 'Invalid or missing symbia version. Expected "routine/1.0"',
        code: "INVALID_VERSION"
      });
    }
    if (!definition.name) {
      errors.push({
        path: "name",
        message: "Routine definition must have a name",
        code: "MISSING_NAME"
      });
    }
    if (!definition.version) {
      errors.push({
        path: "version",
        message: "Routine definition must have a version",
        code: "MISSING_VERSION"
      });
    }
    if (!definition.assistantId) {
      errors.push({
        path: "assistantId",
        message: "Routine definition must specify an assistantId",
        code: "MISSING_ASSISTANT_ID"
      });
    }
    if (!Array.isArray(definition.routines) || definition.routines.length === 0) {
      errors.push({
        path: "routines",
        message: "Routine definition must have at least one routine",
        code: "NO_ROUTINES"
      });
    }
    const routineNames = /* @__PURE__ */ new Set();
    definition.routines?.forEach((routine, idx) => {
      const routinePath = `routines[${idx}]`;
      if (!routine.id) {
        errors.push({
          path: `${routinePath}.id`,
          message: "Routine must have an id",
          code: "MISSING_ROUTINE_ID"
        });
      }
      if (!routine.name) {
        errors.push({
          path: `${routinePath}.name`,
          message: "Routine must have a name",
          code: "MISSING_ROUTINE_NAME"
        });
      }
      if (routineNames.has(routine.name)) {
        errors.push({
          path: `${routinePath}.name`,
          message: `Duplicate routine name: ${routine.name}`,
          code: "DUPLICATE_ROUTINE_NAME"
        });
      }
      routineNames.add(routine.name);
      if (!Array.isArray(routine.steps) || routine.steps.length === 0) {
        warnings.push({
          path: `${routinePath}.steps`,
          message: "Routine has no steps",
          code: "EMPTY_ROUTINE"
        });
      }
      routine.steps?.forEach((step, stepIdx) => {
        const stepPath = `${routinePath}.steps[${stepIdx}]`;
        if (!step.id) {
          errors.push({
            path: `${stepPath}.id`,
            message: "Step must have an id",
            code: "MISSING_STEP_ID"
          });
        }
        if (!step.type) {
          errors.push({
            path: `${stepPath}.type`,
            message: "Step must have a type",
            code: "MISSING_STEP_TYPE"
          });
        } else if (!STEP_TYPE_TO_COMPONENT[step.type]) {
          errors.push({
            path: `${stepPath}.type`,
            message: `Unknown step type: ${step.type}`,
            code: "UNKNOWN_STEP_TYPE"
          });
        }
        if (!step.description) {
          warnings.push({
            path: `${stepPath}.description`,
            message: "Step has no description",
            code: "MISSING_STEP_DESCRIPTION"
          });
        }
        if (step.type === "call") {
          const targetRoutine = step.params?.routineName;
          if (targetRoutine && !routineNames.has(targetRoutine)) {
            const exists = definition.routines?.some((r) => r.name === targetRoutine);
            if (!exists) {
              warnings.push({
                path: `${stepPath}.params.routineName`,
                message: `Call target routine "${targetRoutine}" not found in definition`,
                code: "UNKNOWN_CALL_TARGET"
              });
            }
          }
        }
      });
    });
    const hasMain = definition.routines?.some((r) => r.isMain);
    if (!hasMain) {
      warnings.push({
        path: "routines",
        message: "No main routine defined. First routine will be used as entry point.",
        code: "NO_MAIN_ROUTINE"
      });
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  /**
   * Compile a routine definition into graph definitions
   */
  compile(definition, options) {
    const opts = { ...this.options, ...options };
    const validation = this.validate(definition);
    if (!validation.valid) {
      throw new CompilationError(
        "Validation failed",
        validation.errors
      );
    }
    const compiledRoutines = [];
    const graphs = [];
    let totalNodeCount = 0;
    let totalEdgeCount = 0;
    for (const routine of definition.routines) {
      const { graph, nodeMapping } = this.compileRoutine(
        routine,
        definition,
        opts
      );
      graphs.push(graph);
      compiledRoutines.push({
        graphId: graph.name,
        assistantId: definition.assistantId,
        routine,
        nodeMapping
      });
      totalNodeCount += graph.nodes.length;
      totalEdgeCount += graph.edges.length;
    }
    return {
      graphs,
      compiledRoutines,
      warnings: validation.warnings,
      metadata: {
        compilerVersion: "1.0.0",
        compiledAt: (/* @__PURE__ */ new Date()).toISOString(),
        sourceHash: this.hashDefinition(definition),
        routineCount: definition.routines.length,
        totalNodeCount,
        totalEdgeCount
      }
    };
  }
  /**
   * Compile a single routine into a graph
   */
  compileRoutine(routine, definition, options) {
    const nodes = [];
    const edges = [];
    const nodeMapping = /* @__PURE__ */ new Map();
    const entryNodeId = `${routine.id}-entry`;
    nodes.push({
      id: entryNodeId,
      component: "symbia.core.passthrough",
      config: {
        routineId: routine.id,
        routineName: routine.name,
        trigger: routine.trigger
      },
      position: { x: 0, y: 0 }
    });
    let prevNodeId = entryNodeId;
    let prevOutputPort = "output";
    let yOffset = 100;
    for (let i = 0; i < routine.steps.length; i++) {
      const step = routine.steps[i];
      const nodeId = `${routine.id}-${step.id}`;
      nodeMapping.set(step.id, nodeId);
      const component = STEP_TYPE_TO_COMPONENT[step.type];
      if (!component) {
        throw new CompilationError(
          `Unknown step type: ${step.type}`,
          [{ path: `step.${step.id}`, message: `Unknown type`, code: "UNKNOWN_TYPE" }]
        );
      }
      const llmConfig = this.mergeLLMConfig(definition.llm, step.llm);
      const node = {
        id: nodeId,
        component,
        config: {
          description: step.description,
          ...step.params || {},
          // Include LLM config for steps that use it
          ...this.stepUsesLLM(step.type) && llmConfig ? { llm: llmConfig } : {}
        },
        position: { x: 200, y: yOffset }
      };
      if (options.debug && node.config) {
        node.config._debug = {
          stepId: step.id,
          stepIndex: i,
          stepType: step.type,
          routineId: routine.id
        };
      }
      nodes.push(node);
      edges.push({
        id: `edge-${prevNodeId}-to-${nodeId}`,
        source: { node: prevNodeId, port: prevOutputPort },
        target: { node: nodeId, port: "input" }
      });
      if (step.type === "check") {
        const nextStep = routine.steps[i + 1];
        if (nextStep) {
          const nextNodeId = `${routine.id}-${nextStep.id}`;
          prevOutputPort = "true";
        } else {
          prevOutputPort = "output";
        }
      } else if (step.type === "repeat") {
        prevOutputPort = "output";
      } else {
        prevOutputPort = "output";
      }
      prevNodeId = nodeId;
      yOffset += 100;
    }
    const exitNodeId = `${routine.id}-exit`;
    nodes.push({
      id: exitNodeId,
      component: "symbia.core.passthrough",
      config: {
        routineId: routine.id,
        exitPoint: true
      },
      position: { x: 200, y: yOffset }
    });
    edges.push({
      id: `edge-${prevNodeId}-to-exit`,
      source: { node: prevNodeId, port: prevOutputPort },
      target: { node: exitNodeId, port: "input" }
    });
    const graph = {
      symbia: "1.0",
      name: `${definition.assistantId}/${routine.name.toLowerCase().replace(/\s+/g, "-")}`,
      version: definition.version,
      description: routine.trigger || `Routine: ${routine.name}`,
      nodes,
      edges,
      metadata: {
        compiledFrom: "routine",
        routineId: routine.id,
        routineName: routine.name,
        assistantId: definition.assistantId,
        assistantAlias: definition.alias,
        isMain: routine.isMain || false,
        trigger: routine.trigger,
        // Include default LLM config at graph level
        llm: definition.llm
      }
    };
    return { graph, nodeMapping };
  }
  /**
   * Generate a hash for the definition (for caching)
   */
  hashDefinition(definition) {
    const str = JSON.stringify(definition);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
  /**
   * Check if a step type uses LLM
   */
  stepUsesLLM(stepType) {
    return ["think", "say", "ask", "check"].includes(stepType);
  }
  /**
   * Merge LLM configs with step-level taking precedence
   */
  mergeLLMConfig(definitionLevel, stepLevel) {
    if (!definitionLevel && !stepLevel) return void 0;
    if (!definitionLevel) return stepLevel;
    if (!stepLevel) return definitionLevel;
    return {
      provider: stepLevel.provider ?? definitionLevel.provider,
      model: stepLevel.model ?? definitionLevel.model,
      temperature: stepLevel.temperature ?? definitionLevel.temperature,
      maxTokens: stepLevel.maxTokens ?? definitionLevel.maxTokens,
      systemPrompt: stepLevel.systemPrompt ?? definitionLevel.systemPrompt
    };
  }
};
var CompilationError = class extends Error {
  errors;
  constructor(message, errors) {
    super(message);
    this.name = "CompilationError";
    this.errors = errors;
  }
};
var routineCompiler = new RoutineCompiler();

// ../../runtime/server/src/routes/graphs.ts
function getParamId(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
function createGraphRoutes(executor) {
  const router = Router();
  router.post("/", requireAuth, async (req, res) => {
    try {
      let rawBody;
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("yaml") || contentType.includes("x-yaml")) {
        rawBody = parseYaml(req.body);
      } else if (typeof req.body === "string") {
        try {
          rawBody = parseYaml(req.body);
        } catch {
          rawBody = JSON.parse(req.body);
        }
      } else {
        rawBody = req.body;
      }
      if (isRoutineDefinition(rawBody)) {
        console.log("[GraphRoutes] Compiling routine definition:", rawBody.name);
        const result = routineCompiler.compile(rawBody);
        const loadedGraphs = [];
        for (const graphDef of result.graphs) {
          const graph2 = await executor.loadGraph(graphDef);
          loadedGraphs.push({
            id: graph2.id,
            name: graph2.definition.name,
            version: graph2.definition.version,
            nodeCount: graph2.definition.nodes.length,
            edgeCount: graph2.definition.edges.length,
            topology: {
              inputNodes: graph2.topology.inputNodes,
              outputNodes: graph2.topology.outputNodes
            },
            loadedAt: graph2.loadedAt.toISOString()
          });
        }
        res.status(201).json({
          type: "routine",
          assistantId: rawBody.assistantId,
          compiledAt: result.metadata.compiledAt,
          routineCount: result.metadata.routineCount,
          totalNodeCount: result.metadata.totalNodeCount,
          totalEdgeCount: result.metadata.totalEdgeCount,
          graphs: loadedGraphs,
          warnings: result.warnings
        });
        return;
      }
      const definition = rawBody;
      const graph = await executor.loadGraph(definition);
      res.status(201).json({
        type: "graph",
        id: graph.id,
        name: graph.definition.name,
        version: graph.definition.version,
        nodeCount: graph.definition.nodes.length,
        edgeCount: graph.definition.edges.length,
        topology: {
          inputNodes: graph.topology.inputNodes,
          outputNodes: graph.topology.outputNodes
        },
        loadedAt: graph.loadedAt.toISOString()
      });
    } catch (error) {
      console.error("[GraphRoutes] Load error:", error);
      if (error instanceof CompilationError) {
        res.status(400).json({
          error: "Routine compilation failed",
          code: "COMPILATION_ERROR",
          details: error.errors
        });
        return;
      }
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to load graph"
      });
    }
  });
  router.get("/", optionalAuth, async (_req, res) => {
    const stats = executor.getStats();
    const graphs = executor.getAllGraphs().map((g) => ({
      id: g.id,
      name: g.definition.name,
      version: g.definition.version,
      description: g.definition.description,
      nodeCount: g.definition.nodes.length,
      edgeCount: g.definition.edges.length,
      orgId: g.orgId ?? null,
      role: (g.definition.metadata ?? {}).role ?? null,
      ingress: (g.definition.metadata ?? {}).ingress ?? null,
      loadedAt: g.loadedAt.toISOString()
    }));
    res.json({
      loadedGraphs: stats.loadedGraphs,
      activeExecutions: stats.activeExecutions,
      graphs
    });
  });
  router.get("/:id", optionalAuth, async (req, res) => {
    const graph = executor.getGraph(getParamId(req.params, "id"));
    if (!graph) {
      res.status(404).json({ error: "Graph not found" });
      return;
    }
    res.json({
      id: graph.id,
      name: graph.definition.name,
      version: graph.definition.version,
      description: graph.definition.description,
      nodes: graph.definition.nodes,
      edges: graph.definition.edges,
      topology: {
        sorted: graph.topology.sorted,
        inputNodes: graph.topology.inputNodes,
        outputNodes: graph.topology.outputNodes
      },
      loadedAt: graph.loadedAt.toISOString()
    });
  });
  router.delete("/:id", requireAuth, async (req, res) => {
    try {
      await executor.unloadGraph(getParamId(req.params, "id"));
      res.status(204).send();
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : "Failed to unload graph"
      });
    }
  });
  router.post("/:id/execute", requireAuth, async (req, res) => {
    try {
      const execution = await executor.startExecution(getParamId(req.params, "id"));
      res.status(201).json({
        executionId: execution.id,
        graphId: execution.graphId,
        state: execution.state,
        startedAt: execution.startedAt?.toISOString()
      });
    } catch (error) {
      console.error("[GraphRoutes] Execute error:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to start execution"
      });
    }
  });
  return router;
}

// ../../runtime/server/src/routes/executions.ts
import { Router as Router2 } from "express";
function getParamId2(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
function createExecutionRoutes(executor) {
  const router = Router2();
  router.get("/", optionalAuth, async (_req, res) => {
    const executions = executor.getAllExecutions();
    res.json({
      executions: executions.map((e) => ({
        id: e.id,
        graphId: e.graphId,
        state: e.state,
        instanceCount: e.instances.size,
        metrics: {
          messagesProcessed: e.metrics.messagesProcessed,
          messagesEmitted: e.metrics.messagesEmitted,
          componentInvocations: e.metrics.componentInvocations,
          avgLatencyMs: e.metrics.avgLatencyMs,
          errorCount: e.metrics.errorCount
        },
        startedAt: e.startedAt?.toISOString(),
        completedAt: e.completedAt?.toISOString(),
        createdAt: e.createdAt.toISOString()
      })),
      total: executions.length
    });
  });
  router.get("/:id", optionalAuth, async (req, res) => {
    const execution = executor.getExecution(getParamId2(req.params, "id"));
    if (!execution) {
      res.status(404).json({ error: "Execution not found" });
      return;
    }
    res.json({
      id: execution.id,
      graphId: execution.graphId,
      state: execution.state,
      instances: Array.from(execution.instances.entries()).map(([nodeId, instance]) => ({
        nodeId,
        instanceId: instance.id,
        componentId: instance.componentId,
        state: instance.state,
        metrics: instance.metrics
      })),
      metrics: execution.metrics,
      error: execution.error,
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      createdAt: execution.createdAt.toISOString()
    });
  });
  router.get("/:id/metrics", optionalAuth, async (req, res) => {
    const execution = executor.getExecution(getParamId2(req.params, "id"));
    if (!execution) {
      res.status(404).json({ error: "Execution not found" });
      return;
    }
    res.json({
      executionId: execution.id,
      state: execution.state,
      ...execution.metrics,
      uptimeMs: execution.startedAt ? Date.now() - execution.startedAt.getTime() : 0
    });
  });
  router.post("/:id/inject", requireAuth, async (req, res) => {
    const { nodeId, port, value } = req.body;
    if (!nodeId || !port) {
      res.status(400).json({ error: "nodeId and port are required" });
      return;
    }
    try {
      const result = await executor.injectMessage(
        getParamId2(req.params, "id"),
        nodeId,
        port,
        value
      );
      res.json({
        success: true,
        executionId: getParamId2(req.params, "id"),
        nodeId,
        port,
        outputs: result.outputs,
        trace: result.trace,
        hops: result.trace.length
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to inject message"
      });
    }
  });
  router.post("/:id/pause", requireAuth, async (req, res) => {
    try {
      await executor.pauseExecution(getParamId2(req.params, "id"));
      const execution = executor.getExecution(getParamId2(req.params, "id"));
      res.json({
        executionId: getParamId2(req.params, "id"),
        state: execution?.state
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to pause execution"
      });
    }
  });
  router.post("/:id/resume", requireAuth, async (req, res) => {
    try {
      await executor.resumeExecution(getParamId2(req.params, "id"));
      const execution = executor.getExecution(getParamId2(req.params, "id"));
      res.json({
        executionId: getParamId2(req.params, "id"),
        state: execution?.state
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to resume execution"
      });
    }
  });
  router.post("/:id/stop", requireAuth, async (req, res) => {
    try {
      await executor.stopExecution(getParamId2(req.params, "id"));
      res.json({
        executionId: getParamId2(req.params, "id"),
        state: "cancelled"
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to stop execution"
      });
    }
  });
  return router;
}

// ../../runtime/server/src/routes/routines.ts
import { Router as Router3 } from "express";
function createRoutineRoutes(executor) {
  const router = Router3();
  router.post("/validate", requireAuth, async (req, res) => {
    try {
      const definition = req.body;
      const result = routineCompiler.validate(definition);
      res.json({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings
      });
    } catch (error) {
      console.error("[RoutineRoutes] Validation error:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Validation failed"
      });
    }
  });
  router.post("/", requireAuth, async (req, res) => {
    try {
      const definition = req.body;
      console.log("[RoutineRoutes] Compiling routines for:", definition.assistantId);
      const result = routineCompiler.compile(definition);
      const loadedGraphs = [];
      for (const graphDef of result.graphs) {
        const graph = await executor.loadGraph(graphDef);
        loadedGraphs.push({
          id: graph.id,
          name: graph.definition.name,
          routineId: graphDef.metadata?.routineId,
          routineName: graphDef.metadata?.routineName,
          isMain: graphDef.metadata?.isMain,
          trigger: graphDef.metadata?.trigger,
          nodeCount: graph.definition.nodes.length,
          edgeCount: graph.definition.edges.length,
          loadedAt: graph.loadedAt.toISOString()
        });
      }
      res.status(201).json({
        assistantId: definition.assistantId,
        alias: definition.alias,
        compiledAt: result.metadata.compiledAt,
        compilerVersion: result.metadata.compilerVersion,
        sourceHash: result.metadata.sourceHash,
        routineCount: result.metadata.routineCount,
        totalNodeCount: result.metadata.totalNodeCount,
        totalEdgeCount: result.metadata.totalEdgeCount,
        graphs: loadedGraphs,
        warnings: result.warnings
      });
    } catch (error) {
      console.error("[RoutineRoutes] Compile error:", error);
      if (error instanceof CompilationError) {
        res.status(400).json({
          error: "Compilation failed",
          code: "COMPILATION_ERROR",
          details: error.errors
        });
        return;
      }
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to compile routines"
      });
    }
  });
  router.post("/preview", requireAuth, async (req, res) => {
    try {
      const definition = req.body;
      const result = routineCompiler.compile(definition, { debug: true });
      res.json({
        assistantId: definition.assistantId,
        metadata: result.metadata,
        graphs: result.graphs.map((g) => ({
          name: g.name,
          description: g.description,
          nodes: g.nodes,
          edges: g.edges,
          metadata: g.metadata
        })),
        warnings: result.warnings
      });
    } catch (error) {
      if (error instanceof CompilationError) {
        res.status(400).json({
          error: "Compilation failed",
          code: "COMPILATION_ERROR",
          details: error.errors
        });
        return;
      }
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to preview routines"
      });
    }
  });
  return router;
}

// ../../runtime/server/src/routes.ts
var docsDir = path.resolve(process.cwd(), "docs");
async function registerRoutes(_server, app) {
  app.use("/docs", express.static(docsDir));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    next();
  });
  setupDocRoutes(app);
  app.get("/api/bootstrap/service", optionalAuth, (_req, res) => {
    res.json({
      service: config.serviceId,
      version: "1.0.0",
      description: "Graph execution engine for Symbia Script workflows",
      status: "limited",
      statusNote: "Runtime service requires rework - graph loading works, execution is stubbed",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
        openapiDirect: "/api/openapi.json",
        openapiApi: "/api/docs/openapi.json",
        llmsApi: "/api/docs/llms.txt",
        llmsFullApi: "/api/docs/llms-full.txt"
      },
      endpoints: {
        graphs: "/api/graphs",
        routines: "/api/routines",
        executions: "/api/executions",
        websocket: "/"
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)",
        "Session cookie (token or symbia_session)"
      ],
      websocketEvents: {
        client: [
          "execution:subscribe",
          "execution:unsubscribe",
          "execution:start",
          "execution:pause",
          "execution:resume",
          "execution:stop",
          "execution:inject"
        ],
        server: [
          "execution:started",
          "execution:paused",
          "execution:resumed",
          "execution:completed",
          "execution:failed",
          "execution:state",
          "port:emit",
          "metrics:update",
          "error"
        ]
      },
      runtime: {
        maxConcurrentExecutions: config.runtime.maxConcurrentExecutions,
        defaultExecutionTimeout: config.runtime.defaultExecutionTimeout
      }
    });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.get("/api/components", (_req, res) => {
    const components = graphExecutor.listComponents();
    res.json({ components, count: components.length });
  });
  app.get("/api/components/:id", (req, res) => {
    const found = graphExecutor.listComponents().find((c) => c.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: `Unknown component: ${req.params.id}` });
      return;
    }
    res.json(found);
  });
  app.post("/api/components", requireAuth, (req, res) => {
    const body = req.body ?? {};
    const missing = ["id", "name", "version", "ports", "execution"].filter(
      (k) => body[k] === void 0
    );
    if (missing.length > 0) {
      res.status(400).json({ error: `Invalid component definition: missing ${missing.join(", ")}` });
      return;
    }
    if (typeof body.id !== "string" || !/^[a-z0-9][a-z0-9\-_.]*$/i.test(body.id)) {
      res.status(400).json({ error: "Invalid component definition: id must be an identifier string" });
      return;
    }
    if (getComponent(body.id)) {
      res.status(400).json({ error: `Component already registered: ${body.id}` });
      return;
    }
    const inputs = Array.isArray(body.ports?.inputs) ? body.ports.inputs.map(String) : [];
    const outputs = Array.isArray(body.ports?.outputs) ? body.ports.outputs.map(String) : [];
    registerComponent({
      id: body.id,
      name: String(body.name),
      description: String(body.description ?? "Custom component (registered via API)"),
      inputs,
      outputs,
      emitsApocryphal: true,
      meta: {
        version: body.version,
        category: body.category,
        config: body.config,
        execution: body.execution,
        custom: true
      },
      handler: (input) => {
        const out = {};
        for (const port of outputs.length > 0 ? outputs : ["out"]) out[port] = input;
        return out;
      }
    });
    res.status(201).json({ registered: body.id });
  });
  app.post("/api/ingress/:graphName", requireAuth, async (req, res) => {
    try {
      const name = String(req.params.graphName);
      const graph = graphExecutor.getAllGraphs().find((g) => g.definition.name === name);
      if (!graph) {
        res.status(404).json({ error: `No loaded graph named: ${name}` });
        return;
      }
      const declared = readIngress(graph.definition) ?? { node: "entry", port: "in" };
      const gate = checkIngressAccess({
        graphOrgId: graph.orgId ?? catalogSync?.getGraphOrg(name),
        ingress: declared,
        caller: {
          isSuperAdmin: req.user?.isSuperAdmin,
          entitlements: req.user?.entitlements,
          organizations: req.user?.organizations
        },
        enforcement: config.ingressEnforcement
      });
      if (!gate.allowed) {
        res.status(403).json({
          error: `Delivery to ingress "${name}" refused: ${gate.reason}`,
          ingress: {
            graph: name,
            requiresCapability: declared.capability ?? null,
            declaredIn: `catalog resource ingress/${name}`
          }
        });
        return;
      }
      const exec = graphExecutor.getAllExecutions().filter((e) => e.graphId === graph.id && e.state === "running").sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
      if (!exec) {
        res.status(409).json({ error: `Graph "${name}" has no running execution` });
        return;
      }
      const node = declared.node;
      const port = declared.port;
      const values = Array.isArray(req.body) ? req.body : [req.body];
      let outputs = {};
      let hops = 0;
      for (const value of values) {
        const result = await graphExecutor.injectMessage(exec.id, node, port, value);
        hops += result.trace.length;
        if (Object.keys(result.outputs).length > 0) outputs = result.outputs;
      }
      res.json({
        success: true,
        executionId: exec.id,
        delivered: values.length,
        outputs,
        hops
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  app.use("/api/graphs", createGraphRoutes(graphExecutor));
  app.use("/api/routines", createRoutineRoutes(graphExecutor));
  app.use("/api/executions", createExecutionRoutes(graphExecutor));
  app.get("/api/stats", optionalAuth, (_req, res) => {
    res.json(graphExecutor.getStats());
  });
}

// ../../runtime/server/src/service.ts
var wired = false;
var store;
function stateStore() {
  return store;
}
function wireComponents() {
  if (wired) return;
  wired = true;
  const stateStore2 = new StateStore({
    pool,
    durable: isDurable,
    flushIntervalMs: parseInt(process.env.RUNTIME_STATE_FLUSH_MS || "2000", 10)
  });
  setStateStore(stateStore2);
  store = stateStore2;
  const telemetry = createTelemetryClient({
    serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId
  });
  const metricWriter = new MetricWriter({ serviceId: config.serviceId });
  registerSinkComponents({
    metric: (name, value, labels, orgId) => metricWriter.write({ name, value, labels, orgId }),
    log: (level, message, metadata) => {
      telemetry.log(level, message, metadata);
      return telemetry.getLastError() === null;
    }
  });
}
async function start() {
  wireComponents();
  const report = await catalogSync.start();
  return {
    graphsLoaded: report.graphsLoaded.length,
    graphsStarted: report.graphsStarted.length,
    errors: report.errors
  };
}
async function stop() {
  catalogSync?.stop();
}
export {
  catalogSync,
  graphExecutor,
  isDurable,
  registerRoutes,
  start,
  stateStore,
  stop,
  wireComponents
};
