import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/script.js
var SymbiaNamespace = {
  CONTEXT: "context",
  MESSAGE: "message",
  USER: "user",
  ORG: "org",
  SERVICE: "service",
  INTEGRATION: "integration",
  VAR: "var",
  ENV: "env",
  COMPONENT: "component",
  CATALOG: "catalog",
  ENTITY: "entity",
  // Entity directory resolution (@entity.log-analyst → entityId)
  MENTION: "mention",
  // @mention syntax sugar for @entity (@log-analyst → entityId)
  /**
   * Assistants, addressable by alias or key.
   *
   * `@assistant.calc.routing.handles` reads what Calculator DECLARES it does.
   * The point is that a rule can reference another assistant's declaration
   * instead of holding a copy of it — this codebase has killed the same
   * roster-copy defect five times (a literal array in `assistants.list`, the
   * coordinator's help text, an orchestrate prompt, two alias tables), and
   * every fix was discipline. This one is grammar, which does not lapse.
   *
   * Added 11 Aug 2026. The prompt was a challenge worth recording: if 99% of
   * authoring happens through typeahead, does the namespace matter? It matters
   * *because* of typeahead — `getRefSuggestions()` can only offer what is a
   * namespace, so without this, autocomplete cannot offer assistants at all.
   */
  ASSISTANT: "assistant"
};
var REF_PATTERN = /^@([a-zA-Z][a-zA-Z0-9_]*)\.(.+)$/;
var INTERPOLATION_PATTERN = /\{\{([^}]+)\}\}/g;
function parseRef(ref) {
  const trimmed = ref.trim();
  if (!trimmed.startsWith("@")) {
    return {
      raw: ref,
      valid: false,
      namespace: "",
      path: "",
      segments: [],
      error: "Reference must start with @"
    };
  }
  const match = trimmed.match(REF_PATTERN);
  if (!match) {
    const nsOnly = trimmed.slice(1).replace(/\.$/, "");
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(nsOnly)) {
      return {
        raw: ref,
        valid: true,
        namespace: nsOnly,
        path: "",
        segments: []
      };
    }
    return {
      raw: ref,
      valid: false,
      namespace: "",
      path: "",
      segments: [],
      error: "Invalid reference format. Expected @namespace.path"
    };
  }
  const namespace = match[1];
  let path = match[2];
  let query;
  const queryIndex = path.indexOf("?");
  if (queryIndex !== -1) {
    const queryString = path.slice(queryIndex + 1);
    path = path.slice(0, queryIndex);
    query = {};
    for (const pair of queryString.split("&")) {
      const [key, value] = pair.split("=");
      if (key) {
        query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : "";
      }
    }
  }
  const segments = splitPath(path);
  const brackets = [];
  for (const segment of segments) {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      brackets.push(segment.slice(1, -1));
    }
  }
  return {
    raw: ref,
    valid: true,
    namespace,
    path,
    segments,
    brackets: brackets.length > 0 ? brackets : void 0,
    query
  };
}
function splitPath(path) {
  const segments = [];
  let current = "";
  let inUrlPath = false;
  let inBracket = false;
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === "[" && !inUrlPath && !inBracket) {
      if (current) {
        segments.push(current);
        current = "";
      }
      inBracket = true;
      current = "[";
    } else if (char === "]" && inBracket) {
      current += "]";
      segments.push(current);
      current = "";
      inBracket = false;
    } else if (char === "/" && !inUrlPath && !inBracket) {
      if (current) {
        segments.push(current);
        current = "";
      }
      inUrlPath = true;
      current = "/";
    } else if (char === "." && !inUrlPath && !inBracket) {
      if (current) {
        segments.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) {
    segments.push(current);
  }
  return segments;
}
function containsRefs(str) {
  return str.includes("@") || INTERPOLATION_PATTERN.test(str);
}
function extractRefs(str) {
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  const matches = str.matchAll(INTERPOLATION_PATTERN);
  for (const match of matches) {
    const content = match[1].trim();
    if (content.startsWith("@") && !seen.has(content)) {
      seen.add(content);
      refs.push(parseRef(content));
    }
  }
  const barePattern = /@([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z0-9_./?&=%-]+)/g;
  const bareMatches = str.matchAll(barePattern);
  for (const match of bareMatches) {
    const ref = match[0];
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(parseRef(ref));
    }
  }
  return refs;
}
function getNestedValue(obj, path) {
  const segments = Array.isArray(path) ? path : path.split(".");
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current !== "object") {
      return void 0;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      const key = segment.slice(1, -1);
      current = current[key];
    } else {
      current = current[segment];
    }
  }
  return current;
}
function resolveAssistantRef(segments, ctx) {
  const registry = ctx.assistants;
  if (!registry) {
    return {
      success: false,
      error: "No assistant registry in this context. It is injected by the assistants service; a context built elsewhere cannot resolve @assistant."
    };
  }
  if (segments.length === 0)
    return { success: true, value: registry };
  const [wanted, ...rest] = segments;
  const needle = String(wanted).toLowerCase();
  const tail = (s) => s?.toLowerCase().split("/").pop();
  const found = registry.find((a) => a.alias?.toLowerCase() === needle || a.key?.toLowerCase() === needle || tail(a.key) === needle);
  if (!found) {
    const known = registry.map((a) => a.alias || a.key).filter(Boolean).sort().join(", ");
    return {
      success: false,
      error: `No assistant '${wanted}'. Loaded: ${known || "(none)"}`
    };
  }
  return rest.length === 0 ? { success: true, value: found } : { success: true, value: getNestedValue(found, rest) };
}
function resolveCatalogRef(segments, ctx) {
  if (!ctx.catalog?.resources) {
    return { success: false, error: "Catalog data not available in context" };
  }
  if (segments.length === 0) {
    return { success: true, value: ctx.catalog.resources };
  }
  const resourceType = segments[0];
  if (segments.length === 1) {
    const filtered = ctx.catalog.resources.filter((r) => r.type === resourceType);
    return { success: true, value: filtered };
  }
  if (segments[1].startsWith("[") && segments[1].endsWith("]")) {
    const key = segments[1].slice(1, -1);
    const resource = ctx.catalog.resources.find((r) => r.type === resourceType && r.key === key);
    if (!resource) {
      return { success: false, error: `Resource not found: ${resourceType}[${key}]` };
    }
    if (segments.length > 2) {
      const remainingPath = segments.slice(2);
      return { success: true, value: getNestedValue(resource, remainingPath) };
    }
    return { success: true, value: resource };
  }
  return { success: true, value: getNestedValue(ctx.catalog, segments) };
}
function resolveRef(ref, ctx) {
  const parsed = typeof ref === "string" ? parseRef(ref) : ref;
  if (!parsed.valid) {
    return { success: false, error: parsed.error };
  }
  const { namespace, segments } = parsed;
  switch (namespace) {
    case SymbiaNamespace.ASSISTANT:
      return resolveAssistantRef(segments, ctx);
    case SymbiaNamespace.CONTEXT:
      return { success: true, value: getNestedValue(ctx.context, segments) };
    case SymbiaNamespace.MESSAGE:
      return { success: true, value: getNestedValue(ctx.message, segments) };
    case SymbiaNamespace.USER:
      return { success: true, value: getNestedValue(ctx.user, segments) };
    case SymbiaNamespace.ORG:
      if (segments.length === 0 || segments[0] === "id") {
        return { success: true, value: ctx.orgId ?? ctx.org?.id };
      }
      return { success: true, value: getNestedValue(ctx.org, segments) };
    case SymbiaNamespace.VAR:
      return { success: true, value: getNestedValue(ctx.vars, segments) };
    case SymbiaNamespace.ENV:
      if (segments.length > 0 && typeof process !== "undefined") {
        return { success: true, value: process.env[segments[0]] };
      }
      return { success: false, error: "Environment variable name required" };
    case SymbiaNamespace.CATALOG:
      return resolveCatalogRef(segments, ctx);
    case SymbiaNamespace.SERVICE:
    case SymbiaNamespace.INTEGRATION:
    case SymbiaNamespace.ENTITY:
    case SymbiaNamespace.MENTION:
      return {
        success: false,
        error: `${namespace} references require async resolution`,
        async: true
      };
    default:
      const contextValue = getNestedValue(ctx.context, [namespace, ...segments]);
      if (contextValue !== void 0) {
        return { success: true, value: contextValue };
      }
      return { success: false, error: `Unknown namespace: ${namespace}` };
  }
}
var EACH_BLOCK = /\{\{#each\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;
function interpolateEach(template, ctx) {
  return template.replace(EACH_BLOCK, (_match, rawPath, body) => {
    const path = rawPath.trim();
    const list = path.startsWith("@") ? (() => {
      const r = resolveRef(path, ctx);
      return r.success ? r.value : void 0;
    })() : getNestedValue(ctx, path.split("."));
    if (!Array.isArray(list) || list.length === 0)
      return "";
    return list.map((item, index) => body.replace(INTERPOLATION_PATTERN, (_m, content) => {
      let key = String(content).trim();
      if (key === "this" || key === ".")
        return formatValue(item);
      if (key === "@index")
        return String(index);
      if (key === "@number")
        return String(index + 1);
      if (key === "this" || key.startsWith("this."))
        key = key.slice(5);
      if (item !== null && typeof item === "object") {
        const value = getNestedValue(item, key.split("."));
        if (value !== void 0)
          return formatValue(value);
      }
      return formatValue(getNestedValue(ctx, key.split(".")));
    })).join("");
  });
}
function interpolate(template, ctx) {
  return interpolateEach(template, ctx).replace(INTERPOLATION_PATTERN, (_, content) => {
    const trimmed = content.trim();
    if (trimmed.startsWith("@")) {
      const result = resolveRef(trimmed, ctx);
      if (result.success) {
        return formatValue(result.value);
      }
      return "";
    }
    const value = getNestedValue(ctx, trimmed.split("."));
    return formatValue(value);
  });
}
function formatValue(value) {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}
function interpolateObject(obj, ctx) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = interpolate(value, ctx);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => typeof item === "string" ? interpolate(item, ctx) : typeof item === "object" && item !== null ? interpolateObject(item, ctx) : item);
    } else if (typeof value === "object" && value !== null) {
      result[key] = interpolateObject(value, ctx);
    } else {
      result[key] = value;
    }
  }
  return result;
}
function getNamespaces() {
  return [
    {
      // Listed FIRST because this is the one a builder reaches for, and
      // because it is the whole reason the namespace exists: typeahead can
      // only offer what appears here.
      name: SymbiaNamespace.ASSISTANT,
      description: "Assistants, by alias or key \u2014 read what one declares",
      examples: [
        "@assistant.calc",
        "@assistant.calc.routing.handles",
        "@assistant.smartcalc.description"
      ],
      async: false,
      children: [
        { path: "name", description: "Display name", type: "value" },
        { path: "description", description: "What it is, in prose", type: "value" },
        { path: "alias", description: "Its @handle", type: "value" },
        { path: "routing", description: "What it declares it handles", type: "object" },
        { path: "routing.handles", description: "One line, in a user's terms", type: "value" },
        { path: "routing.patterns", description: "Exact-match patterns", type: "object" },
        { path: "routing.precedence", description: "Who wins when several match", type: "value" }
      ]
    },
    {
      name: SymbiaNamespace.CONTEXT,
      description: "Execution context data",
      examples: ["@context.conversationId", "@context.customData"],
      async: false
    },
    {
      name: SymbiaNamespace.MESSAGE,
      description: "Current message",
      examples: ["@message.content", "@message.id", "@message.role"],
      async: false,
      children: [
        { path: "id", description: "Message ID", type: "value" },
        { path: "content", description: "Message text content", type: "value" },
        { path: "role", description: "Sender role (user/assistant/system)", type: "value" },
        { path: "metadata", description: "Message metadata", type: "object" }
      ]
    },
    {
      name: SymbiaNamespace.USER,
      description: "Current user",
      examples: ["@user.id", "@user.email", "@user.displayName"],
      async: false,
      children: [
        { path: "id", description: "User ID", type: "value" },
        { path: "email", description: "User email", type: "value" },
        { path: "displayName", description: "Display name", type: "value" },
        { path: "metadata", description: "User metadata", type: "object" }
      ]
    },
    {
      name: SymbiaNamespace.ORG,
      description: "Current organization",
      examples: ["@org.id", "@org.name"],
      async: false,
      children: [
        { path: "id", description: "Organization ID", type: "value" },
        { path: "name", description: "Organization name", type: "value" },
        { path: "metadata", description: "Org metadata", type: "object" }
      ]
    },
    {
      name: SymbiaNamespace.CATALOG,
      description: "Catalog resources",
      examples: ["@catalog.component[http/Request]", "@catalog.graph[user-onboarding].nodes"],
      async: false,
      children: [
        { path: "component", description: "All components", type: "object" },
        { path: "graph", description: "All graphs", type: "object" },
        { path: "executor", description: "All executors", type: "object" },
        { path: "context", description: "All contexts", type: "object" }
      ]
    },
    {
      name: SymbiaNamespace.SERVICE,
      description: "Internal service calls",
      examples: ["@service.logging./logs/query", "@service.catalog./resources"],
      async: true,
      children: [
        { path: "logging", description: "Logging service", type: "service" },
        { path: "catalog", description: "Catalog service", type: "service" },
        { path: "identity", description: "Identity service", type: "service" },
        { path: "messaging", description: "Messaging service", type: "service" },
        { path: "runtime", description: "Runtime service", type: "service" },
        { path: "network", description: "Network service", type: "service" }
      ]
    },
    {
      name: SymbiaNamespace.INTEGRATION,
      description: "External API integrations",
      examples: ["@integration.openai.chat.completions", "@integration.slack.postMessage"],
      async: true
    },
    {
      name: SymbiaNamespace.VAR,
      description: "Script variables",
      examples: ["@var.myVariable", "@var.config.apiKey"],
      async: false
    },
    {
      name: SymbiaNamespace.ENV,
      description: "Environment variables",
      examples: ["@env.NODE_ENV", "@env.API_KEY"],
      async: false
    }
  ];
}
function getRefSuggestions(partial, ctx) {
  const suggestions = [];
  if (!partial || partial === "@") {
    for (const ns of getNamespaces()) {
      suggestions.push({
        value: `@${ns.name}.`,
        description: ns.description
      });
    }
    return suggestions;
  }
  const parsed = parseRef(partial);
  if (!parsed.valid && partial.startsWith("@")) {
    const nsPartial = partial.slice(1).toLowerCase();
    for (const ns of getNamespaces()) {
      if (ns.name.toLowerCase().startsWith(nsPartial)) {
        suggestions.push({
          value: `@${ns.name}.`,
          description: ns.description
        });
      }
    }
    return suggestions;
  }
  const nsInfo = getNamespaces().find((ns) => ns.name === parsed.namespace);
  if (nsInfo?.children) {
    const pathPrefix = parsed.segments.join(".");
    for (const child of nsInfo.children) {
      if (!pathPrefix || child.path.startsWith(pathPrefix)) {
        suggestions.push({
          value: `@${parsed.namespace}.${child.path}`,
          description: child.description
        });
      }
    }
  }
  if (parsed.namespace === SymbiaNamespace.CATALOG && ctx?.catalog?.resources) {
    const segments = parsed.segments;
    if (segments.length === 1) {
      const resourceType = segments[0];
      const resources = ctx.catalog.resources.filter((r) => r.type === resourceType);
      for (const resource of resources.slice(0, 20)) {
        const key = String(resource.key || "");
        const desc = String(resource.name || resource.description || resource.key || "");
        suggestions.push({
          value: `@catalog.${resourceType}[${key}]`,
          description: desc
        });
      }
    }
  }
  if (suggestions.length === 0 && nsInfo) {
    for (const example of nsInfo.examples) {
      suggestions.push({
        value: example,
        description: `Example: ${example}`
      });
    }
  }
  return suggestions;
}
function validateRef(ref) {
  const parsed = parseRef(ref);
  const warnings = [];
  const errors = [];
  if (!parsed.valid) {
    errors.push(parsed.error || "Invalid reference");
    return { valid: false, ref: parsed, warnings, errors };
  }
  const knownNamespaces = Object.values(SymbiaNamespace);
  if (!knownNamespaces.includes(parsed.namespace)) {
    warnings.push(`Unknown namespace: ${parsed.namespace}`);
  }
  if ((parsed.namespace === SymbiaNamespace.SERVICE || parsed.namespace === SymbiaNamespace.INTEGRATION) && parsed.segments.length === 0) {
    errors.push(`${parsed.namespace} references require a path`);
  }
  return {
    valid: errors.length === 0,
    ref: parsed,
    warnings,
    errors
  };
}
function validateTemplate(template) {
  const refs = extractRefs(template);
  const validations = refs.map((ref) => validateRef(ref.raw));
  const errors = validations.flatMap((v) => v.errors);
  return {
    valid: errors.length === 0,
    refs: validations,
    errors
  };
}

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/namespace-client.js
var NamespaceClient = class {
  cache = /* @__PURE__ */ new Map();
  options;
  constructor(options) {
    this.options = {
      services: options.services,
      cacheTTL: options.cacheTTL ?? 5 * 60 * 1e3,
      // 5 minutes default
      debug: options.debug ?? false
    };
  }
  /**
   * Fetch namespace data from a service
   */
  async fetch(namespace) {
    const cached = this.cache.get(namespace);
    if (cached && Date.now() < cached.expiresAt) {
      if (this.options.debug) {
        console.log(`[NamespaceClient] Cache hit for ${namespace}`);
      }
      return cached.data;
    }
    const serviceUrl = this.options.services[namespace];
    if (!serviceUrl) {
      if (this.options.debug) {
        console.warn(`[NamespaceClient] No service URL configured for ${namespace}`);
      }
      return null;
    }
    try {
      const url = `${serviceUrl}/symbia-namespace`;
      if (this.options.debug) {
        console.log(`[NamespaceClient] Fetching ${url}`);
      }
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[NamespaceClient] Failed to fetch ${namespace}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      this.cache.set(namespace, {
        data,
        expiresAt: Date.now() + this.options.cacheTTL
      });
      if (this.options.debug) {
        console.log(`[NamespaceClient] Cached ${namespace} (${data.resources?.length || 0} resources)`);
      }
      return data;
    } catch (error) {
      console.error(`[NamespaceClient] Error fetching ${namespace}:`, error);
      return null;
    }
  }
  /**
   * Preload all configured namespaces
   */
  async preloadAll() {
    const namespaces = Object.keys(this.options.services);
    if (this.options.debug) {
      console.log(`[NamespaceClient] Preloading ${namespaces.length} namespaces`);
    }
    await Promise.all(namespaces.map((ns) => this.fetch(ns)));
  }
  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    if (this.options.debug) {
      console.log(`[NamespaceClient] Cache cleared`);
    }
  }
  /**
   * Get all cached namespace names
   */
  getCachedNamespaces() {
    return Array.from(this.cache.keys());
  }
};
function createNamespaceClient() {
  const services = {};
  if (process.env.CATALOG_BASE_URL) {
    services.catalog = process.env.CATALOG_BASE_URL;
  }
  if (process.env.MESSAGING_BASE_URL) {
    services.messaging = process.env.MESSAGING_BASE_URL;
  }
  if (process.env.IDENTITY_BASE_URL) {
    services.identity = process.env.IDENTITY_BASE_URL;
  }
  if (process.env.LOGGING_BASE_URL) {
    services.logging = process.env.LOGGING_BASE_URL;
  }
  if (process.env.ASSISTANTS_BASE_URL) {
    services.assistants = process.env.ASSISTANTS_BASE_URL;
  }
  if (Object.keys(services).length === 0) {
    services.catalog = "http://localhost:4001";
    services.messaging = "http://localhost:3001";
    services.identity = "http://localhost:3002";
    services.logging = "http://localhost:3004";
    services.assistants = "http://localhost:3005";
  }
  return new NamespaceClient({
    services,
    debug: process.env.DEBUG_NAMESPACE === "true"
  });
}

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/bootstrap.js
var cachedConfig = null;
var fetchPromise = null;
async function fetchBootstrapConfig(retries = 3, retryDelayMs = 1e3) {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (fetchPromise) {
    return fetchPromise;
  }
  fetchPromise = (async () => {
    const identityUrl = resolveServiceUrl(ServiceId.IDENTITY);
    const endpoint = `${identityUrl}/api/bootstrap/internal`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        if (response.ok) {
          const config = await response.json();
          cachedConfig = config;
          return config;
        }
        if (response.status === 403) {
          console.warn("[bootstrap] Identity bootstrap endpoint forbidden");
          return null;
        }
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
        }
      } catch (error) {
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
        }
      }
    }
    console.warn("[bootstrap] Failed to fetch bootstrap config after retries");
    return null;
  })();
  const result = await fetchPromise;
  fetchPromise = null;
  return result;
}
function clearBootstrapCache() {
  cachedConfig = null;
}
function getBootstrapCache() {
  return cachedConfig;
}
function hasBootstrapConfig() {
  return cachedConfig !== null;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/auth.js
var Capabilities = {
  // Global capabilities
  GLOBAL_READ: "cap:global.read",
  // Read across all orgs
  GLOBAL_ADMIN: "cap:global.admin",
  // Full admin across all orgs
  // Catalog/Registry capabilities
  CATALOG_READ: "cap:catalog.read",
  CATALOG_WRITE: "cap:catalog.write",
  CATALOG_PUBLISH: "cap:catalog.publish",
  CATALOG_ADMIN: "cap:catalog.admin",
  REGISTRY_READ: "cap:registry.read",
  REGISTRY_WRITE: "cap:registry.write",
  REGISTRY_PUBLISH: "cap:registry.publish",
  REGISTRY_SIGN: "cap:registry.sign",
  REGISTRY_CERTIFY: "cap:registry.certify",
  // Logging/Telemetry capabilities
  TELEMETRY_READ: "cap:telemetry.read",
  TELEMETRY_WRITE: "cap:telemetry.write",
  TELEMETRY_INGEST: "cap:telemetry.ingest",
  TELEMETRY_GLOBAL_READ: "cap:telemetry.global-read",
  // Read logs across all orgs
  TELEMETRY_ADMIN: "cap:telemetry.admin",
  // Messaging capabilities
  MESSAGING_READ: "cap:messaging.read",
  MESSAGING_WRITE: "cap:messaging.write",
  MESSAGING_INTERRUPT: "cap:messaging.interrupt",
  MESSAGING_ROUTE: "cap:messaging.route",
  MESSAGING_ADMIN: "cap:messaging.admin",
  // Assistants capabilities
  ASSISTANTS_EXECUTE: "cap:assistants.execute",
  ASSISTANTS_MANAGE: "cap:assistants.manage",
  ASSISTANTS_ADMIN: "cap:assistants.admin",
  // Runtime capabilities
  RUNTIME_EXECUTE: "cap:runtime.execute",
  RUNTIME_MANAGE: "cap:runtime.manage",
  RUNTIME_ADMIN: "cap:runtime.admin",
  // Integrations capabilities
  INTEGRATIONS_READ: "cap:integrations.read",
  INTEGRATIONS_CONFIGURE: "cap:integrations.configure",
  INTEGRATIONS_ADMIN: "cap:integrations.admin",
  // Identity capabilities
  IDENTITY_READ: "cap:identity.read",
  IDENTITY_MANAGE_USERS: "cap:identity.manage-users",
  IDENTITY_MANAGE_ORGS: "cap:identity.manage-orgs",
  IDENTITY_ADMIN: "cap:identity.admin"
};
var Roles = {
  ADMIN: "role:admin",
  PUBLISHER: "role:publisher",
  DEVELOPER: "role:developer",
  OPERATOR: "role:operator",
  REVIEWER: "role:reviewer",
  VIEWER: "role:viewer"
};
function hasCapability(context, capability) {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.entitlements.includes(capability);
}
function hasAnyCapability(context, capabilities) {
  if (context.isSuperAdmin) {
    return true;
  }
  return capabilities.some((cap) => context.entitlements.includes(cap));
}
function hasAllCapabilities(context, capabilities) {
  if (context.isSuperAdmin) {
    return true;
  }
  return capabilities.every((cap) => context.entitlements.includes(cap));
}
function hasRole(context, role) {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.roles.includes(role) || context.roles.includes(role.replace("role:", "")) || context.entitlements.includes(role);
}
function canBypassOrgFilter(context) {
  return context.isSuperAdmin || hasCapability(context, Capabilities.GLOBAL_READ) || hasCapability(context, Capabilities.GLOBAL_ADMIN);
}
function canBypassOrgFilterForService(context, service) {
  if (context.isSuperAdmin) {
    return true;
  }
  const serviceGlobalReadCap = `cap:${service}.global-read`;
  if (context.entitlements.includes(serviceGlobalReadCap)) {
    return true;
  }
  const serviceAdminCap = `cap:${service}.admin`;
  if (context.entitlements.includes(serviceAdminCap)) {
    return true;
  }
  return hasCapability(context, Capabilities.GLOBAL_READ) || hasCapability(context, Capabilities.GLOBAL_ADMIN);
}
function isOrgAdmin(context, orgId) {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.entitlements.includes(`role:admin:${orgId}`);
}
function isOrgMember(context, orgId) {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.entitlements.includes(`org:${orgId}`) || context.entitlements.includes(`role:member:${orgId}`) || context.entitlements.includes(`role:admin:${orgId}`);
}
function getAccessibleOrgIds(context) {
  if (context.isSuperAdmin || canBypassOrgFilter(context)) {
    return "all";
  }
  const orgIds = [];
  for (const ent of context.entitlements) {
    if (ent.startsWith("org:")) {
      orgIds.push(ent.slice(4));
    }
  }
  if (context.orgId && !orgIds.includes(context.orgId)) {
    orgIds.push(context.orgId);
  }
  return orgIds;
}
function buildEntitlements(user) {
  const entitlements = ["public", "authenticated"];
  if (user.isSuperAdmin) {
    entitlements.push(Roles.ADMIN, Capabilities.GLOBAL_READ, Capabilities.GLOBAL_ADMIN, Capabilities.TELEMETRY_GLOBAL_READ, Capabilities.TELEMETRY_ADMIN, Capabilities.CATALOG_ADMIN, Capabilities.MESSAGING_ADMIN, Capabilities.RUNTIME_ADMIN, Capabilities.ASSISTANTS_ADMIN, Capabilities.INTEGRATIONS_ADMIN, Capabilities.IDENTITY_ADMIN);
  }
  if (user.entitlements) {
    entitlements.push(...user.entitlements);
  }
  if (user.roles) {
    for (const role of user.roles) {
      const roleKey = role.startsWith("role:") ? role : `role:${role}`;
      entitlements.push(roleKey);
    }
  }
  if (user.organizations) {
    for (const org of user.organizations) {
      entitlements.push(`org:${org.id}`);
      if (org.role === "admin") {
        entitlements.push(`role:admin:${org.id}`);
      }
      if (org.role === "member" || org.role === "admin") {
        entitlements.push(`role:member:${org.id}`);
      }
    }
  }
  return Array.from(new Set(entitlements));
}
function anonymousContext(defaults = {}) {
  return {
    authType: "anonymous",
    actorId: "anonymous",
    orgId: defaults.orgId || "",
    serviceId: defaults.serviceId || "",
    env: defaults.env || "dev",
    entitlements: ["public"],
    roles: [],
    isSuperAdmin: false
  };
}
function systemContext(serviceId, orgId) {
  return {
    authType: "system",
    actorId: `system:${serviceId}`,
    orgId,
    serviceId,
    env: process.env.NODE_ENV || "dev",
    entitlements: [
      "authenticated",
      Capabilities.TELEMETRY_INGEST,
      `cap:${serviceId}.system`
    ],
    roles: [],
    isSuperAdmin: false
  };
}

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/trace-context.js
var TRACEPARENT_RE = /^(?<version>[0-9a-f]{2})-(?<traceId>[0-9a-f]{32})-(?<spanId>[0-9a-f]{16})-(?<flags>[0-9a-f]{2})$/;
var INVALID_TRACE_ID = "0".repeat(32);
var INVALID_SPAN_ID = "0".repeat(16);
var randomHex = (bytes) => {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
};
function newTraceContext(sampled = true) {
  return { traceId: randomHex(16), spanId: randomHex(8), sampled };
}
function parseTraceparent(value) {
  if (!value || typeof value !== "string")
    return null;
  const m = TRACEPARENT_RE.exec(value.trim());
  if (!m?.groups)
    return null;
  const { version, traceId, spanId, flags } = m.groups;
  if (version === "ff")
    return null;
  if (traceId === INVALID_TRACE_ID)
    return null;
  if (spanId === INVALID_SPAN_ID)
    return null;
  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 1) === 1
  };
}
function formatTraceparent(ctx) {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? "01" : "00"}`;
}
function traceIdFromRunId(runId) {
  if (!runId || typeof runId !== "string")
    return null;
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(runId);
  if (!uuid)
    return null;
  const hex = uuid[0].replace(/-/g, "").toLowerCase();
  return hex === INVALID_TRACE_ID ? null : hex;
}
function contextForEvent(opts) {
  const inbound = parseTraceparent(opts.inboundTraceparent);
  if (inbound) {
    return {
      context: {
        traceId: inbound.traceId,
        spanId: randomHex(8),
        sampled: opts.sampled ?? inbound.sampled,
        tracestate: opts.tracestate ?? inbound.tracestate
      },
      parentSpanId: inbound.spanId
    };
  }
  const migrated = traceIdFromRunId(opts.runId);
  return {
    context: {
      traceId: migrated ?? randomHex(16),
      spanId: randomHex(8),
      sampled: opts.sampled ?? true,
      tracestate: opts.tracestate ?? void 0
    }
  };
}
function traceHeaders(ctx) {
  const headers = { traceparent: formatTraceparent(ctx) };
  if (ctx.tracestate && ctx.tracestate.trim()) {
    headers.tracestate = ctx.tracestate.trim();
  }
  return headers;
}
function traceFromHeaders(headers) {
  const pick = (name) => {
    const v = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const ctx = parseTraceparent(pick("traceparent"));
  if (!ctx)
    return null;
  const state = pick("tracestate");
  return state ? { ...ctx, tracestate: state } : ctx;
}

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/event-headers.js
var BOUNDARIES = ["intra", "inter", "extra"];
var HEADERS = {
  eventId: "X-Symbia-Event-Id",
  runId: "X-Symbia-Run-Id",
  boundary: "X-Symbia-Boundary",
  source: "X-Symbia-Source"
};
var HeaderMismatchError = class extends Error {
  field;
  code = "HEADER_MISMATCH";
  status = 400;
  constructor(message, field) {
    super(message);
    this.field = field;
    this.name = "HeaderMismatchError";
  }
};
function isBoundary(v) {
  return typeof v === "string" && BOUNDARIES.includes(v);
}
function isHeaderSafe(v) {
  return /^[\x20-\x7E\t]*$/.test(v) && v === v.trim();
}
function eventHeaders(wrapper) {
  const out = {};
  const put = (name, value) => {
    if (typeof value === "string" && value && isHeaderSafe(value))
      out[name] = value;
  };
  put(HEADERS.eventId, wrapper.id);
  put(HEADERS.runId, wrapper.runId);
  put(HEADERS.boundary, wrapper.boundary);
  put(HEADERS.source, wrapper.source);
  return out;
}
var headerValue = (headers, name) => {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};
function validateEventHeaders(headers, wrapper, opts = {}) {
  const requireBoundary = opts.requireBoundary !== false;
  const boundary = headerValue(headers, HEADERS.boundary);
  if (boundary === void 0) {
    if (requireBoundary) {
      throw new HeaderMismatchError(`${HEADERS.boundary} header is required and was not present`, "boundary");
    }
  } else {
    if (!isBoundary(boundary)) {
      throw new HeaderMismatchError(`${HEADERS.boundary} value "${boundary}" is not a valid boundary`, "boundary");
    }
    if (boundary !== wrapper.boundary) {
      throw new HeaderMismatchError(`${HEADERS.boundary} header "${boundary}" does not match body value "${wrapper.boundary}"`, "boundary");
    }
  }
  for (const [field, name, expected] of [
    ["id", HEADERS.eventId, wrapper.id],
    ["runId", HEADERS.runId, wrapper.runId]
  ]) {
    const got = headerValue(headers, name);
    if (got !== void 0 && got !== expected) {
      throw new HeaderMismatchError(`${name} header "${got}" does not match body value "${expected}"`, field);
    }
  }
}
function eventHeaderValidator(opts = {}) {
  return function validate(req, res, next) {
    const wrapper = req.body?.wrapper;
    if (!wrapper || typeof wrapper !== "object")
      return next();
    try {
      validateEventHeaders(req.headers, wrapper, opts);
      next();
    } catch (err) {
      if (err instanceof HeaderMismatchError) {
        res.status(400).json({
          error: {
            code: -32020,
            message: err.message,
            data: { field: err.field, reason: "HEADER_MISMATCH" }
          }
        });
        return;
      }
      next(err);
    }
  };
}

// build/plugin/symbia-imagine/vendor/symbia-sys/dist/index.js
var ServiceId = {
  /**
   * Reserved. Nothing listens on this. Held so the slot is not claimed by
   * something else. See `RunningServices` — anything enumerating this registry
   * in order to *reach* a service must exclude it, and must do so through that
   * export rather than by repeating the filter.
   */
  SERVER: "server",
  IDENTITY: "identity",
  LOGGING: "logging",
  CATALOG: "catalog",
  ASSISTANTS: "assistants",
  MESSAGING: "messaging",
  RUNTIME: "runtime",
  INTEGRATIONS: "integrations",
  MODELS: "models",
  NETWORK: "network",
  /**
   * Federation directory (control plane): the peer directory (BDT) of networks
   * this one federates with, the foreign-node table (FDT), and admission. The
   * bridge node is the data plane; this holds the policy. See
   * docs/2026-08-09-network-bridge-bbmd.md.
   */
  DIRECTORY: "directory",
  /** Operator console. Serves its own built assets and proxies /svc/{id}. */
  CONTROL_CENTER: "control-center",
  /** Admin/API front end. Was `service-admin` on 3000, unregistered. */
  API: "api"
};
var ServicePorts = {
  [ServiceId.SERVER]: 5e3,
  [ServiceId.IDENTITY]: 5001,
  [ServiceId.LOGGING]: 5002,
  [ServiceId.CATALOG]: 5003,
  [ServiceId.ASSISTANTS]: 5004,
  [ServiceId.MESSAGING]: 5005,
  [ServiceId.RUNTIME]: 5006,
  [ServiceId.INTEGRATIONS]: 5007,
  [ServiceId.MODELS]: 5008,
  [ServiceId.NETWORK]: 5009,
  [ServiceId.DIRECTORY]: 5010,
  [ServiceId.CONTROL_CENTER]: 8e3,
  [ServiceId.API]: 9e3
};
var NotRunning = [];
var RunningServices = Object.values(ServiceId).filter((id) => !NotRunning.includes(id));
var ProxiedServices = RunningServices.filter((id) => id !== ServiceId.CONTROL_CENTER && id !== ServiceId.SERVER);
var ServiceLocalEndpoints = Object.fromEntries(Object.entries(ServicePorts).map(([id, port]) => [id, `http://localhost:${port}`]));
var ServicePortEnvVars = {
  [ServiceId.SERVER]: "SERVER_PORT",
  [ServiceId.IDENTITY]: "IDENTITY_PORT",
  [ServiceId.LOGGING]: "LOGGING_PORT",
  [ServiceId.CATALOG]: "CATALOG_PORT",
  [ServiceId.ASSISTANTS]: "ASSISTANTS_PORT",
  [ServiceId.MESSAGING]: "MESSAGING_PORT",
  [ServiceId.RUNTIME]: "RUNTIME_PORT",
  [ServiceId.INTEGRATIONS]: "INTEGRATIONS_PORT",
  [ServiceId.MODELS]: "MODELS_PORT",
  [ServiceId.NETWORK]: "NETWORK_PORT",
  [ServiceId.DIRECTORY]: "DIRECTORY_PORT",
  [ServiceId.CONTROL_CENTER]: "CONTROL_CENTER_PORT",
  [ServiceId.API]: "API_PORT"
};
function registeredPort(serviceId, caller) {
  const port = ServicePorts[serviceId];
  if (port === void 0) {
    throw new Error(`${caller}: unknown service id "${serviceId}". Known ids: ${Object.keys(ServicePorts).join(", ")}`);
  }
  return port;
}
function servicePortOverride(serviceId) {
  const envVar = ServicePortEnvVars[serviceId];
  if (!envVar)
    return void 0;
  const raw = process.env[envVar];
  if (!raw)
    return void 0;
  const port = parseInt(raw, 10);
  return isNaN(port) ? void 0 : port;
}
function resolveServicePort(serviceId) {
  return servicePortOverride(serviceId) ?? registeredPort(serviceId, "resolveServicePort");
}
function resolveOwnPort(serviceId) {
  const override = servicePortOverride(serviceId);
  if (override !== void 0)
    return override;
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (!isNaN(port))
      return port;
  }
  return registeredPort(serviceId, "resolveOwnPort");
}
function serviceDisplayName(serviceId) {
  return String(serviceId).split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function resolveServiceHost(serviceId) {
  const envVar = `${String(serviceId).toUpperCase().replace(/-/g, "_")}_HOST`;
  return process.env[envVar] || "localhost";
}
function resolveServiceTarget(serviceId) {
  const id = serviceId;
  return `http://${resolveServiceHost(id)}:${resolveServicePort(id)}`;
}
function getServiceLocalEndpoint(serviceId) {
  return `http://localhost:${resolveServicePort(serviceId)}`;
}
function getServiceUrlEnvVar(serviceId) {
  const id = serviceId.toUpperCase().replace(/-/g, "_");
  return `${id}_SERVICE_URL`;
}
function resolveServiceUrl(serviceId) {
  const envVar = getServiceUrlEnvVar(serviceId);
  return process.env[envVar] ?? getServiceLocalEndpoint(serviceId);
}

export {
  SymbiaNamespace,
  parseRef,
  containsRefs,
  extractRefs,
  getNestedValue,
  resolveRef,
  interpolate,
  interpolateObject,
  getNamespaces,
  getRefSuggestions,
  validateRef,
  validateTemplate,
  NamespaceClient,
  createNamespaceClient,
  fetchBootstrapConfig,
  clearBootstrapCache,
  getBootstrapCache,
  hasBootstrapConfig,
  Capabilities,
  Roles,
  hasCapability,
  hasAnyCapability,
  hasAllCapabilities,
  hasRole,
  canBypassOrgFilter,
  canBypassOrgFilterForService,
  isOrgAdmin,
  isOrgMember,
  getAccessibleOrgIds,
  buildEntitlements,
  anonymousContext,
  systemContext,
  newTraceContext,
  parseTraceparent,
  formatTraceparent,
  traceIdFromRunId,
  contextForEvent,
  traceHeaders,
  traceFromHeaders,
  BOUNDARIES,
  HEADERS,
  HeaderMismatchError,
  isBoundary,
  eventHeaders,
  validateEventHeaders,
  eventHeaderValidator,
  ServiceId,
  ServicePorts,
  RunningServices,
  ProxiedServices,
  ServiceLocalEndpoints,
  resolveServicePort,
  resolveOwnPort,
  serviceDisplayName,
  resolveServiceHost,
  resolveServiceTarget,
  getServiceLocalEndpoint,
  getServiceUrlEnvVar,
  resolveServiceUrl
};
