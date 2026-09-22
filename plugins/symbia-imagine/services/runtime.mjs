// ../runtime/server/src/service.ts
import { createTelemetryClient } from "@symbia/logging-client";

// ../runtime/server/src/config.ts
import dotenv from "dotenv";
import { resolveOwnPort, resolveServiceUrl, ServiceId } from "@symbia/sys";
dotenv.config();
var config = {
  port: resolveOwnPort(ServiceId.RUNTIME),
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

// ../runtime/server/src/executor/preview.ts
function preview(value, max = 200) {
  let text;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = "[unserialisable]";
  }
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}

// ../runtime/server/src/executor/components.ts
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
function normaliseEmission(emitted, incoming, component, onArbitrage) {
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
    if (lane === "apocryphal" && candidate.lane === "canonical" && onArbitrage) {
      onArbitrage({
        event: "lane.arbitrage",
        node: def?.id,
        port,
        from: "canonical",
        to: "apocryphal",
        because: laneReason ?? "lane tightened without a stated reason",
        held: {
          ...candidate.receipt ? { receipt: candidate.receipt.kind } : {},
          // The distinction worth recording: a value can be demoted by its
          // company while remaining perfectly recomputable on its own recipe.
          recomputable: candidate.receipt?.kind === "recipe"
        }
      });
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
      // Genuinely untyped: it is compared against whatever the message holds.
      // It was declared `string`, which the first run of validateNodeConfig
      // caught as a lie — "eq" uses ===, so a graph that honoured that
      // declaration and wrote "1" against a numeric field would have compared
      // "1" === 1 and silently taken the fail port.
      type: "any",
      required: false,
      description: 'Value compared against. Unused by "exists". NOTE that "eq"/"neq" compare with === and do not coerce: match the type of the field you are testing.'
    }
  },
  lanes: { pass: { lane: "inherit" }, fail: { lane: "inherit" } },
  handler: (input, ctx) => {
    const { field: field4, op = "exists", value } = ctx.config;
    const src = input.value;
    const actual = field4 ? src?.[field4] : src;
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
  id: "symbia.lane.gate",
  name: "Lane Gate",
  description: 'Routes on the lane the EXECUTOR tracks for this value \u2014 canonical out "canonical", apocryphal out "apocryphal". Takes no config, deliberately: a gate an author can point at a payload field is a gate the author controls. Measured 19 Aug: a t(0) session declared witnessed:true in its own payload and symbia.logic.filter routed it canonical, because a payload field is testimony and the filter cannot tell testimony from provenance. This component reads the one thing the author cannot write.',
  inputs: ["in"],
  outputs: ["canonical", "apocryphal"],
  config: {},
  // `inherit` on both ports: the gate CLASSIFIES, it does not launder. A value
  // leaves in the lane it arrived in — routing it is the whole service.
  lanes: { canonical: { lane: "inherit" }, apocryphal: { lane: "inherit" } },
  handler: (input) => {
    return input.lane === "canonical" ? { canonical: input } : { apocryphal: input };
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
    const { field: field4 = "type", ports = [] } = ctx.config;
    const src = input.value;
    const key = String(src?.[field4] ?? "");
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
var EXTRACT_TEXT_VERSION = "strip-v1";
var HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026"
};
function stripV1(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&(\w+);/g, (m, n) => HTML_ENTITIES[n.toLowerCase()] ?? m);
  return t.replace(/\s+/g, " ").trim();
}
registerComponent({
  id: "symbia.transform.extract-text",
  name: "Extract Text",
  description: "Deterministic HTML/text extraction (strip-v1): removes script/style/comments and tags, decodes entities, collapses whitespace. The recipe carries input and output sha256, so the derivation is recomputable by anyone holding the bytes \u2014 same input, same version, same output, forever.",
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    field: {
      type: "string",
      required: false,
      default: "body",
      description: 'Field of the incoming message holding the source string. Omitted, "body" \u2014 the shape symbia.io.http-request emits.'
    }
  },
  lanes: {
    out: {
      lane: "canonical",
      receipt: "recipe",
      note: "the DERIVATION is canonical \u2014 recomputable from the input bytes and the pinned algorithm version in the recipe. Content fetched apocryphal stays apocryphal by tightening; the receipt still proves the extraction was faithful to whatever arrived."
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: (input, ctx) => {
    const field4 = String(ctx.config.field ?? "body");
    const src = input.value?.[field4];
    if (typeof src !== "string") {
      return {
        error: {
          value: {
            error: `extract-text refused: field "${field4}" is ${src === void 0 ? "absent" : typeof src}, not a string`,
            accepts: "a message whose configured field holds the source markup or text"
          },
          lane: "apocryphal"
        }
      };
    }
    const inputSha256 = createHash("sha256").update(src).digest("hex");
    const text = stripV1(src);
    const outputSha256 = createHash("sha256").update(text).digest("hex");
    return {
      out: {
        value: { text, sha256: outputSha256, chars: text.length, algorithm: EXTRACT_TEXT_VERSION },
        lane: "canonical",
        receipt: {
          kind: "recipe",
          source: "symbia.transform.extract-text",
          recipe: {
            algorithm: EXTRACT_TEXT_VERSION,
            inputSha256,
            outputSha256,
            inputChars: src.length,
            outputChars: text.length
          }
        }
      }
    };
  }
});
registerComponent({
  id: "symbia.canon.certify",
  name: "Certify Canon",
  description: "Fixes a corpus before judgment: writes a canon manifest to the catalog and attaches each item's bytes as an artifact. The catalog computes its own sha256 per artifact; this component verifies that second witness against its own digest and refuses on mismatch. The certification is the manifest's ledger position \u2014 everything after it can be checked, nothing before it can be smuggled in.",
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    keyPrefix: {
      type: "string",
      required: false,
      default: "canon",
      description: "Catalog key prefix; the resource lands at <prefix>/<slug>."
    }
  },
  lanes: {
    out: {
      lane: "canonical",
      receipt: "recipe",
      note: "the manifest is recomputable from the item digests the recipe carries. The certified CONTENT keeps whatever lane it arrived on \u2014 certification fixes bytes, it does not bless them."
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: async (input, ctx) => {
    const v = input.value ?? {};
    const items = Array.isArray(v.items) ? v.items : [];
    if (items.length === 0 || items.some((i) => !i?.name || typeof i?.content !== "string")) {
      return {
        error: {
          value: {
            error: "certify refused: items must be a non-empty array of {name, content}",
            accepts: "{slug?, title?, items: [{name, content, url?, mimeType?}]}"
          },
          lane: "apocryphal"
        }
      };
    }
    const catalogUrl = process.env.CATALOG_SERVICE_URL;
    if (!catalogUrl) {
      return {
        error: { value: { error: "certify refused: CATALOG_SERVICE_URL is not set \u2014 no catalog to certify into" }, lane: "apocryphal" }
      };
    }
    const digests = items.map((i) => ({
      name: i.name,
      url: i.url,
      sha256: createHash("sha256").update(i.content).digest("hex"),
      bytes: Buffer.byteLength(i.content)
    }));
    const slug = (v.slug ?? `corpus-${Date.now()}`).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const headers = { "content-type": "application/json", "X-Service-Auth": "internal" };
    try {
      const rRes = await fetch(`${catalogUrl}/api/contexts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: `${String(ctx.config.keyPrefix ?? "canon")}/${slug}`,
          name: v.title ?? `Canon \u2014 ${slug}`,
          type: "context",
          tags: ["canon", "certified"],
          content: { certified: true, items: digests }
        })
      });
      if (!rRes.ok) {
        return { error: { value: { error: `catalog refused the manifest: ${rRes.status}`, detail: (await rRes.text()).slice(0, 300) }, lane: "apocryphal" } };
      }
      const resource = await rRes.json();
      const attached = [];
      for (const [idx, item] of items.entries()) {
        const aRes = await fetch(`${catalogUrl}/api/resources/${resource.id}/artifacts`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: item.name,
            // text/html is not in the catalog's MIME allowlist; canon text
            // travels as text/plain, and the manifest records the original.
            type: item.mimeType && item.mimeType !== "text/html" ? item.mimeType : "text/plain",
            content: Buffer.from(item.content).toString("base64")
          })
        });
        if (!aRes.ok) {
          return { error: { value: { error: `artifact upload refused for "${item.name}": ${aRes.status}`, detail: (await aRes.text()).slice(0, 300), resourceId: resource.id, attachedSoFar: attached.length }, lane: "apocryphal" } };
        }
        const artifact = await aRes.json();
        if (artifact.checksum && artifact.checksum !== digests[idx].sha256) {
          return { error: { value: { error: `checksum mismatch on "${item.name}": component ${digests[idx].sha256}, catalog ${artifact.checksum}`, meaning: "the stored bytes are not the certified bytes; nothing was certified" }, lane: "apocryphal" } };
        }
        attached.push({ name: item.name, sha256: digests[idx].sha256, artifactId: artifact.id, catalogChecksum: artifact.checksum, secondWitness: artifact.checksum === digests[idx].sha256 });
      }
      return {
        out: {
          value: { resourceId: resource.id, key: resource.key, items: attached },
          lane: "canonical",
          receipt: {
            kind: "recipe",
            source: "symbia.canon.certify",
            recipe: { items: digests.map(({ name, sha256: sha2562 }) => ({ name, sha256: sha2562 })) }
          }
        }
      };
    } catch (e) {
      return { error: { value: { error: `certify failed: ${e.message}` }, lane: "apocryphal" } };
    }
  }
});
var CHECK_CLAIMS_VERSION = "check-v2";
var DEFAULT_MAX_QUOTE_OCCURRENCES = 3;
function occurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}
function normV1(s) {
  return s.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}
var NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:billion|trillion|million|thousand|percent|%))?/g;
function numbersOf(text) {
  const found = normV1(text).match(NUMBER_RE) ?? [];
  return Array.from(new Set(found.map((n) => n.trim()).filter((n) => /\d/.test(n))));
}
function numberInCanon(n, canonAll) {
  const variants = /* @__PURE__ */ new Set([n, n.replace(/\$/g, ""), n.replace(/\s*percent/, "%"), n.replace(/%/, " percent")]);
  for (const v of variants) {
    if (!v) continue;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\d.,])${escaped}(?!\\d)(?![.,]\\d)`).test(canonAll)) return true;
  }
  return false;
}
function checkClaimsCore(claims, canon, maxQuoteOccurrences = DEFAULT_MAX_QUOTE_OCCURRENCES) {
  const normCanon = {};
  for (const [k, v] of Object.entries(canon)) normCanon[k] = normV1(v);
  const all = Object.values(normCanon).join(" || ");
  const results = claims.map((c, i) => {
    const id = c.id ?? `claim-${i + 1}`;
    const problems = [];
    const src = String(c.source ?? "");
    const q = normV1(String(c.quote ?? ""));
    if (!q) {
      problems.push("no quote offered \u2014 a claim with no citation cannot be checked, which is not the same as being false");
    } else if (!(src in normCanon)) {
      problems.push(`cited source "${src}" is not in this canon`);
    } else if (!normCanon[src].includes(q)) {
      problems.push(
        all.includes(q) ? `quote is not in the cited source "${src}" \u2014 it appears in another canonical source, so this is a misattribution rather than an invention` : "quote does not appear verbatim in any canonical source"
      );
    } else {
      const occ = occurrences(all, q);
      if (occ > maxQuoteOccurrences) {
        problems.push(
          `quote occurs ${occ} times across canon (limit ${maxQuoteOccurrences}) \u2014 it locates no particular passage, so it cannot show where this claim came from. Quote something distinctive enough to point at one place.`
        );
      }
    }
    for (const n of numbersOf(String(c.claim ?? ""))) {
      if (!numberInCanon(n, all)) problems.push(`number "${n}" does not appear anywhere in canon`);
    }
    return { id, status: problems.length === 0 ? "PASS" : "FAIL", problems };
  });
  return {
    results,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length
  };
}
var CONTROL_CANON = {
  "ctrl-a.txt": "The first canonical document. Value: 42 percent of the total, per the register and the appendix.",
  "ctrl-b.txt": "The second canonical document mentions a distinct phrase. Reach the office at (202) 514-3435 for the schedule."
};
var CONTROL_CLAIMS = [
  { id: "honest", claim: "The value is 42 percent.", source: "ctrl-a.txt", quote: "Value: 42 percent" },
  { id: "fabricated-number", claim: "The value is 99 percent.", source: "ctrl-a.txt", quote: "Value: 42 percent" },
  { id: "paraphrase-as-quote", claim: "The value is stated.", source: "ctrl-a.txt", quote: "the value equals forty-two" },
  { id: "wrong-source", claim: "A distinct phrase appears.", source: "ctrl-a.txt", quote: "mentions a distinct phrase" },
  // THE TWO v1 SHIPPED WITHOUT, WHICH IS WHY ITS CONTROL PROVED NOTHING.
  //
  // Every v1 vector used a quote of 17-26 distinctive characters — precisely
  // the case the matching handled correctly. An external review pointed out
  // that following the recommended procedure therefore produced three green
  // checks and false confidence. A control that only exercises the working
  // path is decoration. These two fail on v1 and pass on v2.
  { id: "ubiquitous-quote", claim: "Something was documented.", source: "ctrl-a.txt", quote: "the" },
  { id: "substring-number", claim: "There were 14 findings.", source: "ctrl-b.txt", quote: "mentions a distinct phrase" }
];
var CONTROL_EXPECTED = {
  honest: "PASS",
  "fabricated-number": "FAIL",
  "paraphrase-as-quote": "FAIL",
  "wrong-source": "FAIL",
  "ubiquitous-quote": "FAIL",
  "substring-number": "FAIL"
};
var CHECK_CONTROL = (() => {
  try {
    const { results } = checkClaimsCore(CONTROL_CLAIMS, CONTROL_CANON);
    const got = Object.fromEntries(results.map((r) => [r.id, r.status]));
    const wrong = Object.entries(CONTROL_EXPECTED).filter(([k, v]) => got[k] !== v);
    return wrong.length === 0 ? { ok: true, detail: `${CHECK_CLAIMS_VERSION} control: 1 honest claim passed, 5 planted failures caught (fabricated number, paraphrase-as-quote, wrong-source, ubiquitous quote, number inside another number)` } : { ok: false, detail: wrong.map(([k, v]) => `${k}: expected ${v}, got ${got[k] ?? "no result"}`).join("; ") };
  } catch (e) {
    return { ok: false, detail: `control threw: ${e.message}` };
  }
})();
if (!CHECK_CONTROL.ok) {
  console.error(`[components] symbia.canon.check-claims CONTROL FAILED \u2014 ${CHECK_CONTROL.detail}. The component will refuse every invocation.`);
}
async function loadCanonFromCatalog(resourceId) {
  const catalogUrl = process.env.CATALOG_SERVICE_URL;
  if (!catalogUrl) throw new Error("CATALOG_SERVICE_URL is not set \u2014 no catalog to read canon from");
  const headers = { "X-Service-Auth": "internal" };
  const listRes = await fetch(`${catalogUrl}/api/resources/${resourceId}/artifacts`, { headers });
  if (!listRes.ok) throw new Error(`artifact list refused: ${listRes.status} ${(await listRes.text()).slice(0, 200)}`);
  const artifacts = await listRes.json();
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error(`resource ${resourceId} carries no artifacts \u2014 nothing to check against`);
  const out = {};
  for (const a of artifacts) {
    const dRes = await fetch(`${catalogUrl}/api/artifacts/${a.id}/download`, { headers });
    if (!dRes.ok) throw new Error(`download refused for "${a.name}": ${dRes.status} ${(await dRes.text()).slice(0, 200)}`);
    out[a.name] = await dRes.text();
  }
  return out;
}
registerComponent({
  id: "symbia.canon.check-claims",
  name: "Check Claims Against Canon",
  description: "Mechanically checks a claim register against a certified corpus: every quote must appear verbatim in the source it cites, every number must appear somewhere in canon. Distinguishes invention from misattribution. Carries its own control vectors, run at registration \u2014 a checker that cannot detect a planted failure refuses to answer at all. The verdict is recomputable from the canon digests, the claims digest and the pinned algorithm version, all of which the recipe carries.",
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    canonResourceId: {
      type: "string",
      required: false,
      description: "Catalog resource holding the certified canon as artifacts. May instead be supplied per-message as canonResourceId, or the canon passed inline as canon: [{name, text}]."
    }
  },
  lanes: {
    out: {
      lane: "canonical",
      receipt: "recipe",
      note: "the VERDICT is recomputable \u2014 same canon digests, same claims, same algorithm version, same result, forever. A verdict about claims that arrived apocryphal tightens to apocryphal like any derivation: the checking was faithful, the thing checked was not recomputable."
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  meta: {
    algorithm: CHECK_CLAIMS_VERSION,
    controlVectors: CONTROL_CLAIMS.length,
    controlStatus: CHECK_CONTROL.ok ? "passing" : "FAILING",
    controlDetail: CHECK_CONTROL.detail
  },
  handler: async (input, ctx) => {
    if (!CHECK_CONTROL.ok) {
      return {
        error: {
          value: {
            error: "check-claims refuses to answer: its own control vectors did not pass at registration",
            control: CHECK_CONTROL.detail,
            meaning: "A checker that cannot detect a planted failure would return PASS for everything, which is indistinguishable from working. No verdict was produced."
          },
          lane: "apocryphal"
        }
      };
    }
    const v = input.value ?? {};
    const claims = Array.isArray(v.claims) ? v.claims : [];
    if (claims.length === 0) {
      return {
        error: {
          value: {
            error: "check-claims refused: no claims to check",
            accepts: "{claims: [{id?, claim, source, quote}], and either canon: [{name, text}] or canonResourceId}"
          },
          lane: "apocryphal"
        }
      };
    }
    let canon = {};
    const rid = v.canonResourceId ?? (ctx.config.canonResourceId ? String(ctx.config.canonResourceId) : void 0);
    if (Array.isArray(v.canon) && v.canon.length > 0) {
      for (const c of v.canon) canon[String(c.name)] = String(c.text ?? "");
    } else if (rid) {
      try {
        canon = await loadCanonFromCatalog(rid);
      } catch (e) {
        return {
          error: {
            value: { error: `check-claims could not read its canon: ${e.message}`, canonResourceId: rid },
            lane: "apocryphal"
          }
        };
      }
    } else {
      return {
        error: {
          value: {
            error: "check-claims refused: no canon supplied",
            meaning: "Checking claims against nothing would pass everything. A corpus must be named before a verdict can mean anything."
          },
          lane: "apocryphal"
        }
      };
    }
    const canonDigests = {};
    for (const [name, text] of Object.entries(canon)) {
      canonDigests[name] = createHash("sha256").update(text).digest("hex");
    }
    const { results, passed, failed } = checkClaimsCore(claims, canon);
    const verdictBody = {
      algorithm: CHECK_CLAIMS_VERSION,
      results: results.map((r) => ({ id: r.id, status: r.status, problems: r.problems }))
    };
    const verdictSha256 = createHash("sha256").update(JSON.stringify(verdictBody)).digest("hex");
    const claimsSha256 = createHash("sha256").update(JSON.stringify(claims.map((c) => ({ id: c.id ?? null, claim: c.claim ?? null, source: c.source ?? null, quote: c.quote ?? null })))).digest("hex");
    return {
      out: {
        value: {
          clean: failed === 0,
          passed,
          failed,
          results,
          verdictSha256,
          algorithm: CHECK_CLAIMS_VERSION,
          canon: canonDigests
        },
        lane: "canonical",
        receipt: {
          kind: "recipe",
          source: "symbia.canon.check-claims",
          recipe: {
            algorithm: CHECK_CLAIMS_VERSION,
            canon: canonDigests,
            claimsSha256,
            verdictSha256,
            control: CHECK_CONTROL.detail
          }
        }
      }
    };
  }
});
function validateNodeConfig(componentId, config2) {
  const def = getComponent(componentId);
  if (!def?.config) return [];
  const declared = def.config;
  const given = config2 ?? {};
  const problems = [];
  for (const [name, field4] of Object.entries(declared)) {
    const has = Object.prototype.hasOwnProperty.call(given, name) && given[name] !== void 0;
    if (!has) {
      if (field4.required && field4.default === void 0) {
        problems.push(`"${name}" is required (${field4.description})`);
      }
      continue;
    }
    const v = given[name];
    const actual = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
    const wanted = field4.type;
    const ok = wanted === "any" ? true : wanted === "array" ? Array.isArray(v) : wanted === "object" ? actual === "object" : actual === wanted;
    if (!ok) {
      problems.push(
        `"${name}" is declared ${wanted} but received ${actual} (${JSON.stringify(v)}). The value is not coerced \u2014 declare it as ${wanted} in the graph.`
      );
      continue;
    }
    if (field4.enum && !field4.enum.includes(String(v))) {
      problems.push(`"${name}" must be one of ${field4.enum.join(", ")} \u2014 received ${JSON.stringify(v)}`);
    }
  }
  for (const name of Object.keys(given)) {
    if (!(name in declared)) {
      const near = Object.keys(declared).filter(
        (d) => d.toLowerCase() === name.toLowerCase()
      );
      problems.push(
        `"${name}" is not a config field of ${componentId}` + (near.length ? ` \u2014 did you mean "${near[0]}"?` : "") + `. Declared fields: ${Object.keys(declared).join(", ") || "(none)"}. An unknown key would silently do nothing, so it is refused instead.`
      );
    }
  }
  return problems;
}
var CONSTANT_TYPES = ["string", "integer", "number", "boolean", "null", "json"];
function parseConstant(declared, raw) {
  const refuse2 = (why) => {
    throw new Error(
      `symbia.compute.constant refuses: ${why}. A constant is an assertion; it will not emit a value that differs from the one declared.`
    );
  };
  if (!CONSTANT_TYPES.includes(declared)) {
    refuse2(
      `config.type is ${declared ? `"${declared}"` : "missing"}; declare one of ` + CONSTANT_TYPES.map((t) => `"${t}"`).join(", ")
    );
  }
  if (declared === "null") {
    if (raw !== void 0 && raw !== "null") refuse2(`type "null" cannot carry the value "${raw}"`);
    return null;
  }
  if (raw === void 0) refuse2(`type "${declared}" needs a config.value`);
  const text = raw;
  switch (declared) {
    case "string":
      return text;
    case "boolean":
      if (text !== "true" && text !== "false") {
        refuse2(`type "boolean" accepts only "true" or "false", not "${text}"`);
      }
      return text === "true";
    case "integer": {
      if (!/^-?\d+$/.test(text)) refuse2(`"${text}" is not written as an integer`);
      const n = Number(text);
      if (!Number.isSafeInteger(n)) {
        refuse2(
          `"${text}" is outside the range JavaScript can hold exactly (it would become ${n}). If this is an identifier rather than a quantity, declare it as "string"`
        );
      }
      if (String(n) !== text) {
        refuse2(
          `"${text}" would be emitted as ${n}. If the notation is significant \u2014 leading zeros in a part number, a zip code \u2014 declare it as "string"`
        );
      }
      return n;
    }
    case "number": {
      const n = Number(text);
      if (text.trim() === "" || !Number.isFinite(n)) refuse2(`"${text}" is not a finite number`);
      if (String(n) !== text) {
        refuse2(
          `"${text}" would be emitted as ${n}, which is not what was written. Write it the way it will be stored (${n}), or declare it as "string" if the notation matters`
        );
      }
      return n;
    }
    case "json": {
      try {
        return JSON.parse(text);
      } catch (e) {
        refuse2(`type "json" could not parse the value: ${e.message}`);
      }
    }
  }
  return refuse2(`unreachable type "${declared}"`);
}
registerComponent({
  id: "symbia.compute.constant",
  name: "Constant",
  description: "Emits a value declared in config, regardless of input. Canonical: recomputable by reading the config. The recipe records it as a literal, so a reader can tell an asserted value from a measured one. Optionally merges into the incoming message rather than replacing it.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    type: {
      type: "string",
      required: true,
      enum: [...CONSTANT_TYPES],
      description: 'The declared type of the literal. There is NO inference: a constant is an assertion, and an assertion whose type was guessed is one the author did not make. "integer" and "number" additionally require that the emitted value round-trips to exactly what was written.'
    },
    value: {
      type: "string",
      required: true,
      description: "The literal, written out. Must satisfy the declared type or the component refuses \u2014 it will not be the place where the config and the value quietly diverge."
    },
    field: {
      type: "string",
      required: false,
      description: "When set, the literal is merged into the incoming object under this field instead of replacing the message. Omitted, the literal becomes the whole value."
    }
  },
  lanes: {
    out: {
      lane: "canonical",
      receipt: "recipe",
      note: "a literal is recomputable from the config that declares it. NOTE what this component demonstrates: lane tightening demotes it when the triggering message arrived apocryphal, even though the value does not depend on that message at all \u2014 producing an apocryphal value that carries a full recipe. The demotion is CORRECT and stays; what is missing is a record of the seam where it happened. See the arbitrage lane in docs/missing-primitives.md."
    }
  },
  handler: (input, ctx) => {
    const declared = String(ctx.config.type ?? "");
    const raw = ctx.config.value === void 0 ? void 0 : String(ctx.config.value);
    const literal = parseConstant(declared, raw);
    const field4 = ctx.config.field ? String(ctx.config.field) : void 0;
    const value = field4 ? { ...input.value ?? {}, [field4]: literal } : literal;
    return {
      out: {
        value,
        lane: "canonical",
        receipt: {
          kind: "recipe",
          source: "symbia.compute.constant",
          recipe: {
            operation: "literal",
            inputs: {
              literal,
              declaredType: declared,
              declaredAs: raw ?? null,
              mergedInto: field4 ?? null
            }
          }
        }
      }
    };
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

// ../runtime/server/src/executor/components-sinks.ts
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

// ../runtime/server/src/executor/metric-writer.ts
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

// ../runtime/server/src/executor/state-store.ts
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

// ../runtime/server/src/db.ts
import { initializeDatabase } from "@symbia/db";

// ../runtime/server/src/memory-schema.ts
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

// ../runtime/server/src/db.ts
var database = initializeDatabase({
  serviceId: "runtime-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "RUNTIME_USE_MEMORY_DB"
});
var { db, pool, isMemory, close } = database;
var isDurable = !isMemory;

// ../runtime/server/src/executor/components-state.ts
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
registerComponent({
  id: "symbia.state.accumulate",
  name: "Accumulate",
  description: 'Running count and total per key. Unlike rollup, repeated observations of the same key ADD rather than replace \u2014 this answers "how much has arrived?" rather than "is the declared set complete?".',
  inputs: ["in"],
  outputs: ["out"],
  config: {
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Field locating the key. Messages without it accumulate under the empty key."
    },
    valueField: {
      type: "string",
      required: false,
      description: 'Numeric field to total. Omitted, only the count advances \u2014 which is the honest behaviour for "how many times", and avoids inventing a 1 the message did not carry.'
    }
  },
  lanes: {
    out: {
      lane: "inherit",
      note: "a running total is exactly as good as the messages that built it, and it carries no claim of completeness \u2014 nothing here declares an expected set, so do not read a total as a whole. That question is rollup's."
    }
  },
  handler: (input, ctx) => {
    const keyField = String(ctx.config.keyField ?? "key");
    const valueField = ctx.config.valueField ? String(ctx.config.valueField) : void 0;
    const state = stateFor(ctx);
    const key = String(field2(input.value, keyField) ?? "");
    const prior = state.get(key) ?? {
      count: 0,
      total: 0
    };
    let added = null;
    if (valueField) {
      const n = Number(field2(input.value, valueField));
      if (Number.isFinite(n)) added = n;
    }
    const next = { count: prior.count + 1, total: prior.total + (added ?? 0) };
    state.set(key, next);
    return {
      out: {
        value: {
          key,
          count: next.count,
          total: valueField ? next.total : null,
          added,
          counting: valueField ?? null,
          message: input.value
        },
        lane: input.lane,
        receipt: {
          kind: "recipe",
          source: "symbia.state.accumulate",
          recipe: {
            operation: "running-total",
            inputs: {
              key,
              priorCount: prior.count,
              priorTotal: valueField ? prior.total : null,
              added,
              note: "recomputable only by replaying this message sequence into this node; the prior state is named so the single step is checkable"
            }
          }
        }
      }
    };
  }
});
registerComponent({
  id: "symbia.state.delta",
  name: "Delta",
  description: 'Reports whether the value at config.valueField differs from the last value seen under the same key. Routes to "first" (never seen), "changed", or "unchanged". Answers the question latest-per-key components structurally cannot: what moved?',
  inputs: ["in"],
  outputs: ["first", "changed", "unchanged"],
  config: {
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Field locating the identity being tracked. Messages without it are tracked under the empty key."
    },
    valueField: {
      type: "string",
      required: false,
      description: "Field holding the value to compare. Omitted, the whole message is compared structurally."
    }
  },
  lanes: {
    first: { lane: "inherit" },
    changed: { lane: "inherit" },
    unchanged: { lane: "inherit" }
  },
  handler: (input, ctx) => {
    const keyField = String(ctx.config.keyField ?? "key");
    const valueField = ctx.config.valueField ? String(ctx.config.valueField) : void 0;
    const state = stateFor(ctx);
    const key = String(field2(input.value, keyField) ?? "");
    const current = valueField ? field2(input.value, valueField) : input.value;
    const slot = state.get(key);
    const seen = slot !== void 0;
    const previous = seen ? slot.value : null;
    const same = seen && JSON.stringify(previous) === JSON.stringify(current);
    const observations = (slot?.observations ?? 0) + 1;
    state.set(key, { value: current, observations });
    const numeric = typeof current === "number" && typeof previous === "number" ? current - previous : null;
    const payload = {
      key,
      value: current,
      previous,
      first: !seen,
      changed: !seen || !same,
      delta: numeric,
      observations,
      message: input.value
    };
    const receipt = {
      kind: "recipe",
      source: "symbia.state.delta",
      recipe: {
        operation: "structural-inequality",
        inputs: {
          key,
          previous,
          current,
          observations,
          note: "recomputable only by replaying this message sequence into this node; both operands are named so the comparison itself is checkable without the history"
        }
      }
    };
    const port = !seen ? "first" : same ? "unchanged" : "changed";
    return { [port]: { value: payload, lane: input.lane, receipt } };
  }
});

// ../runtime/server/src/executor/components-catalog.ts
import { createHash as createHash2 } from "crypto";
function resolveNamespacedKey(namespace, key) {
  const ns = String(namespace ?? "").trim();
  const k = String(key ?? "").trim();
  if (!ns) {
    throw new Error(
      "catalog components require config.namespace \u2014 an undeclared reach into the catalog is what these components exist to prevent"
    );
  }
  if (ns.includes("..") || ns.startsWith("/")) throw new Error(`namespace "${ns}" is not a plain prefix`);
  if (!k) throw new Error("no key: config.key was not set and the message carried nothing at config.keyField");
  if (k.includes("..")) {
    throw new Error(`key "${k}" contains ".." \u2014 refused, because a key that walks out of its namespace is not in it`);
  }
  const prefix = ns.endsWith("/") ? ns : `${ns}/`;
  if (k.startsWith("/")) {
    throw new Error(`key "${k}" is absolute; keys are relative to the declared namespace "${prefix}"`);
  }
  if (k.startsWith(prefix)) return k;
  if (k.includes("/") && k.split("/")[0] !== ns.split("/")[0]) {
    throw new Error(
      `key "${k}" names a different namespace than the declared "${prefix}". Write it relative to the namespace, or declare the namespace it belongs to.`
    );
  }
  return `${prefix}${k}`;
}
function laneForCatalogRead(pinnedVersion) {
  return pinnedVersion ? {
    lane: "canonical",
    receiptKind: "recipe",
    why: `pinned to version ${pinnedVersion}: the same key at the same version is the same bytes for anyone, forever`
  } : {
    lane: "apocryphal",
    receiptKind: "witness",
    why: "unpinned read of a mutable registry: these are the bytes received, and a later read may differ. Pin config.version to make this recomputable."
  };
}
function catalogBase() {
  const url = process.env.CATALOG_SERVICE_URL;
  if (!url) throw new Error("CATALOG_SERVICE_URL is not set \u2014 there is no catalog to reach");
  return url.replace(/\/$/, "");
}
function callerHeaders(ctx) {
  const token = ctx.authToken ?? process.env.IMAGINE_HOST_TOKEN;
  if (!token) {
    throw new Error(
      "no caller credential available for a catalog call. These components deliberately do not fall back to the X-Service-Auth: internal bypass that canon.certify uses \u2014 a graph writing the runtime's own definition must do so as someone."
    );
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
function keyFrom(input, ctx) {
  if (ctx.config.key !== void 0) return String(ctx.config.key);
  const field4 = String(ctx.config.keyField ?? "key");
  const v = input.value;
  return String(v && typeof v === "object" ? v[field4] ?? "" : "");
}
var sha256 = (s) => createHash2("sha256").update(s, "utf8").digest("hex");
registerComponent({
  id: "symbia.catalog.get",
  name: "Catalog Read",
  capability: "catalog.read",
  description: 'Reads a catalog resource by key, within a namespace the node declares. A read pinned to config.version is canonical with a recipe \u2014 the same key at the same version is the same bytes for anyone, forever. An unpinned read of a mutable registry is apocryphal with a witness over the bytes actually received. Routes to "found" or "missing".',
  inputs: ["in"],
  outputs: ["found", "missing", "error"],
  config: {
    namespace: {
      type: "string",
      required: true,
      description: "Key prefix this node may read. Declared in the graph so an auditor reads which nodes touch which part of the catalog off the document."
    },
    key: {
      type: "string",
      required: false,
      description: "Literal key, relative to the namespace. Omitted, the key comes from the message at keyField."
    },
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Where to find the key in the message when config.key is not set."
    },
    version: {
      type: "string",
      required: false,
      description: "Pin the read to a version. THIS IS THE LANE DECISION: pinned reads are canonical and recomputable; unpinned reads are apocryphal and witnessed."
    }
  },
  lanes: {
    found: {
      lane: "conditional",
      receipt: "recipe",
      note: "decided by config.version: pinned is canonical with a recipe (same key + same version = same bytes, forever); unpinned is apocryphal with a witness, because a registry is mutable by design and a later read may differ. NOTE that `conditional` is currently not acted on by normaliseEmission (N5 in docs/missing-primitives.md) \u2014 this handler emits the correct lane itself, and this is the second component relying on a declaration the runtime does not enforce."
    },
    missing: { lane: "inherit" },
    error: {
      lane: "apocryphal",
      note: "a failed read is a fact about this attempt, not about the catalog"
    }
  },
  handler: async (input, ctx) => {
    let key;
    try {
      key = resolveNamespacedKey(String(ctx.config.namespace ?? ""), keyFrom(input, ctx));
    } catch (e) {
      return { error: { value: { error: e.message }, lane: "apocryphal" } };
    }
    const version = ctx.config.version === void 0 ? void 0 : String(ctx.config.version);
    const decision = laneForCatalogRead(version);
    try {
      const res = await fetch(`${catalogBase()}/api/resources?key=${encodeURIComponent(key)}`, {
        headers: callerHeaders(ctx)
      });
      if (!res.ok) {
        return {
          error: {
            value: { error: `catalog read failed: ${res.status} ${await res.text()}`, key },
            lane: "apocryphal"
          }
        };
      }
      const list = await res.json();
      const hit = Array.isArray(list) ? list.find((r) => r.key === key) : void 0;
      if (!hit) return { missing: { value: { key, found: false }, lane: input.lane } };
      const body = JSON.stringify(hit);
      const digest = sha256(body);
      return {
        found: {
          value: hit,
          lane: decision.lane,
          laneReason: decision.why,
          receipt: decision.receiptKind === "recipe" ? {
            kind: "recipe",
            source: "symbia.catalog.get",
            recipe: {
              operation: "catalog.read",
              inputs: { key, version, sha256: digest, note: decision.why }
            }
          } : {
            kind: "witness",
            source: `catalog:${key}`,
            witness: { algorithm: "sha256", digest, bytes: body.length, transport: "http" }
          }
        }
      };
    } catch (e) {
      return { error: { value: { error: e.message, key }, lane: "apocryphal" } };
    }
  }
});
registerComponent({
  id: "symbia.catalog.put",
  name: "Catalog Write",
  capability: "catalog.write",
  description: "Writes a resource to the catalog under a namespace the node declares. THIS WRITES THE RUNTIME'S OWN DEFINITION \u2014 catalog + configuration = runtime \u2014 so it refuses keys outside its declared namespace and never uses the internal-auth bypass. The confirmation inherits the written value's lane: writing apocryphal bytes does not yield a canonical receipt.",
  inputs: ["in"],
  outputs: ["out", "error"],
  config: {
    namespace: {
      type: "string",
      required: true,
      description: "Key prefix this node may write. Keys outside it are refused, not re-rooted."
    },
    type: {
      type: "string",
      required: true,
      description: "Catalog resource type. Required rather than defaulted: the catalog enforces key-prefix/type agreement, and guessing it here would be inference where declaration is free."
    },
    key: { type: "string", required: false, description: "Literal key, relative to the namespace." },
    keyField: {
      type: "string",
      required: false,
      default: "key",
      description: "Where to find the key in the message when config.key is not set."
    },
    valueField: {
      type: "string",
      required: false,
      description: "Field holding the value to store. Omitted, the whole message is stored."
    }
  },
  lanes: {
    out: {
      lane: "inherit",
      receipt: "recipe",
      note: "the confirmation is exactly as good as what was written \u2014 an apocryphal value written to the catalog yields an apocryphal confirmation, because the write does not launder it"
    },
    error: { lane: "apocryphal" }
  },
  handler: async (input, ctx) => {
    let key;
    try {
      key = resolveNamespacedKey(String(ctx.config.namespace ?? ""), keyFrom(input, ctx));
    } catch (e) {
      return { error: { value: { error: e.message }, lane: "apocryphal" } };
    }
    const valueField = ctx.config.valueField ? String(ctx.config.valueField) : void 0;
    const stored = valueField ? input.value?.[valueField] : input.value;
    const body = JSON.stringify(stored ?? null);
    const digest = sha256(body);
    try {
      const res = await fetch(`${catalogBase()}/api/resources`, {
        method: "POST",
        headers: callerHeaders(ctx),
        body: JSON.stringify({
          key,
          type: String(ctx.config.type),
          name: key.split("/").slice(-1)[0],
          description: `written by graph node ${ctx.nodeId}`,
          metadata: { value: stored, sha256: digest, writtenBy: ctx.nodeId, graph: ctx.graphKey }
        })
      });
      if (!res.ok) {
        return {
          error: {
            value: { error: `catalog write refused: ${res.status} ${await res.text()}`, key },
            lane: "apocryphal"
          }
        };
      }
      const resource = await res.json();
      return {
        out: {
          value: {
            key,
            resourceId: resource.id ?? null,
            version: resource.version ?? null,
            sha256: digest
          },
          lane: input.lane,
          receipt: {
            kind: "recipe",
            source: "symbia.catalog.put",
            recipe: {
              operation: "catalog.write",
              inputs: {
                key,
                namespace: String(ctx.config.namespace),
                type: String(ctx.config.type),
                sha256: digest
              }
            }
          }
        }
      };
    } catch (e) {
      return { error: { value: { error: e.message, key }, lane: "apocryphal" } };
    }
  }
});

// ../runtime/server/src/executor/components-routine.ts
function stateFor2(ctx) {
  const store2 = getStateStore();
  const graphKey = ctx.graphKey ?? "adhoc";
  return {
    get: (key) => store2.get(graphKey, ctx.nodeId, key),
    set: (key, value) => store2.set(graphKey, ctx.nodeId, key, value)
  };
}
function field3(value, path2) {
  if (!path2) return value;
  return path2.split(".").reduce(
    (acc, part) => acc && typeof acc === "object" ? acc[part] : void 0,
    value
  );
}
function serviceBase(envVar, humanName) {
  const url = process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set \u2014 there is no ${humanName} to reach`);
  return url.replace(/\/$/, "");
}
function callerHeaders2(ctx) {
  const token = ctx.authToken ?? process.env.IMAGINE_HOST_TOKEN;
  if (!token) {
    throw new Error(
      "no caller credential available. A routine step that reaches another service does so as someone; it does not fall back to the internal bypass."
    );
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
var apocryphal = (value) => ({ value, lane: "apocryphal" });
var STEP_META = {
  description: {
    type: "string",
    required: false,
    description: "The step sentence the author wrote. Carried for traceability."
  },
  _debug: {
    type: "object",
    required: false,
    description: "Compiler provenance for this node \u2014 step id, index, type, routine id. Present when the routine was compiled with debug."
  }
};
registerComponent({
  id: "symbia.routine.entry",
  name: "Routine Entry",
  description: "Entry point of a compiled routine. Emits its input unchanged and carries the routine identity the compiler recorded.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    routineId: { type: "string", required: false, description: "Id of the routine this begins." },
    routineName: { type: "string", required: false, description: "Name of the routine this begins." },
    trigger: { type: "string", required: false, description: "The condition the author wrote for when this routine runs." }
  },
  lanes: { out: { lane: "inherit" } },
  handler: (input) => ({ out: input })
});
registerComponent({
  id: "symbia.routine.exit",
  name: "Routine Exit",
  description: "Exit point of a compiled routine. Emits its input unchanged; downstream of it the routine is over.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    routineId: { type: "string", required: false, description: "Id of the routine this ends." },
    exitPoint: { type: "boolean", required: false, description: "Marks this node as the routine exit." }
  },
  lanes: { out: { lane: "inherit" } },
  handler: (input) => ({ out: input })
});
registerComponent({
  id: "symbia.routine.check",
  name: "Check \u2014 a gate",
  description: `Lets a message through when a predicate holds, and stops it when it does not. symbia.logic.filter is the mechanism; this is its step-shaped face. It declares pass and fail, and the compiler wires pass onward while fail goes nowhere, because the routine vocabulary has no way to name a failure target. A stopped message is not lost: it emits on fail and appears in the flow's outputs, so a caller can see what was refused (measured 22 Aug 2026). Anything richer than "continue only when" needs a branch construct the language does not have.`,
  inputs: ["in"],
  outputs: ["pass", "fail"],
  config: {
    field: {
      type: "string",
      required: false,
      description: "Dotted path to the value tested. Omitted, the whole message value is tested."
    },
    op: {
      type: "string",
      required: false,
      default: "exists",
      enum: ["eq", "neq", "gt", "lt", "contains", "exists"],
      description: 'Comparison. An unrecognised value falls through to "exists".'
    },
    value: {
      type: "any",
      required: false,
      description: 'Compared against. Unused by "exists". eq/neq compare with === and do not coerce \u2014 match the type of the field you are testing.'
    },
    ...STEP_META
  },
  lanes: {
    pass: { lane: "inherit" },
    fail: { lane: "inherit" }
  },
  handler: (input, ctx) => {
    const path2 = ctx.config.field ? String(ctx.config.field) : "";
    const actual = field3(input.value, path2);
    const expected = ctx.config.value;
    const op = String(ctx.config.op ?? "exists");
    let passed;
    switch (op) {
      case "eq":
        passed = actual === expected;
        break;
      case "neq":
        passed = actual !== expected;
        break;
      case "gt":
        passed = Number(actual) > Number(expected);
        break;
      case "lt":
        passed = Number(actual) < Number(expected);
        break;
      case "contains":
        passed = String(actual).includes(String(expected));
        break;
      default:
        passed = actual !== void 0 && actual !== null;
    }
    return passed ? { pass: input } : { fail: input };
  }
});
registerComponent({
  id: "symbia.routine.wait",
  name: "Wait",
  description: "Holds a message for config.seconds, then passes it through unchanged. Wraps the same delay symbia.io.delay provides.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    seconds: {
      type: "number",
      required: false,
      default: 1,
      description: "How long to hold the message. Floored at 0; a negative wait is not a wait."
    },
    ...STEP_META
  },
  lanes: { out: { lane: "inherit" } },
  handler: async (input, ctx) => {
    const seconds = Math.max(0, Number(ctx.config.seconds ?? 1));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1e3));
    return { out: input };
  }
});
registerComponent({
  id: "symbia.routine.stop",
  name: "Stop",
  description: "Terminal step. Emits the message to the collect port and routes nothing onward, ending this path of the routine.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    ...STEP_META
  },
  lanes: { out: { lane: "inherit" } },
  handler: (input) => ({ out: input })
});
registerComponent({
  id: "symbia.routine.remember",
  name: "Remember",
  description: "Stores a value under config.key in this node's slice of the state store, keyed by (graphKey, nodeId), and passes the message through. The lane is stored with the value so recall can re-emit it honestly.",
  inputs: ["in"],
  outputs: ["out"],
  config: {
    key: {
      type: "string",
      required: true,
      description: "Name the value is remembered under."
    },
    field: {
      type: "string",
      required: false,
      description: "Dotted path to the part of the message stored. Omitted, the whole message value is stored."
    },
    ...STEP_META
  },
  lanes: { out: { lane: "inherit" } },
  handler: (input, ctx) => {
    const key = String(ctx.config.key ?? "");
    const path2 = ctx.config.field ? String(ctx.config.field) : "";
    const stored = field3(input.value, path2);
    stateFor2(ctx).set(key, { value: stored, lane: input.lane ?? "inherit" });
    return { out: input };
  }
});
registerComponent({
  id: "symbia.routine.recall",
  name: "Recall",
  description: 'Reads a value remembered earlier in this graph and emits it. A recall of nothing is a fact, not an error: it emits on the "missing" port rather than failing, because "we never learned this" is a real answer.',
  inputs: ["in"],
  outputs: ["out", "missing"],
  config: {
    key: { type: "string", required: true, description: "Name to recall." },
    ...STEP_META
  },
  lanes: {
    out: {
      lane: "inherit",
      note: "inherits the lane the value carried when it was remembered, not the lane of the message that triggered the recall"
    },
    missing: {
      lane: "inherit",
      note: "the absence is as canonical as the lookup that found nothing"
    }
  },
  handler: (input, ctx) => {
    const key = String(ctx.config.key ?? "");
    const held = stateFor2(ctx).get(key);
    if (held === void 0) {
      return { missing: { value: { key, recalled: false }, lane: input.lane ?? "inherit" } };
    }
    return { out: { value: held.value, lane: held.lane ?? "inherit" } };
  }
});
registerComponent({
  id: "symbia.routine.think",
  name: "Think",
  description: "Asks the configured model to reason over the message and emits its answer. The answer is apocryphal without exception \u2014 an LLM response cannot be recomputed, so nothing downstream may treat it as canonical.",
  capability: "integrations.execute",
  inputs: ["in"],
  outputs: ["out", "error"],
  emitsApocryphal: true,
  config: {
    prompt: {
      type: "string",
      required: false,
      description: "Prompt template. The step sentence is used when this is omitted. The incoming message value is appended as context."
    },
    provider: { type: "string", required: false, default: "anthropic", description: "LLM provider." },
    model: { type: "string", required: false, description: "Model id. Provider default when omitted." },
    ...STEP_META
  },
  lanes: {
    out: {
      lane: "apocryphal",
      note: "an LLM answer is not recomputable; this lane is not conditional on the prompt, the model, or the caller's confidence"
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: async (input, ctx) => {
    const instruction = String(ctx.config.prompt ?? ctx.config.description ?? "");
    if (!instruction) {
      return { error: apocryphal({ error: "think has no prompt and no step description to fall back on" }) };
    }
    try {
      const res = await fetch(`${serviceBase("INTEGRATIONS_SERVICE_URL", "integrations service")}/api/integrations/execute`, {
        method: "POST",
        headers: callerHeaders2(ctx),
        body: JSON.stringify({
          provider: String(ctx.config.provider ?? "anthropic"),
          operation: "chat.completions",
          params: {
            ...ctx.config.model ? { model: String(ctx.config.model) } : {},
            messages: [
              { role: "system", content: instruction },
              { role: "user", content: JSON.stringify(input.value ?? null) }
            ]
          }
        })
      });
      if (!res.ok) {
        return { error: apocryphal({ error: `think failed: ${res.status} ${await res.text()}` }) };
      }
      return { out: apocryphal(await res.json()) };
    } catch (e) {
      return { error: apocryphal({ error: e.message }) };
    }
  }
});
registerComponent({
  id: "symbia.routine.say",
  name: "Say",
  description: 'Posts a message to the conversation this routine is running in. With no conversation in context it emits on the "collect" port and says so, because a routine that speaks into nowhere should report that rather than appear to have spoken.',
  capability: "messaging.message.send",
  inputs: ["in"],
  outputs: ["out", "collect", "error"],
  config: {
    content: {
      type: "string",
      required: false,
      description: "What to say. The step sentence is used when this is omitted."
    },
    conversationId: {
      type: "string",
      required: false,
      description: "Target conversation. Taken from execution context when omitted."
    },
    ...STEP_META
  },
  lanes: {
    out: { lane: "inherit", note: "the receipt of a send is as canonical as the send" },
    collect: {
      lane: "inherit",
      note: "the words were produced but not delivered; the lane describes the message, and the undelivered fact is stated in the payload"
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: async (input, ctx) => {
    const content = String(ctx.config.content ?? ctx.config.description ?? "");
    const conversationId = (ctx.config.conversationId ? String(ctx.config.conversationId) : void 0) ?? ctx.conversationId;
    if (!conversationId) {
      return {
        collect: {
          value: { spoken: content, delivered: false, reason: "no conversation in context" },
          lane: input.lane ?? "inherit"
        }
      };
    }
    try {
      const res = await fetch(`${serviceBase("MESSAGING_SERVICE_URL", "messaging service")}/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: callerHeaders2(ctx),
        body: JSON.stringify({ content, role: "assistant" })
      });
      if (!res.ok) {
        return { error: apocryphal({ error: `say failed: ${res.status} ${await res.text()}` }) };
      }
      return { out: { value: { spoken: content, delivered: true }, lane: input.lane ?? "inherit" } };
    } catch (e) {
      return { error: apocryphal({ error: e.message }) };
    }
  }
});
var CALLABLE_SERVICES = /* @__PURE__ */ new Set([
  "catalog",
  "identity",
  "logging",
  "messaging",
  "network",
  "directory",
  "runtime",
  "assistants",
  "integrations",
  "models"
]);
registerComponent({
  id: "symbia.routine.call",
  name: "Call",
  description: "Calls a named Symbia service and emits its response. The service must be on the allowlist \u2014 a step that could name any host would be an egress primitive wearing a friendly name.",
  capability: "service.call",
  inputs: ["in"],
  outputs: ["out", "error"],
  emitsApocryphal: true,
  config: {
    service: { type: "string", required: true, description: "Service id. Must be on the allowlist." },
    method: { type: "string", required: false, default: "GET", description: "HTTP method." },
    path: { type: "string", required: true, description: "Path on the service." },
    basePath: {
      type: "string",
      required: false,
      default: "/api",
      description: 'Prefix on the service. Set to "" to reach root endpoints \u2014 every service publishes /openapi.json and /llms.txt outside /api, and a call that silently prefixes /api will 404 on all of them.'
    },
    body: {
      type: "object",
      required: false,
      description: 'Static request body compiled into the routine. Without it a copied script cannot express "send this exact payload" \u2014 the routine family has no literal step, so the body could only arrive as the incoming message. When present this wins over the message value; when absent the incoming message value is the body, as before. Measured 22 Aug 2026: both Spyglass emitters put the body here and were refused at load for it (undeclared key), which was the review finding that earned this field.'
    },
    ...STEP_META
  },
  lanes: {
    out: {
      lane: "apocryphal",
      note: "apocryphal unless the callee returns a receipt, and none currently does. When one does, this becomes conditional on that receipt rather than on the caller's trust in the callee."
    },
    error: { lane: "apocryphal", note: "a refusal is not a recomputable value" }
  },
  handler: async (input, ctx) => {
    const service = String(ctx.config.service ?? "");
    if (!CALLABLE_SERVICES.has(service)) {
      return {
        error: apocryphal({
          error: `call refused: "${service}" is not an allowlisted service`,
          allowed: Array.from(CALLABLE_SERVICES)
        })
      };
    }
    const basePath = ctx.config.basePath === void 0 ? "/api" : String(ctx.config.basePath);
    const path2 = String(ctx.config.path ?? "");
    const method = String(ctx.config.method ?? "GET").toUpperCase();
    const envVar = `${service.toUpperCase().replace(/-/g, "_")}_SERVICE_URL`;
    try {
      const url = `${serviceBase(envVar, `${service} service`)}${basePath}${path2.startsWith("/") ? path2 : `/${path2}`}`;
      const body = ctx.config.body !== void 0 ? ctx.config.body : input.value ?? {};
      const res = await fetch(url, {
        method,
        headers: callerHeaders2(ctx),
        ...method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) }
      });
      const text = await res.text();
      if (!res.ok) {
        return { error: apocryphal({ error: `call failed: ${res.status} ${text}`, service, path: path2 }) };
      }
      try {
        return { out: apocryphal(JSON.parse(text)) };
      } catch {
        return { out: apocryphal(text) };
      }
    } catch (e) {
      return { error: apocryphal({ error: e.message, service, path: path2 }) };
    }
  }
});
registerComponent({
  id: "symbia.routine.repeat",
  name: "Repeat (not implemented)",
  description: "NOT IMPLEMENTED. A loop needs either compile-side unrolling or bounded re-entry in the executor, and the executor rejects cyclic graphs outright \u2014 Kahn's algorithm is what orders the nodes, and a cycle has no topological order. Refuses rather than silently running once.",
  inputs: ["in"],
  outputs: ["error"],
  config: {
    ...STEP_META
  },
  lanes: { error: { lane: "apocryphal", note: "a refusal is not a recomputable value" } },
  handler: () => ({
    error: apocryphal({
      error: "symbia.routine.repeat is not implemented. The executor orders nodes with Kahn's algorithm and rejects cyclic graphs, so a loop must be unrolled at compile time or re-entered under a bound in the executor. Neither exists yet.",
      needs: "compile-side unrolling or executor bounded re-entry"
    })
  })
});
registerComponent({
  id: "symbia.routine.ask",
  name: "Ask (not implemented)",
  description: "NOT IMPLEMENTED. Asking a person a question means suspending the execution and resuming it with their answer. There is no paused execution state and no resume-with-input route, so this refuses rather than inventing an answer or blocking forever.",
  inputs: ["in"],
  outputs: ["error"],
  config: {
    ...STEP_META
  },
  lanes: { error: { lane: "apocryphal", note: "a refusal is not a recomputable value" } },
  handler: () => ({
    error: apocryphal({
      error: "symbia.routine.ask is not implemented. It requires a paused execution state and a resume-with-input route; the executor has neither. An ask that fabricated an answer would be the worst available behaviour.",
      needs: "executor paused state + resume-with-input route"
    })
  })
});

// ../runtime/server/src/executor/components-sources.ts
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

// ../runtime/server/src/executor/graph-executor.ts
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
  /**
   * `source` records WHERE this graph came from, and it is not decoration.
   *
   * Measured 19 Aug against a sealed session bundle: the catalog resource
   * (84364c09…) and the runtime graph it became (ae5cf010…) appear in zero
   * records together. CatalogSync holds the mapping in memory and hydrates on
   * its own timer, so nothing it does is an HTTP mutation and nothing the
   * ledger sees ever says the two are the same thing. A reader of that bundle
   * can establish that a graph was authored and that a graph ran, and cannot
   * establish they are the same graph.
   *
   * Carrying the source on the loaded graph puts the binding into responses
   * that are already recorded — execute and ingress — so the join appears in
   * the chain without a new event type or a new recorder. Provenance breaks
   * wherever a background reconciler moves something instead of a call; this
   * closes it for the one reconciler that exists.
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
      key: opts.key ?? definition.name,
      // Absent when a graph was loaded some other way. Stated as absent rather
      // than defaulted, because "hydrated from nothing in particular" and
      // "hydrated from catalog resource X" are different facts.
      source: opts.source
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
  async runFlow(execution, graph, startNodeId, startPort, seed, authToken) {
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
            authToken,
            config: node.config ?? {},
            log: (m) => trace.push({ node: nodeId, port: "log", lane: msg.lane, ms: 0, summary: m })
          });
          emitted = normaliseEmission(raw, msg, component, (arb) => {
            trace.push({
              node: nodeId,
              port: arb.port,
              lane: arb.to,
              ms: 0,
              summary: `ARBITRAGE ${arb.from} \u2192 ${arb.to}: ${arb.because}` + (arb.held.recomputable ? " \u2014 NOTE the value is still recomputable from its own recipe; it was demoted by its company, not by its derivation" : ""),
              ...arb.held.receipt ? { receipt: arb.held.receipt } : {},
              laneReason: arb.because
            });
          });
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
  async injectMessage(executionId, nodeId, port, value, authToken) {
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
    const seed = {
      value,
      lane: "apocryphal",
      laneReason: "injected over HTTP: witnessed testimony from a client, not recomputable from any recipe this platform holds"
    };
    const result = await this.runFlow(execution, graph, nodeId, port, seed, authToken);
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
  /**
   * The loader's own checks, run without loading.
   *
   * `/api/routines/preview` exists to show an author what they will get, and
   * it showed them graphs the loader then refused: measured 22 Aug 2026, a
   * routine ending in a check previewed with `warnings: []` and failed at
   * POST /api/routines with "names source port out … declares no such port".
   * The endpoint whose job is the preview was the one endpoint not running
   * the checks.
   *
   * This calls the SAME validator rather than restating its rules, because a
   * second copy of a rule is a rule that will disagree with itself later —
   * the failure this file's own comments keep recording. The cost of reusing
   * it is that validateGraph throws on the FIRST problem, so this reports one
   * problem at a time; the message says so rather than implying the list is
   * complete.
   */
  inspectGraph(definition) {
    try {
      this.validateGraph(definition);
      return [];
    } catch (error) {
      return [error.message];
    }
  }
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
      if (!node.component) {
        throw new Error(
          `node "${node.id}" names no component. Each node needs {"id","component","config"} where component is a registered id such as "symbia.state.rollup".`
        );
      }
      const problems = validateNodeConfig(
        node.component,
        node.config
      );
      if (problems.length > 0) {
        throw new Error(
          `node "${node.id}" (${node.component}) has config its component does not accept:
` + problems.map((p) => `  - ${p}`).join("\n")
        );
      }
    }
    const SHAPE = 'each edge needs {"id","source":{"node","port"},"target":{"node","port"}} \u2014 source and target are OBJECTS naming a node and one of its ports, not bare node ids';
    for (const [i, edge] of definition.edges.entries()) {
      const where = `edge ${edge?.id ? `"${edge.id}"` : `at index ${i}`}`;
      for (const end of ["source", "target"]) {
        const e = edge?.[end];
        if (!e || typeof e !== "object") {
          throw new Error(
            `${where} has no ${end} object (found ${e === void 0 ? "nothing" : typeof e}). ${SHAPE}`
          );
        }
        if (!e.node) {
          throw new Error(`${where} declares a ${end} with no node. ${SHAPE}`);
        }
        if (!nodeIds.has(e.node)) {
          throw new Error(
            `${where} references unknown ${end} node "${e.node}". Declared nodes: ${[...nodeIds].join(", ")}`
          );
        }
        const portOwner = definition.nodes.find((n) => n.id === e.node);
        const def = portOwner?.component ? getComponent(portOwner.component) : void 0;
        if (def && e.port) {
          const declared = end === "source" ? def.outputs : def.inputs;
          if (!declared.includes(e.port)) {
            const near = declared.filter((d) => d.toLowerCase() === e.port.toLowerCase());
            throw new Error(
              `${where} names ${end} port "${e.port}" on node "${e.node}" (${portOwner.component}), which declares no such port` + (near.length ? ` \u2014 did you mean "${near[0]}"?` : "") + `. Declared ${end === "source" ? "outputs" : "inputs"}: ${declared.join(", ") || "(none)"}. An edge on an undeclared port routes nothing and reports no error, so it is refused instead.`
            );
          }
        }
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

// ../runtime/server/src/catalog/client.ts
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

// ../runtime/server/src/catalog/manifests.ts
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
    // A component that declares its own authority publishes it. Omitted means
    // the honest default — it touches nothing but the message. Previously every
    // component published the same hardcoded string, which is the same as
    // declaring nothing.
    capability: c.capability ?? COMPONENT_CAPABILITY,
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

// ../runtime/server/src/catalog/ingress.ts
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

// ../runtime/server/src/catalog/sync.ts
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
          key: resource.key,
          // The join. This mapping already existed in `this.hydrated` below,
          // in memory, where no sealed bundle could ever see it.
          source: {
            resourceId: resource.id,
            key: resource.key,
            revision,
            hydratedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
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

// ../runtime/server/src/executor.ts
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

// ../runtime/server/src/routes.ts
import express from "express";
import path from "path";

// ../runtime/server/src/auth.ts
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

// ../runtime/server/src/doc-routes.ts
import { registerDocRoutes } from "@symbia/md";

// ../runtime/server/src/openapi.ts
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

// ../runtime/server/src/doc-routes.ts
function setupDocRoutes(app) {
  registerDocRoutes(app, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false
  });
}

// ../runtime/server/src/routes/graphs.ts
import { Router } from "express";
import { parse as parseYaml } from "yaml";

// ../runtime/server/src/types/routine.ts
function isRoutineDefinition(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  const def = obj;
  return def.symbia === "routine/1.0" && Array.isArray(def.routines);
}

// ../runtime/server/src/compiler/routine-compiler.ts
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
   * Report component ids the compiler emitted that the executor cannot resolve.
   *
   * A compiled routine used to come back clean while every node referenced a
   * component that does not exist — measured 21 Aug 2026: a three-step routine
   * compiled to five nodes with `warnings: []`, and all five ids were absent
   * from the registry. The graph then loads and fails at instantiation on its
   * first message, so the compiler's silence was the misleading part, not the
   * failure.
   *
   * This WARNS rather than refuses, deliberately. `validateNodeConfig` skips
   * unregistered components because a graph may name one that
   * `POST /api/components` registers later, and that tolerance is intentional.
   * A warning names the problem without removing it.
   *
   * The graph output stays deterministic; only this advisory list reads the
   * registry. When the registry is empty the compiler is running outside a
   * runtime (a unit test importing only the compiler), so the check is skipped
   * rather than reporting every component as missing.
   */
  checkComponentsResolve(graphs) {
    if (listComponents().length === 0) return [];
    const unresolved = /* @__PURE__ */ new Map();
    for (const graph of graphs) {
      for (const node of graph.nodes) {
        const component = node.component;
        if (!component || getComponent(component)) continue;
        const sites = unresolved.get(component) ?? [];
        sites.push(`${graph.name}/${node.id}`);
        unresolved.set(component, sites);
      }
    }
    return Array.from(unresolved.entries()).map(([component, sites]) => ({
      path: sites[0] ?? component,
      message: `Component "${component}" is not registered in this runtime, so the graph will load and then fail when the first message reaches ${sites.length === 1 ? "this node" : `these ${sites.length} nodes`}: ${sites.join(", ")}.`,
      code: "UNRESOLVED_COMPONENT"
    }));
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
    const shapeWarnings = [];
    for (const routine of definition.routines) {
      const { graph, nodeMapping, warnings } = this.compileRoutine(
        routine,
        definition,
        opts
      );
      shapeWarnings.push(...warnings);
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
      warnings: [
        ...validation.warnings,
        ...shapeWarnings,
        ...this.checkComponentsResolve(graphs)
      ],
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
    const checkWarnings = [];
    const entryNodeId = `${routine.id}-entry`;
    nodes.push({
      id: entryNodeId,
      component: "symbia.routine.entry",
      config: {
        routineId: routine.id,
        routineName: routine.name,
        trigger: routine.trigger
      },
      position: { x: 0, y: 0 }
    });
    let prevNodeId = entryNodeId;
    let prevOutputPort = "out";
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
        target: { node: nodeId, port: "in" }
      });
      if (step.type === "check") {
        checkWarnings.push({
          path: `${routine.id}.${step.id}`,
          message: `Step "${step.id}" is a gate, not a branch: messages that pass continue to ` + (routine.steps[i + 1] ? `"${routine.steps[i + 1].id}"` : "the routine exit") + `, and messages that fail stop at this node and surface as a graph output ("${routine.id}-${step.id}:fail"). The routine vocabulary has no way to say what should happen on failure, so nothing does.`,
          code: "CHECK_FAIL_UNWIRED"
        });
        prevOutputPort = "pass";
      } else if (step.type === "repeat") {
        prevOutputPort = "out";
      } else {
        prevOutputPort = "out";
      }
      prevNodeId = nodeId;
      yOffset += 100;
    }
    const exitNodeId = `${routine.id}-exit`;
    nodes.push({
      id: exitNodeId,
      component: "symbia.routine.exit",
      config: {
        routineId: routine.id,
        exitPoint: true
      },
      position: { x: 200, y: yOffset }
    });
    edges.push({
      id: `edge-${prevNodeId}-to-exit`,
      source: { node: prevNodeId, port: prevOutputPort },
      target: { node: exitNodeId, port: "in" }
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
        // WHERE A DELIVERY ENTERS, NAMED BY THE THING THAT NAMED THE NODE.
        //
        // The gated ingress route reads metadata.ingress and falls back to a
        // node literally called `entry`. The compiler has always named entry
        // nodes `<routineId>-entry` and emitted no ingress block, so every
        // routine compiled from Symbia Script was unreachable through
        // /api/ingress and could only be fed through /executions/{id}/inject —
        // which needs an execution id, the exact thing the ingress route
        // exists to avoid. Measured 22 Aug 2026 while verifying that ingress
        // carries caller identity: the identity worked and no compiled
        // routine could use the door.
        ingress: { node: entryNodeId, port: "in" },
        // Include default LLM config at graph level
        llm: definition.llm
      }
    };
    return { graph, nodeMapping, warnings: checkWarnings };
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

// ../runtime/server/src/routes/graphs.ts
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
      const graph = executor.getGraph(execution.graphId);
      res.status(201).json({
        executionId: execution.id,
        graphId: execution.graphId,
        // Where the graph being executed came from, and how many components
        // this execution instantiated. Both were knowable only through
        // GET /api/executions, which is not a mutation and therefore not in
        // any sealed record — so a bundle could show that an execution started
        // and say nothing about what started or how big it was.
        graphSource: graph?.source ?? null,
        instanceCount: execution.instances?.size ?? null,
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

// ../runtime/server/src/routes/executions.ts
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
      const authToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const result = await executor.injectMessage(
        getParamId2(req.params, "id"),
        nodeId,
        port,
        value,
        authToken
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

// ../runtime/server/src/routes/routines.ts
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
      const loadWarnings = result.graphs.flatMap(
        (g) => executor.inspectGraph(g).map((message) => ({
          path: g.name,
          message: `This graph would be REFUSED at load: ${message} (the loader stops at the first problem, so there may be more behind this one.)`,
          code: "WOULD_NOT_LOAD"
        }))
      );
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
        warnings: [...result.warnings, ...loadWarnings]
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

// ../runtime/server/src/routes.ts
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
      const callerToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      let outputs = {};
      let hops = 0;
      for (const value of values) {
        const result = await graphExecutor.injectMessage(exec.id, node, port, value, callerToken);
        hops += result.trace.length;
        if (Object.keys(result.outputs).length > 0) outputs = result.outputs;
      }
      res.json({
        success: true,
        executionId: exec.id,
        // WHICH graph this was delivered to, and where that graph came from.
        //
        // The response already carried the outcome — which port fired, the
        // lane, the hop count — and a sealed session could reconstruct all of
        // it. What it could not do was say the graph that ran was the graph the
        // session authored, because the catalog resource id and the runtime
        // graph id are different values and no recorded call held both.
        graphId: graph.id,
        graphSource: graph.source ?? null,
        // WHAT THE VALUE ENTERED AS, AND WHY. Predicted (P4, lane-gate MAP)
        // that the seed's laneReason would be visible in a sealed record;
        // measured: it was not. The seed carries it, normaliseEmission rebuilds
        // messages per the component contract at the first hop, and no trace
        // entry marks the injection itself — so the WHY existed only in memory.
        // Stating it here puts it in a response body the ledger already keeps.
        seeded: {
          lane: "apocryphal",
          reason: "injected over HTTP: witnessed testimony from a client, not recomputable from any recipe this platform holds"
        },
        delivered: values.length,
        outputs,
        hops,
        // THE COUNTERS, AT THE MOMENT THEY CHANGED.
        //
        // These lived only behind GET /api/executions. GETs are not mutations,
        // so nothing recorded them, and three arbitration passes judged "how
        // many invocations ran" and "did anything error" lost from a sealed
        // session every time. A delivery is exactly when they move, and this
        // response is already recorded, so the counters enter the chain by
        // riding along rather than by adding a recorder.
        //
        // EXECUTION-WIDE, NOT PER-DELIVERY. With a batch body or concurrent
        // traffic these attribute imprecisely — they are the execution's totals
        // as of this response, not this delivery's contribution. Named here
        // because a reader who assumes otherwise would compute per-message
        // costs that are wrong, and the field cannot say so later.
        executionMetrics: {
          messagesProcessed: exec.metrics.messagesProcessed,
          messagesEmitted: exec.metrics.messagesEmitted,
          componentInvocations: exec.metrics.componentInvocations,
          errorCount: exec.metrics.errorCount,
          instanceCount: exec.instances.size,
          scope: "execution totals as of this response, not this delivery alone"
        }
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

// ../runtime/server/src/service.ts
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
