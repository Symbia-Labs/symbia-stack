var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../assistants/server/src/engine/provenance.ts
import { createHash } from "node:crypto";
import {
  GENESIS,
  advance,
  sha256Hex,
  signEvent,
  verifyEvent
} from "@symbia/lineage";
import {
  canonicalJson,
  loadServiceIdentity,
  signDocument,
  verifyDocument
} from "@symbia/crypto";
function provenanceSigningIdentity() {
  return serviceIdentity();
}
function serviceIdentity() {
  if (cachedIdentity === void 0) {
    try {
      cachedIdentity = loadServiceIdentity({ role: "assistants" });
    } catch {
      cachedIdentity = null;
    }
  }
  return cachedIdentity;
}
function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value ?? null)).digest("hex").slice(0, 16);
}
function classify(steps, contentFromModel, delegation, rule) {
  const note = delegation?.method === "addressed" ? ` Reached this assistant because you named it. No routing decision was made, and there is nothing to reproduce.` : delegation ? ` Reached this assistant because ${delegation.from} chose it${delegation.decidedBy ? ` via ${delegation.decidedBy}` : ""}; that choice is recorded in this envelope's delegation and ` + (delegation.method === "declaration" ? (
    // Recomputable, so say so — the same claim COMPUTED makes about the
    // arithmetic now holds for the routing that preceded it, and the
    // whole chain is checkable rather than just the tail of it.
    `is reproducible from the message and the registry.`
  ) : delegation.method === "classifier" ? (
    // Also recomputable. Trained weights with argmax decoding are as
    // reproducible as a pattern; the training digest in the source
    // says which weights, so a third party can re-derive the choice.
    `is reproducible from the message and the classifier's training digest.`
  ) : `is NOT reproducible.`) : "";
  const withNote = (r) => ({
    arena: r.arena,
    basis: r.basis + note
  });
  return withNote(classifyContent(steps, contentFromModel, rule));
}
function classifyContent(steps, contentFromModel, rule) {
  const ok = steps.filter((s) => s.ok);
  const failed = steps.filter((s) => !s.ok);
  if (failed.length > 0 && ok.length === 0) {
    return {
      arena: "REFUSED",
      basis: `every step failed: ${failed.map((f) => f.action).join(", ")}`
    };
  }
  const contentSteps = ok.filter((s) => CONTENT_ACTIONS.has(s.action));
  if (!contentFromModel && contentSteps.length === 0) {
    return {
      arena: "RETRIEVED",
      basis: `content returned verbatim from the rule${rule ? ` "${rule}"` : ""} \u2014 authored text, not a computed value. No step produced it because none was needed.` + (failed.length > 0 ? ` Note: ${failed.length} step(s) failed on the way here (${failed.map((f) => f.action).join(", ")}), and the reply does not depend on them.` : "")
    };
  }
  const deterministic = ok.filter(
    (s) => s.action === "tool.invoke" || s.action === "code.tool.invoke"
  );
  const retrieved = ok.filter(
    (s) => s.action === "service.call" || s.action === "integration.invoke"
  );
  const model = ok.filter((s) => s.action === "llm.invoke");
  if (!contentFromModel && deterministic.length > 0) {
    return {
      arena: "COMPUTED",
      basis: `content produced by ${deterministic.map((s) => s.source).join(", ")}; no model involved`
    };
  }
  if (!contentFromModel && retrieved.length > 0) {
    return {
      arena: "RETRIEVED",
      basis: `content returned verbatim from ${retrieved.map((s) => s.source).join(", ")}`
    };
  }
  if (model.length > 0 && (deterministic.length > 0 || retrieved.length > 0)) {
    const over = [...deterministic, ...retrieved].map((s) => s.source).join(", ");
    return {
      arena: "COMPOSED",
      basis: `model wrote over material from ${over}. The material is recorded; whether the model represented it faithfully is NOT checked here.`
    };
  }
  if (model.length > 0) {
    return {
      arena: "GENERATED",
      basis: "a model answered from its own weights. Nothing was supplied to it and nothing was verified. This answer stands on no source."
    };
  }
  return {
    arena: "REFUSED",
    basis: "the reply was built from a model step that did not produce content"
  };
}
function sealDelegation(input) {
  const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
  const payload = {
    from: input.from,
    to: input.to,
    reason: input.reason,
    decidedBy: input.decidedBy,
    method: input.method,
    steps: input.steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest
    }))
  };
  const scope = input.conversationId ?? "unscoped";
  const previous = chainHeads.get(scope) ?? GENESIS;
  const digest2 = sha256Hex(
    canonicalJson({
      payload,
      causedBy: input.causedBy ?? null,
      timestamp: timestamp2,
      conversationId: input.conversationId ?? null
    })
  );
  const chain = advance(previous, digest2);
  chainHeads.set(scope, chain);
  const identity = serviceIdentity();
  const event = {
    event_id: crypto.randomUUID(),
    timestamp: timestamp2,
    // The DECIDER is the actor, not the service. A delegation is an act by an
    // assistant; the service merely signs that it observed it.
    actor_identity: `assistant:${input.from}`,
    event_type: "assistant.delegation",
    payload,
    parent_links: [input.causedBy ?? null],
    checksum: `sha256:${chain}`,
    signature: null
  };
  event.signature = identity ? signEvent(event, identity.identity) : null;
  return {
    ...payload,
    steps: input.steps,
    causedBy: input.causedBy,
    timestamp: timestamp2,
    event,
    hash: event.checksum
  };
}
function seal(input) {
  const steps = input.delegation ? [
    ...input.delegation.steps.map((s) => ({ ...s, by: s.by ?? input.delegation.from })),
    ...input.steps.map((s) => ({ ...s, by: s.by ?? input.assistant }))
  ] : input.steps.map((s) => ({ ...s }));
  const classified = classify(input.steps, input.contentFromModel, input.delegation, input.rule);
  const arena = input.refusal ? "REFUSED" : classified.arena;
  const basis = (input.refusal ? input.refusal.basis : classified.basis) + (input.presentation?.ornamentedBy ? ` The wording you are reading was written by ${input.presentation.ornamentedBy}${input.presentation.relayedBy ? ` relaying for ${input.presentation.relayedBy}` : ""}; it is not what produced the value. The pre-humanised form is in this envelope's presentation.raw.` : "");
  const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
  const sealedOver = input.fields ? "fields" : "content";
  const body = {
    content: sealedOver === "content" ? input.content : void 0,
    fields: input.fields,
    // Inside the hashed body. The raw form is only worth anything if it cannot
    // be swapped after the fact — an inspectable "before" that a rephraser
    // could edit would be theatre.
    presentation: input.presentation,
    sealedOver,
    arena,
    steps: steps.map((s) => ({
      id: s.id,
      action: s.action,
      source: s.source,
      ok: s.ok,
      outputDigest: s.outputDigest,
      by: s.by
    })),
    rule: input.rule,
    assistant: input.assistant,
    runId: input.runId,
    causedBy: input.causedBy,
    // The delegation's HASH, not the record — the reply commits to a decision
    // it did not make, without becoming a second copy of it.
    delegation: input.delegation?.hash,
    timestamp: timestamp2
  };
  const canonical = canonicalJson(body);
  const hash = sha256Hex(canonical);
  const identity = serviceIdentity();
  const signature = identity ? signDocument(body, identity.identity) : null;
  return {
    arena,
    fields: input.fields,
    presentation: input.presentation,
    sealedOver,
    signature,
    // Names the key, so a verifier knows which one to ask for. Absent when the
    // service has no identity, and `signature: null` says so rather than the
    // envelope implying a guarantee it does not carry.
    signedBy: identity?.id,
    basis,
    // The FULL chain, matching what was hashed. This returned `input.steps` —
    // the post-delegation half only — which would have put the envelope's
    // visible steps out of agreement with its own seal, so verify() failed on
    // every delegated reply.
    steps,
    rule: input.rule,
    assistant: input.assistant,
    runId: input.runId,
    causedBy: input.causedBy,
    delegation: input.delegation,
    timestamp: timestamp2,
    hash
  };
}
var cachedIdentity, chainHeads, CONTENT_ACTIONS;
var init_provenance = __esm({
  "../../assistants/server/src/engine/provenance.ts"() {
    "use strict";
    chainHeads = /* @__PURE__ */ new Map();
    CONTENT_ACTIONS = /* @__PURE__ */ new Set([
      "tool.invoke",
      "code.tool.invoke",
      "service.call",
      "integration.invoke",
      "llm.invoke"
    ]);
  }
});

// ../../assistants/server/src/engine/condition-evaluator.ts
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current === "object") {
      current = current[part];
    } else {
      return void 0;
    }
  }
  return current;
}
function evaluateOperator(fieldValue, operator, conditionValue) {
  switch (operator) {
    case "eq":
      return fieldValue === conditionValue;
    case "neq":
      return fieldValue !== conditionValue;
    case "gt":
      if (typeof fieldValue === "number" && typeof conditionValue === "number") {
        return fieldValue > conditionValue;
      }
      return false;
    case "gte":
      if (typeof fieldValue === "number" && typeof conditionValue === "number") {
        return fieldValue >= conditionValue;
      }
      return false;
    case "lt":
      if (typeof fieldValue === "number" && typeof conditionValue === "number") {
        return fieldValue < conditionValue;
      }
      return false;
    case "lte":
      if (typeof fieldValue === "number" && typeof conditionValue === "number") {
        return fieldValue <= conditionValue;
      }
      return false;
    case "contains":
      if (typeof fieldValue === "string" && typeof conditionValue === "string") {
        return fieldValue.toLowerCase().includes(conditionValue.toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(conditionValue);
      }
      return false;
    case "not_contains":
      if (typeof fieldValue === "string" && typeof conditionValue === "string") {
        return !fieldValue.toLowerCase().includes(conditionValue.toLowerCase());
      }
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(conditionValue);
      }
      return true;
    case "starts_with":
      if (typeof fieldValue === "string" && typeof conditionValue === "string") {
        return fieldValue.toLowerCase().startsWith(conditionValue.toLowerCase());
      }
      return false;
    case "ends_with":
      if (typeof fieldValue === "string" && typeof conditionValue === "string") {
        return fieldValue.toLowerCase().endsWith(conditionValue.toLowerCase());
      }
      return false;
    case "matches":
      if (typeof fieldValue === "string" && typeof conditionValue === "string") {
        try {
          const regex = new RegExp(conditionValue, "i");
          return regex.test(fieldValue);
        } catch (err) {
          console.error(
            `[ConditionEval] INVALID REGEX in condition \u2014 this rule can never match. pattern=${JSON.stringify(conditionValue)} error=${err instanceof Error ? err.message : String(err)}`
          );
          return false;
        }
      }
      return false;
    case "not_matches":
      if (typeof fieldValue === "string" && typeof conditionValue === "string") {
        try {
          const regex = new RegExp(conditionValue, "i");
          return !regex.test(fieldValue);
        } catch {
          return true;
        }
      }
      return true;
    case "in":
      if (Array.isArray(conditionValue)) {
        return conditionValue.includes(fieldValue);
      }
      return false;
    case "not_in":
      if (Array.isArray(conditionValue)) {
        return !conditionValue.includes(fieldValue);
      }
      return true;
    case "exists":
      return fieldValue !== void 0 && fieldValue !== null;
    case "not_exists":
      return fieldValue === void 0 || fieldValue === null;
    case "length_gte":
      if (typeof fieldValue === "string" && typeof conditionValue === "number") {
        return fieldValue.length >= conditionValue;
      }
      if (Array.isArray(fieldValue) && typeof conditionValue === "number") {
        return fieldValue.length >= conditionValue;
      }
      return false;
    case "length_lte":
      if (typeof fieldValue === "string" && typeof conditionValue === "number") {
        return fieldValue.length <= conditionValue;
      }
      if (Array.isArray(fieldValue) && typeof conditionValue === "number") {
        return fieldValue.length <= conditionValue;
      }
      return false;
    case "length_eq":
      if (typeof fieldValue === "string" && typeof conditionValue === "number") {
        return fieldValue.length === conditionValue;
      }
      if (Array.isArray(fieldValue) && typeof conditionValue === "number") {
        return fieldValue.length === conditionValue;
      }
      return false;
    default:
      return false;
  }
}
function flattenContext(ctx) {
  return {
    orgId: ctx.orgId,
    conversationId: ctx.conversationId,
    conversationState: ctx.conversationState,
    trigger: ctx.trigger,
    event: ctx.event,
    message: ctx.message,
    user: ctx.user,
    context: ctx.context,
    // Keep context nested for field path access (e.g., context.codeAgentActive)
    metadata: ctx.metadata
  };
}
function evaluateCondition(condition, flatContext) {
  const fieldValue = getNestedValue(flatContext, condition.field);
  if (condition.field === "message.content" && typeof condition.value === "string" && condition.value.includes("@")) {
    const originalContent = getNestedValue(flatContext, "message.metadata.originalContent");
    if (originalContent && typeof originalContent === "string") {
      const resultWithOriginal = evaluateOperator(originalContent, condition.operator, condition.value);
      if (resultWithOriginal) {
        console.log(`[ConditionEval] ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} => ${resultWithOriginal} (via originalContent: "${originalContent.substring(0, 50)}")`);
        return resultWithOriginal;
      }
    }
  }
  const result = evaluateOperator(fieldValue, condition.operator, condition.value);
  console.log(`[ConditionEval] ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)} => ${result} (actual: ${JSON.stringify(fieldValue)})`);
  return result;
}
function isConditionGroup(item) {
  return "logic" in item && "conditions" in item;
}
function evaluateConditions(group, context) {
  const flatContext = flattenContext(context);
  if (group.conditions.length === 0) {
    console.log(`[ConditionEval] Empty conditions group (${group.logic}) => true (matches all)`);
    return true;
  }
  console.log(`[ConditionEval] Evaluating ${group.conditions.length} condition(s) with logic: ${group.logic}`);
  const results = group.conditions.map((item) => {
    if (isConditionGroup(item)) {
      return evaluateConditions(item, context);
    }
    return evaluateCondition(item, flatContext);
  });
  const finalResult = group.logic === "and" ? results.every(Boolean) : results.some(Boolean);
  console.log(`[ConditionEval] Group result (${group.logic}): [${results.join(", ")}] => ${finalResult}`);
  console.log(`[ConditionEval] RETURNING: ${finalResult} (typeof: ${typeof finalResult}, strictTrue: ${finalResult === true})`);
  return finalResult;
}
var init_condition_evaluator = __esm({
  "../../assistants/server/src/engine/condition-evaluator.ts"() {
    "use strict";
  }
});

// ../../assistants/server/src/engine/actions/base.ts
var BaseActionHandler;
var init_base = __esm({
  "../../assistants/server/src/engine/actions/base.ts"() {
    "use strict";
    BaseActionHandler = class {
      success(output, durationMs) {
        return {
          success: true,
          actionType: this.type,
          output,
          durationMs
        };
      }
      failure(error, durationMs) {
        return {
          success: false,
          actionType: this.type,
          error,
          durationMs
        };
      }
    };
  }
});

// ../../assistants/server/src/integrations-client.ts
import { resolveServiceUrl, ServiceId } from "@symbia/sys";
async function invokeViaModels(token, options) {
  const { provider = "openai", model = "gpt-4o-mini", messages: messages2, temperature, maxTokens, orgId } = options;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
  if (orgId) headers["X-Org-Id"] = orgId;
  const response = await fetch(`${MODELS_SERVICE_URL}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      // The registry publishes remote models as `provider/model`, and the chat
      // router splits on exactly that.
      model: `${provider}/${model}`,
      messages: messages2,
      // Absent means absent, still. The broker will strip what the model
      // rejects; it should not have to strip what nobody asked for.
      ...temperature !== void 0 ? { temperature } : {},
      ...maxTokens !== void 0 ? { max_tokens: maxTokens } : {}
    }),
    signal: AbortSignal.timeout(45e3)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const msg = body.error?.message || response.statusText;
    if (response.status === 401) throw new TokenAuthError(msg);
    throw new Error(`Models service error: ${msg}`);
  }
  const result = await response.json();
  const dropped = result.symbia?.droppedParams ?? [];
  if (dropped.length) {
    console.log(
      `[llm.invoke] models dropped ${dropped.map((d) => d.param).join(", ")} for ${result.model}: ` + dropped.map((d) => d.reason).join("; ")
    );
  }
  return {
    content: result.choices?.[0]?.message?.content ?? "",
    model: result.model,
    usage: {
      promptTokens: result.usage?.prompt_tokens ?? 0,
      completionTokens: result.usage?.completion_tokens ?? 0,
      totalTokens: result.usage?.total_tokens ?? 0
    },
    finishReason: result.choices?.[0]?.finish_reason ?? "stop"
  };
}
async function invokeLLM(token, options) {
  if (process.env.LLM_VIA_MODELS !== "0") {
    return invokeViaModels(token, options);
  }
  return invokeViaIntegrations(token, options);
}
async function invokeViaIntegrations(token, options) {
  const {
    provider = "openai",
    model = "gpt-4o-mini",
    messages: messages2,
    temperature,
    maxTokens = 1024,
    orgId
  } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45e3);
  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
    if (orgId) {
      headers["X-Org-Id"] = orgId;
    }
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        operation: "chat.completions",
        params: {
          model,
          messages: messages2,
          // Only sent when a caller actually chose one.
          //
          // This defaulted to 0.7 and was injected into every request. Newer
          // Anthropic models REJECT it: "`temperature` is deprecated for this
          // model" -- measured 7 Aug 2026, after the model name itself was
          // fixed. A default nobody asked for turned into a hard failure at
          // the provider, and the third distinct symptom of the same habit
          // today: openai as a provider default, a stale model list, and this.
          //
          // Absent means absent. Let the provider apply its own default.
          ...temperature !== void 0 ? { temperature } : {},
          maxTokens
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      const errorMsg = error.error || response.statusText;
      if (response.status === 401 || errorMsg.includes("Invalid or expired token") || errorMsg.includes("Authentication required")) {
        throw new TokenAuthError(errorMsg);
      }
      throw new Error(`Integrations service error: ${errorMsg}`);
    }
    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error(result.error || "LLM invocation failed");
    }
    return {
      content: result.data.content,
      model: result.data.model,
      usage: result.data.usage,
      finishReason: result.data.finishReason
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LLM request timed out after 45 seconds");
    }
    throw error;
  }
}
async function isIntegrationsAvailable() {
  try {
    // Probe a route Integrations actually serves — /health 404s on every
    // host, which disabled llm.invoke platform-wide. Mirrors source fix.
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/status`, {
      method: "GET",
      signal: AbortSignal.timeout(2e3)
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function resolveUsableProvider(token, orgId) {
  try {
    const headers = { Authorization: `Bearer ${token}` };
    if (orgId) headers["X-Org-Id"] = orgId;
    const response = await fetch(
      `${INTEGRATIONS_SERVICE_URL}/api/integrations/capabilities`,
      { headers }
    );
    if (!response.ok) {
      throw new Error(
        `Could not ask Integrations which providers are usable: ${response.status} ${response.statusText}. This is a request failure, not a statement about configured credentials.`
      );
    }
    const data = await response.json();
    const usable = (data.providers ?? []).find((p) => p.status === "available");
    if (!usable) return null;
    return {
      provider: usable.provider,
      model: DEFAULT_MODEL[usable.provider] || usable.defaultModel || "gpt-4o-mini"
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error(`Could not reach Integrations to resolve a provider: ${String(error)}`);
  }
}
async function invokeEmbedding(token, options) {
  const {
    provider = "openai",
    model = "text-embedding-3-small",
    input,
    dimensions
  } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        provider,
        operation: "embeddings",
        params: {
          model,
          input: Array.isArray(input) ? input : [input],
          ...dimensions && { dimensions }
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      const errorMsg = error.error || response.statusText;
      if (response.status === 401 || errorMsg.includes("Invalid or expired token")) {
        throw new TokenAuthError(errorMsg);
      }
      throw new Error(`Embedding service error: ${errorMsg}`);
    }
    const result = await response.json();
    if (!result.success || !result.data?.embeddings?.[0]) {
      throw new Error(result.error || "Embedding generation failed");
    }
    return result.data.embeddings[0];
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Embedding request timed out after 10 seconds");
    }
    throw error;
  }
}
var INTEGRATIONS_SERVICE_URL, MODELS_SERVICE_URL, TokenAuthError, DEFAULT_MODEL;
var init_integrations_client = __esm({
  "../../assistants/server/src/integrations-client.ts"() {
    "use strict";
    INTEGRATIONS_SERVICE_URL = resolveServiceUrl(ServiceId.INTEGRATIONS);
    MODELS_SERVICE_URL = resolveServiceUrl(ServiceId.MODELS);
    TokenAuthError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "TokenAuthError";
      }
    };
    DEFAULT_MODEL = {
      openai: "gpt-4o-mini",
      // Verified against the live /v1/models list on 7 Aug 2026. The two values
      // this replaced -- claude-sonnet-4-20250514 (from the provider adapter) and
      // claude-3-5-sonnet-20241022 (from the catalog resource) -- were BOTH
      // rejected by the API as nonexistent. Static model lists go stale silently
      // and present as "your key does not work"; asking the provider is the only
      // thing that does not rot. This map is a fallback, not a source of truth.
      anthropic: "claude-sonnet-5",
      huggingface: "meta-llama/Llama-3.2-3B-Instruct",
      "symbia-labs": "llama-3-2-1b-instruct-q4-k-m"
    };
  }
});

// ../../assistants/server/src/engine/template.ts
var template_exports = {};
__export(template_exports, {
  formatValue: () => formatValue,
  getContextValue: () => getContextValue,
  getRefSuggestions: () => getRefSuggestions,
  interpolate: () => interpolate,
  interpolateObject: () => interpolateObject,
  parseRef: () => parseRef,
  resolveRef: () => resolveRef,
  toResolutionContext: () => toResolutionContext,
  validateTemplate: () => validateTemplate
});
import {
  interpolate as scriptInterpolate,
  interpolateObject as scriptInterpolateObject,
  parseRef,
  resolveRef,
  getRefSuggestions,
  validateTemplate
} from "@symbia/sys";
function toResolutionContext(ctx) {
  return {
    orgId: ctx.orgId,
    conversationId: ctx.conversationId,
    message: ctx.message ? {
      id: ctx.message.id,
      content: ctx.message.content,
      role: ctx.message.role,
      metadata: ctx.message.metadata
    } : void 0,
    user: ctx.user ? {
      id: ctx.user.id,
      email: ctx.user.email,
      displayName: ctx.user.displayName,
      metadata: ctx.user.metadata
    } : void 0,
    org: {
      id: ctx.orgId
    },
    // HOIST THE CONTEXT KEYS TO THE TOP LEVEL.
    //
    // service.call writes its result to context.context[resultKey], and every
    // rule in this codebase then references it as `{{resultKey}}`. Nothing
    // hoisted it, so the resolver looked for a top-level `catalogStats` that
    // did not exist, formatValue turned undefined into '', and the model was
    // handed a prompt with every label present and every value blank.
    //
    // That is the "Platform Status rule's fetched data reaches the prompt
    // empty" defect, and it was never a fetch problem — the calls succeeded
    // and the data was stored. One lookup did not know where to find it.
    //
    // `steps` was already hoisted two lines below for exactly this reason,
    // which is the tell: the same need was met once, for one key, and not
    // generalised. Spread FIRST so the named fields below always win a
    // collision — a rule that stores a result called "message" must not be
    // able to shadow the actual message.
    ...ctx.context,
    context: ctx.context,
    metadata: ctx.metadata,
    // Extract token from metadata if present
    token: ctx.metadata?.token,
    // Pass through catalog data if available
    catalog: ctx.catalog,
    /**
     * The assistant registry, so `@assistant.calc.routing.handles` resolves.
     *
     * Injected here rather than fetched in `symbia-sys`, which is a grammar
     * and must not become a client — the same arrangement `catalog` already
     * uses.
     *
     * A rule can now READ another assistant's declaration instead of holding a
     * copy of it. Five roster copies have been deleted from this codebase and
     * every fix was discipline; this one is grammar.
     */
    assistants: getAllLoadedAssistants().map((l) => ({
      key: loadedAssistantKey(l),
      alias: l.alias,
      name: l.resource?.name,
      description: l.resource?.description,
      routing: l.resource?.metadata?.routing
    })),
    // Expose steps at top level for template access ({{steps.step-id.result}})
    // This allows action results to be referenced by subsequent actions
    steps: ctx.context?.steps
  };
}
function interpolate(template, ctx) {
  const resCtx = toResolutionContext(ctx);
  return scriptInterpolate(template, resCtx);
}
function interpolateObject(obj, ctx) {
  const resCtx = toResolutionContext(ctx);
  return scriptInterpolateObject(obj, resCtx);
}
function getContextValue(path, ctx) {
  const resCtx = toResolutionContext(ctx);
  if (path.startsWith("@")) {
    const result = resolveRef(path, resCtx);
    return result.success ? result.value : void 0;
  }
  const parts = path.split(".");
  const walk = (root) => {
    let current = root;
    for (const part of parts) {
      if (current === null || current === void 0) return void 0;
      if (typeof current === "object") {
        current = current[part];
      } else {
        return void 0;
      }
    }
    return current;
  };
  const direct = walk(ctx);
  if (direct !== void 0) return direct;
  return walk(ctx.context);
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
var init_template = __esm({
  "../../assistants/server/src/engine/template.ts"() {
    "use strict";
    init_assistant_loader();
  }
});

// ../../assistants/server/src/engine/actions/attachments.ts
function buildAttachmentBlock(context, template) {
  const meta = context.message?.metadata ?? {};
  const frame = meta.symbiaFrame;
  const situation = meta.symbiaContext;
  const parts = [];
  const mentionsFrame = /symbiaFrame/.test(template);
  const mentionsSituation = /symbiaContext/.test(template);
  if (situation?.situation && !mentionsSituation) {
    parts.push(`WHERE THE OPERATOR IS
${situation.situation}`);
  }
  if (frame?.digest && !mentionsFrame) {
    const lines = [];
    lines.push("ATTACHED SCREEN CAPTURE");
    lines.push(
      `The operator framed a region of their screen with the spyglass and attached it to this message. Frame ${frame.digest}` + (frame.width && frame.height ? ` (${frame.width}x${frame.height})` : "") + (frame.nodeId ? `, captured by ${frame.nodeId}` : "") + "."
    );
    if (frame.arena === "COMPOSED" && frame.verdict) {
      lines.push(
        `A vision model looked at it${frame.model ? ` (${frame.model}` : ""}${frame.model && frame.path ? ` via ${frame.path}` : ""}${frame.model ? ")" : ""} and described it as follows. This description is the ONLY information you have about the image; you cannot see the image itself.`
      );
      lines.push(`"${frame.verdict}"`);
    } else {
      lines.push(
        `NO MODEL LOOKED AT THIS IMAGE. ${frame.verdict ?? "The vision request was refused."}`
      );
      lines.push(
        `You therefore have NO information about what the capture shows. Do not describe it, guess at it, or answer as though you had seen it. Say that the capture could not be read and, if useful, why.`
      );
    }
    parts.push(lines.join("\n"));
  }
  if (parts.length === 0) return "";
  return `

---
${parts.join("\n\n")}
---
`;
}
var init_attachments = __esm({
  "../../assistants/server/src/engine/actions/attachments.ts"() {
    "use strict";
  }
});

// ../../assistants/server/src/engine/actions/llm-invoke.ts
var LLMInvokeHandler;
var init_llm_invoke = __esm({
  "../../assistants/server/src/engine/actions/llm-invoke.ts"() {
    "use strict";
    init_base();
    init_integrations_client();
    init_template();
    init_attachments();
    LLMInvokeHandler = class extends BaseActionHandler {
      type = "llm.invoke";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const prompt = this.buildPrompt(params, context);
          const response = await this.callLLM(params, prompt, context);
          if (!response.content || response.content.trim() === "") {
            return this.failure(
              `LLM returned an empty response (provider=${response.model ? "resolved" : "unknown"}, model=${response.model || "unknown"}, promptChars=${prompt.length}). Nothing was sent.`,
              Date.now() - start2
            );
          }
          console.log(`[LLMInvoke] model=${response.model} promptChars=${prompt.length} replyChars=${response.content.length}`);
          if (params.resultKey) {
            let contextValue = response.content;
            try {
              contextValue = JSON.parse(response.content);
            } catch {
            }
            context.context[params.resultKey] = contextValue;
            console.log(`[LLMInvoke] Stored result in context.${params.resultKey}:`, contextValue);
          }
          const actionId = config.id;
          if (actionId) {
            if (!context.context.steps) {
              context.context.steps = {};
            }
            context.context.steps[actionId] = { response: response.content };
            console.log(`[LLMInvoke] Stored result in steps.${actionId}.response`);
          }
          return this.success({
            response: response.content,
            model: response.model,
            usage: response.usage,
            promptUsed: prompt
          }, Date.now() - start2);
        } catch (error) {
          if (error instanceof TokenAuthError) {
            throw error;
          }
          const message = error instanceof Error ? error.message : "LLM invocation failed";
          return this.failure(message, Date.now() - start2);
        }
      }
      buildPrompt(params, context) {
        const template = params.promptTemplate || params.userPrompt || "{{message.content}}";
        const prompt = interpolate(template, context);
        return prompt + buildAttachmentBlock(context, template);
      }
      async callLLM(params, prompt, context) {
        const systemPrompt = interpolate(
          params.systemPrompt || "You are a helpful assistant.",
          context
        );
        const integrationsAvailable = await isIntegrationsAvailable();
        if (!integrationsAvailable) {
          throw new Error("Integrations service is not available");
        }
        const token = context.metadata?.token;
        if (!token) {
          throw new Error("No auth token available in execution context");
        }
        const rawOrgId = context.metadata?.rawOrgId;
        let provider = params.provider;
        let model = params.model;
        if (!provider) {
          const usable = await resolveUsableProvider(token, rawOrgId);
          if (!usable) {
            throw new Error(
              "No LLM provider has a usable credential. Add an API key in Settings, or configure this assistant to use a local provider."
            );
          }
          provider = usable.provider;
          model = model || usable.model;
          console.log(`[llm.invoke] no provider configured; resolved to ${provider} (${model})`);
        }
        const response = await invokeLLM(token, {
          provider,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          orgId: rawOrgId
        });
        return {
          content: response.content,
          model: response.model,
          usage: {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens
          }
        };
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/handoff.ts
var HandoffCreateHandler, HandoffAssignHandler, HandoffResolveHandler;
var init_handoff = __esm({
  "../../assistants/server/src/engine/actions/handoff.ts"() {
    "use strict";
    init_base();
    HandoffCreateHandler = class extends BaseActionHandler {
      type = "handoff.create";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const handoffRequest = {
            id: crypto.randomUUID(),
            conversationId: context.conversationId,
            orgId: context.orgId,
            status: "pending",
            reason: params.reason || "Handoff requested",
            priority: params.priority ?? 0,
            tags: params.tags || [],
            contextSummary: params.contextSummary || this.generateContextSummary(context),
            requestedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          return this.success({
            handoffId: handoffRequest.id,
            status: "pending",
            message: "Handoff request created",
            request: handoffRequest
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to create handoff";
          return this.failure(message, Date.now() - start2);
        }
      }
      generateContextSummary(context) {
        const parts = [];
        if (context.message?.content) {
          parts.push(`Last message: ${context.message.content.substring(0, 200)}`);
        }
        if (context.user?.displayName) {
          parts.push(`User: ${context.user.displayName}`);
        }
        parts.push(`Conversation state: ${context.conversationState}`);
        return parts.join("\n");
      }
    };
    HandoffAssignHandler = class extends BaseActionHandler {
      type = "handoff.assign";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        if (!params.handoffId) {
          return this.failure("handoffId is required", Date.now() - start2);
        }
        if (!params.agentId) {
          return this.failure("agentId is required", Date.now() - start2);
        }
        try {
          return this.success({
            handoffId: params.handoffId,
            agentId: params.agentId,
            conversationId: context.conversationId,
            status: "assigned",
            assignedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to assign handoff";
          return this.failure(message, Date.now() - start2);
        }
      }
    };
    HandoffResolveHandler = class extends BaseActionHandler {
      type = "handoff.resolve";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          return this.success({
            handoffId: params.handoffId,
            conversationId: context.conversationId,
            status: "resolved",
            resolution: params.resolution,
            resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to resolve handoff";
          return this.failure(message, Date.now() - start2);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/message.ts
var MessageSendHandler;
var init_message = __esm({
  "../../assistants/server/src/engine/actions/message.ts"() {
    "use strict";
    init_base();
    init_provenance();
    init_template();
    MessageSendHandler = class extends BaseActionHandler {
      type = "message.send";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          let content = params.content || "";
          const template = params.template || params.contentTemplate || content;
          content = interpolate(template, context);
          const steps = context.provenance ?? [];
          const modelStepIds = steps.filter((st) => st.action === "llm.invoke").map((st) => st.id);
          const contentFromModel = modelStepIds.some((id) => template.includes(id));
          const delegation = context.message?.metadata?.symbia?.delegation;
          const fields = params.fields ? interpolateObject({ ...params.fields }, context) : void 0;
          const envelope = seal({
            content,
            fields,
            steps,
            contentFromModel,
            delegation,
            rule: context.provenanceRule,
            assistant: context.metadata?.assistantKey,
            runId: context.metadata?.runId,
            causedBy: context.message?.id
          });
          const message = {
            id: crypto.randomUUID(),
            conversationId: context.conversationId,
            orgId: context.orgId,
            role: params.role || "assistant",
            content,
            channel: params.channel,
            metadata: {
              ...params.metadata || {},
              // Structured, hashed, and verifiable — not a sentence appended to
              // the text. The chat window renders from this; nothing renders from
              // a string an author remembered to write.
              symbia: { provenance: envelope }
            },
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          return this.success({
            messageId: message.id,
            content: message.content,
            role: message.role,
            message
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to send message";
          return this.failure(message, Date.now() - start2);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/notify.ts
import { safeFetch } from "@symbia/egress";
var NotifyHandler;
var init_notify = __esm({
  "../../assistants/server/src/engine/actions/notify.ts"() {
    "use strict";
    init_base();
    init_template();
    NotifyHandler = class extends BaseActionHandler {
      type = "notify";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          let content = params.content || "";
          if (params.contentTemplate) {
            content = interpolate(params.contentTemplate, context);
          }
          const notification = {
            id: crypto.randomUUID(),
            orgId: context.orgId,
            conversationId: context.conversationId,
            channel: params.channel || "webhook",
            recipient: params.recipient,
            recipientId: params.recipientId,
            subject: params.subject,
            content,
            metadata: params.metadata || {},
            status: "pending",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          if (params.channel === "webhook" && params.webhookUrl) {
            await this.sendWebhook(params.webhookUrl, notification, context);
            notification.status = "sent";
          }
          return this.success({
            notificationId: notification.id,
            channel: notification.channel,
            status: notification.status,
            notification
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to send notification";
          return this.failure(message, Date.now() - start2);
        }
      }
      async sendWebhook(url, notification, context) {
        const response = await safeFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            notification,
            context: {
              orgId: context.orgId,
              conversationId: context.conversationId,
              trigger: context.trigger
            }
          })
        });
        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/state-transition.ts
var VALID_TRANSITIONS, StateTransitionHandler;
var init_state_transition = __esm({
  "../../assistants/server/src/engine/actions/state-transition.ts"() {
    "use strict";
    init_base();
    VALID_TRANSITIONS = {
      "idle": ["ai_active", "agent_active", "resolved"],
      "ai_active": ["waiting_for_user", "handoff_pending", "resolved", "idle"],
      "waiting_for_user": ["ai_active", "handoff_pending", "resolved", "archived"],
      "handoff_pending": ["agent_active", "ai_active", "resolved"],
      "agent_active": ["ai_active", "handoff_pending", "resolved", "waiting_for_user"],
      "resolved": ["archived", "ai_active", "idle"],
      "archived": ["idle"]
    };
    StateTransitionHandler = class extends BaseActionHandler {
      type = "state.transition";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        if (!params.targetState) {
          return this.failure("targetState is required", Date.now() - start2);
        }
        try {
          const currentState = context.conversationState;
          const targetState = params.targetState;
          const validTargets = VALID_TRANSITIONS[currentState] || [];
          if (!validTargets.includes(targetState)) {
            return this.failure(
              `Invalid state transition from '${currentState}' to '${targetState}'`,
              Date.now() - start2
            );
          }
          return this.success({
            previousState: currentState,
            newState: targetState,
            reason: params.reason,
            transitionedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to transition state";
          return this.failure(message, Date.now() - start2);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/context-update.ts
var ContextUpdateHandler;
var init_context_update = __esm({
  "../../assistants/server/src/engine/actions/context-update.ts"() {
    "use strict";
    init_base();
    ContextUpdateHandler = class extends BaseActionHandler {
      type = "context.update";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        let updates = params.updates;
        if (!updates && params.key !== void 0) {
          updates = { [params.key]: params.value };
        }
        if (!updates) {
          return this.failure("updates or key/value is required", Date.now() - start2);
        }
        try {
          const operation = params.operation || "merge";
          let newContext;
          switch (operation) {
            case "set":
              newContext = { ...updates };
              break;
            case "merge":
              newContext = this.deepMerge(context.context, updates);
              break;
            case "delete":
              newContext = { ...context.context };
              for (const key of Object.keys(updates)) {
                delete newContext[key];
              }
              break;
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
          return this.success({
            operation,
            previousContext: context.context,
            newContext,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to update context";
          return this.failure(message, Date.now() - start2);
        }
      }
      deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
          const sourceVal = source[key];
          const targetVal = result[key];
          if (sourceVal !== null && typeof sourceVal === "object" && !Array.isArray(sourceVal) && targetVal !== null && typeof targetVal === "object" && !Array.isArray(targetVal)) {
            result[key] = this.deepMerge(
              targetVal,
              sourceVal
            );
          } else {
            result[key] = sourceVal;
          }
        }
        return result;
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/webhook-call.ts
import { safeFetch as safeFetch2 } from "@symbia/egress";
var WebhookCallHandler;
var init_webhook_call = __esm({
  "../../assistants/server/src/engine/actions/webhook-call.ts"() {
    "use strict";
    init_base();
    init_template();
    WebhookCallHandler = class extends BaseActionHandler {
      type = "webhook.call";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        if (!params.url) {
          return this.failure("url is required", Date.now() - start2);
        }
        try {
          const url = interpolate(params.url, context);
          const method = params.method || "POST";
          const timeout = params.timeout || 3e4;
          let body;
          if (params.bodyTemplate) {
            body = interpolate(params.bodyTemplate, context);
          } else if (params.body) {
            body = JSON.stringify(params.body);
          } else if (method !== "GET" && method !== "DELETE") {
            body = JSON.stringify({
              orgId: context.orgId,
              conversationId: context.conversationId,
              trigger: context.trigger,
              message: context.message,
              context: context.context
            });
          }
          const headers = {
            "Content-Type": "application/json",
            ...params.headers
          };
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          try {
            const response = await safeFetch2(url, {
              method,
              headers,
              body,
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            let responseBody;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              responseBody = await response.json();
            } else {
              responseBody = await response.text();
            }
            if (!response.ok) {
              return this.failure(
                `Webhook returned ${response.status}: ${JSON.stringify(responseBody)}`,
                Date.now() - start2
              );
            }
            return this.success({
              status: response.status,
              headers: Object.fromEntries(response.headers.entries()),
              body: responseBody
            }, Date.now() - start2);
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Webhook call failed";
          return this.failure(message, Date.now() - start2);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/service-call.ts
import { ServiceId as ServiceId2, resolveServiceUrl as resolveServiceUrl2 } from "@symbia/sys";
function getServiceEndpoint(service) {
  const serviceMap = {
    logging: ServiceId2.LOGGING,
    catalog: ServiceId2.CATALOG,
    identity: ServiceId2.IDENTITY,
    messaging: ServiceId2.MESSAGING,
    runtime: ServiceId2.RUNTIME,
    network: ServiceId2.NETWORK,
    integrations: ServiceId2.INTEGRATIONS,
    // Absent until 16 Aug — stranded local inference behind the assistant
    // layer. Mirrors source fix in service-call.ts.
    models: ServiceId2.MODELS
  };
  const serviceId = serviceMap[service];
  if (!serviceId) return null;
  const envOverride = process.env[`${service.toUpperCase()}_ENDPOINT`];
  if (envOverride) return envOverride;
  return resolveServiceUrl2(serviceId);
}
var ServiceCallHandler;
var init_service_call = __esm({
  "../../assistants/server/src/engine/actions/service-call.ts"() {
    "use strict";
    init_base();
    init_integrations_client();
    init_template();
    ServiceCallHandler = class extends BaseActionHandler {
      type = "service.call";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const baseUrl = getServiceEndpoint(params.service);
          if (!baseUrl) {
            return this.failure(`Unknown service: ${params.service}`, Date.now() - start2);
          }
          const resolvedPath = interpolate(params.path, context);
          const resolvedBody = params.body ? interpolateObject(params.body, context) : void 0;
          const basePath = params.basePath ?? "/api";
          const url = `${baseUrl}${basePath}${resolvedPath}`;
          const token = context.metadata?.token;
          const rawOrgId = context.metadata?.rawOrgId ?? context.orgId;
          const response = await fetch(url, {
            method: params.method || "GET",
            headers: {
              "Content-Type": "application/json",
              "X-Org-Id": rawOrgId,
              ...token ? { Authorization: `Bearer ${token}` } : {},
              ...params.headers
            },
            body: resolvedBody ? JSON.stringify(resolvedBody) : void 0
          });
          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 401 || response.status === 403) {
              throw new TokenAuthError(
                `${params.service} ${params.method || "GET"} ${resolvedPath} rejected the token (${response.status})`
              );
            }
            return this.failure(
              `Service call failed: ${params.service} ${params.method || "GET"} ${resolvedPath} -> ${response.status} (auth: ${token ? "bearer sent" : "NO TOKEN"}) - ${errorText.slice(0, 200)}`,
              Date.now() - start2
            );
          }
          const data = await response.json();
          if (params.resultKey) {
            context.context[params.resultKey] = data;
          }
          return this.success({
            service: params.service,
            path: resolvedPath,
            status: response.status,
            data
          }, Date.now() - start2);
        } catch (error) {
          if (error instanceof TokenAuthError) throw error;
          const message = error instanceof Error ? error.message : "Service call failed";
          return this.failure(message, Date.now() - start2);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/wait.ts
var WaitHandler;
var init_wait = __esm({
  "../../assistants/server/src/engine/actions/wait.ts"() {
    "use strict";
    init_base();
    WaitHandler = class extends BaseActionHandler {
      type = "wait";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          let durationMs = params.duration || 0;
          switch (params.unit) {
            case "s":
              durationMs = durationMs * 1e3;
              break;
            case "m":
              durationMs = durationMs * 60 * 1e3;
              break;
          }
          const maxWait = 5 * 60 * 1e3;
          if (durationMs > maxWait) {
            console.warn(`[Wait] Duration ${durationMs}ms exceeds max ${maxWait}ms, capping`);
            durationMs = maxWait;
          }
          if (durationMs > 0) {
            console.log(`[Wait] Waiting ${durationMs}ms${params.reason ? ` (${params.reason})` : ""}`);
            await this.sleep(durationMs);
          }
          return {
            success: true,
            actionType: this.type,
            output: {
              waited: durationMs,
              reason: params.reason
            },
            durationMs: Date.now() - start2
          };
        } catch (error) {
          return {
            success: false,
            actionType: this.type,
            error: error instanceof Error ? error.message : "Wait failed",
            durationMs: Date.now() - start2
          };
        }
      }
      sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/parallel.ts
var ParallelHandler;
var init_parallel = __esm({
  "../../assistants/server/src/engine/actions/parallel.ts"() {
    "use strict";
    init_base();
    init_actions();
    ParallelHandler = class extends BaseActionHandler {
      type = "parallel";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const actions = params.actions || [];
          const strategy = params.strategy || "all";
          const timeout = params.timeout || 3e4;
          if (actions.length === 0) {
            return {
              success: true,
              actionType: this.type,
              output: { strategy, total: 0, succeeded: 0, failed: 0, results: [] },
              durationMs: Date.now() - start2
            };
          }
          console.log(`[Parallel] Executing ${actions.length} actions with strategy: ${strategy}`);
          const actionPromises = actions.map((actionConfig) => this.executeAction(actionConfig, context));
          const timedPromises = actionPromises.map(
            (p) => Promise.race([
              p,
              this.timeoutPromise(timeout)
            ])
          );
          let results;
          switch (strategy) {
            case "any":
              const firstResult = await Promise.any(timedPromises).catch(() => null);
              if (firstResult) {
                results = [firstResult];
              } else {
                results = await Promise.allSettled(timedPromises).then(
                  (settled2) => settled2.map((s) => s.status === "fulfilled" ? s.value : this.errorResult(s.reason))
                );
              }
              break;
            case "settle":
              const settled = await Promise.allSettled(timedPromises);
              results = settled.map(
                (s) => s.status === "fulfilled" ? s.value : this.errorResult(s.reason)
              );
              break;
            case "all":
            default:
              if (params.continueOnError) {
                const allSettled = await Promise.allSettled(timedPromises);
                results = allSettled.map(
                  (s) => s.status === "fulfilled" ? s.value : this.errorResult(s.reason)
                );
              } else {
                results = await Promise.all(timedPromises);
              }
              break;
          }
          const succeeded = results.filter((r) => r.success).length;
          const failed = results.filter((r) => !r.success).length;
          const output = {
            strategy,
            total: actions.length,
            succeeded,
            failed,
            results
          };
          let success = true;
          if (strategy === "all" && failed > 0) {
            success = false;
          } else if (strategy === "any" && succeeded === 0) {
            success = false;
          }
          return {
            success,
            actionType: this.type,
            output,
            durationMs: Date.now() - start2
          };
        } catch (error) {
          return {
            success: false,
            actionType: this.type,
            error: error instanceof Error ? error.message : "Parallel execution failed",
            durationMs: Date.now() - start2
          };
        }
      }
      async executeAction(config, context) {
        const handler = getActionHandler(config.type);
        if (!handler) {
          return {
            success: false,
            actionType: config.type,
            error: `Unknown action type: ${config.type}`,
            durationMs: 0
          };
        }
        return handler.execute(config, context);
      }
      timeoutPromise(ms) {
        return new Promise(
          (_, reject) => setTimeout(() => reject(new Error(`Action timed out after ${ms}ms`)), ms)
        );
      }
      errorResult(reason) {
        return {
          success: false,
          actionType: "parallel",
          error: reason instanceof Error ? reason.message : String(reason),
          durationMs: 0
        };
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/condition.ts
var ConditionHandler;
var init_condition = __esm({
  "../../assistants/server/src/engine/actions/condition.ts"() {
    "use strict";
    init_base();
    init_actions();
    init_condition_evaluator();
    ConditionHandler = class extends BaseActionHandler {
      type = "condition";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          if (!params.if) {
            return {
              success: false,
              actionType: this.type,
              error: 'Condition "if" clause is required',
              durationMs: Date.now() - start2
            };
          }
          const conditionMet = evaluateConditions(params.if, context);
          console.log(`[Condition] Evaluated: ${conditionMet}`);
          const actionsToExecute = conditionMet ? params.then || [] : params.else || [];
          if (actionsToExecute.length === 0) {
            return {
              success: true,
              actionType: this.type,
              output: {
                conditionMet,
                branch: conditionMet ? "then" : "else",
                actionsExecuted: 0
              },
              durationMs: Date.now() - start2
            };
          }
          const results = [];
          for (const actionConfig of actionsToExecute) {
            const handler = getActionHandler(actionConfig.type);
            if (!handler) {
              results.push({
                success: false,
                actionType: actionConfig.type,
                error: `Unknown action type: ${actionConfig.type}`,
                durationMs: 0
              });
              continue;
            }
            const result = await handler.execute(actionConfig, context);
            results.push(result);
            if (!result.success) {
              break;
            }
          }
          const allSucceeded = results.every((r) => r.success);
          return {
            success: allSucceeded,
            actionType: this.type,
            output: {
              conditionMet,
              branch: conditionMet ? "then" : "else",
              actionsExecuted: results.length,
              results
            },
            durationMs: Date.now() - start2
          };
        } catch (error) {
          return {
            success: false,
            actionType: this.type,
            error: error instanceof Error ? error.message : "Condition evaluation failed",
            durationMs: Date.now() - start2
          };
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/loop.ts
var LoopHandler;
var init_loop = __esm({
  "../../assistants/server/src/engine/actions/loop.ts"() {
    "use strict";
    init_base();
    init_actions();
    LoopHandler = class extends BaseActionHandler {
      type = "loop";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          let collection;
          if (typeof params.over === "string") {
            collection = this.resolveContextPath(params.over, context);
          } else if (Array.isArray(params.over)) {
            collection = params.over;
          } else {
            return {
              success: false,
              actionType: this.type,
              error: '"over" must be an array or a context path to an array',
              durationMs: Date.now() - start2
            };
          }
          if (!Array.isArray(collection)) {
            return {
              success: false,
              actionType: this.type,
              error: `Resolved value is not an array: ${typeof collection}`,
              durationMs: Date.now() - start2
            };
          }
          const maxIterations = params.maxIterations || 100;
          const itemsToProcess = collection.slice(0, maxIterations);
          if (collection.length > maxIterations) {
            console.warn(`[Loop] Collection has ${collection.length} items, limiting to ${maxIterations}`);
          }
          console.log(`[Loop] Iterating over ${itemsToProcess.length} items as "${params.as}"`);
          const iterationResults = [];
          let failedIterations = 0;
          for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];
            const loopContext = {
              ...context,
              context: {
                ...context.context,
                [params.as]: item,
                ...params.index ? { [params.index]: i } : {}
              }
            };
            const actionResults = [];
            let iterationFailed = false;
            for (const actionConfig of params.actions || []) {
              const handler = getActionHandler(actionConfig.type);
              if (!handler) {
                actionResults.push({
                  success: false,
                  actionType: actionConfig.type,
                  error: `Unknown action type: ${actionConfig.type}`,
                  durationMs: 0
                });
                iterationFailed = true;
                break;
              }
              const result = await handler.execute(actionConfig, loopContext);
              actionResults.push(result);
              if (!result.success) {
                iterationFailed = true;
                if (!params.continueOnError) {
                  break;
                }
              }
            }
            iterationResults.push({ index: i, results: actionResults });
            if (iterationFailed) {
              failedIterations++;
              if (!params.continueOnError) {
                break;
              }
            }
          }
          return {
            success: failedIterations === 0 || params.continueOnError === true,
            actionType: this.type,
            output: {
              totalItems: collection.length,
              processedItems: iterationResults.length,
              failedIterations,
              iterations: iterationResults
            },
            durationMs: Date.now() - start2
          };
        } catch (error) {
          return {
            success: false,
            actionType: this.type,
            error: error instanceof Error ? error.message : "Loop execution failed",
            durationMs: Date.now() - start2
          };
        }
      }
      resolveContextPath(path, context) {
        const parts = path.split(".");
        let current = context;
        for (const part of parts) {
          if (current === null || current === void 0) {
            return void 0;
          }
          current = current[part];
        }
        return current;
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/assistant-route.ts
import { emitEvent } from "@symbia/relay";
import { createMessagingClient } from "@symbia/messaging-client";
var AssistantRouteHandler;
var init_assistant_route = __esm({
  "../../assistants/server/src/engine/actions/assistant-route.ts"() {
    "use strict";
    init_base();
    init_assistant_loader();
    init_provenance();
    AssistantRouteHandler = class extends BaseActionHandler {
      type = "assistant.route";
      async execute(config, context) {
        const startTime = Date.now();
        const params = config.params;
        let targetAssistant = params.targetAssistant;
        if (params.fromContext) {
          const contextKey = params.contextKey || "routeTarget";
          const contextValue = context.context[contextKey];
          if (typeof contextValue === "string") {
            targetAssistant = contextValue;
          } else if (contextValue && typeof contextValue === "object") {
            const obj = contextValue;
            targetAssistant = obj.assistant || obj.target || obj.key;
          }
        }
        if (!targetAssistant) {
          return this.failure("No target assistant specified for routing", Date.now() - startTime);
        }
        const requested = targetAssistant;
        const resolved = resolveAssistant(requested);
        if (!resolved || !resolved.ruleSet) {
          const known = getAllLoadedAssistants().map((l) => {
            const k = loadedAssistantKey(l);
            return l.alias && l.alias !== k ? `${k} (@${l.alias})` : k;
          }).filter(Boolean).sort().join(", ");
          console.log(`[AssistantRoute] '${requested}' does not resolve. Loaded: ${known}`);
          return this.failure(
            `No assistant named '${requested}'. Loaded assistants: ${known}`,
            Date.now() - startTime
          );
        }
        targetAssistant = loadedAssistantKey(resolved);
        const assistant = resolved;
        const selfKey = context.event?.data?.assistantKey;
        if (selfKey && selfKey === targetAssistant) {
          return this.failure(
            `Refusing to route to self ('${targetAssistant}') \u2014 that is an unbounded loop, not a delegation`,
            Date.now() - startTime
          );
        }
        const alreadyRouted = context.message?.metadata?.routedFrom;
        if (alreadyRouted) {
          return this.failure(
            `Message was already routed by '${alreadyRouted}'; refusing a second hop`,
            Date.now() - startTime
          );
        }
        const tierReason = context.context[params.contextKey || "routeTarget"]?.method === "classifier" ? "classifier match" : params.reason || "declared match";
        console.log(`[AssistantRoute] Routing message to ${targetAssistant} (reason: ${tierReason})`);
        try {
          const targetUserId = `assistant:${targetAssistant}`;
          console.log(`[AssistantRoute] Adding ${targetAssistant} to conversation ${context.conversationId}`);
          try {
            const messagingClient = createMessagingClient();
            await messagingClient.joinConversation(context.conversationId, {
              asUserId: targetUserId
            });
            console.log(`[AssistantRoute] ${targetAssistant} joined conversation`);
          } catch (joinError) {
            const joinMsg = joinError instanceof Error ? joinError.message : String(joinError);
            console.log(`[AssistantRoute] Join attempt for ${targetAssistant}: ${joinMsg}`);
          }
          console.log(`[AssistantRoute] Forwarding message to ${targetAssistant} via SDN`);
          const resolved2 = params.contentKey ? context.context[params.contentKey] : void 0;
          const forwardedContent = resolved2?.resolved && typeof resolved2.text === "string" ? resolved2.text : context.message?.content;
          const selfName = selfKey || context.metadata?.assistantKey || "coordinator";
          const priorSteps = context.provenance ?? [];
          const decision = context.context[params.contextKey || "routeTarget"];
          const modelSteps = priorSteps.filter((s) => s.action === "llm.invoke");
          const tier = modelSteps.length > 0 ? "model" : decision?.method === "addressed" ? (
            // Not an inference at all — the person named the assistant. The
            // most reproducible routing there is, and it was being ignored.
            "addressed"
          ) : decision?.method === "classifier" ? "classifier" : "declaration";
          const decidedBy = tier === "addressed" ? `you did \u2014 ${decision?.matchedPattern ?? "addressed by name"}` : tier === "model" ? modelSteps.map((s) => s.source).join(", ") || void 0 : tier === "classifier" ? `assistants.route (${decision?.matchedPattern ?? "classifier"})` : `assistants.route (declared pattern ${JSON.stringify(decision?.matchedPattern ?? "")}${decision?.tieBroken ? ", TIE BROKEN BY NAME" : ""})`;
          const delegation = sealDelegation({
            from: selfName,
            to: targetAssistant,
            reason: tierReason,
            decidedBy: decidedBy || void 0,
            method: tier,
            causedBy: context.message?.id,
            conversationId: context.conversationId,
            steps: [
              ...priorSteps,
              {
                id: config.id || "assistant.route",
                action: "assistant.route",
                source: `${selfName} -> ${targetAssistant}`,
                ok: true,
                by: selfName
              }
            ]
          });
          const forwardPayload = {
            conversationId: context.conversationId,
            message: {
              id: context.message?.id,
              sender_id: context.user?.id,
              sender_type: "user",
              content: forwardedContent,
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              metadata: {
                // Carried so the specialist's reply can show that the question it
                // answered is not word-for-word the question that was asked.
                ...forwardedContent !== context.message?.content ? { resolvedFrom: context.message?.content } : {},
                // Was the literal string 'coordinator' regardless of who routed,
                // so the one surviving breadcrumb would have lied the moment
                // anything else delegated.
                routedFrom: selfName,
                routeReason: params.reason,
                // The sealed decision travels with the message it caused. The
                // specialist cannot have forged it and does not need to be trusted
                // to describe it.
                symbia: { delegation }
              }
            },
            // Target this specific assistant
            assistants: [{
              userId: targetUserId,
              key: targetAssistant
            }],
            orgId: context.orgId.split(":")[1] || "default"
          };
          const emitResult = await emitEvent(
            "message.new",
            forwardPayload,
            context.conversationId,
            {
              target: "assistants",
              boundary: "intra"
            }
          );
          if (emitResult) {
            console.log(`[AssistantRoute] Message forwarded to ${targetAssistant}: ${emitResult.eventId}`);
          } else {
            console.warn(`[AssistantRoute] Failed to forward message via SDN, trying direct emit`);
            await emitEvent("message.new", forwardPayload, context.conversationId);
          }
          return this.success({
            routed: true,
            targetAssistant,
            reason: params.reason,
            // Mark that coordinator should not produce its own response
            suppressResponse: true
          }, Date.now() - startTime);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[AssistantRoute] Failed to route to ${targetAssistant}:`, errorMsg);
          return this.failure(`Failed to route to ${targetAssistant}: ${errorMsg}`, Date.now() - startTime);
        }
      }
    };
  }
});

// ../../assistants/server/src/config/llm-config-resolver.ts
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (sourceValue !== void 0 && typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue) && typeof targetValue === "object" && targetValue !== null && !Array.isArray(targetValue)) {
      result[key] = deepMerge(
        targetValue,
        sourceValue
      );
    } else if (sourceValue !== void 0) {
      result[key] = sourceValue;
    }
  }
  return result;
}
function resolveLLMConfig(configRef, orgDefaults) {
  let resolved = { ...SYSTEM_DEFAULTS };
  if (orgDefaults) {
    resolved = deepMerge(resolved, orgDefaults);
  }
  if (!configRef) {
    return resolved;
  }
  if (configRef.preset && configRef.preset !== "custom") {
    const preset = PRESETS[configRef.preset];
    if (preset) {
      resolved = deepMerge(resolved, preset);
    }
  }
  if (configRef.overrides) {
    const overrides = configRef.overrides;
    if (overrides.provider?.type) {
      resolved.provider = {
        ...resolved.provider,
        type: overrides.provider.type,
        ...overrides.provider.baseUrl ? { baseUrl: overrides.provider.baseUrl } : {}
      };
    }
    if (overrides.generation) {
      resolved.generation = {
        ...resolved.generation,
        ...overrides.generation
      };
    }
    if (overrides.embedding) {
      resolved.embedding = {
        ...resolved.embedding,
        provider: overrides.embedding.provider || resolved.embedding?.provider || "openai",
        model: overrides.embedding.model || resolved.embedding?.model || "text-embedding-3-small",
        dimensions: overrides.embedding.dimensions ?? resolved.embedding?.dimensions,
        normalize: resolved.embedding?.normalize ?? true
      };
    }
    if (overrides.routing) {
      resolved.routing = {
        ...resolved.routing,
        strategy: overrides.routing.strategy || resolved.routing?.strategy || "hybrid",
        similarityThreshold: overrides.routing.similarityThreshold ?? resolved.routing?.similarityThreshold ?? 0.7,
        confidenceThreshold: overrides.routing.confidenceThreshold ?? resolved.routing?.confidenceThreshold ?? 0.85,
        cacheEmbeddings: resolved.routing?.cacheEmbeddings ?? true
      };
    }
    if (overrides.safety) {
      resolved.safety = {
        ...resolved.safety,
        contentFilterLevel: overrides.safety.contentFilterLevel || resolved.safety.contentFilterLevel,
        piiDetection: overrides.safety.piiDetection ?? resolved.safety.piiDetection,
        promptInjectionProtection: overrides.safety.promptInjectionProtection ?? resolved.safety.promptInjectionProtection
      };
    }
    if (overrides.reliability) {
      resolved.reliability = {
        ...resolved.reliability,
        timeoutMs: overrides.reliability.timeoutMs ?? resolved.reliability.timeoutMs,
        maxRetries: overrides.reliability.maxRetries ?? resolved.reliability.maxRetries,
        enableFallback: overrides.reliability.enableFallback ?? resolved.reliability.enableFallback
      };
    }
    if (overrides.context) {
      resolved.context = {
        ...resolved.context,
        maxContextTokens: overrides.context.maxContextTokens ?? resolved.context.maxContextTokens,
        truncationStrategy: overrides.context.truncationStrategy || resolved.context.truncationStrategy,
        enableRollingContext: overrides.context.enableRollingContext ?? resolved.context.enableRollingContext
      };
    }
  }
  return resolved;
}
function shouldUseEmbeddingRouting(resolvedConfig) {
  const strategy = resolvedConfig.routing?.strategy;
  return strategy === "embedding" || strategy === "hybrid";
}
function shouldUseLLMFallback(resolvedConfig, embeddingSimilarity) {
  const strategy = resolvedConfig.routing?.strategy;
  if (strategy === "llm") return true;
  if (strategy === "embedding" || strategy === "rules") return false;
  if (strategy === "hybrid" && embeddingSimilarity !== void 0) {
    const confidenceThreshold = resolvedConfig.routing?.confidenceThreshold ?? 0.85;
    return embeddingSimilarity < confidenceThreshold;
  }
  return true;
}
var SYSTEM_DEFAULTS, PRESETS;
var init_llm_config_resolver = __esm({
  "../../assistants/server/src/config/llm-config-resolver.ts"() {
    "use strict";
    SYSTEM_DEFAULTS = {
      provider: {
        type: "openai"
      },
      generation: {
        model: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 1024,
        responseFormat: "text"
      },
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 512,
        normalize: true
      },
      routing: {
        strategy: "hybrid",
        similarityThreshold: 0.7,
        confidenceThreshold: 0.85,
        cacheEmbeddings: true
      },
      safety: {
        contentFilterLevel: "medium",
        piiDetection: false,
        promptInjectionProtection: true
      },
      reliability: {
        timeoutMs: 45e3,
        maxRetries: 3,
        enableFallback: true,
        fallbackModels: [
          { provider: "openai", model: "gpt-4o-mini" }
        ]
      },
      context: {
        maxContextTokens: 8e3,
        reserveForResponse: 1024,
        truncationStrategy: "oldest_first",
        enableRollingContext: false
      },
      observability: {
        logLevel: "info",
        logTokenUsage: true,
        logLatency: true
      }
    };
    PRESETS = {
      routing: {
        generation: {
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 100,
          responseFormat: "json"
        },
        routing: {
          strategy: "hybrid",
          similarityThreshold: 0.7,
          confidenceThreshold: 0.85,
          cacheEmbeddings: true
        },
        reliability: {
          timeoutMs: 1e4,
          maxRetries: 2,
          enableFallback: true
        },
        context: {
          maxContextTokens: 2e3,
          reserveForResponse: 100,
          truncationStrategy: "oldest_first",
          enableRollingContext: true
        }
      },
      conversational: {
        generation: {
          model: "gpt-4o",
          temperature: 0.7,
          maxTokens: 2048,
          responseFormat: "text"
        },
        safety: {
          contentFilterLevel: "medium",
          piiDetection: false,
          promptInjectionProtection: true
        },
        reliability: {
          timeoutMs: 45e3,
          maxRetries: 3,
          enableFallback: true,
          fallbackModels: [
            { provider: "openai", model: "gpt-4o-mini" },
            { provider: "anthropic", model: "claude-3-haiku-20240307" }
          ]
        },
        context: {
          maxContextTokens: 8e3,
          reserveForResponse: 2048,
          truncationStrategy: "oldest_first",
          enableRollingContext: false
        }
      },
      code: {
        generation: {
          model: "gpt-4o",
          temperature: 0.2,
          maxTokens: 4096,
          topP: 0.95,
          responseFormat: "text"
        },
        safety: {
          contentFilterLevel: "low",
          piiDetection: false,
          promptInjectionProtection: false
        },
        reliability: {
          timeoutMs: 6e4,
          maxRetries: 2,
          enableFallback: true
        },
        context: {
          maxContextTokens: 16e3,
          reserveForResponse: 4096,
          truncationStrategy: "sliding_window",
          enableRollingContext: false
        }
      },
      reasoning: {
        generation: {
          model: "o4-mini",
          temperature: 1,
          // o-series requires temp=1
          maxTokens: 16e3,
          responseFormat: "text",
          reasoningEffort: "medium"
          // Options: none, low, medium, high, xhigh
        },
        reliability: {
          timeoutMs: 12e4,
          maxRetries: 2,
          enableFallback: false
          // Don't fallback from reasoning models
        },
        context: {
          maxContextTokens: 32e3,
          reserveForResponse: 16e3,
          truncationStrategy: "summarize",
          enableRollingContext: false
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/embedding-route.ts
var embeddingCache, CACHE_TTL_MS, EmbeddingRouteHandler;
var init_embedding_route = __esm({
  "../../assistants/server/src/engine/actions/embedding-route.ts"() {
    "use strict";
    init_base();
    init_assistant_loader();
    init_integrations_client();
    init_llm_config_resolver();
    embeddingCache = /* @__PURE__ */ new Map();
    CACHE_TTL_MS = 60 * 60 * 1e3;
    EmbeddingRouteHandler = class extends BaseActionHandler {
      type = "embedding.route";
      async execute(config, context) {
        const startTime = Date.now();
        const params = config.params;
        try {
          if (context.llmConfig && !shouldUseEmbeddingRouting(context.llmConfig)) {
            console.log("[EmbeddingRoute] Embedding routing disabled in config, skipping");
            return this.success({
              skipped: true,
              reason: "Embedding routing disabled in configuration"
            }, Date.now() - startTime);
          }
          const userMessage = context.message?.content;
          if (!userMessage) {
            return this.failure("No message content available", Date.now() - startTime);
          }
          const token = context.metadata?.token;
          if (!token) {
            console.warn("[EmbeddingRoute] No auth token, falling back to LLM routing");
            return this.success({
              skipped: true,
              needsLLMFallback: true,
              reason: "No auth token for embedding service"
            }, Date.now() - startTime);
          }
          const provider = params.provider || context.llmConfig?.embedding?.provider || "openai";
          const model = params.model || context.llmConfig?.embedding?.model || "text-embedding-3-small";
          const dimensions = params.dimensions || context.llmConfig?.embedding?.dimensions;
          const assistantDescriptions = this.getAssistantDescriptions(params);
          if (Object.keys(assistantDescriptions).length === 0) {
            return this.failure("No assistants available for routing", Date.now() - startTime);
          }
          console.log(`[EmbeddingRoute] Computing embeddings for ${Object.keys(assistantDescriptions).length} assistants`);
          const userEmbedding = await invokeEmbedding(token, {
            provider,
            model,
            input: userMessage,
            dimensions
          });
          const assistantEmbeddings = await this.getAssistantEmbeddings(
            token,
            assistantDescriptions,
            { provider, model, dimensions },
            params.cacheEmbeddings !== false
          );
          const scores = this.computeSimilarities(userEmbedding, assistantEmbeddings);
          const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
          const [bestKey, bestScore] = sorted[0] || ["", 0];
          console.log(`[EmbeddingRoute] Best match: ${bestKey} (score: ${bestScore.toFixed(3)})`);
          const similarityThreshold = params.similarityThreshold ?? context.llmConfig?.routing?.similarityThreshold ?? 0.7;
          const confidenceThreshold = params.confidenceThreshold ?? context.llmConfig?.routing?.confidenceThreshold ?? 0.85;
          let confidenceLevel;
          if (bestScore >= confidenceThreshold) {
            confidenceLevel = "high";
          } else if (bestScore >= similarityThreshold) {
            confidenceLevel = "medium";
          } else {
            confidenceLevel = "low";
          }
          const needsLLMFallback = context.llmConfig ? shouldUseLLMFallback(context.llmConfig, bestScore) : bestScore < confidenceThreshold;
          const result = {
            assistant: bestScore >= similarityThreshold ? bestKey : "",
            score: bestScore,
            allScores: scores,
            method: "embedding",
            confidenceLevel,
            needsLLMFallback,
            reason: params.reason || `Semantic similarity routing (score: ${bestScore.toFixed(3)})`
          };
          const resultKey = params.resultKey || "embeddingRouteDecision";
          context.context[resultKey] = result;
          console.log(`[EmbeddingRoute] Result stored in context.${resultKey}:`, {
            assistant: result.assistant,
            score: result.score.toFixed(3),
            confidenceLevel,
            needsLLMFallback
          });
          if (bestScore < similarityThreshold) {
            return this.success({
              ...result,
              routed: false,
              message: `No confident match (best: ${bestScore.toFixed(3)} < ${similarityThreshold})`
            }, Date.now() - startTime);
          }
          return this.success(result, Date.now() - startTime);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Embedding routing failed";
          console.error("[EmbeddingRoute] Error:", message);
          return this.success({
            skipped: true,
            needsLLMFallback: true,
            error: message,
            reason: "Embedding routing failed, needs LLM fallback"
          }, Date.now() - startTime);
        }
      }
      /**
       * Get assistant descriptions for routing, excluding coordinator and filtered assistants
       */
      getAssistantDescriptions(params) {
        const descriptions = {};
        const exclude = new Set(params.excludeAssistants || ["coordinator"]);
        const includeSet = params.includeAssistants ? new Set(params.includeAssistants) : null;
        for (const assistant of getAllLoadedAssistants()) {
          const key = assistant.resource.key;
          if (exclude.has(key)) continue;
          if (includeSet && !includeSet.has(key)) continue;
          const parts = [
            assistant.resource.description,
            assistant.resource.name
          ];
          if (assistant.alias) {
            parts.push(`Also known as @${assistant.alias}`);
          }
          descriptions[key] = parts.filter(Boolean).join(". ");
        }
        return descriptions;
      }
      /**
       * Get embeddings for assistant descriptions, using cache when available
       */
      async getAssistantEmbeddings(token, descriptions, config, useCache) {
        const embeddings = {};
        const toCompute = [];
        const cacheKey = (key) => `${config.model}:${key}`;
        for (const [key, description] of Object.entries(descriptions)) {
          const cached = useCache ? embeddingCache.get(cacheKey(key)) : null;
          if (cached && cached.model === config.model && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            embeddings[key] = cached.embedding;
          } else {
            toCompute.push({ key, text: description });
          }
        }
        if (toCompute.length > 0) {
          console.log(`[EmbeddingRoute] Computing ${toCompute.length} embeddings (${Object.keys(embeddings).length} cached)`);
          const batchSize = 10;
          for (let i = 0; i < toCompute.length; i += batchSize) {
            const batch = toCompute.slice(i, i + batchSize);
            const results = await Promise.all(
              batch.map(async ({ key, text: text2 }) => {
                try {
                  const embedding = await invokeEmbedding(token, {
                    provider: config.provider,
                    model: config.model,
                    input: text2,
                    dimensions: config.dimensions
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
                if (useCache) {
                  embeddingCache.set(cacheKey(key), {
                    embedding,
                    timestamp: Date.now(),
                    model: config.model
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
      computeSimilarities(userEmbedding, assistantEmbeddings) {
        const scores = {};
        for (const [key, embedding] of Object.entries(assistantEmbeddings)) {
          scores[key] = this.cosineSimilarity(userEmbedding, embedding);
        }
        return scores;
      }
      /**
       * Compute cosine similarity between two vectors
       */
      cosineSimilarity(a, b) {
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
    };
  }
});

// ../../assistants/server/src/engine/conversation-memory.ts
function recall(conversationId) {
  return conversationId ? memory.get(conversationId) : void 0;
}
function resolveReferences(conversationId, text2) {
  const raw = String(text2 ?? "");
  const previous = recall(conversationId);
  if (REPEAT.test(raw)) {
    if (!previous?.expression) {
      return {
        text: raw,
        resolved: false,
        substitutions: [],
        reason: "asked to repeat, but nothing in this conversation produced an expression to repeat"
      };
    }
    return {
      text: previous.expression,
      resolved: true,
      substitutions: [{ phrase: raw.trim(), value: previous.expression }],
      fromMessageId: previous.messageId
    };
  }
  const isCorrection = CORRECTIONS.some((r) => r.test(raw));
  if (isCorrection) {
    if (!previous?.expression) {
      return {
        text: raw,
        resolved: false,
        kind: "correction",
        substitutions: [],
        reason: "this revises a previous calculation, and nothing in this conversation produced one to revise"
      };
    }
    const text3 = `Revise this calculation: \`${previous.expression}\` \u2014 ${raw.trim()}`;
    return {
      text: text3,
      resolved: true,
      kind: "correction",
      revises: previous.expression,
      substitutions: [{ phrase: raw.trim(), value: text3 }],
      fromMessageId: previous.messageId,
      reason: `revises the previous calculation \`${previous.expression}\` rather than operating on its result`
    };
  }
  const mentionsReference = BACK_REFERENCES.some((r) => {
    r.lastIndex = 0;
    return r.test(raw);
  });
  if (!mentionsReference) {
    return { text: raw, resolved: false, substitutions: [], reason: "no back-reference" };
  }
  if (!previous || previous.result === void 0) {
    return {
      text: raw,
      resolved: false,
      substitutions: [],
      reason: "a back-reference was used and there is no prior result in this conversation"
    };
  }
  const value = String(previous.result);
  const substitutions = [];
  let out = raw;
  for (const pattern of BACK_REFERENCES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, (match) => {
      substitutions.push({ phrase: match, value });
      return value;
    });
  }
  return {
    text: out,
    resolved: substitutions.length > 0,
    substitutions,
    fromMessageId: previous.messageId
  };
}
function countTurn(conversationId, kind) {
  if (!conversationId) return 0;
  let counts = turnCounts.get(conversationId);
  if (!counts) {
    counts = /* @__PURE__ */ new Map();
    turnCounts.set(conversationId, counts);
  }
  const seen = counts.get(kind) ?? 0;
  counts.set(kind, seen + 1);
  return seen;
}
var memory, BACK_REFERENCES, REPEAT, CORRECTIONS, turnCounts;
var init_conversation_memory = __esm({
  "../../assistants/server/src/engine/conversation-memory.ts"() {
    "use strict";
    memory = /* @__PURE__ */ new Map();
    BACK_REFERENCES = [
      /\bthe (?:result|answer|total)\b/gi,
      /\bthat number\b/gi,
      /\bprevious (?:result|answer)\b/gi,
      /\bthat\b/gi,
      /\bit\b/gi
    ];
    REPEAT = /^\s*(?:(?:do|run|try|say|calculate|compute)\s+(?:that|it|this)\s+)?again\b[\s!.?]*$|^\s*(?:same again|one more time|repeat that|do it again)\b[\s!.?]*$/i;
    CORRECTIONS = [
      /\bactually\b/i,
      /\binstead\b/i,
      /^\s*no[,\s]+(?:make|do|use|try)\b/i,
      /\b(?:make|change|set) (?:it|that|the \w+) (?:to|into)\b/i,
      /\bmake it\b/i,
      /\b(?:first|before that)\b[\s!.?]*$/i,
      /\bi meant\b/i,
      /\bshould (?:have )?be\b/i
    ];
    turnCounts = /* @__PURE__ */ new Map();
  }
});

// ../../assistants/server/src/engine/conversational-turns.ts
function classifyTurn(text2) {
  const t = String(text2 ?? "");
  for (const [kind, re] of PATTERNS) {
    const m = t.match(re);
    if (m) return { kind, matched: m[0].trim() };
  }
  return { kind: "work", matched: "" };
}
function replyFor(kind, seen) {
  if (kind === "work" || kind === "correction") return void 0;
  const options = REPLIES[kind];
  return options[Math.min(seen, options.length - 1)];
}
function declineFor(seen, roster) {
  if (seen === 0) {
    return `${DECLINED}That is not something any of my specialists declares, so I am not going to guess at it.

I can route to:
${roster}`;
  }
  if (seen === 1) return `${DECLINED}Still outside what my team covers, I am afraid.`;
  return `${DECLINED}Also no \u2014 arithmetic is genuinely all I have people for.`;
}
var PATTERNS, CONVERSATIONAL_TURN_PATTERNS, REPLIES, DECLINED;
var init_conversational_turns = __esm({
  "../../assistants/server/src/engine/conversational-turns.ts"() {
    "use strict";
    PATTERNS = [
      // A correction is checked FIRST. "actually make it 20%" contains no
      // greeting and no thanks, but it does contain arithmetic, so anything that
      // looked for work first would route it and answer the wrong question — which
      // is exactly what happened to "add 15% tip first" on 11 Aug.
      ["correction", /^\s*(?:no,?\s|actually\b|wait\b|sorry,?\s|i meant\b|make (?:it|that)\b|change (?:it|that)\b|scratch that\b|instead\b)/i],
      ["correction", /\b(?:first|before that|not that)\s*$/i],
      ["greeting", /^\s*(?:hey|hi|hello|yo|hiya|howdy|morning|good morning|good afternoon|good evening|hey there|hi there|greetings)\b[\s!.,?]*$/i],
      ["greeting", /^\s*(?:hey|hi|hello)\b.{0,20}\b(?:how are you|whats up|what's up|hows it going)\b/i],
      ["closing", /^\s*(?:bye|goodbye|see ya|see you|later|good ?night|that'?s all|that will be all|we'?re done|im done|i'?m done)\b[\s!.,?]*$/i],
      ["acknowledgement", /^\s*(?:thanks|thank you|ta|cheers|nice|great|perfect|lovely|cool|ok|okay|got it|understood|makes sense|brilliant|excellent|awesome|sweet|👍)\b[\s!.,?]*$/i],
      // REACTIONS, which are acknowledgements that do not begin with a thank-you.
      //
      // "that was fast1" begins with `that`, so every anchored acknowledgement
      // missed it and the router had to guess. Bounded to a short tail so it
      // cannot swallow a real request that happens to start "that is…".
      ["acknowledgement", /^\s*(?:that (?:was|is)|wow|damn|impressive|amazing|neat|nice one|well done|good job|you'?re (?:quick|fast))\b[^.?!]{0,24}[\s!.,?]*$/i],
      // `what else can you do?` was refused because the pattern demanded
      // `what can you do` with nothing between. One word in the middle and the
      // system declined a question `help` answers two turns later — which reads as
      // arbitrary rather than principled.
      ["capability", /\b(?:what (?:else )?can you do|what (?:else )?do you do|what are you (?:for|able to do)|how (?:else )?can you help|what (?:else )?can i ask|anything else|what more can you|what are your (?:capabilities|skills)|who are you|what are you)\b/i]
    ];
    CONVERSATIONAL_TURN_PATTERNS = PATTERNS.filter(
      ([kind]) => kind !== "correction"
    ).map(([, re]) => re.source);
    REPLIES = {
      greeting: [
        "Hello. I'm Symbia \u2014 I coordinate a small team and hand your question to whoever fits. What do you need?",
        "Hi. Ask me something and I'll route it to the right specialist. Say `help` if you want the roster.",
        "Hey. What are we working on?"
      ],
      closing: [
        "Any time.",
        "Cheers \u2014 I'll be here.",
        "Good luck with it."
      ],
      acknowledgement: [
        "Glad it helped.",
        "Any time.",
        "No problem."
      ],
      capability: [
        // Answered rather than deflected. `help` renders the live roster and this
        // must not become a fifth copy of it, so it says what it IS and points at
        // the rule that reads the registry.
        "I coordinate a team of specialists and hand each question to whichever one declares it. Every answer comes back with a receipt saying how it was arrived at \u2014 computed, composed, retrieved, or refused \u2014 and you can ask me `how do you know that?` about any of them. Say `help` for the current roster."
      ]
    };
    DECLINED = "DECLINED::";
  }
});

// ../../assistants/server/src/engine/explain-provenance.ts
function aspectOf(question) {
  for (const [re, aspect] of ASPECT_PATTERNS) if (re.test(question)) return aspect;
  return "full";
}
function describeArena(env) {
  switch (env.arena) {
    case "COMPUTED":
      return "It was **computed**. A deterministic tool produced the value and no model touched it.";
    case "RETRIEVED":
      return "It was **retrieved** \u2014 returned as-is from a named source.";
    case "COMPOSED":
      return "It was **composed**. A model wrote over material it was given. The material is recorded; whether the model represented it faithfully is **not** checked.";
    case "GENERATED":
      return "It was **generated** \u2014 a model answered from its own weights, with nothing supplied and nothing verified. It stands on no source.";
    case "REFUSED":
      return "It was a **refusal**. Nothing was produced, and the reason is recorded.";
    default:
      return "That reply carries no arena, which is itself a defect \u2014 every reply should say how it was arrived at.";
  }
}
function describeSteps(env) {
  const steps = env.steps ?? [];
  if (steps.length === 0) return ["No steps were recorded for it."];
  return steps.map((s) => {
    const who = s.by ? ` *(${s.by})*` : "";
    return `- \`${s.action}\` via **${s.source}** \u2014 ${s.ok ? "ok" : "failed"}${who}`;
  });
}
function describeDelegation(env) {
  const d = env.delegation;
  if (!d) return ["Nothing routed it \u2014 that assistant was addressed directly."];
  const reproducible = d.method === "declaration" ? "That choice is reproducible from your message and the registry." : d.method === "classifier" ? "That choice is reproducible from your message and the classifier's training digest." : "That choice came from a generative model and is **not** reproducible.";
  const lines = [
    `**${d.from}** chose **${d.to}** (${d.method ?? "method not recorded"}).`,
    d.decidedBy ? `Decided by: \`${d.decidedBy}\`` : "",
    reproducible
  ].filter(Boolean);
  if (d.event?.checksum) {
    lines.push(
      `The decision is its own sealed record: \`${d.event.checksum.slice(0, 24)}\u2026\`` + (d.event.signature ? `, signed by ${d.event.actor_identity ?? "the service"} \u2014 checkable with a public key, not a shared secret.` : ", unsigned.")
    );
  }
  return lines;
}
function describeSeal(env) {
  if (!env.hash) {
    return [
      "That reply is **unsealed** \u2014 there is no hash on it. It happens on the failure path, where no `message.send` ran to seal anything."
    ];
  }
  const over = env.sealedOver === "fields" ? "The seal covers the **typed fields**, not the wording \u2014 so rephrasing the sentence does not change the hash, and the value can be checked apart from the prose." : "The seal covers the **reply text**.";
  const lines = [`Sealed: \`${String(env.hash).slice(0, 24)}\u2026\``, over];
  if (env.signature) {
    lines.push(
      `Signed by \`${env.signedBy ?? "this service"}\` (ed25519 over RFC 8785 canonical JSON).`,
      "You can check it yourself: the digest needs **no secret at all**, and the signature needs only the public key from `GET /api/provenance/key` \u2014 which lets you verify and **not** forge."
    );
  } else {
    lines.push(
      "Honest limit: this envelope is **unsigned** \u2014 the service had no identity available when it was sealed. The digest still proves the contents have not changed, but nothing proves who produced them."
    );
  }
  return lines;
}
function explain(envelope, content, question) {
  if (!envelope) return void 0;
  const aspect = aspectOf(question);
  const quoted = content ? `> ${String(content).split("\n")[0].slice(0, 80)}` : "";
  const head = quoted ? `About my last answer:
${quoted}
` : "";
  switch (aspect) {
    case "model": {
      const modelSteps = (envelope.steps ?? []).filter((s) => s.action === "llm.invoke");
      const body = envelope.arena === "COMPUTED" ? "No. No model was involved in producing that value \u2014 it came from a deterministic tool." : modelSteps.length > 0 ? `Yes, in part. A model ran: ${modelSteps.map((s) => `\`${s.source}\``).join(", ")}. ${describeArena(envelope)}` : describeArena(envelope);
      return `${head}
${body}`;
    }
    case "router":
      return `${head}
${describeDelegation(envelope).join("\n")}`;
    case "verify":
      return `${head}
${describeSeal(envelope).join("\n")}`;
    case "reproducible": {
      const d = envelope.delegation;
      const routing = !d || d.method === "declaration" || d.method === "classifier" ? "the routing is reproducible" : "**the routing is not reproducible** \u2014 a generative model chose the responder";
      const answer = envelope.arena === "COMPUTED" ? "the answer is recomputable from the expression" : envelope.arena === "COMPOSED" ? "the answer involved a model, so it is not guaranteed to come out the same way twice" : "there is no computed value to reproduce";
      return `${head}
For that reply, ${routing}, and ${answer}.`;
    }
    case "source":
      return `${head}
${describeArena(envelope)}

What it consulted:
${describeSteps(envelope).join("\n")}`;
    case "full":
    default:
      return [
        head,
        describeArena(envelope),
        "",
        "**Steps**",
        ...describeSteps(envelope),
        "",
        "**How it reached me**",
        ...describeDelegation(envelope),
        "",
        "**Seal**",
        ...describeSeal(envelope),
        envelope.basis ? `
*Basis recorded at the time:* ${envelope.basis}` : ""
      ].filter((l) => l !== void 0).join("\n");
  }
}
var ASPECT_PATTERNS, PROVENANCE_QUESTION_PATTERNS;
var init_explain_provenance = __esm({
  "../../assistants/server/src/engine/explain-provenance.ts"() {
    "use strict";
    ASPECT_PATTERNS = [
      [/\b(?:who|what) (?:decided|chose|picked|routed|sent)\b|\bwhy (?:you|did you) answer\b|\bwhy did (?:calc|calculator|smart|symbia)\b/i, "router"],
      // "did you use a calculator or just know it" — the phrasing that motivated
      // widening this. `calculator` and `work (it|that) out` were both missing.
      [/\b(?:model|ai|llm|guess(?:ed)?|made (?:it|that) up|hallucinat|calculator|work(?:ed)? (?:it|that) out|just know)\b/i, "model"],
      // `sure`, `certain`, `right`, `correct` and `trust you` were all missing, so
      // "are you sure?" and "what if I do not trust you" fell through to the router
      // and were answered by a specialist that could make nothing of them.
      [/\b(?:verify|check|prove|proof|trust|tamper|signature|signed|seal|are you sure|you sure|certain|is that (?:right|correct)|double ?check)\b/i, "verify"],
      // `again` REMOVED, and this is the most dangerous defect the browser test
      // found. "do that again!" was read as "is that reproducible?" and answered
      // with a receipt — no error, a plausible reply, and completely the wrong
      // question. Silently answering something else is worse than refusing, and it
      // is the same failure as `add 15% tip first` being ignored.
      //
      // "again" in a conversation means DO IT AGAIN. It is a re-run, handled in
      // conversation-memory, not a question about determinism.
      [/\b(?:reproducib|deterministic|same answer|repeatable|every time|get the same)\b/i, "reproducible"],
      [/\b(?:source|where.*(?:from|come)|what.*(?:used|consulted)|cite|citation)\b/i, "source"],
      [/\bhow do you know|how did you (?:know|get|work)|show.*(?:receipt|provenance)|what arena|why did you (?:refuse|decline)|explain\b/i, "full"]
    ];
    PROVENANCE_QUESTION_PATTERNS = ASPECT_PATTERNS.map(
      ([re]) => re.source
    );
  }
});

// ../../assistants/server/src/engine/intent-classifier.ts
import { createHash as createHash2 } from "node:crypto";
function features(text2) {
  const norm = String(text2 ?? "").toLowerCase().replace(/\d+(?:\.\d+)?/g, "0").replace(/\s+/g, " ").trim();
  const out = [];
  for (const w of norm.split(/[^a-z0-9%$£€]+/).filter(Boolean)) out.push(`w:${w}`);
  const padded = ` ${norm} `;
  for (let i = 0; i + 3 <= padded.length; i++) out.push(`c:${padded.slice(i, i + 3)}`);
  return out;
}
var NONE_CLASS, DEFAULT_NEGATIVES, IntentClassifier, intentClassifier;
var init_intent_classifier = __esm({
  "../../assistants/server/src/engine/intent-classifier.ts"() {
    "use strict";
    NONE_CLASS = "__none__";
    DEFAULT_NEGATIVES = [
      "tell me a joke",
      "tell me a joke about snails",
      "write me a poem",
      "what is the weather",
      "who won the world cup",
      "hello",
      "hi how are you",
      "thanks",
      "what do you think about politics",
      "summarise this article",
      "send an email to my team",
      "what time is it",
      "translate this into french",
      "recommend a restaurant",
      "tell me a story",
      "what is the capital of france",
      // REACTIONS. Praise is a turn type, and it was missing.
      //
      // Found in the browser, 11 Aug: "that was fast1" — an acknowledgement with a
      // typo'd digit — matched no pattern, fell to the classifier, and with only
      // calculator and smart-calc to choose from the stray `1` made it look like
      // arithmetic. Calculator then choked on `wasfast1`.
      //
      // The classifier was not wrong so much as cornered: a conversational turn
      // with no conversational class to put it in. Same lesson as `tell me a joke`
      // going to Calculator, one category further out.
      "that was fast",
      "that was quick",
      "that was easy",
      "wow that was fast",
      "impressive",
      "nice one",
      "well done",
      "good job",
      "you are quick",
      "that worked"
    ];
    IntentClassifier = class {
      classes = [];
      vocabulary = /* @__PURE__ */ new Set();
      totalDocs = 0;
      trainingDigest = "";
      /**
       * Train from declarations. Deterministic: same examples in, same weights out,
       * regardless of insertion order — the digest sorts before hashing so a
       * registry that loads assistants in a different order does not produce a
       * different classifier.
       */
      train(declarations, extraNegatives = []) {
        const withNone = [
          ...declarations.filter((d) => d.examples?.length),
          { key: NONE_CLASS, examples: [...DEFAULT_NEGATIVES, ...extraNegatives] }
        ];
        const sorted = withNone.map((d) => ({ key: d.key, examples: [...d.examples].sort() })).sort((a, b) => a.key.localeCompare(b.key));
        this.trainingDigest = createHash2("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 16);
        this.classes = [];
        this.vocabulary = /* @__PURE__ */ new Set();
        this.totalDocs = 0;
        for (const d of sorted) {
          const counts = /* @__PURE__ */ new Map();
          let total = 0;
          for (const example of d.examples) {
            for (const f of features(example)) {
              counts.set(f, (counts.get(f) ?? 0) + 1);
              this.vocabulary.add(f);
              total++;
            }
          }
          this.classes.push({ key: d.key, counts, total, docs: d.examples.length });
          this.totalDocs += d.examples.length;
        }
      }
      get ready() {
        return this.classes.length >= 2;
      }
      /**
       * Argmax over log-probabilities, with add-one smoothing.
       *
       * Returns `undefined` rather than a low-confidence guess. A classifier that
       * always answers is a classifier that has stopped being evidence — the point
       * of the tier is to cover paraphrase, not to cover everything, and the
       * declination below it is a legitimate outcome.
       */
      classify(text2, minConfidence = 0.75, minMargin = 0.3) {
        if (!this.ready) return void 0;
        const feats = features(text2);
        if (feats.length === 0) return void 0;
        const V = this.vocabulary.size || 1;
        const scored = this.classes.map((c) => {
          let logp = Math.log(c.docs / this.totalDocs);
          for (const f of feats) {
            logp += Math.log(((c.counts.get(f) ?? 0) + 1) / (c.total + V));
          }
          return { key: c.key, logp };
        });
        scored.sort((a, b) => b.logp - a.logp);
        const max = scored[0].logp;
        const exps = scored.map((s) => Math.exp(s.logp - max));
        const sum = exps.reduce((a, b) => a + b, 0);
        const confidence = exps[0] / sum;
        const margin = confidence - (exps[1] ?? 0) / sum;
        if (confidence < minConfidence || margin < minMargin) return void 0;
        if (scored[0].key === NONE_CLASS) return void 0;
        return {
          assistant: scored[0].key,
          confidence: Math.round(confidence * 1e3) / 1e3,
          margin: Math.round(margin * 1e3) / 1e3,
          runnerUp: scored[1]?.key,
          trainingDigest: this.trainingDigest,
          method: "classifier"
        };
      }
    };
    intentClassifier = new IntentClassifier();
  }
});

// ../../assistants/server/src/engine/actions/tool-invoke.ts
import { createHash as createHash3 } from "node:crypto";
function stripFiller(raw) {
  const out = String(raw ?? "").replace(CONVERSATIONAL_FILLER, "");
  return out.trim() === "" ? String(raw ?? "") : out;
}
function normalizeMathInput(raw) {
  let s = stripFiller(raw).trim();
  s = s.replace(MATH_LEAD_IN, "");
  s = s.replace(/[\s?!.=]+$/, "");
  s = s.replace(/^=\s*/, "");
  const stripped = s.trim();
  return stripped === "" ? raw.trim() : stripped;
}
var MATH_LEAD_IN, CONVERSATIONAL_FILLER, MathEvaluator, UnitConverter, StatsAnalyzer, CodeExecutor, ToolInvokeHandler;
var init_tool_invoke = __esm({
  "../../assistants/server/src/engine/actions/tool-invoke.ts"() {
    "use strict";
    init_base();
    init_template();
    init_assistant_loader();
    init_conversation_memory();
    init_conversational_turns();
    init_explain_provenance();
    init_intent_classifier();
    MATH_LEAD_IN = /^\s*(?:please\s+)?(?:what(?:'s|s| is| does)|how much(?: is)?|calculate|compute|evaluate|solve|work out)\s+/i;
    CONVERSATIONAL_FILLER = /^\s*(?:ok(?:ay)?|fine|so|right|alright|well|and|then|now|hmm+|umm+|yeah|yep|cool|great)\b[\s,:;–—-]*/i;
    MathEvaluator = class _MathEvaluator {
      static CONSTANTS = {
        pi: Math.PI,
        PI: Math.PI,
        e: Math.E,
        E: Math.E
      };
      static FUNCTIONS = {
        sqrt: Math.sqrt,
        abs: Math.abs,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        log: Math.log,
        log10: Math.log10,
        log2: Math.log2,
        exp: Math.exp,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round
      };
      evaluate(expression) {
        let expr = expression.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^").replace(/[xX](?=\d|[-(])/g, "*");
        for (const [name, value] of Object.entries(_MathEvaluator.CONSTANTS)) {
          expr = expr.replace(new RegExp(`\\b${name}\\b`, "g"), value.toString());
        }
        return this.parseExpression(expr);
      }
      parseExpression(expr) {
        const tokens = this.tokenize(expr);
        const result = this.parseAddSub(tokens);
        if (tokens.length > 0) {
          throw new Error(`Unexpected token: ${tokens[0]}`);
        }
        return result;
      }
      tokenize(expr) {
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
          const char = expr[i];
          if (/[0-9.]/.test(char)) {
            let num = "";
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
              num += expr[i++];
            }
            tokens.push(num);
            continue;
          }
          if (/[a-zA-Z]/.test(char)) {
            let name = "";
            while (i < expr.length && /[a-zA-Z0-9]/.test(expr[i])) {
              name += expr[i++];
            }
            tokens.push(name);
            continue;
          }
          if ("+-*/^()%".includes(char)) {
            tokens.push(char);
            i++;
            continue;
          }
          throw new Error(`Invalid character: ${char}`);
        }
        return tokens;
      }
      parseAddSub(tokens) {
        let left = this.parseMulDiv(tokens);
        while (tokens.length > 0 && (tokens[0] === "+" || tokens[0] === "-")) {
          const op = tokens.shift();
          const right = this.parseMulDiv(tokens);
          left = op === "+" ? left + right : left - right;
        }
        return left;
      }
      parseMulDiv(tokens) {
        let left = this.parsePower(tokens);
        while (tokens.length > 0 && "*/%".includes(tokens[0])) {
          const op = tokens.shift();
          const right = this.parsePower(tokens);
          if (op === "*") left = left * right;
          else if (op === "/") left = left / right;
          else if (op === "%") left = left % right;
        }
        return left;
      }
      parsePower(tokens) {
        let base = this.parseUnary(tokens);
        while (tokens.length > 0 && tokens[0] === "^") {
          tokens.shift();
          const exp = this.parseUnary(tokens);
          base = Math.pow(base, exp);
        }
        return base;
      }
      parseUnary(tokens) {
        if (tokens[0] === "-") {
          tokens.shift();
          return -this.parseUnary(tokens);
        }
        if (tokens[0] === "+") {
          tokens.shift();
          return this.parseUnary(tokens);
        }
        return this.parsePrimary(tokens);
      }
      parsePrimary(tokens) {
        if (tokens.length === 0) {
          throw new Error("Unexpected end of expression");
        }
        const token = tokens[0];
        if (token === "(") {
          tokens.shift();
          const result = this.parseAddSub(tokens);
          if (tokens[0] !== ")") {
            throw new Error("Missing closing parenthesis");
          }
          tokens.shift();
          return result;
        }
        if (/^[a-zA-Z]/.test(token) && tokens[1] === "(") {
          const funcName = tokens.shift().toLowerCase();
          const func = _MathEvaluator.FUNCTIONS[funcName];
          if (!func) {
            throw new Error(`Unknown function: ${funcName}`);
          }
          tokens.shift();
          const arg = this.parseAddSub(tokens);
          if (tokens[0] !== ")") {
            throw new Error("Missing closing parenthesis for function");
          }
          tokens.shift();
          return func(arg);
        }
        if (/^[0-9.]/.test(token)) {
          tokens.shift();
          const num = parseFloat(token);
          if (isNaN(num)) {
            throw new Error(`Invalid number: ${token}`);
          }
          return num;
        }
        throw new Error(`Unexpected token: ${token}`);
      }
    };
    UnitConverter = class _UnitConverter {
      static CONVERSIONS = {
        length: {
          m: 1,
          meter: 1,
          meters: 1,
          km: 1e3,
          kilometer: 1e3,
          kilometers: 1e3,
          cm: 0.01,
          centimeter: 0.01,
          centimeters: 0.01,
          mm: 1e-3,
          millimeter: 1e-3,
          millimeters: 1e-3,
          mi: 1609.344,
          mile: 1609.344,
          miles: 1609.344,
          ft: 0.3048,
          foot: 0.3048,
          feet: 0.3048,
          in: 0.0254,
          inch: 0.0254,
          inches: 0.0254,
          yd: 0.9144,
          yard: 0.9144,
          yards: 0.9144
        },
        weight: {
          kg: 1,
          kilogram: 1,
          kilograms: 1,
          g: 1e-3,
          gram: 1e-3,
          grams: 1e-3,
          mg: 1e-6,
          milligram: 1e-6,
          milligrams: 1e-6,
          lb: 0.453592,
          pound: 0.453592,
          pounds: 0.453592,
          lbs: 0.453592,
          oz: 0.0283495,
          ounce: 0.0283495,
          ounces: 0.0283495
        },
        volume: {
          l: 1,
          liter: 1,
          liters: 1,
          ml: 1e-3,
          milliliter: 1e-3,
          milliliters: 1e-3,
          gal: 3.78541,
          gallon: 3.78541,
          gallons: 3.78541,
          cup: 0.236588,
          cups: 0.236588
        },
        temperature: {
          c: "celsius",
          celsius: "celsius",
          f: "fahrenheit",
          fahrenheit: "fahrenheit",
          k: "kelvin",
          kelvin: "kelvin"
        }
      };
      convert(input) {
        const match = input.match(/^([\d.]+)\s*(\w+)\s*(?:to|in|as)\s*(\w+)$/i);
        if (!match) {
          throw new Error('Invalid format. Use "10 km to miles"');
        }
        const [, valueStr, fromUnit, toUnit] = match;
        const value = parseFloat(valueStr);
        const from = fromUnit.toLowerCase();
        const to = toUnit.toLowerCase();
        for (const [category, units] of Object.entries(_UnitConverter.CONVERSIONS)) {
          if (from in units && to in units) {
            let result;
            if (category === "temperature") {
              result = this.convertTemperature(value, from, to);
            } else {
              const fromBase = units[from];
              const toBase = units[to];
              result = value * fromBase / toBase;
            }
            return {
              fromValue: value,
              fromUnit: this.normalizeUnit(from),
              toValue: Math.round(result * 1e3) / 1e3,
              toUnit: this.normalizeUnit(to)
            };
          }
        }
        throw new Error(`Cannot convert from ${from} to ${to}`);
      }
      normalizeUnit(unit) {
        const map = {
          m: "m",
          km: "km",
          mi: "mi",
          mile: "mi",
          miles: "mi",
          ft: "ft",
          foot: "ft",
          feet: "ft",
          kg: "kg",
          lb: "lb",
          lbs: "lb",
          pound: "lb",
          pounds: "lb",
          c: "\xB0C",
          celsius: "\xB0C",
          f: "\xB0F",
          fahrenheit: "\xB0F",
          k: "K",
          kelvin: "K"
        };
        return map[unit] || unit;
      }
      convertTemperature(value, from, to) {
        let celsius = from === "c" || from === "celsius" ? value : from === "f" || from === "fahrenheit" ? (value - 32) * 5 / 9 : value - 273.15;
        return to === "c" || to === "celsius" ? celsius : to === "f" || to === "fahrenheit" ? celsius * 9 / 5 + 32 : celsius + 273.15;
      }
    };
    StatsAnalyzer = class {
      analyze(input) {
        const numbers = input.split(/[,\s\n]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
        if (numbers.length === 0) throw new Error("No valid numbers found");
        const count = numbers.length;
        const sum = numbers.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        const sorted = [...numbers].sort((a, b) => a - b);
        const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];
        const min = sorted[0];
        const max = sorted[count - 1];
        const variance = numbers.reduce((a, n) => a + Math.pow(n - mean, 2), 0) / count;
        const round = (n) => Math.round(n * 1e4) / 1e4;
        return {
          count,
          sum: round(sum),
          mean: round(mean),
          median: round(median),
          min: round(min),
          max: round(max),
          range: round(max - min),
          stdDev: round(Math.sqrt(variance))
        };
      }
    };
    CodeExecutor = class {
      execute(code, config) {
        try {
          const outputs = [];
          const safeConsole = {
            log: (...args) => outputs.push(args.map(String).join(" ")),
            error: (...args) => outputs.push("[ERROR] " + args.map(String).join(" "))
          };
          const fn = new Function(
            "console",
            "Math",
            "JSON",
            "Date",
            "Array",
            "Object",
            "String",
            "Number",
            '"use strict";\n' + code
          );
          const result = fn(safeConsole, Math, JSON, Date, Array, Object, String, Number);
          if (result !== void 0) outputs.push(String(result));
          return { output: outputs.join("\n") || "(no output)" };
        } catch (error) {
          return { output: "", error: error instanceof Error ? error.message : "Execution failed" };
        }
      }
    };
    ToolInvokeHandler = class extends BaseActionHandler {
      type = "tool.invoke";
      mathEvaluator = new MathEvaluator();
      unitConverter = new UnitConverter();
      statsAnalyzer = new StatsAnalyzer();
      codeExecutor = new CodeExecutor();
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          if (!params.tool) {
            return this.failure("No tool specified", Date.now() - start2);
          }
          if (params.input !== void 0 && typeof params.input !== "string") {
            return this.failure(
              `Tool '${params.tool}' was given a ${Array.isArray(params.input) ? "array" : typeof params.input} for 'input'; it must be a string. Got ${JSON.stringify(params.input).slice(0, 120)}. Tools that take no input should omit the field.`,
              Date.now() - start2
            );
          }
          const input = interpolate(params.input || "", context);
          let result;
          switch (params.tool) {
            case "math.evaluate":
              result = this.executeMathEvaluate(
                input,
                context.event?.data?.assistantKey
              );
              break;
            case "convert.units":
              result = this.unitConverter.convert(input);
              break;
            case "stats.analyze":
              result = this.statsAnalyzer.analyze(input);
              break;
            case "code.execute":
              result = this.codeExecutor.execute(input, params.options);
              break;
            case "assistants.list":
              result = this.getBootstrapAssistants();
              break;
            case "assistants.route":
              result = this.routeDeterministically(input, context.conversationId);
              break;
            case "conversation.turn": {
              const turn = classifyTurn(input);
              if (turn.kind === "work" || turn.kind === "correction") {
                throw new Error(
                  `Not a conversational turn (${turn.kind}) \u2014 this rule should not have matched.`
                );
              }
              const seen = countTurn(context.conversationId, turn.kind);
              result = {
                kind: turn.kind,
                matched: turn.matched,
                seen,
                reply: replyFor(turn.kind, seen)
              };
              break;
            }
            case "provenance.explain": {
              const last = recall(context.conversationId);
              const text2 = explain(
                last?.envelope,
                last?.content,
                input
              );
              if (!text2) {
                throw new Error(
                  "I have not answered anything in this conversation yet, so there is no receipt to explain."
                );
              }
              result = { explanation: text2, aspect: aspectOf(input) };
              break;
            }
            case "context.resolve":
              result = resolveReferences(context.conversationId, input);
              break;
            default:
              return this.failure(`Unknown tool: ${params.tool}`, Date.now() - start2);
          }
          if (params.resultKey) {
            context.context[params.resultKey] = result;
          }
          const actionId = config.id;
          if (actionId) {
            if (!context.context.steps) {
              context.context.steps = {};
            }
            context.context.steps[actionId] = { result };
          }
          return this.success({ result }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool invocation failed";
          return this.failure(message, Date.now() - start2);
        }
      }
      /**
       * A PARSE FAILURE IS A DECLINATION, NOT A MALFUNCTION.
       *
       * Three warning triangles in one browser session, all the same shape:
       *
       *     ok what is 14 squared.  -> Unexpected token: squared
       *     \(e^{i\pi} + 1 = 0\),   -> Invalid character: \
       *     ask @smartcalc to …     -> Invalid character: @
       *
       * Every one was a ROUTING error surfacing as a parser crash. The router sent
       * work to a specialist that could not take it, and the specialist had no way
       * to say "not mine" — it could only fail at the person, who then sees a
       * malfunction for a fault that happened upstream.
       *
       * A real hand-back to the router is the right fix and is not built. This is
       * the honest interim: say plainly that this is not something this specialist
       * reads, and name the one that might. It removes the triangle, gives the
       * person a next move, and does not pretend the routing was correct.
       */
      executeMathEvaluate(input, runningAs) {
        if (!input || input.trim() === "") {
          throw new Error(`${DECLINED}I need an expression to evaluate \u2014 try \`2 + 2\`.`);
        }
        let result;
        try {
          result = this.mathEvaluator.evaluate(normalizeMathInput(input));
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          const suggestion = runningAs === "smart-calc" ? `I understood the request but could not turn it into arithmetic I can evaluate. Try rephrasing it with the numbers in it.` : `I handle things like \`2+2\`, \`sqrt(16)\`, \`(10+5)*2\`. For arithmetic described in words \u2014 "15% tip on $47.50", "14 squared" \u2014 ask **@smartcalc**.`;
          throw new Error(
            `${DECLINED}I read expressions literally, and I cannot read that one (${detail}).

${suggestion}`
          );
        }
        if (!isFinite(result)) {
          throw new Error("Result is not a finite number");
        }
        return Math.round(result * 1e10) / 1e10;
      }
      /**
       * The roster, from the registry.
       *
       * THIS USED TO BE A LITERAL ARRAY IN THIS FILE.
       *
       * A tool called `assistants.list` that returns eight hardcoded names is not a
       * list of assistants; it is a fifth copy of a roster that also lived in the
       * coordinator's help text, its orchestrate prompt, and two alias tables. It
       * was wrong in both directions at once — it named `coordinator` as something
       * to delegate to, which is a loop, and it omitted `analyst` and `builder`,
       * which are registered and published. An assistant registered through the
       * catalog could never appear here, which defeats the point of registering it.
       *
       * The registry is `assistant-loader`. Reading it means a newly registered
       * assistant is routable the moment it loads, with nothing to update here.
       */
      /**
       * Decide which assistant handles a message, from declarations alone.
       *
       * ROUTING IS A TOOL, NOT A PROMPT, AND THAT IS THE POINT.
       *
       * The classifier this replaces was an `llm.invoke`. GKS puts classification
       * in the Interpreter role, which is required to be non-generative, free of
       * inference, and explicitly REPRODUCIBLE
       * (`genesis-key-spec/spec/pipeline/interpreter.md` §2.1–2.3). A generative
       * model in that slot violates all three by construction, and the violation
       * was measured rather than argued: four passes of the same eight prompts
       * disagreed with each other, and `2+2` — three characters — came back as an
       * empty completion.
       *
       * Being a `tool.invoke` is not cosmetic. `classify()` already treats tool
       * output as deterministic, so a routed reply lands in the canonical lane
       * because it IS recomputable: the decision is a function of the message and
       * the registry, with no model, no network, and no hidden state. Run it again
       * on the same two inputs and it cannot answer differently.
       *
       * Assistants declare their own routing surface in their catalog manifest.
       * That keeps the coordinator ignorant of the roster — the fifth copy of a
       * team list this codebase has had to kill — and makes a newly registered
       * assistant routable the moment it loads, with nothing to update here.
       */
      /**
       * Retrain when the registry has changed.
       *
       * Keyed on the declarations themselves rather than on a load event, so an
       * assistant published or unpublished mid-run produces a new classifier —
       * and a new `trainingDigest`, which makes the change visible in every
       * receipt rather than silent.
       */
      ensureClassifierTrained() {
        const declarations = getAllLoadedAssistants().map((l) => {
          const key = loadedAssistantKey(l);
          const routing = l.resource?.metadata?.routing;
          if (!key || !routing?.examples?.length) return void 0;
          return { key, examples: routing.examples };
        }).filter((d) => Boolean(d));
        const digest2 = createHash3("sha256").update(JSON.stringify([...declarations].sort((a, b) => a.key.localeCompare(b.key)))).digest("hex").slice(0, 16);
        const negatives = getAllLoadedAssistants().flatMap((l) => {
          const routing = l.resource?.metadata?.routing;
          return routing?.negativeExamples ?? [];
        });
        if (digest2 !== intentClassifier.trainingDigest) {
          intentClassifier.train(declarations, negatives);
          console.log(
            `[assistants.route] classifier trained on ${declarations.length} assistant(s), digest=${intentClassifier.trainingDigest}`
          );
        }
      }
      routeDeterministically(message, conversationId = "") {
        const text2 = stripFiller(message || "").trim();
        if (!text2) throw new Error("No message to route");
        for (const loaded of getAllLoadedAssistants()) {
          const key = loadedAssistantKey(loaded);
          if (!key) continue;
          const names = [key, loaded.alias].filter(Boolean);
          for (const name of names) {
            const mention = new RegExp(`(?:^|\\s)@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            if (mention.test(text2)) {
              return {
                assistant: key,
                alias: loaded.alias || key,
                matchedPattern: `addressed as @${name}`,
                precedence: Number.MAX_SAFE_INTEGER,
                tieBroken: false,
                method: "addressed"
              };
            }
          }
        }
        const candidates = [];
        for (const loaded of getAllLoadedAssistants()) {
          const key = loadedAssistantKey(loaded);
          if (!key) continue;
          const routing = loaded.resource?.metadata?.routing;
          if (!routing || !Array.isArray(routing.patterns)) continue;
          for (const raw of routing.patterns) {
            let re;
            try {
              re = new RegExp(raw, "i");
            } catch (err) {
              console.error(
                `[assistants.route] INVALID ROUTING PATTERN on '${key}' \u2014 this assistant can never be routed to. pattern=${JSON.stringify(raw)} error=${err instanceof Error ? err.message : String(err)}`
              );
              continue;
            }
            if (re.test(text2)) {
              candidates.push({
                key,
                alias: loaded.alias || key,
                pattern: raw,
                precedence: typeof routing.precedence === "number" ? routing.precedence : 0
              });
              break;
            }
          }
        }
        if (candidates.length === 0) {
          this.ensureClassifierTrained();
          const guess = intentClassifier.classify(text2);
          if (guess) {
            const loaded = getAllLoadedAssistants().find((l) => loadedAssistantKey(l) === guess.assistant);
            return {
              assistant: guess.assistant,
              alias: loaded?.alias || guess.assistant,
              matchedPattern: `classifier@${guess.trainingDigest} (p=${guess.confidence}, margin=${guess.margin})`,
              precedence: -1,
              tieBroken: false,
              method: "classifier"
            };
          }
          const roster = getAllLoadedAssistants().map((l) => {
            const k = loadedAssistantKey(l);
            const routing = l.resource?.metadata?.routing;
            if (!k || !routing?.patterns?.length) return void 0;
            return `@${l.alias || k} \u2014 ${routing.handles || l.resource?.description || ""}`;
          }).filter(Boolean).sort().join("\n");
          throw new Error(
            declineFor(
              countTurn(conversationId, "decline"),
              roster || "(nothing is registered with a routing declaration)"
            )
          );
        }
        candidates.sort((a, b) => b.precedence - a.precedence || a.key.localeCompare(b.key));
        const top = candidates[0];
        const tieBroken = candidates.length > 1 && candidates[1].precedence === top.precedence;
        return {
          assistant: top.key,
          alias: top.alias,
          matchedPattern: top.pattern,
          precedence: top.precedence,
          // Recorded, not hidden. Two assistants claiming the same request at the
          // same precedence is a declaration defect, and the receipt should show
          // that the answer depended on a tie break.
          tieBroken,
          method: "declaration"
        };
      }
      getBootstrapAssistants() {
        return getAllLoadedAssistants().map((loaded) => {
          const key = loadedAssistantKey(loaded);
          if (!key) return void 0;
          return {
            key,
            alias: loaded.alias || key,
            description: loaded.resource?.description || ""
          };
        }).filter((a) => Boolean(a)).sort((a, b) => a.key.localeCompare(b.key));
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/code-tool-invoke.ts
import { resolveConfinedPath, isPathBlocked } from "@symbia/pathguard";
async function resolveSafePath(workspace, targetPath) {
  return resolveConfinedPath(workspace.rootPath, targetPath, workspace.permissions);
}
var CODE_TOOLS_ENABLED, DEFAULT_BLOCKED_PATHS, workspaces, CodeToolInvokeHandler, WorkspaceCreateHandler, WorkspaceDestroyHandler;
var init_code_tool_invoke = __esm({
  "../../assistants/server/src/engine/actions/code-tool-invoke.ts"() {
    "use strict";
    init_base();
    CODE_TOOLS_ENABLED = process.env.ASSISTANTS_ENABLE_CODE_TOOLS === "true";
    DEFAULT_BLOCKED_PATHS = ["**/.env*", ".env*", "**/secrets/**", "secrets/**"];
    workspaces = /* @__PURE__ */ new Map();
    CodeToolInvokeHandler = class extends BaseActionHandler {
      type = "code.tool.invoke";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const workspace = await this.getWorkspace(params.workspaceId, context);
          if (!workspace) {
            return this.failure("No workspace available. Create one first with workspace.create", Date.now() - start2);
          }
          const result = await this.executeTool(params.tool, params.params, workspace);
          return this.success({
            tool: params.tool,
            workspaceId: workspace.workspaceId,
            result
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.failure(`Tool execution failed: ${message}`, Date.now() - start2);
        }
      }
      async getWorkspace(workspaceId, context) {
        if (workspaceId && workspaces.has(workspaceId)) {
          return workspaces.get(workspaceId);
        }
        const contextWorkspaceId = context.context.workspaceId;
        if (contextWorkspaceId && workspaces.has(contextWorkspaceId)) {
          return workspaces.get(contextWorkspaceId);
        }
        for (const [id, ws] of workspaces.entries()) {
          const wsMetadata = ws;
          if (wsMetadata.conversationId === context.conversationId) {
            return ws;
          }
        }
        return void 0;
      }
      async executeTool(tool, params, workspace) {
        const toolHandlers = {
          "file-read": this.executeFileRead.bind(this),
          "file-write": this.executeFileWrite.bind(this),
          "file-edit": this.executeFileEdit.bind(this),
          "glob": this.executeGlob.bind(this),
          "grep": this.executeGrep.bind(this),
          "ls": this.executeLs.bind(this)
        };
        const handler = toolHandlers[tool];
        if (!handler) {
          throw new Error(`Unknown tool: ${tool}`);
        }
        return handler(params, workspace);
      }
      // Tool implementations that delegate to Runtime service
      // These are simplified inline versions - production would call Runtime
      async executeFileRead(params, workspace) {
        const fs = await import("fs/promises");
        if (!workspace.permissions.read) {
          throw new Error("Read permission denied");
        }
        const filePath = params.path;
        const fullPath = await resolveSafePath(workspace, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        const lines = content.split("\n");
        const offset = Math.max(0, (params.offset || 1) - 1);
        const limit = params.limit || lines.length;
        const selectedLines = lines.slice(offset, offset + limit);
        return {
          path: filePath,
          content: selectedLines.join("\n"),
          lines: selectedLines.length,
          totalLines: lines.length,
          truncated: offset + limit < lines.length
        };
      }
      async executeFileWrite(params, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (!workspace.permissions.write) {
          throw new Error("Write permission denied");
        }
        const filePath = params.path;
        const content = params.content;
        const fullPath = await resolveSafePath(workspace, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return {
          path: filePath,
          bytesWritten: Buffer.byteLength(content)
        };
      }
      async executeFileEdit(params, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (!workspace.permissions.write) {
          throw new Error("Write permission denied");
        }
        const filePath = params.path;
        const edits = params.edits;
        const fullPath = await resolveSafePath(workspace, filePath);
        let content = await fs.readFile(fullPath, "utf-8");
        let editsApplied = 0;
        for (const edit of edits) {
          if (!content.includes(edit.oldText)) {
            throw new Error(`Text not found: "${edit.oldText.slice(0, 50)}..."`);
          }
          content = content.replace(edit.oldText, edit.newText);
          editsApplied++;
        }
        await fs.writeFile(fullPath, content, "utf-8");
        return {
          path: filePath,
          editsApplied
        };
      }
      async executeGlob(params, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (!workspace.permissions.read) {
          throw new Error("Read permission denied");
        }
        const pattern = params.pattern;
        const cwd = await resolveSafePath(workspace, params.cwd);
        const files = [];
        await this.findFilesRecursive(cwd, pattern, files, 1e3, workspace);
        return {
          pattern,
          files: files.map((f) => path.relative(workspace.rootPath, f)),
          truncated: files.length >= 1e3
        };
      }
      async findFilesRecursive(dir, pattern, results, maxResults, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (results.length >= maxResults) return;
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= maxResults) break;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(workspace.rootPath, fullPath);
            if (isPathBlocked(relPath, workspace.permissions.blockedPaths)) continue;
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              await this.findFilesRecursive(fullPath, pattern, results, maxResults, workspace);
            } else if (entry.isFile()) {
              if (this.matchGlob(entry.name, pattern)) {
                results.push(fullPath);
              }
            }
          }
        } catch {
        }
      }
      matchGlob(str, pattern) {
        const regex = pattern.replace(/\*\*/g, "{{GLOB}}").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/{{GLOB}}/g, ".*");
        return new RegExp(`^${regex}$`).test(str);
      }
      async executeGrep(params, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (!workspace.permissions.read) {
          throw new Error("Read permission denied");
        }
        const pattern = params.pattern;
        const searchPath = await resolveSafePath(workspace, params.path);
        const matches = [];
        const regex = new RegExp(pattern, params.ignoreCase ? "gi" : "g");
        await this.searchFilesRecursive(searchPath, workspace.rootPath, regex, matches, 500, workspace);
        return {
          pattern,
          matches,
          truncated: matches.length >= 500
        };
      }
      async searchFilesRecursive(dir, rootPath, regex, results, maxResults, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (results.length >= maxResults) return;
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= maxResults) break;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(workspace.rootPath, fullPath);
            if (isPathBlocked(relPath, workspace.permissions.blockedPaths)) continue;
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
              await this.searchFilesRecursive(fullPath, rootPath, regex, results, maxResults, workspace);
            } else if (entry.isFile()) {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                  if (regex.test(lines[i])) {
                    results.push({
                      file: path.relative(rootPath, fullPath),
                      line: i + 1,
                      content: lines[i].trim()
                    });
                  }
                  regex.lastIndex = 0;
                }
              } catch {
              }
            }
          }
        } catch {
        }
      }
      async executeLs(params, workspace) {
        const fs = await import("fs/promises");
        const path = await import("path");
        if (!workspace.permissions.read) {
          throw new Error("Read permission denied");
        }
        const dirPath = params.path;
        const fullPath = await resolveSafePath(workspace, dirPath);
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const result = [];
        for (const entry of entries) {
          if (!params.includeHidden && entry.name.startsWith(".")) continue;
          const entryPath = path.join(fullPath, entry.name);
          const stat = await fs.stat(entryPath).catch(() => null);
          result.push({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
            size: stat?.size
          });
        }
        return {
          path: dirPath,
          entries: result
        };
      }
      // executeBash was removed 13 Aug 2026 (see the file header). There is no
      // command-execution tool until a real isolation boundary (WASM sandbox) is
      // decided.
    };
    WorkspaceCreateHandler = class extends BaseActionHandler {
      type = "workspace.create";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const { v4: uuid2 } = await import("uuid");
          const os = await import("os");
          const path = await import("path");
          const fs = await import("fs/promises");
          const workspaceId = uuid2();
          const rootPath = path.join(os.tmpdir(), "symbia-workspaces", workspaceId);
          await fs.mkdir(rootPath, { recursive: true });
          const requested = params.permissions ?? {};
          const workspace = {
            workspaceId,
            rootPath,
            conversationId: context.conversationId,
            permissions: {
              read: requested.read !== false,
              write: requested.write !== false,
              paths: requested.paths ?? ["**/*"],
              blockedPaths: [...DEFAULT_BLOCKED_PATHS, ...requested.blockedPaths ?? []]
            }
          };
          workspaces.set(workspaceId, workspace);
          return this.success({
            workspaceId,
            rootPath,
            permissions: workspace.permissions
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.failure(`Failed to create workspace: ${message}`, Date.now() - start2);
        }
      }
    };
    WorkspaceDestroyHandler = class extends BaseActionHandler {
      type = "workspace.destroy";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          const fs = await import("fs/promises");
          let workspaceId = params.workspaceId;
          if (!workspaceId) {
            for (const [id, ws] of workspaces.entries()) {
              const wsWithConv = ws;
              if (wsWithConv.conversationId === context.conversationId) {
                workspaceId = id;
                break;
              }
            }
          }
          if (!workspaceId || !workspaces.has(workspaceId)) {
            return this.failure("Workspace not found", Date.now() - start2);
          }
          const workspace = workspaces.get(workspaceId);
          await fs.rm(workspace.rootPath, { recursive: true, force: true });
          workspaces.delete(workspaceId);
          return this.success({ workspaceId, destroyed: true }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.failure(`Failed to destroy workspace: ${message}`, Date.now() - start2);
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/integration-invoke.ts
import { resolveServiceUrl as resolveServiceUrl3, ServiceId as ServiceId3 } from "@symbia/sys";
var INTEGRATIONS_SERVICE_URL2, IntegrationInvokeHandler;
var init_integration_invoke = __esm({
  "../../assistants/server/src/engine/actions/integration-invoke.ts"() {
    "use strict";
    init_base();
    init_template();
    INTEGRATIONS_SERVICE_URL2 = resolveServiceUrl3(ServiceId3.INTEGRATIONS);
    IntegrationInvokeHandler = class extends BaseActionHandler {
      type = "integration.invoke";
      async execute(config, context) {
        const start2 = Date.now();
        const params = config.params;
        try {
          if (!params.operation) {
            return this.failure("No operation specified", Date.now() - start2);
          }
          let body = params.body;
          if (params.bodyTemplate) {
            body = this.buildTemplatedBody(params.bodyTemplate, context);
          }
          const token = context.metadata?.token;
          if (!token) {
            return this.failure("No auth token available in execution context", Date.now() - start2);
          }
          const response = await fetch(`${INTEGRATIONS_SERVICE_URL2}/api/integrations/invoke`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              ...params.headers
            },
            body: JSON.stringify({
              operation: params.operation,
              params: params.params,
              body,
              timeout: params.timeout
            }),
            signal: params.timeout ? AbortSignal.timeout(params.timeout) : void 0
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: "Unknown error" }));
            return this.failure(
              `Integration error: ${error.error || response.statusText}`,
              Date.now() - start2
            );
          }
          const result = await response.json();
          if (!result.success) {
            return this.failure(result.error || "Integration invocation failed", Date.now() - start2);
          }
          if (params.resultKey && result.data) {
            context.context[params.resultKey] = result.data;
          }
          return this.success({
            data: result.data,
            operation: params.operation,
            requestId: result.requestId,
            integrationDurationMs: result.durationMs
          }, Date.now() - start2);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Integration invocation failed";
          return this.failure(message, Date.now() - start2);
        }
      }
      buildTemplatedBody(template, context) {
        const replaced = interpolate(template, context);
        try {
          return JSON.parse(replaced);
        } catch {
          return replaced;
        }
      }
    };
  }
});

// ../../assistants/server/src/engine/actions/index.ts
function getActionHandler(type) {
  return handlerMap.get(type);
}
var handlers, handlerMap;
var init_actions = __esm({
  "../../assistants/server/src/engine/actions/index.ts"() {
    "use strict";
    init_llm_invoke();
    init_handoff();
    init_message();
    init_notify();
    init_state_transition();
    init_context_update();
    init_webhook_call();
    init_service_call();
    init_wait();
    init_parallel();
    init_condition();
    init_loop();
    init_assistant_route();
    init_embedding_route();
    init_tool_invoke();
    init_code_tool_invoke();
    init_integration_invoke();
    init_base();
    init_llm_invoke();
    init_handoff();
    init_message();
    init_notify();
    init_state_transition();
    init_context_update();
    init_webhook_call();
    init_service_call();
    init_wait();
    init_parallel();
    init_condition();
    init_loop();
    init_assistant_route();
    init_embedding_route();
    init_tool_invoke();
    init_code_tool_invoke();
    init_integration_invoke();
    handlers = [
      new LLMInvokeHandler(),
      new HandoffCreateHandler(),
      new HandoffAssignHandler(),
      new HandoffResolveHandler(),
      new MessageSendHandler(),
      new NotifyHandler(),
      new StateTransitionHandler(),
      new ContextUpdateHandler(),
      new WebhookCallHandler(),
      new ServiceCallHandler(),
      // Orchestration
      new WaitHandler(),
      new ParallelHandler(),
      new ConditionHandler(),
      new LoopHandler(),
      // Coordinator
      new AssistantRouteHandler(),
      new EmbeddingRouteHandler(),
      // Built-in tools
      new ToolInvokeHandler(),
      // Code agent: OFF by default. These run commands as the service process
      // (no sandbox) and their input is LLM-influenced, so they are only
      // registered when ASSISTANTS_ENABLE_CODE_TOOLS=true is set explicitly.
      ...CODE_TOOLS_ENABLED ? [new CodeToolInvokeHandler(), new WorkspaceCreateHandler(), new WorkspaceDestroyHandler()] : [],
      // Integrations
      new IntegrationInvokeHandler()
    ];
    if (CODE_TOOLS_ENABLED) {
      console.warn(
        "[assistants] code.tool.invoke / workspace.* action handlers are ENABLED. These execute on the host as the service process (no sandbox). Do not enable outside trusted development."
      );
    }
    handlerMap = /* @__PURE__ */ new Map();
    for (const handler of handlers) {
      handlerMap.set(handler.type, handler);
    }
  }
});

// ../../assistants/server/src/engine/rule-executor.ts
function describeSource(action, output) {
  const p = action.params || {};
  switch (action.type) {
    // WHAT ACTUALLY ANSWERED, NOT WHAT WAS CONFIGURED.
    //
    // The note below said the resolved provider "is recorded by llm-invoke
    // itself when it differs". It never was. Almost no rule configures a
    // provider — resolveUsableProvider picks whichever has a credential — so
    // in practice every model step in every envelope read
    // "llm (provider resolved at call time)", which names nothing anyone
    // could go and check. A receipt whose source field is a description of
    // its own uncertainty is not a source field.
    //
    // llm-invoke has returned `output.model` all along. This reads it, so a
    // delegation can say WHICH model made a choice that is not reproducible.
    case "llm.invoke": {
      const resolved = output?.model;
      if (resolved) return p.provider ? `${p.provider}/${resolved}` : resolved;
      return p.provider ? `${p.provider}/${p.model ?? "default"}` : "llm (provider unresolved \u2014 the call did not report a model)";
    }
    case "tool.invoke":
      return String(p.tool ?? "tool");
    case "service.call":
      return `${p.service ?? "service"} ${String(p.method ?? "GET")} ${p.path ?? ""}`.trim();
    case "integration.invoke":
      return String(p.operation ?? "integration");
    case "assistant.route":
      return `route -> ${p.targetAssistant ?? (p.fromContext ? `(from context.${p.contextKey ?? "routeTarget"})` : "unspecified")}`;
    case "message.send":
      return "message.send";
    default:
      return action.type;
  }
}
var RuleExecutor, ruleExecutor;
var init_rule_executor = __esm({
  "../../assistants/server/src/engine/rule-executor.ts"() {
    "use strict";
    init_provenance();
    init_condition_evaluator();
    init_actions();
    init_llm_invoke();
    init_conversational_turns();
    RuleExecutor = class {
      async execute(context, ruleSet) {
        const start2 = Date.now();
        const runId = crypto.randomUUID();
        console.log(`[RuleExecutor] Starting execution for trigger: ${context.trigger}`);
        console.log(`[RuleExecutor] RuleSet: ${ruleSet.name} (${ruleSet.rules.length} rules)`);
        console.log(`[RuleExecutor] Message content: "${context.message?.content?.substring(0, 50)}..."`);
        const enabled = ruleSet.rules.filter(
          (rule) => rule.enabled && rule.trigger === context.trigger
        );
        const byPriority = (a, b) => b.priority - a.priority;
        const normalRules = enabled.filter((r) => !r.isDefault).sort(byPriority);
        const defaultRules = enabled.filter((r) => r.isDefault).sort(byPriority);
        const applicableRules = [...normalRules, ...defaultRules];
        console.log(`[RuleExecutor] Found ${applicableRules.length} applicable rules for trigger ${context.trigger}`);
        const results = [];
        let newState;
        let rulesMatched = 0;
        let cededResult;
        for (const rule of applicableRules) {
          console.log(`[RuleExecutor] Evaluating rule: ${rule.name} (priority: ${rule.priority})`);
          const ruleResult = await this.executeRule(
            rule,
            context,
            ruleSet.kind ?? "deterministic",
            ruleSet.maxAttempts ?? 3
          );
          results.push(ruleResult);
          console.log(`[RuleExecutor] Rule "${rule.name}" matched: ${ruleResult.matched}, conditionsEvaluated: ${ruleResult.conditionsEvaluated}`);
          if (ruleResult.error) {
            console.log(`[RuleExecutor] Rule error: ${ruleResult.error}`);
          }
          if (ruleResult.actionsExecuted.length > 0) {
            console.log(`[RuleExecutor] Actions executed: ${ruleResult.actionsExecuted.map((a) => `${a.actionType}(${a.success ? "ok" : "fail"})`).join(", ")}`);
          }
          if (ruleResult.fellThrough) {
            console.log(
              `[RuleExecutor] Rule "${rule.name}" matched but ceded (fallThrough) \u2014 trying the next rule`
            );
            cededResult = ruleResult;
            continue;
          }
          if (ruleResult.matched) {
            rulesMatched++;
            const stateAction = ruleResult.actionsExecuted.find(
              (a) => a.actionType === "state.transition" && a.success
            );
            if (stateAction?.output && typeof stateAction.output === "object") {
              const output = stateAction.output;
              if (output.newState) {
                newState = output.newState;
                context.conversationState = newState;
              }
            }
            break;
          }
        }
        if (rulesMatched === 0 && cededResult) {
          console.log(
            `[RuleExecutor] No rule handled this and "${cededResult.ruleName}" ceded \u2014 reporting its failure rather than staying silent`
          );
          rulesMatched = 1;
          results.push({ ...cededResult, fellThrough: false });
        }
        console.log(`[RuleExecutor] Execution complete: ${rulesMatched}/${applicableRules.length} rules matched in ${Date.now() - start2}ms`);
        return {
          runId,
          orgId: context.orgId,
          conversationId: context.conversationId,
          trigger: context.trigger,
          rulesEvaluated: applicableRules.length,
          rulesMatched,
          results,
          newState,
          durationMs: Date.now() - start2,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      async executeRule(rule, context, kind = "deterministic", ruleSetMaxAttempts = 3) {
        const start2 = Date.now();
        try {
          const conditionsMatch = evaluateConditions(rule.conditions, context);
          console.log(`[RuleExecutor] evaluateConditions returned: ${conditionsMatch} (type: ${typeof conditionsMatch})`);
          if (!conditionsMatch) {
            return {
              ruleId: rule.id,
              ruleName: rule.name,
              matched: false,
              conditionsEvaluated: true,
              actionsExecuted: [],
              durationMs: Date.now() - start2
            };
          }
          console.log(`[RuleExecutor] Conditions matched! Executing ${rule.actions.length} action(s)...`);
          const actionResults = [];
          const provenance = [];
          context.provenance = provenance;
          context.provenanceRule = rule.name;
          for (const actionConfig of rule.actions) {
            console.log(`[RuleExecutor] Executing action: ${actionConfig.type}`);
            const handler = getActionHandler(actionConfig.type);
            let result;
            if (!handler) {
              // AN ACTION THE ENGINE DOES NOT HAVE IS A FAILED ACTION. This
              // branch used to `continue`, skipping onError and the chain
              // break; a later message.send then sealed "" as RETRIEVED.
              // Found 16 Aug. Mirrors the source fix in rule-executor.ts.
              result = {
                success: false,
                actionType: actionConfig.type,
                error: `Unknown action type: ${actionConfig.type}`,
                durationMs: 0
              };
              provenance.push({
                id: actionConfig.id || actionConfig.type,
                action: actionConfig.type,
                source: "no handler for this action type — nothing executed",
                ok: false,
                ms: 0,
                error: result.error
              });
            } else {
            const maxAttempts = kind === "probabilistic" ? Math.max(1, ruleSetMaxAttempts) : 1;
            let attempt = 0;
            while (attempt < maxAttempts) {
              attempt++;
              result = await handler.execute(actionConfig, context);
              provenance.push({
                // THE ID IS AN IDENTITY, NOT A LABEL. DO NOT DECORATE IT.
                //
                // This appended `#${attempt}` so repeated attempts were
                // distinguishable. It cost four predictions: other code KEYS on
                // this id. Templates resolve `{{steps.step-answer.response}}`, and
                // message.send matches the reply's content back to the step that
                // produced it to decide `contentFromModel`.
                //
                // With the suffix that match failed, so a reply a model had written
                // classified as RETRIEVED — authored text — instead of COMPOSED.
                // The reply was right and its receipt said the wrong thing about
                // where it came from, which on this platform is the worse failure.
                //
                // Attempt number lives in `attempt`, which was added for exactly
                // this and which nothing keys on.
                id: actionConfig.id || actionConfig.type,
                action: actionConfig.type,
                source: describeSource(actionConfig, result.output),
                ok: result.success,
                ms: result.durationMs,
                outputDigest: result.success ? digest(result.output) : void 0,
                error: result.success ? void 0 : result.error,
                // Present only when retrying was possible, so a deterministic
                // assistant's receipt is not cluttered with `attempt: 1` on every
                // step it was never going to repeat.
                attempt: maxAttempts > 1 ? attempt : void 0
              });
              if (result.success) break;
              if (result.error?.startsWith(DECLINED)) {
                console.log(
                  `[RuleExecutor] ${actionConfig.type} declined deliberately \u2014 not retrying a decision`
                );
                break;
              }
              if (attempt < maxAttempts) {
                console.log(
                  `[RuleExecutor] ${actionConfig.type} failed on attempt ${attempt}/${maxAttempts} (${result.error}) \u2014 probabilistic assistant, trying again`
                );
              } else if (maxAttempts > 1) {
                console.log(
                  `[RuleExecutor] ${actionConfig.type} failed on all ${maxAttempts} attempts \u2014 giving up`
                );
              }
            }
            } // handler existed; unknown-type failures joined here already carrying their result
            actionResults.push(result);
            if (!result.success) {
              const handler2 = actionConfig.onError;
              if (handler2) {
                console.log(
                  `[RuleExecutor] Action ${actionConfig.type} failed; running its onError handler (${handler2.type})`
                );
                const handlerImpl = getActionHandler(handler2.type);
                if (handlerImpl) {
                  const handled = await handlerImpl.execute(handler2, context);
                  actionResults.push(handled);
                  provenance.push({
                    id: handler2.id || `${actionConfig.type}:onError`,
                    action: handler2.type,
                    source: describeSource(handler2, handled.output),
                    ok: handled.success,
                    ms: handled.durationMs,
                    outputDigest: handled.success ? digest(handled.output) : void 0,
                    error: handled.success ? void 0 : handled.error
                  });
                  return {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    matched: true,
                    conditionsEvaluated: true,
                    actionsExecuted: actionResults,
                    // The step that failed STAYS in the record. A handled failure
                    // is not an absent one, and the receipt should show both what
                    // broke and what was said about it.
                    handled: true,
                    durationMs: Date.now() - start2
                  };
                }
                console.error(
                  `[RuleExecutor] onError declares unknown action type '${handler2.type}' \u2014 falling back to the raw failure`
                );
              }
              if (rule.fallThrough) {
                return {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  matched: true,
                  conditionsEvaluated: true,
                  actionsExecuted: actionResults,
                  fellThrough: true,
                  error: result.error,
                  durationMs: Date.now() - start2
                };
              }
              break;
            }
          }
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            matched: true,
            conditionsEvaluated: true,
            actionsExecuted: actionResults,
            durationMs: Date.now() - start2
          };
        } catch (error) {
          if (error instanceof TokenAuthError) {
            throw error;
          }
          const message = error instanceof Error ? error.message : "Rule execution failed";
          return {
            ruleId: rule.id,
            ruleName: rule.name,
            matched: false,
            conditionsEvaluated: false,
            actionsExecuted: [],
            error: message,
            durationMs: Date.now() - start2
          };
        }
      }
    };
    ruleExecutor = new RuleExecutor();
  }
});

// ../../assistants/server/src/engine/run-coordinator.ts
function setRuleSet(orgId, ruleSet) {
  inMemoryRuleSets[orgId] = ruleSet;
}
function getRuns() {
  return [...inMemoryRuns];
}
function clearRuns() {
  inMemoryRuns.length = 0;
}
var RunCoordinator, inMemoryState, inMemoryContext, inMemoryRuleSets, inMemoryRuns, defaultCoordinator;
var init_run_coordinator = __esm({
  "../../assistants/server/src/engine/run-coordinator.ts"() {
    "use strict";
    init_rule_executor();
    RunCoordinator = class {
      config;
      constructor(config) {
        this.config = config;
      }
      async processEvent(event) {
        const ruleSet = await this.config.getRuleSet(event.orgId);
        if (!ruleSet || !ruleSet.isActive) {
          return {
            runId: crypto.randomUUID(),
            orgId: event.orgId,
            conversationId: event.conversationId,
            trigger: event.type,
            rulesEvaluated: 0,
            rulesMatched: 0,
            results: [],
            durationMs: 0,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        const conversationState = await this.config.getConversationState(event.conversationId);
        const conversationContext = await this.config.getConversationContext(event.conversationId);
        const executionContext = {
          orgId: event.orgId,
          conversationId: event.conversationId,
          conversationState,
          trigger: event.type,
          event: {
            id: crypto.randomUUID(),
            type: event.type,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            data: event.data
          },
          message: event.message,
          user: event.user,
          context: conversationContext,
          metadata: event.metadata || {},
          // THE LINE THAT MAKES LLM CONFIGURATION REAL.
          //
          // `ExecutionContext.llmConfig` has been declared since January and was
          // never assigned here — this is the only place every ExecutionContext in
          // the codebase is built, so "never assigned here" means never assigned at
          // all. Everything downstream that consulted it was therefore reading
          // `undefined` and silently taking its fallback path.
          //
          // Resolved at load time and carried on the ruleset, so this is a
          // reference copy rather than work repeated per message.
          llmConfig: ruleSet.resolvedLLMConfig
        };
        const result = await ruleExecutor.execute(executionContext, ruleSet);
        if (result.newState) {
          await this.config.saveConversationState(event.conversationId, result.newState);
        }
        const contextUpdates = this.extractContextUpdates(result);
        if (Object.keys(contextUpdates).length > 0) {
          const merged = { ...conversationContext, ...contextUpdates };
          await this.config.saveConversationContext(event.conversationId, merged);
        }
        await this.config.saveRunResult(result);
        return result;
      }
      extractContextUpdates(result) {
        const updates = {};
        for (const ruleResult of result.results) {
          for (const action of ruleResult.actionsExecuted) {
            if (action.actionType === "context.update" && action.success && action.output) {
              const output = action.output;
              if (output.newContext) {
                Object.assign(updates, output.newContext);
              }
            }
          }
        }
        return updates;
      }
    };
    inMemoryState = {};
    inMemoryContext = {};
    inMemoryRuleSets = {};
    inMemoryRuns = [];
    defaultCoordinator = new RunCoordinator({
      getRuleSet: async (orgId) => {
        if (inMemoryRuleSets[orgId]) {
          return inMemoryRuleSets[orgId];
        }
        const [assistantKey] = orgId.split(":");
        const defaultKey = `${assistantKey}:default`;
        return inMemoryRuleSets[defaultKey] || null;
      },
      getConversationState: async (conversationId) => inMemoryState[conversationId] || "idle",
      saveConversationState: async (conversationId, state) => {
        inMemoryState[conversationId] = state;
      },
      getConversationContext: async (conversationId) => inMemoryContext[conversationId] || {},
      saveConversationContext: async (conversationId, context) => {
        inMemoryContext[conversationId] = context;
      },
      saveRunResult: async (result) => {
        inMemoryRuns.push(result);
      }
    });
  }
});

// ../../assistants/server/src/routes/assistants/rule-based-handler.ts
import { Router } from "express";
import { resolveServiceUrl as resolveServiceUrl4, ServiceId as ServiceId4 } from "@symbia/sys";
import { createIdentityClient } from "@symbia/id";
async function getCoordinatorToken() {
  if (coordinatorTokenCache && Date.now() < coordinatorTokenCache.expires) {
    return coordinatorTokenCache.token;
  }
  const identityClient = createIdentityClient();
  const coordinatorId = "assistant:coordinator";
  try {
    const result = await identityClient.registerAgent({
      agentId: coordinatorId,
      credential: BOOTSTRAP_AGENT_CREDENTIAL,
      name: "Coordinator",
      capabilities: ["llm.chat", "catalog.query"]
    });
    coordinatorTokenCache = { token: result.token, expires: Date.now() + 35e5 };
    return result.token;
  } catch {
    try {
      const loginResult = await identityClient.loginAgent(coordinatorId, BOOTSTRAP_AGENT_CREDENTIAL);
      coordinatorTokenCache = { token: loginResult.token, expires: Date.now() + 35e5 };
      return loginResult.token;
    } catch {
      return void 0;
    }
  }
}
function createRuleBasedAssistantRouter(config) {
  const router8 = Router();
  const defaultOrgId = "default";
  setRuleSet(`${config.key}:${defaultOrgId}`, config.defaultRules);
  router8.get("/", (_req, res) => {
    res.json({
      principalId: `assistant:${config.key}`,
      principalType: "assistant",
      name: config.name,
      description: config.description,
      capabilities: extractCapabilities(config.defaultRules),
      messaging: {
        // Messages flow through the Messaging Service
        // Assistants receive messages via webhook at /api/webhook/messaging
        userId: `assistant:${config.key}`,
        webhookUrl: "/api/webhook/messaging"
      },
      source: "rule-based",
      rulesCount: config.defaultRules.rules.length
    });
  });
  router8.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      assistant: config.key,
      source: "rule-based",
      rulesLoaded: config.defaultRules.rules.length
    });
  });
  router8.get("/rules", (req, res) => {
    const orgId = req.headers["x-org-id"] || defaultOrgId;
    res.json({
      assistantKey: config.key,
      orgId,
      rules: config.defaultRules
    });
  });
  router8.post("/topic-name", async (req, res) => {
    if (config.key !== "coordinator") {
      res.status(404).json({ error: "Topic name generation only available on coordinator" });
      return;
    }
    const { conversationId } = req.body;
    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required" });
      return;
    }
    try {
      const messagingUrl = resolveServiceUrl4(ServiceId4.MESSAGING);
      const token = req.headers.authorization;
      const messagesResponse = await fetch(
        `${messagingUrl}/api/conversations/${conversationId}/messages?limit=10`,
        {
          headers: {
            "Content-Type": "application/json",
            ...token ? { Authorization: token } : {}
          }
        }
      );
      if (!messagesResponse.ok) {
        res.status(500).json({ error: "Failed to fetch conversation messages" });
        return;
      }
      const messagesData = await messagesResponse.json();
      const messages2 = Array.isArray(messagesData) ? messagesData : messagesData.messages ?? [];
      if (messages2.length === 0) {
        res.json({ topicName: "New Topic" });
        return;
      }
      const messageText = messages2.slice(0, 5).map(
        (m) => `${m.sender_id?.includes("assistant") ? "Assistant" : "User"}: ${m.content?.slice(0, 200) || ""}`
      ).join("\n");
      const callLLM = async (authToken) => {
        const usable = await resolveUsableProvider(authToken);
        if (!usable) {
          throw new Error("No LLM provider has a usable credential for topic naming");
        }
        return invokeLLM(authToken, {
          provider: usable.provider,
          model: usable.model,
          messages: [
            {
              role: "system",
              content: `You generate short, descriptive topic names for conversations.
Rules:
- Maximum 4-5 words
- No quotes or special characters
- Capture the main topic or intent
- Be specific but concise
- Return ONLY the topic name, nothing else`
            },
            {
              role: "user",
              content: `Generate a topic name for this conversation:

${messageText}`
            }
          ],
          temperature: 0.3,
          maxTokens: 30
        });
      };
      let response;
      const userToken = token?.replace("Bearer ", "") || "";
      if (userToken) {
        try {
          response = await callLLM(userToken);
        } catch (error) {
          if (error instanceof TokenAuthError) {
            console.log("[Coordinator] User token failed, trying coordinator token...");
            const coordinatorToken = await getCoordinatorToken();
            if (!coordinatorToken) {
              res.status(500).json({ error: "Failed to get coordinator token" });
              return;
            }
            response = await callLLM(coordinatorToken);
          } else {
            throw error;
          }
        }
      } else {
        const coordinatorToken = await getCoordinatorToken();
        if (!coordinatorToken) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
        response = await callLLM(coordinatorToken);
      }
      const topicName = response.content?.trim() || "New Topic";
      res.json({ topicName });
    } catch (error) {
      console.error("[Coordinator] Error generating topic name:", error);
      res.status(500).json({ error: "Failed to generate topic name" });
    }
  });
  return router8;
}
function extractCapabilities(ruleSet) {
  const capabilities = /* @__PURE__ */ new Set();
  for (const rule of ruleSet.rules) {
    for (const action of rule.actions) {
      if (action.type === "service.call") {
        const params = action.params;
        if (params.service) capabilities.add(`${params.service}.query`);
      }
      if (action.type === "llm.invoke") {
        capabilities.add("llm.chat");
      }
    }
  }
  return Array.from(capabilities);
}
var coordinatorTokenCache, BOOTSTRAP_AGENT_CREDENTIAL;
var init_rule_based_handler = __esm({
  "../../assistants/server/src/routes/assistants/rule-based-handler.ts"() {
    "use strict";
    init_run_coordinator();
    init_integrations_client();
    coordinatorTokenCache = null;
    BOOTSTRAP_AGENT_CREDENTIAL = process.env.AGENT_CREDENTIAL || "symbia-agent-dev-secret-32chars-min!!";
  }
});

// ../../assistants/server/src/middleware/auth.ts
import { resolveServiceUrl as resolveServiceUrl5 } from "@symbia/sys";
import { runWithRLSContext } from "@symbia/db";
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookies = req.headers.cookie;
  if (cookies) {
    const tokenMatch = cookies.match(/token=([^;]+)/);
    if (tokenMatch) {
      return tokenMatch[1];
    }
  }
  return null;
}
async function introspectToken(token) {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/auth/introspect`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token })
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch (error) {
    console.error("[assistants] Error introspecting token:", error);
    return null;
  }
}
async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const introspection = await introspectToken(token);
  if (!introspection?.active) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const orgId = resolveOrgId(req, introspection, res);
  if (orgId === null) return;
  req.userId = introspection.sub;
  req.orgId = orgId;
  req.userType = introspection.type;
  req.token = token;
  runRequestWithRLS(
    {
      orgId,
      userId: introspection.sub ?? "anonymous",
      isSuperAdmin: introspection.isSuperAdmin,
      capabilities: introspection.entitlements || [],
      serviceId: "assistants"
    },
    res,
    next
  );
}
function resolveOrgId(req, introspection, res) {
  const headerOrgId = req.headers["x-org-id"];
  const memberOrgs = /* @__PURE__ */ new Set();
  if (introspection.orgId) memberOrgs.add(introspection.orgId);
  for (const org of introspection.organizations ?? []) memberOrgs.add(org.id);
  if (headerOrgId) {
    if (introspection.isSuperAdmin || memberOrgs.has(headerOrgId)) {
      return headerOrgId;
    }
    res.status(403).json({
      error: "Forbidden: authenticated principal is not a member of the requested organization"
    });
    return null;
  }
  let orgId;
  if (introspection.type === "agent") {
    orgId = introspection.orgId;
  } else if (introspection.organizations && introspection.organizations.length > 0) {
    orgId = introspection.organizations[0].id;
  }
  if (!orgId) {
    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      res.status(400).json({
        error: "Organization context required. Provide X-Org-Id header or ensure token includes org membership."
      });
      return null;
    }
    orgId = "dev-default-org";
  }
  return orgId;
}
function runRequestWithRLS(context, res, next) {
  try {
    runWithRLSContext(context, () => next());
  } catch (error) {
    console.error("[assistants-service] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish request security context" });
    }
  }
}
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const introspection = await introspectToken(token);
    if (introspection?.active) {
      const orgId = resolveOrgId(req, introspection, res);
      if (orgId === null) return;
      req.userId = introspection.sub;
      req.orgId = orgId || "dev-default-org";
      req.userType = introspection.type;
      req.token = token;
      runRequestWithRLS(
        {
          orgId: req.orgId,
          userId: introspection.sub ?? "anonymous",
          isSuperAdmin: introspection.isSuperAdmin,
          capabilities: introspection.entitlements || [],
          serviceId: "assistants"
        },
        res,
        next
      );
      return;
    }
  }
  next();
}
var IDENTITY_SERVICE_URL;
var init_auth = __esm({
  "../../assistants/server/src/middleware/auth.ts"() {
    "use strict";
    IDENTITY_SERVICE_URL = process.env.IDENTITY_ENDPOINT || resolveServiceUrl5("identity");
  }
});

// ../../assistants/server/src/routes/rules.ts
import { Router as Router2 } from "express";
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
function registerRuleSet(orgId, ruleSet) {
  ruleSets[orgId] = ruleSet;
  setRuleSet(orgId, ruleSet);
}
function getAllRuleSets() {
  return ruleSets;
}
var router, ruleSets, rules_default;
var init_rules = __esm({
  "../../assistants/server/src/routes/rules.ts"() {
    "use strict";
    init_run_coordinator();
    init_auth();
    router = Router2();
    router.use(requireAuth);
    ruleSets = {};
    router.get("/", (_req, res) => {
      const all = Object.values(ruleSets);
      res.json({ data: all, count: all.length });
    });
    router.get("/:orgId", (req, res) => {
      const orgId = getParam(req.params, "orgId");
      const ruleSet = ruleSets[orgId];
      if (!ruleSet) {
        res.status(404).json({ error: "Rule set not found" });
        return;
      }
      res.json({ data: ruleSet });
    });
    router.post("/", (req, res) => {
      const body = req.body;
      if (!body.orgId || !body.name) {
        res.status(400).json({ error: "orgId and name are required" });
        return;
      }
      const ruleSet = {
        id: crypto.randomUUID(),
        orgId: body.orgId,
        name: body.name,
        description: body.description,
        rules: body.rules || [],
        version: 1,
        isActive: body.isActive ?? true
      };
      ruleSets[body.orgId] = ruleSet;
      setRuleSet(body.orgId, ruleSet);
      res.status(201).json({ data: ruleSet });
    });
    router.put("/:orgId", (req, res) => {
      const orgId = getParam(req.params, "orgId");
      const body = req.body;
      const existing = ruleSets[orgId];
      if (!existing) {
        res.status(404).json({ error: "Rule set not found" });
        return;
      }
      const updated = {
        ...existing,
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        rules: body.rules ?? existing.rules,
        isActive: body.isActive ?? existing.isActive,
        version: existing.version + 1
      };
      ruleSets[orgId] = updated;
      setRuleSet(orgId, updated);
      res.json({ data: updated });
    });
    router.post("/:orgId/rules", (req, res) => {
      const orgId = getParam(req.params, "orgId");
      const body = req.body;
      const ruleSet = ruleSets[orgId];
      if (!ruleSet) {
        res.status(404).json({ error: "Rule set not found" });
        return;
      }
      if (!body.name || !body.trigger) {
        res.status(400).json({ error: "name and trigger are required" });
        return;
      }
      const rule = {
        id: crypto.randomUUID(),
        name: body.name,
        description: body.description,
        priority: body.priority ?? 0,
        enabled: body.enabled ?? true,
        trigger: body.trigger,
        conditions: body.conditions || { logic: "and", conditions: [] },
        actions: body.actions || [],
        metadata: body.metadata
      };
      ruleSet.rules.push(rule);
      ruleSet.version += 1;
      setRuleSet(orgId, ruleSet);
      res.status(201).json({ data: rule });
    });
    router.delete("/:orgId/rules/:ruleId", (req, res) => {
      const orgId = getParam(req.params, "orgId");
      const ruleId = getParam(req.params, "ruleId");
      const ruleSet = ruleSets[orgId];
      if (!ruleSet) {
        res.status(404).json({ error: "Rule set not found" });
        return;
      }
      const index2 = ruleSet.rules.findIndex((r) => r.id === ruleId);
      if (index2 === -1) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      ruleSet.rules.splice(index2, 1);
      ruleSet.version += 1;
      setRuleSet(orgId, ruleSet);
      res.json({ success: true });
    });
    router.post("/execute", async (req, res) => {
      const { orgId, conversationId, trigger, data, message, user } = req.body ?? {};
      if (!orgId || !conversationId || !trigger) {
        res.status(400).json({ error: "orgId, conversationId, and trigger are required" });
        return;
      }
      try {
        const result = await defaultCoordinator.processEvent({
          type: trigger,
          orgId,
          conversationId,
          data: data || {},
          message,
          user
        });
        res.json({ data: result });
      } catch (error) {
        const message2 = error instanceof Error ? error.message : "Execution failed";
        res.status(500).json({ error: message2 });
      }
    });
    router.get("/runs", (_req, res) => {
      const runs = getRuns();
      res.json({ data: runs, count: runs.length });
    });
    router.delete("/runs", (_req, res) => {
      clearRuns();
      res.json({ success: true });
    });
    rules_default = router;
  }
});

// ../../assistants/server/src/services/assistant-loader.ts
var assistant_loader_exports = {};
__export(assistant_loader_exports, {
  createAssistantsListRouter: () => createAssistantsListRouter,
  getAllLoadedAssistants: () => getAllLoadedAssistants,
  getLoadedAssistant: () => getLoadedAssistant,
  loadAssistants: () => loadAssistants,
  loadedAssistantKey: () => loadedAssistantKey,
  resolveAssistant: () => resolveAssistant
});
import { Router as Router3 } from "express";
import { ServiceId as ServiceId5, resolveServiceUrl as resolveServiceUrl6 } from "@symbia/sys";
function getCatalogEndpoint() {
  if (process.env.CATALOG_ENDPOINT) {
    return process.env.CATALOG_ENDPOINT;
  }
  return `${resolveServiceUrl6(ServiceId5.CATALOG)}/api`;
}
async function fetchFromCatalog(type, options = {}) {
  const { maxRetries = 5, retryDelayMs = 2e3, status } = options;
  const catalogEndpoint = getCatalogEndpoint();
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const query = new URLSearchParams({ type });
      if (status) query.set("status", status);
      const response = await fetch(`${catalogEndpoint}/resources?${query}`, {
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        console.warn(`[Assistant Loader] Catalog returned ${response.status} for type=${type} (attempt ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        return [];
      }
      const data = await response.json();
      const resources = data.resources || data || [];
      if (resources.length > 0) {
        return resources;
      }
      if (attempt < maxRetries) {
        console.log(`[Assistant Loader] Catalog returned 0 ${type}s, retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      return [];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries) {
        console.warn(`[Assistant Loader] Failed to fetch from Catalog (attempt ${attempt}/${maxRetries}): ${errorMsg}`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      console.warn("[Assistant Loader] Failed to fetch from Catalog after all retries:", errorMsg);
      return [];
    }
  }
  return [];
}
function getLoadedAssistant(key) {
  return loadedAssistants.get(key);
}
function getAllLoadedAssistants() {
  return Array.from(loadedAssistants.values());
}
function resolveAssistant(nameOrAlias) {
  const wanted = nameOrAlias.trim().replace(/^@/, "").toLowerCase();
  if (!wanted) return void 0;
  const byKey = loadedAssistants.get(wanted);
  if (byKey) return byKey;
  for (const loaded of loadedAssistants.values()) {
    if (loaded.alias?.toLowerCase() === wanted) return loaded;
  }
  return void 0;
}
function loadedAssistantKey(loaded) {
  const k = loaded.resource?.key;
  if (!k) return void 0;
  return k.includes("/") ? k.split("/").pop() : k;
}
async function loadAssistants(app) {
  const catalogEndpoint = getCatalogEndpoint();
  console.log(`[Assistant Loader] Loading assistants from Catalog at ${catalogEndpoint}...`);
  const catalogAssistants = await fetchFromCatalog("assistant", {
    maxRetries: 5,
    retryDelayMs: 2e3,
    // Only published assistants become routable. Unpublishing is how the
    // roster shrinks without destroying the resource.
    status: "published"
  });
  if (catalogAssistants.length === 0) {
    console.error("[Assistant Loader] No assistants found in Catalog after retries. Ensure Catalog service is running and has assistant resources.");
    return;
  }
  console.log(`[Assistant Loader] Found ${catalogAssistants.length} assistant(s) in Catalog`);
  for (const resource of catalogAssistants) {
    const assistantKey = resource.key.includes("/") ? resource.key.split("/").pop() : resource.key;
    const ruleSet = resource.metadata?.ruleSet;
    if (!ruleSet) {
      console.warn(`[Assistant Loader] Skipping ${assistantKey}: no ruleSet in metadata`);
      continue;
    }
    const config = resource.metadata?.assistantConfig || {
      principalId: `assistant:${assistantKey}`,
      principalType: "assistant",
      capabilities: extractCapabilities2(ruleSet)
    };
    const authored = resource.metadata?.llmConfig ?? {};
    const llmConfigPreset = resource.metadata?.llmConfigPreset || "conversational";
    const llmConfigRef = {
      preset: llmConfigPreset,
      overrides: {
        ...authored.provider ? { provider: { type: authored.provider } } : {},
        generation: {
          ...authored.model ? { model: authored.model } : {},
          ...authored.temperature !== void 0 ? { temperature: authored.temperature } : {},
          ...authored.maxTokens !== void 0 ? { maxTokens: authored.maxTokens } : {}
        }
      }
    };
    const resolvedLLMConfig = resolveLLMConfig(llmConfigRef);
    ruleSet.llmConfig = llmConfigRef;
    ruleSet.resolvedLLMConfig = resolvedLLMConfig;
    const declaredConfig = resource.metadata?.config ?? {};
    ruleSet.kind = declaredConfig.kind ?? "deterministic";
    ruleSet.maxAttempts = declaredConfig.retries?.max ?? 3;
    console.log(
      `[Assistant Loader] ${assistantKey} kind=${ruleSet.kind}` + (ruleSet.kind === "probabilistic" ? ` maxAttempts=${ruleSet.maxAttempts}` : " (refuses, never retries)") + (declaredConfig.kind ? "" : " [DEFAULTED \u2014 nothing declared]")
    );
    console.log(
      `[Assistant Loader] ${assistantKey} llm: preset=${llmConfigPreset} provider=${resolvedLLMConfig.provider.type} model=${resolvedLLMConfig.generation.model} temp=${resolvedLLMConfig.generation.temperature} maxTokens=${resolvedLLMConfig.generation.maxTokens}${authored.model || authored.provider ? " (authored overrides applied)" : ""}`
    );
    const router8 = createRuleBasedAssistantRouter({
      key: assistantKey,
      name: resource.name,
      description: resource.description,
      defaultRules: ruleSet
    });
    const basePath = `/api/assistants/${assistantKey}`;
    app.use(basePath, router8);
    registerRuleSet(assistantKey, ruleSet);
    console.log(`[Assistant Loader] \u2713 Registered ${assistantKey} at ${basePath}`);
    const routines = ruleSetToRoutines(ruleSet);
    const llmConfigLegacy = extractLlmConfig(ruleSet);
    const alias = resource.metadata?.alias;
    loadedAssistants.set(assistantKey, {
      resource: {
        ...resource,
        metadata: {
          ...resource.metadata,
          routines,
          llm: llmConfigLegacy,
          // THE AUTHORED CONFIG SURVIVES, UNDER ITS OWN NAME.
          //
          // This line used to read `llmConfig: resolvedLLMConfig`, overwriting
          // what the resource actually declared with the preset-derived value.
          // The console therefore displayed a configuration nobody had written,
          // in the field where the authored one belonged — so the operator saw
          // the discrepancy already resolved rather than seeing that one
          // existed. A UI that hides a disagreement between two configs is
          // worse than one that shows neither.
          //
          // `llmConfig` is now what the resource says. `llmConfigResolved` is
          // what it resolves to. Both are visible, and they can be compared.
          llmConfigResolved: resolvedLLMConfig
        }
      },
      config,
      alias,
      ruleSet,
      router: router8,
      llmConfig: resolvedLLMConfig
    });
  }
  console.log(`[Assistant Loader] Loaded ${loadedAssistants.size} assistant(s) total`);
}
function extractCapabilities2(ruleSet) {
  const capabilities = /* @__PURE__ */ new Set();
  for (const rule of ruleSet.rules) {
    for (const action of rule.actions) {
      if (action.type === "service.call") {
        const params = action.params;
        if (params.service) capabilities.add(`${params.service}.query`);
      }
      if (action.type === "llm.invoke") {
        capabilities.add("llm.chat");
      }
      if (action.type === "message.send") {
        capabilities.add("messaging");
      }
    }
  }
  return Array.from(capabilities);
}
function extractLlmConfig(ruleSet) {
  for (const rule of ruleSet.rules) {
    for (const action of rule.actions) {
      if (action.type === "llm.invoke") {
        const params = action.params;
        return {
          // Deliberately NOT defaulted to openai here. An unset provider means
          // "nobody chose", and llm-invoke resolves it against providers that
          // actually hold a credential. Baking a default in at this layer is
          // what made an Anthropic key look like it had no effect.
          provider: params.provider,
          model: params.model,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          systemPrompt: params.systemPrompt
        };
      }
    }
  }
  return void 0;
}
function actionToStep(action, index2) {
  const id = `step-${Date.now()}-${index2}`;
  switch (action.type) {
    case "message.send":
      return {
        id,
        type: "say",
        description: String(action.params?.content || "Send response")
      };
    case "llm.invoke": {
      const params = action.params || {};
      const systemPrompt = params.systemPrompt || "";
      let description = "Process with AI";
      if (systemPrompt) {
        const firstLine = systemPrompt.split("\n")[0].substring(0, 100);
        description = firstLine;
      }
      return {
        id,
        type: "think",
        description
      };
    }
    case "service.call":
      return {
        id,
        type: "recall",
        description: `@${action.params?.service || "service"}.${action.params?.path || "data"}`,
        params: {
          contextKey: action.params?.resultKey
        }
      };
    default:
      return {
        id,
        type: "say",
        description: `Execute: ${action.type}`
      };
  }
}
function conditionsToTrigger(trigger, conditions) {
  if (!conditions) return trigger;
  const describeCondition = (cond) => {
    if (cond.logic && cond.conditions) {
      const parts = cond.conditions.map(describeCondition);
      return parts.join(cond.logic === "or" ? " or " : " and ");
    }
    if (cond.field && cond.operator && cond.value !== void 0) {
      const field = cond.field.replace("message.", "");
      switch (cond.operator) {
        case "contains":
          return `${field} contains "${cond.value}"`;
        case "not_contains":
          return `${field} doesn't contain "${cond.value}"`;
        case "equals":
          return `${field} equals "${cond.value}"`;
        case "matches":
          return `${field} matches ${cond.value}`;
        default:
          return `${field} ${cond.operator} ${cond.value}`;
      }
    }
    return "";
  };
  const conditionDesc = describeCondition(conditions);
  return conditionDesc ? `When ${conditionDesc}` : trigger;
}
function ruleSetToRoutines(ruleSet) {
  return ruleSet.rules.filter((rule) => rule.enabled).sort((a, b) => b.priority - a.priority).map((rule, idx) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    trigger: conditionsToTrigger(rule.trigger, rule.conditions),
    steps: rule.actions.map((action, i) => actionToStep(action, i)),
    isMain: idx === 0
  }));
}
function createAssistantsListRouter() {
  const router8 = Router3();
  router8.get("/", (_req, res) => {
    const assistants = getAllLoadedAssistants().map((a) => ({
      key: a.resource.key.includes("/") ? a.resource.key.split("/").pop() : a.resource.key,
      name: a.resource.name,
      alias: a.alias || a.resource.metadata?.alias,
      // @mention alias (e.g., "logs" for @logs)
      principalId: a.config.principalId,
      description: a.resource.description,
      status: a.resource.status,
      tags: a.resource.tags || [],
      // Include tags for UI grouping
      capabilities: a.config.capabilities,
      hasHandler: !!a.router,
      hasRules: !!a.ruleSet,
      rulesCount: a.ruleSet?.rules.length || 0,
      // Include routines for UI display
      routines: a.resource.metadata?.routines || [],
      // Include LLM config for UI display (legacy format)
      llm: a.resource.metadata?.llm || {},
      // Include full LLM configuration
      llmConfigPreset: a.resource.metadata?.llmConfigPreset || "conversational",
      llmConfig: a.llmConfig || a.resource.metadata?.llmConfig || null
    }));
    res.json({ assistants });
  });
  router8.get("/mentionable", (_req, res) => {
    const mentionable = getAllLoadedAssistants().filter((a) => a.alias).map((a) => ({
      alias: a.alias,
      name: a.resource.name,
      principalId: a.config.principalId,
      key: a.resource.key.includes("/") ? a.resource.key.split("/").pop() : a.resource.key
    }));
    res.json({ mentionable });
  });
  return router8;
}
var loadedAssistants;
var init_assistant_loader = __esm({
  "../../assistants/server/src/services/assistant-loader.ts"() {
    "use strict";
    init_rule_based_handler();
    init_rules();
    init_llm_config_resolver();
    loadedAssistants = /* @__PURE__ */ new Map();
  }
});

// ../../assistants/shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  actorPrincipals: () => actorPrincipals,
  actorPrincipalsRelations: () => actorPrincipalsRelations,
  agentPrincipals: () => agentPrincipals,
  agentPrincipalsRelations: () => agentPrincipalsRelations,
  auditLogs: () => auditLogs,
  auditLogsRelations: () => auditLogsRelations,
  catalogBindings: () => catalogBindings,
  catalogBindingsRelations: () => catalogBindingsRelations,
  compiledGraphs: () => compiledGraphs,
  compiledGraphsRelations: () => compiledGraphsRelations,
  contextSnapshots: () => contextSnapshots,
  contextSnapshotsRelations: () => contextSnapshotsRelations,
  contextSourceTypeEnum: () => contextSourceTypeEnum,
  contextSources: () => contextSources,
  contextSourcesRelations: () => contextSourcesRelations,
  conversationEvents: () => conversationEvents,
  conversationEventsRelations: () => conversationEventsRelations,
  conversationParticipants: () => conversationParticipants,
  conversationParticipantsRelations: () => conversationParticipantsRelations,
  conversationStatusEnum: () => conversationStatusEnum,
  conversations: () => conversations,
  conversationsRelations: () => conversationsRelations,
  eventTypeEnum: () => eventTypeEnum,
  graphRunPriorityEnum: () => graphRunPriorityEnum,
  graphRunStatusEnum: () => graphRunStatusEnum,
  graphRuns: () => graphRuns,
  graphRunsRelations: () => graphRunsRelations,
  handoffRequests: () => handoffRequests,
  handoffRequestsRelations: () => handoffRequestsRelations,
  handoffStatusEnum: () => handoffStatusEnum,
  inferredContexts: () => inferredContexts,
  inferredContextsRelations: () => inferredContextsRelations,
  llmProviders: () => llmProviders,
  llmProvidersRelations: () => llmProvidersRelations,
  membershipRoleEnum: () => membershipRoleEnum,
  messageRoleEnum: () => messageRoleEnum,
  messages: () => messages,
  messagesRelations: () => messagesRelations,
  messagingChannelTypeEnum: () => messagingChannelTypeEnum,
  messagingChannels: () => messagingChannels,
  messagingChannelsRelations: () => messagingChannelsRelations,
  notificationStatusEnum: () => notificationStatusEnum,
  notifications: () => notifications,
  notificationsRelations: () => notificationsRelations,
  orgMemberships: () => orgMemberships,
  orgMembershipsRelations: () => orgMembershipsRelations,
  orgs: () => orgs,
  orgsRelations: () => orgsRelations,
  participantRoleEnum: () => participantRoleEnum,
  principalTypeEnum: () => principalTypeEnum,
  promptGraphs: () => promptGraphs,
  promptGraphsRelations: () => promptGraphsRelations,
  promptSequenceSteps: () => promptSequenceSteps,
  promptSequenceStepsRelations: () => promptSequenceStepsRelations,
  promptSequences: () => promptSequences,
  promptSequencesRelations: () => promptSequencesRelations,
  providerTypeEnum: () => providerTypeEnum,
  providerUsageLogs: () => providerUsageLogs,
  providerUsageLogsRelations: () => providerUsageLogsRelations,
  runLogLevelEnum: () => runLogLevelEnum,
  runLogs: () => runLogs,
  runLogsRelations: () => runLogsRelations,
  stepTypeEnum: () => stepTypeEnum,
  users: () => users,
  usersRelations: () => usersRelations
});
import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
var orgs, membershipRoleEnum, orgMemberships, users, conversationStatusEnum, conversations, participantRoleEnum, conversationParticipants, eventTypeEnum, conversationEvents, contextSnapshots, messageRoleEnum, messages, promptSequences, stepTypeEnum, promptSequenceSteps, providerTypeEnum, llmProviders, providerUsageLogs, handoffStatusEnum, handoffRequests, contextSourceTypeEnum, contextSources, inferredContexts, catalogBindings, messagingChannelTypeEnum, messagingChannels, notificationStatusEnum, notifications, auditLogs, orgsRelations, usersRelations, orgMembershipsRelations, conversationsRelations, conversationParticipantsRelations, conversationEventsRelations, contextSnapshotsRelations, messagesRelations, promptSequencesRelations, promptSequenceStepsRelations, llmProvidersRelations, providerUsageLogsRelations, handoffRequestsRelations, contextSourcesRelations, inferredContextsRelations, catalogBindingsRelations, messagingChannelsRelations, notificationsRelations, auditLogsRelations, promptGraphs, compiledGraphs, graphRunStatusEnum, graphRunPriorityEnum, graphRuns, runLogLevelEnum, runLogs, principalTypeEnum, agentPrincipals, actorPrincipals, promptGraphsRelations, compiledGraphsRelations, graphRunsRelations, runLogsRelations, agentPrincipalsRelations, actorPrincipalsRelations;
var init_schema = __esm({
  "../../assistants/shared/schema.ts"() {
    "use strict";
    orgs = pgTable("orgs", {
      id: uuid("id").primaryKey().defaultRandom(),
      name: varchar("name", { length: 255 }).notNull(),
      slug: varchar("slug", { length: 100 }).notNull().unique(),
      settings: jsonb("settings").default({}),
      entitlements: jsonb("entitlements").default([]),
      isActive: boolean("is_active").default(true),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      slugIdx: uniqueIndex("orgs_slug_idx").on(table.slug)
    }));
    membershipRoleEnum = pgEnum("membership_role", ["owner", "admin", "member", "viewer"]);
    orgMemberships = pgTable("org_memberships", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
      role: membershipRoleEnum("role").default("member").notNull(),
      permissions: jsonb("permissions").default([]),
      invitedBy: uuid("invited_by").references(() => users.id),
      invitedAt: timestamp("invited_at"),
      acceptedAt: timestamp("accepted_at"),
      isActive: boolean("is_active").default(true),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgUserIdx: uniqueIndex("memberships_org_user_idx").on(table.orgId, table.userId)
    }));
    users = pgTable("users", {
      id: uuid("id").primaryKey().defaultRandom(),
      externalId: varchar("external_id", { length: 255 }).unique(),
      email: varchar("email", { length: 255 }).notNull().unique(),
      displayName: varchar("display_name", { length: 255 }),
      avatarUrl: text("avatar_url"),
      metadata: jsonb("metadata").default({}),
      lastSeenAt: timestamp("last_seen_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      emailIdx: uniqueIndex("users_email_idx").on(table.email),
      externalIdIdx: index("users_external_id_idx").on(table.externalId)
    }));
    conversationStatusEnum = pgEnum("conversation_status", ["active", "waiting", "handoff", "resolved", "archived"]);
    conversations = pgTable("conversations", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      title: varchar("title", { length: 500 }),
      status: conversationStatusEnum("status").default("active"),
      channel: varchar("channel", { length: 50 }).default("web"),
      metadata: jsonb("metadata").default({}),
      currentSequenceId: uuid("current_sequence_id"),
      currentStepId: uuid("current_step_id"),
      resolvedAt: timestamp("resolved_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgStatusIdx: index("conversations_org_status_idx").on(table.orgId, table.status),
      orgCreatedIdx: index("conversations_org_created_idx").on(table.orgId, table.createdAt)
    }));
    participantRoleEnum = pgEnum("participant_role", ["user", "agent", "actor", "system"]);
    conversationParticipants = pgTable("conversation_participants", {
      id: uuid("id").primaryKey().defaultRandom(),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      userId: uuid("user_id").references(() => users.id),
      role: participantRoleEnum("role").notNull(),
      isActive: boolean("is_active").default(true),
      joinedAt: timestamp("joined_at").defaultNow().notNull(),
      leftAt: timestamp("left_at"),
      metadata: jsonb("metadata").default({})
    }, (table) => ({
      convUserIdx: uniqueIndex("participants_conv_user_idx").on(table.conversationId, table.userId)
    }));
    eventTypeEnum = pgEnum("event_type", ["message", "status_change", "handoff", "context_update", "participant_join", "participant_leave", "sequence_start", "sequence_step", "sequence_end", "error"]);
    conversationEvents = pgTable("conversation_events", {
      id: uuid("id").primaryKey().defaultRandom(),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      eventType: eventTypeEnum("event_type").notNull(),
      actorId: uuid("actor_id").references(() => users.id),
      actorRole: participantRoleEnum("actor_role"),
      payload: jsonb("payload").notNull(),
      sequenceNumber: integer("sequence_number").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      convSeqIdx: index("events_conv_seq_idx").on(table.conversationId, table.sequenceNumber),
      orgCreatedIdx: index("events_org_created_idx").on(table.orgId, table.createdAt)
    }));
    contextSnapshots = pgTable("context_snapshots", {
      id: uuid("id").primaryKey().defaultRandom(),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      snapshotType: varchar("snapshot_type", { length: 50 }).notNull(),
      identityContext: jsonb("identity_context").default({}),
      catalogContext: jsonb("catalog_context").default({}),
      conversationSummary: text("conversation_summary"),
      customContext: jsonb("custom_context").default({}),
      version: integer("version").default(1),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      convVersionIdx: index("snapshots_conv_version_idx").on(table.conversationId, table.version)
    }));
    messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system", "agent"]);
    messages = pgTable("messages", {
      id: uuid("id").primaryKey().defaultRandom(),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      participantId: uuid("participant_id").references(() => conversationParticipants.id),
      role: messageRoleEnum("role").notNull(),
      content: text("content").notNull(),
      metadata: jsonb("metadata").default({}),
      tokenCount: integer("token_count"),
      modelUsed: varchar("model_used", { length: 100 }),
      providerId: uuid("provider_id").references(() => llmProviders.id),
      promptSequenceStepId: uuid("prompt_sequence_step_id").references(() => promptSequenceSteps.id),
      latencyMs: integer("latency_ms"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      convCreatedIdx: index("messages_conv_created_idx").on(table.conversationId, table.createdAt),
      orgCreatedIdx: index("messages_org_created_idx").on(table.orgId, table.createdAt)
    }));
    promptSequences = pgTable("prompt_sequences", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      version: integer("version").default(1),
      isActive: boolean("is_active").default(true),
      isPublished: boolean("is_published").default(false),
      triggerConditions: jsonb("trigger_conditions").default({}),
      metadata: jsonb("metadata").default({}),
      createdBy: uuid("created_by").references(() => users.id),
      publishedAt: timestamp("published_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgNameVersionIdx: uniqueIndex("sequences_org_name_version_idx").on(table.orgId, table.name, table.version),
      orgActiveIdx: index("sequences_org_active_idx").on(table.orgId, table.isActive)
    }));
    stepTypeEnum = pgEnum("step_type", ["prompt", "condition", "tool", "handoff", "wait", "branch", "end"]);
    promptSequenceSteps = pgTable("prompt_sequence_steps", {
      id: uuid("id").primaryKey().defaultRandom(),
      sequenceId: uuid("sequence_id").references(() => promptSequences.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      stepType: stepTypeEnum("step_type").notNull(),
      orderIndex: integer("order_index").notNull(),
      promptTemplate: text("prompt_template"),
      systemPrompt: text("system_prompt"),
      modelConfig: jsonb("model_config").default({}),
      conditions: jsonb("conditions").default([]),
      nextStepOnSuccess: uuid("next_step_on_success"),
      nextStepOnFailure: uuid("next_step_on_failure"),
      toolConfig: jsonb("tool_config"),
      contextInjectors: jsonb("context_injectors").default([]),
      metadata: jsonb("metadata").default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      seqOrderIdx: uniqueIndex("steps_seq_order_idx").on(table.sequenceId, table.orderIndex)
    }));
    providerTypeEnum = pgEnum("provider_type", ["openai", "anthropic", "azure", "google", "custom"]);
    llmProviders = pgTable("llm_providers", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      providerType: providerTypeEnum("provider_type").notNull(),
      apiKeyEncrypted: text("api_key_encrypted"),
      baseUrl: text("base_url"),
      defaultModel: varchar("default_model", { length: 100 }),
      models: jsonb("models").default([]),
      routingWeight: integer("routing_weight").default(100),
      fallbackOrder: integer("fallback_order").default(0),
      isActive: boolean("is_active").default(true),
      rateLimits: jsonb("rate_limits").default({}),
      metadata: jsonb("metadata").default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgActiveIdx: index("providers_org_active_idx").on(table.orgId, table.isActive)
    }));
    providerUsageLogs = pgTable("provider_usage_logs", {
      id: uuid("id").primaryKey().defaultRandom(),
      providerId: uuid("provider_id").references(() => llmProviders.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      conversationId: uuid("conversation_id").references(() => conversations.id),
      messageId: uuid("message_id").references(() => messages.id),
      model: varchar("model", { length: 100 }).notNull(),
      promptTokens: integer("prompt_tokens"),
      completionTokens: integer("completion_tokens"),
      totalTokens: integer("total_tokens"),
      latencyMs: integer("latency_ms"),
      success: boolean("success").default(true),
      errorMessage: text("error_message"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      orgCreatedIdx: index("usage_org_created_idx").on(table.orgId, table.createdAt),
      providerCreatedIdx: index("usage_provider_created_idx").on(table.providerId, table.createdAt)
    }));
    handoffStatusEnum = pgEnum("handoff_status", ["pending", "assigned", "in_progress", "resolved", "cancelled", "expired"]);
    handoffRequests = pgTable("handoff_requests", {
      id: uuid("id").primaryKey().defaultRandom(),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      requestedBy: uuid("requested_by").references(() => users.id),
      assignedTo: uuid("assigned_to").references(() => users.id),
      status: handoffStatusEnum("status").default("pending"),
      reason: text("reason"),
      priority: integer("priority").default(0),
      contextSummary: text("context_summary"),
      contextSnapshotId: uuid("context_snapshot_id").references(() => contextSnapshots.id),
      tags: jsonb("tags").default([]),
      metadata: jsonb("metadata").default({}),
      assignedAt: timestamp("assigned_at"),
      resolvedAt: timestamp("resolved_at"),
      expiresAt: timestamp("expires_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgStatusIdx: index("handoff_org_status_idx").on(table.orgId, table.status),
      assignedStatusIdx: index("handoff_assigned_status_idx").on(table.assignedTo, table.status)
    }));
    contextSourceTypeEnum = pgEnum("context_source_type", ["identity", "catalog", "custom", "webhook", "database"]);
    contextSources = pgTable("context_sources", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      sourceType: contextSourceTypeEnum("source_type").notNull(),
      config: jsonb("config").default({}),
      isActive: boolean("is_active").default(true),
      refreshInterval: integer("refresh_interval"),
      lastRefreshedAt: timestamp("last_refreshed_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    inferredContexts = pgTable("inferred_contexts", {
      id: uuid("id").primaryKey().defaultRandom(),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      contextType: varchar("context_type", { length: 100 }).notNull(),
      data: jsonb("data").notNull(),
      confidence: integer("confidence"),
      sourceId: uuid("source_id").references(() => contextSources.id),
      expiresAt: timestamp("expires_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      convTypeIdx: index("inferred_conv_type_idx").on(table.conversationId, table.contextType)
    }));
    catalogBindings = pgTable("catalog_bindings", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      catalogItemId: varchar("catalog_item_id", { length: 255 }).notNull(),
      catalogItemType: varchar("catalog_item_type", { length: 100 }).notNull(),
      localAlias: varchar("local_alias", { length: 255 }),
      config: jsonb("config").default({}),
      isActive: boolean("is_active").default(true),
      syncedAt: timestamp("synced_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgItemIdx: uniqueIndex("catalog_org_item_idx").on(table.orgId, table.catalogItemId)
    }));
    messagingChannelTypeEnum = pgEnum("messaging_channel_type", ["email", "sms", "webhook", "slack", "teams", "push"]);
    messagingChannels = pgTable("messaging_channels", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      channelType: messagingChannelTypeEnum("channel_type").notNull(),
      config: jsonb("config").default({}),
      isActive: boolean("is_active").default(true),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "delivered", "failed", "cancelled"]);
    notifications = pgTable("notifications", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      channelId: uuid("channel_id").references(() => messagingChannels.id),
      recipientId: uuid("recipient_id").references(() => users.id),
      conversationId: uuid("conversation_id").references(() => conversations.id),
      notificationType: varchar("notification_type", { length: 100 }).notNull(),
      subject: varchar("subject", { length: 500 }),
      content: text("content").notNull(),
      metadata: jsonb("metadata").default({}),
      status: notificationStatusEnum("status").default("pending"),
      sentAt: timestamp("sent_at"),
      deliveredAt: timestamp("delivered_at"),
      failedAt: timestamp("failed_at"),
      errorMessage: text("error_message"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      orgStatusIdx: index("notifications_org_status_idx").on(table.orgId, table.status),
      recipientCreatedIdx: index("notifications_recipient_created_idx").on(table.recipientId, table.createdAt)
    }));
    auditLogs = pgTable("audit_logs", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      userId: uuid("user_id").references(() => users.id),
      action: varchar("action", { length: 100 }).notNull(),
      resourceType: varchar("resource_type", { length: 100 }).notNull(),
      resourceId: uuid("resource_id"),
      changes: jsonb("changes"),
      ipAddress: varchar("ip_address", { length: 45 }),
      userAgent: text("user_agent"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      orgCreatedIdx: index("audit_org_created_idx").on(table.orgId, table.createdAt),
      userCreatedIdx: index("audit_user_created_idx").on(table.userId, table.createdAt),
      resourceIdx: index("audit_resource_idx").on(table.resourceType, table.resourceId)
    }));
    orgsRelations = relations(orgs, ({ many }) => ({
      memberships: many(orgMemberships),
      conversations: many(conversations),
      promptSequences: many(promptSequences),
      llmProviders: many(llmProviders),
      catalogBindings: many(catalogBindings),
      messagingChannels: many(messagingChannels)
    }));
    usersRelations = relations(users, ({ many }) => ({
      memberships: many(orgMemberships),
      participations: many(conversationParticipants)
    }));
    orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
      org: one(orgs, { fields: [orgMemberships.orgId], references: [orgs.id] }),
      user: one(users, { fields: [orgMemberships.userId], references: [users.id] }),
      inviter: one(users, { fields: [orgMemberships.invitedBy], references: [users.id] })
    }));
    conversationsRelations = relations(conversations, ({ one, many }) => ({
      org: one(orgs, { fields: [conversations.orgId], references: [orgs.id] }),
      currentSequence: one(promptSequences, { fields: [conversations.currentSequenceId], references: [promptSequences.id] }),
      currentStep: one(promptSequenceSteps, { fields: [conversations.currentStepId], references: [promptSequenceSteps.id] }),
      participants: many(conversationParticipants),
      events: many(conversationEvents),
      messages: many(messages),
      handoffRequests: many(handoffRequests),
      inferredContexts: many(inferredContexts),
      contextSnapshots: many(contextSnapshots)
    }));
    conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
      conversation: one(conversations, { fields: [conversationParticipants.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [conversationParticipants.orgId], references: [orgs.id] }),
      user: one(users, { fields: [conversationParticipants.userId], references: [users.id] })
    }));
    conversationEventsRelations = relations(conversationEvents, ({ one }) => ({
      conversation: one(conversations, { fields: [conversationEvents.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [conversationEvents.orgId], references: [orgs.id] }),
      actor: one(users, { fields: [conversationEvents.actorId], references: [users.id] })
    }));
    contextSnapshotsRelations = relations(contextSnapshots, ({ one }) => ({
      conversation: one(conversations, { fields: [contextSnapshots.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [contextSnapshots.orgId], references: [orgs.id] })
    }));
    messagesRelations = relations(messages, ({ one }) => ({
      conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [messages.orgId], references: [orgs.id] }),
      participant: one(conversationParticipants, { fields: [messages.participantId], references: [conversationParticipants.id] }),
      provider: one(llmProviders, { fields: [messages.providerId], references: [llmProviders.id] }),
      promptStep: one(promptSequenceSteps, { fields: [messages.promptSequenceStepId], references: [promptSequenceSteps.id] })
    }));
    promptSequencesRelations = relations(promptSequences, ({ one, many }) => ({
      org: one(orgs, { fields: [promptSequences.orgId], references: [orgs.id] }),
      createdByUser: one(users, { fields: [promptSequences.createdBy], references: [users.id] }),
      steps: many(promptSequenceSteps)
    }));
    promptSequenceStepsRelations = relations(promptSequenceSteps, ({ one }) => ({
      sequence: one(promptSequences, { fields: [promptSequenceSteps.sequenceId], references: [promptSequences.id] }),
      org: one(orgs, { fields: [promptSequenceSteps.orgId], references: [orgs.id] })
    }));
    llmProvidersRelations = relations(llmProviders, ({ one, many }) => ({
      org: one(orgs, { fields: [llmProviders.orgId], references: [orgs.id] }),
      usageLogs: many(providerUsageLogs)
    }));
    providerUsageLogsRelations = relations(providerUsageLogs, ({ one }) => ({
      provider: one(llmProviders, { fields: [providerUsageLogs.providerId], references: [llmProviders.id] }),
      org: one(orgs, { fields: [providerUsageLogs.orgId], references: [orgs.id] }),
      conversation: one(conversations, { fields: [providerUsageLogs.conversationId], references: [conversations.id] }),
      message: one(messages, { fields: [providerUsageLogs.messageId], references: [messages.id] })
    }));
    handoffRequestsRelations = relations(handoffRequests, ({ one }) => ({
      conversation: one(conversations, { fields: [handoffRequests.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [handoffRequests.orgId], references: [orgs.id] }),
      requestedByUser: one(users, { fields: [handoffRequests.requestedBy], references: [users.id] }),
      assignedUser: one(users, { fields: [handoffRequests.assignedTo], references: [users.id] }),
      contextSnapshot: one(contextSnapshots, { fields: [handoffRequests.contextSnapshotId], references: [contextSnapshots.id] })
    }));
    contextSourcesRelations = relations(contextSources, ({ one, many }) => ({
      org: one(orgs, { fields: [contextSources.orgId], references: [orgs.id] }),
      inferredContexts: many(inferredContexts)
    }));
    inferredContextsRelations = relations(inferredContexts, ({ one }) => ({
      conversation: one(conversations, { fields: [inferredContexts.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [inferredContexts.orgId], references: [orgs.id] }),
      source: one(contextSources, { fields: [inferredContexts.sourceId], references: [contextSources.id] })
    }));
    catalogBindingsRelations = relations(catalogBindings, ({ one }) => ({
      org: one(orgs, { fields: [catalogBindings.orgId], references: [orgs.id] })
    }));
    messagingChannelsRelations = relations(messagingChannels, ({ one, many }) => ({
      org: one(orgs, { fields: [messagingChannels.orgId], references: [orgs.id] }),
      notifications: many(notifications)
    }));
    notificationsRelations = relations(notifications, ({ one }) => ({
      org: one(orgs, { fields: [notifications.orgId], references: [orgs.id] }),
      channel: one(messagingChannels, { fields: [notifications.channelId], references: [messagingChannels.id] }),
      recipient: one(users, { fields: [notifications.recipientId], references: [users.id] }),
      conversation: one(conversations, { fields: [notifications.conversationId], references: [conversations.id] })
    }));
    auditLogsRelations = relations(auditLogs, ({ one }) => ({
      org: one(orgs, { fields: [auditLogs.orgId], references: [orgs.id] }),
      user: one(users, { fields: [auditLogs.userId], references: [users.id] })
    }));
    promptGraphs = pgTable("prompt_graphs", {
      id: uuid("id").primaryKey().defaultRandom(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      version: integer("version").default(1).notNull(),
      graphJson: jsonb("graph_json").notNull(),
      // { components: [], edges: [] }
      isPublished: boolean("is_published").default(false),
      triggerConditions: jsonb("trigger_conditions").default({}),
      logLevel: varchar("log_level", { length: 20 }).default("warn"),
      // debug, info, warn, error
      createdBy: uuid("created_by").references(() => users.id),
      publishedAt: timestamp("published_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgNameVersionIdx: uniqueIndex("graphs_org_name_version_idx").on(table.orgId, table.name, table.version),
      orgPublishedIdx: index("graphs_org_published_idx").on(table.orgId, table.isPublished)
    }));
    compiledGraphs = pgTable("compiled_graphs", {
      id: uuid("id").primaryKey().defaultRandom(),
      graphId: uuid("graph_id").references(() => promptGraphs.id, { onDelete: "cascade" }).notNull(),
      version: integer("version").notNull(),
      bytecode: text("bytecode").notNull(),
      // Compiled/IR representation
      checksum: varchar("checksum", { length: 64 }),
      compiledAt: timestamp("compiled_at").defaultNow().notNull()
    }, (table) => ({
      graphVersionIdx: uniqueIndex("compiled_graph_version_idx").on(table.graphId, table.version)
    }));
    graphRunStatusEnum = pgEnum("graph_run_status", ["running", "paused", "waiting", "completed", "failed", "cancelled"]);
    graphRunPriorityEnum = pgEnum("graph_run_priority", ["low", "normal", "high", "critical"]);
    graphRuns = pgTable("graph_runs", {
      id: uuid("id").primaryKey().defaultRandom(),
      graphId: uuid("graph_id").references(() => promptGraphs.id, { onDelete: "set null" }),
      compiledGraphId: uuid("compiled_graph_id").references(() => compiledGraphs.id),
      conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      traceId: varchar("trace_id", { length: 64 }),
      state: jsonb("state").default({}),
      // Current positions, outputs, queued messages
      status: graphRunStatusEnum("status").default("running"),
      priority: graphRunPriorityEnum("priority").default("normal"),
      metadata: jsonb("metadata").default({}),
      startedAt: timestamp("started_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at"),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgStatusIdx: index("runs_org_status_idx").on(table.orgId, table.status),
      conversationIdx: index("runs_conversation_idx").on(table.conversationId),
      traceIdx: index("runs_trace_idx").on(table.traceId)
    }));
    runLogLevelEnum = pgEnum("run_log_level", ["debug", "info", "warn", "error"]);
    runLogs = pgTable("run_logs", {
      id: uuid("id").primaryKey().defaultRandom(),
      runId: uuid("run_id").references(() => graphRuns.id, { onDelete: "cascade" }).notNull(),
      level: runLogLevelEnum("level").default("info"),
      nodeId: varchar("node_id", { length: 100 }),
      message: text("message").notNull(),
      data: jsonb("data"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      runLevelIdx: index("logs_run_level_idx").on(table.runId, table.level),
      runCreatedIdx: index("logs_run_created_idx").on(table.runId, table.createdAt)
    }));
    principalTypeEnum = pgEnum("principal_type", ["user", "agent", "service", "assistant"]);
    agentPrincipals = pgTable("bot_principals", {
      id: uuid("id").primaryKey().defaultRandom(),
      principalId: varchar("principal_id", { length: 255 }).notNull().unique(),
      orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
      principalType: principalTypeEnum("principal_type").default("agent"),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      defaultGraphId: uuid("default_graph_id").references(() => promptGraphs.id),
      capabilities: jsonb("capabilities").default([]),
      // ['cap:messaging.interrupt', 'cap:messaging.route']
      webhooks: jsonb("webhooks").default({}),
      // { message: 'url', control: 'url' }
      assistantConfig: jsonb("assistant_config").default({}),
      // For assistant-type principals: { endpoint, model, etc. }
      isActive: boolean("is_active").default(true),
      metadata: jsonb("metadata").default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      orgPrincipalIdx: uniqueIndex("bot_org_principal_idx").on(table.orgId, table.principalId),
      principalTypeIdx: index("bot_principal_type_idx").on(table.principalType)
    }));
    actorPrincipals = agentPrincipals;
    promptGraphsRelations = relations(promptGraphs, ({ one, many }) => ({
      org: one(orgs, { fields: [promptGraphs.orgId], references: [orgs.id] }),
      createdByUser: one(users, { fields: [promptGraphs.createdBy], references: [users.id] }),
      compiledVersions: many(compiledGraphs),
      runs: many(graphRuns)
    }));
    compiledGraphsRelations = relations(compiledGraphs, ({ one }) => ({
      graph: one(promptGraphs, { fields: [compiledGraphs.graphId], references: [promptGraphs.id] })
    }));
    graphRunsRelations = relations(graphRuns, ({ one, many }) => ({
      graph: one(promptGraphs, { fields: [graphRuns.graphId], references: [promptGraphs.id] }),
      compiledGraph: one(compiledGraphs, { fields: [graphRuns.compiledGraphId], references: [compiledGraphs.id] }),
      conversation: one(conversations, { fields: [graphRuns.conversationId], references: [conversations.id] }),
      org: one(orgs, { fields: [graphRuns.orgId], references: [orgs.id] }),
      logs: many(runLogs)
    }));
    runLogsRelations = relations(runLogs, ({ one }) => ({
      run: one(graphRuns, { fields: [runLogs.runId], references: [graphRuns.id] })
    }));
    agentPrincipalsRelations = relations(agentPrincipals, ({ one }) => ({
      org: one(orgs, { fields: [agentPrincipals.orgId], references: [orgs.id] }),
      defaultGraph: one(promptGraphs, { fields: [agentPrincipals.defaultGraphId], references: [promptGraphs.id] })
    }));
    actorPrincipalsRelations = agentPrincipalsRelations;
  }
});

// ../../assistants/server/src/lib/memory-schema.ts
var MEMORY_SCHEMA_SQL;
var init_memory_schema = __esm({
  "../../assistants/server/src/lib/memory-schema.ts"() {
    "use strict";
    MEMORY_SCHEMA_SQL = `
CREATE TYPE "membership_role" AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE "conversation_status" AS ENUM ('active', 'waiting', 'handoff', 'resolved', 'archived');
CREATE TYPE "provider_type" AS ENUM ('openai', 'anthropic', 'azure', 'google', 'custom');
CREATE TYPE "graph_run_status" AS ENUM ('running', 'paused', 'waiting', 'completed', 'failed', 'cancelled');
CREATE TYPE "graph_run_priority" AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE "run_log_level" AS ENUM ('debug', 'info', 'warn', 'error');
CREATE TYPE "principal_type" AS ENUM ('user', 'agent', 'service', 'assistant');

CREATE TABLE "orgs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "entitlements" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_id" varchar(255) UNIQUE,
  "email" varchar(255) NOT NULL UNIQUE,
  "display_name" varchar(255),
  "avatar_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "membership_role" DEFAULT 'member' NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb,
  "invited_by" uuid REFERENCES "users"("id"),
  "invited_at" timestamp,
  "accepted_at" timestamp,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("org_id", "user_id")
);

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "title" varchar(500),
  "status" "conversation_status" DEFAULT 'active',
  "channel" varchar(50) DEFAULT 'web',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "current_sequence_id" uuid,
  "current_step_id" uuid,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "llm_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "provider_type" "provider_type" NOT NULL,
  "api_key_encrypted" text,
  "base_url" text,
  "default_model" varchar(100),
  "models" jsonb DEFAULT '[]'::jsonb,
  "routing_weight" integer DEFAULT 100,
  "fallback_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "rate_limits" jsonb DEFAULT '{}'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "prompt_graphs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "version" integer DEFAULT 1 NOT NULL,
  "graph_json" jsonb NOT NULL,
  "is_published" boolean DEFAULT false,
  "trigger_conditions" jsonb DEFAULT '{}'::jsonb,
  "log_level" varchar(20) DEFAULT 'warn',
  "created_by" uuid REFERENCES "users"("id"),
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "compiled_graphs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "graph_id" uuid NOT NULL REFERENCES "prompt_graphs"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "bytecode" text NOT NULL,
  "checksum" varchar(64),
  "compiled_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("graph_id", "version")
);

CREATE TABLE "graph_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "graph_id" uuid REFERENCES "prompt_graphs"("id") ON DELETE SET NULL,
  "compiled_graph_id" uuid REFERENCES "compiled_graphs"("id"),
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "trace_id" varchar(64),
  "state" jsonb DEFAULT '{}'::jsonb,
  "status" "graph_run_status" DEFAULT 'running',
  "priority" "graph_run_priority" DEFAULT 'normal',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "run_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "graph_runs"("id") ON DELETE CASCADE,
  "level" "run_log_level" DEFAULT 'info',
  "node_id" varchar(100),
  "message" text NOT NULL,
  "data" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "bot_principals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "principal_id" varchar(255) NOT NULL UNIQUE,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "principal_type" "principal_type" DEFAULT 'agent',
  "name" varchar(255) NOT NULL,
  "description" text,
  "default_graph_id" uuid REFERENCES "prompt_graphs"("id"),
  "capabilities" jsonb DEFAULT '[]'::jsonb,
  "webhooks" jsonb DEFAULT '{}'::jsonb,
  "assistant_config" jsonb DEFAULT '{}'::jsonb,
  "is_active" boolean DEFAULT true,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
`;
  }
});

// ../../assistants/server/src/lib/db.ts
var db_exports = {};
__export(db_exports, {
  clearSessionContext: () => clearSessionContext,
  close: () => close,
  database: () => database,
  db: () => db,
  exportToFile: () => exportToFile,
  isMemory: () => isMemory,
  pool: () => pool,
  setRLSContext: () => setRLSContext,
  setSessionContext: () => setSessionContext
});
import { initializeDatabase, setSessionContext, clearSessionContext } from "@symbia/db";
async function setRLSContext(context) {
  await setSessionContext(pool, {
    orgId: context.orgId || "",
    userId: context.userId || "anonymous",
    isSuperAdmin: context.isSuperAdmin,
    capabilities: context.capabilities,
    serviceId: "assistants"
  });
}
var database, db, pool, isMemory, exportToFile, close;
var init_db = __esm({
  "../../assistants/server/src/lib/db.ts"() {
    "use strict";
    init_schema();
    init_memory_schema();
    database = initializeDatabase({
      serviceId: "assistants-service",
      memorySchema: MEMORY_SCHEMA_SQL,
      memoryDbEnvVar: "ASSISTANTS_USE_MEMORY_DB"
    }, schema_exports);
    ({ db, pool, isMemory, exportToFile, close } = database);
  }
});

// ../../assistants/server/src/service.ts
init_assistant_loader();
init_rules();

// ../../assistants/server/src/routes.ts
init_db();

// ../../assistants/server/src/routes/graphs.ts
init_db();
init_schema();
import { Router as Router4 } from "express";
import { eq, and, desc } from "drizzle-orm";
function getParam2(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var router2 = Router4();
function requireOrgId(req, res) {
  const authedOrgId = req.orgId;
  const orgId = authedOrgId || req.headers["x-org-id"];
  if (!orgId) {
    res.status(400).json({ error: "orgId required (authenticate, or provide X-Org-Id header)" });
    return null;
  }
  return orgId;
}
router2.get("/", async (req, res) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;
    const graphs = await db.select().from(promptGraphs).where(eq(promptGraphs.orgId, orgId)).orderBy(desc(promptGraphs.updatedAt));
    res.json(graphs);
  } catch (error) {
    console.error("Error fetching graphs:", error);
    res.status(500).json({ error: "Failed to fetch graphs" });
  }
});
router2.get("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;
    const id = getParam2(req.params, "id");
    const graph = await db.select().from(promptGraphs).where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId))).limit(1);
    if (!graph.length) {
      return res.status(404).json({ error: "Graph not found" });
    }
    res.json(graph[0]);
  } catch (error) {
    console.error("Error fetching graph:", error);
    res.status(500).json({ error: "Failed to fetch graph" });
  }
});
router2.post("/", async (req, res) => {
  try {
    const { orgId, name, description, graphJson, triggerConditions, logLevel } = req.body;
    if (!orgId || !name || !graphJson) {
      return res.status(400).json({ error: "orgId, name, and graphJson required" });
    }
    if (typeof graphJson !== "object" || graphJson === null) {
      return res.status(400).json({ error: "graphJson must be an object" });
    }
    const [newGraph] = await db.insert(promptGraphs).values({
      orgId,
      name,
      description,
      graphJson,
      triggerConditions: triggerConditions || {},
      logLevel: logLevel || "warn"
    }).returning();
    res.status(201).json(newGraph);
  } catch (error) {
    const code = error?.code ?? error?.cause?.code;
    if (code === "23503") {
      return res.status(400).json({ error: "Unknown orgId (no such organization)" });
    }
    if (code === "22P02") {
      return res.status(400).json({ error: "Invalid id format" });
    }
    console.error("Error creating graph:", error);
    res.status(500).json({ error: "Failed to create graph" });
  }
});
router2.put("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;
    const id = getParam2(req.params, "id");
    const { name, description, graphJson, triggerConditions, logLevel } = req.body;
    const [updated] = await db.update(promptGraphs).set({
      name,
      description,
      graphJson,
      triggerConditions,
      logLevel,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId))).returning();
    if (!updated) {
      return res.status(404).json({ error: "Graph not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating graph:", error);
    res.status(500).json({ error: "Failed to update graph" });
  }
});
router2.delete("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;
    const id = getParam2(req.params, "id");
    const [deleted] = await db.delete(promptGraphs).where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId))).returning();
    if (!deleted) {
      return res.status(404).json({ error: "Graph not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting graph:", error);
    res.status(500).json({ error: "Failed to delete graph" });
  }
});
router2.post("/:id/publish", async (req, res) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;
    const id = getParam2(req.params, "id");
    const graph = await db.select().from(promptGraphs).where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId))).limit(1);
    if (!graph.length) {
      return res.status(404).json({ error: "Graph not found" });
    }
    const graphData = graph[0];
    const bytecode = JSON.stringify({
      compiled: true,
      version: graphData.version,
      nodes: graphData.graphJson?.components || [],
      edges: graphData.graphJson?.edges || [],
      compiledAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const checksum = Buffer.from(bytecode).toString("base64").slice(0, 64);
    const [compiled] = await db.insert(compiledGraphs).values({
      graphId: id,
      version: graphData.version,
      bytecode,
      checksum
    }).returning();
    await db.update(promptGraphs).set({
      isPublished: true,
      publishedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)));
    res.json({ success: true, compiled });
  } catch (error) {
    console.error("Error publishing graph:", error);
    res.status(500).json({ error: "Failed to publish graph" });
  }
});
router2.get("/:id/runs", async (req, res) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;
    const id = getParam2(req.params, "id");
    const graph = await db.select().from(promptGraphs).where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId))).limit(1);
    if (!graph.length) {
      return res.status(404).json({ error: "Graph not found" });
    }
    const runs = await db.select().from(graphRuns).where(and(eq(graphRuns.graphId, id), eq(graphRuns.orgId, orgId))).orderBy(desc(graphRuns.startedAt)).limit(100);
    res.json(runs);
  } catch (error) {
    console.error("Error fetching runs:", error);
    res.status(500).json({ error: "Failed to fetch runs" });
  }
});
var graphs_default = router2;

// ../../assistants/server/src/routes/runs.ts
init_db();
init_schema();
import { Router as Router5 } from "express";
import { eq as eq2, and as and2, desc as desc2 } from "drizzle-orm";
function getParam3(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var router3 = Router5();
function requireOrgId2(req, res) {
  const authedOrgId = req.orgId;
  const orgId = authedOrgId || req.headers["x-org-id"];
  if (!orgId) {
    res.status(400).json({ error: "orgId required (authenticate, or provide X-Org-Id header)" });
    return null;
  }
  return orgId;
}
router3.get("/", async (req, res) => {
  try {
    const orgId = requireOrgId2(req, res);
    if (!orgId) return;
    const { conversationId, graphId, status } = req.query;
    let conditions = [eq2(graphRuns.orgId, orgId)];
    if (conversationId) conditions.push(eq2(graphRuns.conversationId, conversationId));
    if (graphId) conditions.push(eq2(graphRuns.graphId, graphId));
    if (status) conditions.push(eq2(graphRuns.status, status));
    const runs = await db.select().from(graphRuns).where(and2(...conditions)).orderBy(desc2(graphRuns.startedAt)).limit(100);
    res.json({ runs });
  } catch (error) {
    console.error("Error fetching runs:", error);
    res.status(500).json({ error: "Failed to fetch runs" });
  }
});
router3.get("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId2(req, res);
    if (!orgId) return;
    const id = getParam3(req.params, "id");
    const run = await db.select().from(graphRuns).where(and2(eq2(graphRuns.id, id), eq2(graphRuns.orgId, orgId))).limit(1);
    if (!run.length) {
      return res.status(404).json({ error: "Run not found" });
    }
    res.json({ run: run[0] });
  } catch (error) {
    console.error("Error fetching run:", error);
    res.status(500).json({ error: "Failed to fetch run" });
  }
});
router3.get("/:id/logs", async (req, res) => {
  try {
    const orgId = requireOrgId2(req, res);
    if (!orgId) return;
    const id = getParam3(req.params, "id");
    const { level } = req.query;
    const run = await db.select().from(graphRuns).where(and2(eq2(graphRuns.id, id), eq2(graphRuns.orgId, orgId))).limit(1);
    if (!run.length) {
      return res.status(404).json({ error: "Run not found" });
    }
    let conditions = [eq2(runLogs.runId, id)];
    if (level) conditions.push(eq2(runLogs.level, level));
    const logs = await db.select().from(runLogs).where(and2(...conditions)).orderBy(desc2(runLogs.createdAt)).limit(500);
    res.json({ logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});
var runs_default = router3;

// ../../assistants/server/src/routes.ts
init_auth();

// ../../assistants/server/src/routes/actors.ts
init_db();
init_schema();
import { Router as Router6 } from "express";
import { eq as eq3, and as and3, desc as desc3 } from "drizzle-orm";
function getParam4(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var router4 = Router6();
function requireOrgId3(req, res) {
  const orgId = req.headers["x-org-id"] || req.query.orgId || req.body?.orgId;
  if (!orgId) {
    res.status(400).json({ error: "orgId required (via X-Org-Id header, query param, or body)" });
    return null;
  }
  return orgId;
}
router4.get("/", async (req, res) => {
  try {
    const orgId = requireOrgId3(req, res);
    if (!orgId) return;
    const principalType = req.query.type;
    let query = db.select().from(agentPrincipals).where(eq3(agentPrincipals.orgId, orgId)).orderBy(desc3(agentPrincipals.createdAt));
    const agents = await query;
    const filtered = principalType ? agents.filter((a) => a.principalType === principalType) : agents;
    res.json(filtered);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});
router4.get("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId3(req, res);
    if (!orgId) return;
    const id = getParam4(req.params, "id");
    const agent = await db.select().from(agentPrincipals).where(and3(eq3(agentPrincipals.id, id), eq3(agentPrincipals.orgId, orgId))).limit(1);
    if (!agent.length) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(agent[0]);
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});
router4.post("/", async (req, res) => {
  try {
    const { orgId, principalId, principalType, name, description, defaultGraphId, capabilities, webhooks, assistantConfig } = req.body;
    if (!orgId || !principalId || !name) {
      return res.status(400).json({ error: "orgId, principalId, and name required" });
    }
    const [newAgent] = await db.insert(agentPrincipals).values({
      orgId,
      principalId,
      principalType: principalType || "agent",
      name,
      description,
      defaultGraphId,
      capabilities: capabilities || ["cap:messaging.interrupt"],
      webhooks: webhooks || {},
      assistantConfig: assistantConfig || {}
    }).returning();
    res.status(201).json(newAgent);
  } catch (error) {
    const code = error?.code ?? error?.cause?.code;
    if (code === "23503") {
      return res.status(400).json({ error: "Unknown orgId or defaultGraphId (no such record)" });
    }
    if (code === "22P02") {
      return res.status(400).json({ error: "Invalid id format" });
    }
    if (code === "23505") {
      return res.status(400).json({ error: "An actor with this principalId already exists" });
    }
    console.error("Error creating agent:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});
router4.put("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId3(req, res);
    if (!orgId) return;
    const id = getParam4(req.params, "id");
    const { name, description, defaultGraphId, capabilities, webhooks, assistantConfig, isActive } = req.body;
    const [updated] = await db.update(agentPrincipals).set({
      name,
      description,
      defaultGraphId,
      capabilities,
      webhooks,
      assistantConfig,
      isActive,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and3(eq3(agentPrincipals.id, id), eq3(agentPrincipals.orgId, orgId))).returning();
    if (!updated) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});
router4.delete("/:id", async (req, res) => {
  try {
    const orgId = requireOrgId3(req, res);
    if (!orgId) return;
    const id = getParam4(req.params, "id");
    const [deleted] = await db.delete(agentPrincipals).where(and3(eq3(agentPrincipals.id, id), eq3(agentPrincipals.orgId, orgId))).returning();
    if (!deleted) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});
var actors_default = router4;

// ../../assistants/server/src/routes/webhooks.ts
init_db();
init_schema();
init_run_coordinator();
init_conversation_memory();
init_conversational_turns();
init_provenance();
init_assistant_loader();
init_integrations_client();
import { Router as Router7 } from "express";
import { eq as eq4, and as and4, desc as desc4 } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createMessagingClient as createMessagingClient2 } from "@symbia/messaging-client";
import { getAgentToken, createIdentityClient as createIdentityClient2, clearAgentToken } from "@symbia/id";
import {
  emitEvent as emitEvent2,
  emitClaim,
  emitDefer,
  emitObserve,
  waitForClaimWindow
} from "@symbia/relay";
import { DEFAULT_ORG_IDS } from "@symbia/seed";
var DEFAULT_ORG_ID = DEFAULT_ORG_IDS.SYMBIA_LABS;
var router5 = Router7();
var bootstrapTokenCache = /* @__PURE__ */ new Map();
var catalogCache = null;
var catalogCacheExpiry = 0;
var BOOTSTRAP_AGENT_CREDENTIAL2 = process.env.AGENT_CREDENTIAL || "symbia-agent-dev-secret-32chars-min!!";
async function getCatalogResources() {
  const now = Date.now();
  if (catalogCache && now < catalogCacheExpiry) {
    return catalogCache;
  }
  try {
    const catalogBaseUrl = process.env.CATALOG_BASE_URL || "http://localhost:5003";
    const response = await fetch(`${catalogBaseUrl}/symbia-namespace`);
    if (!response.ok) {
      console.warn(`[Webhook] Failed to fetch catalog: ${response.status}`);
      return void 0;
    }
    const data = await response.json();
    catalogCache = { resources: data.resources || [] };
    catalogCacheExpiry = now + 5 * 60 * 1e3;
    console.log(`[Webhook] Loaded ${catalogCache.resources.length} catalog resources`);
    return catalogCache;
  } catch (error) {
    console.warn(`[Webhook] Error fetching catalog:`, error);
    return void 0;
  }
}
async function getAssistantToken(assistantUserId, assistantKey, forceRefresh = false) {
  const loadedAssistant = getLoadedAssistant(assistantKey);
  if (loadedAssistant?.resource.isBootstrap) {
    if (forceRefresh) {
      bootstrapTokenCache.delete(assistantUserId);
    }
    let token = bootstrapTokenCache.get(assistantUserId);
    if (!token) {
      const identityClient = createIdentityClient2();
      const credential = BOOTSTRAP_AGENT_CREDENTIAL2;
      try {
        const result = await identityClient.registerAgent({
          agentId: assistantUserId,
          credential,
          name: loadedAssistant.resource.name,
          capabilities: loadedAssistant.config.capabilities
        });
        token = result.token;
        bootstrapTokenCache.set(assistantUserId, token);
        console.log(`[Webhook] Registered bootstrap assistant for token: ${assistantKey}`);
      } catch (regError) {
        try {
          const loginResult = await identityClient.loginAgent(assistantUserId, credential);
          token = loginResult.token;
          bootstrapTokenCache.set(assistantUserId, token);
          console.log(`[Webhook] Got existing token for bootstrap assistant: ${assistantKey}`);
        } catch (loginError) {
          console.error(`[Webhook] Failed to get token for bootstrap assistant ${assistantKey}:`, loginError);
          return void 0;
        }
      }
    }
    return token;
  }
  if (forceRefresh) {
    clearAgentToken(assistantUserId);
  }
  try {
    const token = await getAgentToken(assistantUserId);
    return token;
  } catch (error) {
    console.error(`[Webhook] Failed to get token for catalog assistant ${assistantKey}:`, error);
    return void 0;
  }
}
async function getAssistantMessagingClient(assistantUserId, assistantKey) {
  const loadedAssistant = getLoadedAssistant(assistantKey);
  if (loadedAssistant?.resource.isBootstrap) {
    let token = bootstrapTokenCache.get(assistantUserId);
    if (!token) {
      const identityClient = createIdentityClient2();
      try {
        const result = await identityClient.registerAgent({
          agentId: assistantUserId,
          credential: BOOTSTRAP_AGENT_CREDENTIAL2,
          name: loadedAssistant.resource.name,
          capabilities: loadedAssistant.config.capabilities
        });
        token = result.token;
        bootstrapTokenCache.set(assistantUserId, token);
        console.log(`[Webhook] Registered bootstrap assistant: ${assistantKey}`);
      } catch (regError) {
        try {
          const loginResult = await identityClient.loginAgent(assistantUserId, BOOTSTRAP_AGENT_CREDENTIAL2);
          token = loginResult.token;
          bootstrapTokenCache.set(assistantUserId, token);
          console.log(`[Webhook] Got existing token for bootstrap assistant: ${assistantKey}`);
        } catch (loginError) {
          console.error(`[Webhook] Failed to authenticate bootstrap assistant ${assistantKey}:`, loginError);
          throw loginError;
        }
      }
    }
    const client2 = createMessagingClient2({ token });
    return { client: client2, asUserId: void 0 };
  }
  const agentToken = await getAgentToken(assistantUserId);
  console.log(`[Webhook] Using agent token for catalog assistant: ${assistantKey}`);
  const client = createMessagingClient2({ token: agentToken });
  return { client, asUserId: void 0 };
}
router5.post("/message", async (req, res) => {
  try {
    const envelope = req.body;
    if (!envelope.conversationId || !envelope.orgId || !envelope.to?.principalId) {
      return res.status(400).json({ error: "Invalid message envelope" });
    }
    const actor = await db.select().from(actorPrincipals).where(and4(
      eq4(actorPrincipals.principalId, envelope.to.principalId),
      eq4(actorPrincipals.orgId, envelope.orgId),
      eq4(actorPrincipals.isActive, true)
    )).limit(1);
    if (!actor.length) {
      return res.status(404).json({ error: "Actor principal not found or inactive" });
    }
    const actorData = actor[0];
    let run = null;
    if (envelope.runId) {
      const existingRun = await db.select().from(graphRuns).where(and4(
        eq4(graphRuns.id, envelope.runId),
        eq4(graphRuns.orgId, envelope.orgId)
      )).limit(1);
      run = existingRun[0] || null;
    }
    if (!run && actorData.defaultGraphId) {
      const latestCompiled = await db.select().from(compiledGraphs).where(eq4(compiledGraphs.graphId, actorData.defaultGraphId)).orderBy(desc4(compiledGraphs.version)).limit(1);
      const [newRun] = await db.insert(graphRuns).values({
        graphId: actorData.defaultGraphId,
        compiledGraphId: latestCompiled[0]?.id,
        conversationId: envelope.conversationId,
        orgId: envelope.orgId,
        traceId: envelope.traceId || uuidv4(),
        priority: envelope.priority || "normal",
        state: {
          currentNode: "start",
          inputs: [envelope],
          outputs: []
        }
      }).returning();
      run = newRun;
    }
    if (run) {
      await db.insert(runLogs).values({
        runId: run.id,
        level: "info",
        nodeId: "webhook",
        message: `Message received from ${envelope.from.principalId}`,
        data: { messageId: envelope.id, contentType: envelope.contentType }
      });
    }
    res.json({
      success: true,
      runId: run?.id,
      traceId: run?.traceId,
      message: "Message received and queued for processing"
    });
  } catch (error) {
    console.error("Error processing webhook message:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});
router5.post("/messaging", async (req, res) => {
  try {
    const payload = req.body;
    console.log(`[Webhook] Received message for assistant: ${payload.assistant.key}`);
    if (!payload.conversationId || !payload.message || !payload.assistant) {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }
    if (payload.message.sender_type === "agent") {
      res.json({ success: true, skipped: true, reason: "Message from agent" });
      return;
    }
    const assistant = getLoadedAssistant(payload.assistant.key);
    if (!assistant || !assistant.ruleSet) {
      console.warn(`[Webhook] Assistant ${payload.assistant.key} not found or has no rules`);
      res.status(404).json({ error: "Assistant not found or has no rules configured" });
      return;
    }
    const orgId = payload.orgId || DEFAULT_ORG_ID;
    const authHeader = req.headers.authorization;
    let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : void 0;
    if (!token) {
      token = await getAssistantToken(payload.assistant.userId, payload.assistant.key);
      if (token) {
        console.log(`[Webhook] Using assistant token for LLM actions: ${payload.assistant.key}`);
      }
    }
    const catalog = await getCatalogResources();
    const executionContext = {
      orgId: `${payload.assistant.key}:${orgId}`,
      conversationId: payload.conversationId,
      message: {
        id: payload.message.id,
        role: "user",
        content: payload.message.content,
        metadata: {
          // Carry the INBOUND metadata through.
          //
          // This object was built from scratch, which silently dropped
          // everything the sender attached — symbiaContext (which panel the
          // operator is on) and symbiaFrame (a captured region and what a
          // vision model said about it). The console has been sending both;
          // nothing on this side has ever read them, so the assistant answered
          // "I'm not sure what context you're referring to" to a message that
          // arrived with its context attached.
          //
          // symbiaContext WAS read — at line ~292, in the SDN block, which is
          // not the path the coordinator takes. Two near-identical extraction
          // blocks, and the wrong one was wired. That is the third time in this
          // file.
          ...payload.message.metadata ?? {},
          contentType: payload.message.content_type || "text",
          senderId: payload.message.sender_id,
          timestamp: payload.message.created_at
        }
      },
      user: {
        id: payload.message.sender_id,
        metadata: {
          type: payload.message.sender_type
        }
      },
      context: {},
      metadata: {
        token,
        rawOrgId: orgId
        // Original org ID for API calls (before composite key)
      },
      catalog
    };
    const { interpolate: interpolate2 } = await Promise.resolve().then(() => (init_template(), template_exports));
    const transpiled = interpolate2(payload.message.content, executionContext);
    console.log(`[Webhook] Transpiled message:`, {
      original: payload.message.content,
      transpiled
    });
    const result = await defaultCoordinator.processEvent({
      type: "message.received",
      orgId: `${payload.assistant.key}:${orgId}`,
      conversationId: payload.conversationId,
      data: {
        assistantKey: payload.assistant.key,
        messageId: payload.message.id,
        senderId: payload.message.sender_id,
        senderType: payload.message.sender_type
      },
      message: {
        id: payload.message.id,
        role: "user",
        content: transpiled,
        // ← Use transpiled content instead of raw
        metadata: {
          // Same carry-through as the execution context above. Both objects
          // are built here and both dropped the sender's metadata; patching
          // one would have reached neither the prompt nor the rules.
          ...payload.message.metadata ?? {},
          contentType: payload.message.content_type || "text",
          senderId: payload.message.sender_id,
          timestamp: payload.message.created_at,
          originalContent: payload.message.content
          // Keep original for debugging
        }
      },
      user: {
        id: payload.message.sender_id,
        metadata: {
          type: payload.message.sender_type
        }
      },
      catalog,
      // Inject catalog for Symbia Script @catalog references
      metadata: {
        token,
        // Pass token for LLM actions to use Integrations service
        rawOrgId: orgId
        // Original org ID for credential lookup (not the composite key)
      }
    });
    console.log(`[Webhook] Rules evaluated: ${result.rulesEvaluated}, matched: ${result.rulesMatched}`);
    let responseContent = null;
    let provenance = null;
    let errorMessage = null;
    let suppressResponse = false;
    for (const ruleResult of result.results) {
      if (!ruleResult.matched) continue;
      for (const action of ruleResult.actionsExecuted) {
        if (action.success && action.output) {
          if (action.actionType === "message.send") {
            const output = action.output;
            if (output.content) responseContent = output.content;
            const env = output.message?.metadata?.symbia?.provenance;
            if (env) provenance = env;
          }
          if (action.actionType === "llm.invoke") {
            const output = action.output;
            if (output.response) responseContent = output.response;
          }
          if (action.actionType === "assistant.route") {
            const output = action.output;
            if (output.suppressResponse || output.routed) {
              suppressResponse = true;
              console.log(`[Webhook] ${payload.assistant.key} routed to ${output.targetAssistant} - suppressing response`);
            }
          }
        } else if (!action.success && action.error) {
          errorMessage = action.error;
          console.error(`[Webhook] Action ${action.actionType} failed: ${action.error}`);
        }
      }
    }
    if (suppressResponse) {
      console.log(`[Webhook] Response suppressed for ${payload.assistant.key} (message was routed)`);
      res.json({
        success: true,
        runId: result.runId,
        rulesEvaluated: result.rulesEvaluated,
        rulesMatched: result.rulesMatched,
        routed: true,
        responseGenerated: false,
        responseSent: false
      });
      return;
    }
    if (!responseContent && errorMessage) {
      responseContent = `\u26A0\uFE0F I encountered an error while processing your request:

\`${errorMessage}\`

Please check my configuration or try again.`;
    }
    let responseSent = false;
    if (responseContent) {
      try {
        console.log(`[Webhook] Getting messaging client for: ${payload.assistant.userId}`);
        const { client: agentMessagingClient, asUserId } = await getAssistantMessagingClient(
          payload.assistant.userId,
          payload.assistant.key
        );
        try {
          await agentMessagingClient.joinConversation(payload.conversationId, { asUserId });
          console.log(`[Webhook] Assistant ${payload.assistant.key} joined conversation ${payload.conversationId}`);
        } catch (joinError) {
          console.log(`[Webhook] Join result for ${payload.assistant.key}:`, joinError instanceof Error ? joinError.message : "joined");
        }
        await agentMessagingClient.sendMessage({
          conversationId: payload.conversationId,
          content: responseContent,
          contentType: "markdown",
          metadata: {
            // The envelope. Structured and hashed, not a sentence appended to
            // the text.
            ...provenance ? { symbia: { provenance } } : {},
            assistantKey: payload.assistant.key,
            rulesEvaluated: result.rulesEvaluated,
            rulesMatched: result.rulesMatched,
            runId: result.runId,
            ruleTrace: {
              runId: result.runId,
              trigger: result.trigger,
              rulesEvaluated: result.rulesEvaluated,
              rulesMatched: result.rulesMatched,
              totalDurationMs: result.durationMs,
              entries: result.results.map((r) => ({
                ruleId: r.ruleId,
                ruleName: r.ruleName,
                matched: r.matched,
                actions: r.matched ? r.actionsExecuted.map((a) => ({
                  type: a.actionType,
                  success: a.success,
                  durationMs: a.durationMs
                })) : void 0
              }))
            }
          },
          replyTo: payload.message.id
        }, { asUserId });
        console.log(`[Webhook] Response sent for assistant: ${payload.assistant.key}`);
        responseSent = true;
      } catch (sendError) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError);
        console.error(`[Webhook] Failed to send response for ${payload.assistant.key}:`, errMsg);
        try {
          console.log(`[Webhook] Retry: Getting messaging client for: ${payload.assistant.userId}`);
          const { client: retryClient, asUserId: retryAsUserId } = await getAssistantMessagingClient(
            payload.assistant.userId,
            payload.assistant.key
          );
          await retryClient.sendMessage({
            conversationId: payload.conversationId,
            content: responseContent,
            contentType: "markdown"
          }, { asUserId: retryAsUserId });
          console.log(`[Webhook] Response sent (without replyTo) for assistant: ${payload.assistant.key}`);
          responseSent = true;
        } catch (retryError) {
          console.error(`[Webhook] Retry also failed:`, retryError);
        }
      }
    } else {
      console.log(`[Webhook] No response generated for assistant: ${payload.assistant.key}`);
    }
    res.json({
      success: true,
      runId: result.runId,
      rulesEvaluated: result.rulesEvaluated,
      rulesMatched: result.rulesMatched,
      responseGenerated: !!responseContent,
      responseSent
    });
  } catch (error) {
    console.error("[Webhook] Error processing messaging webhook:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});
router5.post("/control", async (req, res) => {
  try {
    const event = req.body;
    if (!event.event || !event.conversationId || !event.orgId) {
      return res.status(400).json({ error: "Invalid control event: event, conversationId, and orgId required" });
    }
    const runs = await db.select().from(graphRuns).where(and4(
      eq4(graphRuns.conversationId, event.conversationId),
      eq4(graphRuns.orgId, event.orgId),
      eq4(graphRuns.status, "running")
    )).limit(10);
    for (const run of runs) {
      let newStatus = run.status;
      switch (event.event) {
        case "stream.pause":
          newStatus = "paused";
          break;
        case "stream.resume":
          newStatus = "running";
          break;
        case "stream.preempt":
          newStatus = "paused";
          break;
        case "stream.handoff":
          newStatus = "waiting";
          break;
        case "stream.cancel":
          newStatus = "cancelled";
          break;
      }
      await db.update(graphRuns).set({
        status: newStatus,
        updatedAt: /* @__PURE__ */ new Date(),
        state: {
          ...run.state,
          lastControlEvent: event
        }
      }).where(eq4(graphRuns.id, run.id));
      await db.insert(runLogs).values({
        runId: run.id,
        level: "info",
        nodeId: "arbiter",
        message: `Control event: ${event.event}`,
        data: { reason: event.reason, effectiveAt: event.effectiveAt }
      });
    }
    res.json({
      success: true,
      affectedRuns: runs.length,
      event: event.event
    });
  } catch (error) {
    console.error("Error processing control event:", error);
    res.status(500).json({ error: "Failed to process control event" });
  }
});
var webhooks_default = router5;

// ../../assistants/server/src/routes.ts
init_rules();

// ../../assistants/server/src/routes/settings.ts
init_auth();
import { Router as Router8 } from "express";
var router6 = Router8();
router6.use(requireAuth);
var llmSettings = {};
var defaultLLMSettings = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 1024,
  apiKeySet: false
};
router6.get("/llm", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const settings = llmSettings[orgId];
  if (!settings) {
    const envApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    res.json({
      data: {
        ...defaultLLMSettings,
        apiKeySet: !!envApiKey
      }
    });
    return;
  }
  const { apiKey, ...safeSettings } = settings;
  res.json({
    data: {
      ...safeSettings,
      apiKeySet: !!apiKey || !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY
    }
  });
});
router6.put("/llm", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const body = req.body;
  const existing = llmSettings[orgId] || { ...defaultLLMSettings };
  const updated = {
    provider: body.provider ?? existing.provider,
    model: body.model ?? existing.model,
    temperature: body.temperature ?? existing.temperature,
    maxTokens: body.maxTokens ?? existing.maxTokens,
    apiKeySet: !!(body.apiKey || existing.apiKey),
    apiKey: body.apiKey || existing.apiKey
  };
  llmSettings[orgId] = updated;
  if (body.apiKey) {
    if (updated.provider === "openai") {
      process.env.OPENAI_API_KEY = body.apiKey;
    } else if (updated.provider === "anthropic") {
      process.env.ANTHROPIC_API_KEY = body.apiKey;
    }
  }
  const { apiKey, ...safeSettings } = updated;
  res.json({
    data: {
      ...safeSettings,
      apiKeySet: !!apiKey
    }
  });
});
var settings_default = router6;

// ../../assistants/server/src/routes/assistants-admin.ts
init_auth();
import { Router as Router9 } from "express";
function getParam5(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var router7 = Router9();
router7.use(requireAuth);
var customAssistants = {};
router7.get("/", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const orgAssistants = customAssistants[orgId] || {};
  res.json({
    data: Object.values(orgAssistants),
    count: Object.keys(orgAssistants).length
  });
});
router7.get("/:key", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const key = getParam5(req.params, "key");
  const orgAssistants = customAssistants[orgId] || {};
  const assistant = orgAssistants[key];
  if (!assistant) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  res.json({ data: assistant });
});
router7.post("/", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const body = req.body;
  if (!body.key || !body.name) {
    res.status(400).json({ error: "key and name are required" });
    return;
  }
  if (!/^[a-z0-9-]+$/.test(body.key)) {
    res.status(400).json({ error: "key must be lowercase alphanumeric with dashes only" });
    return;
  }
  if (!customAssistants[orgId]) {
    customAssistants[orgId] = {};
  }
  if (customAssistants[orgId][body.key]) {
    res.status(409).json({ error: "Assistant with this key already exists" });
    return;
  }
  const assistant = {
    key: body.key,
    name: body.name,
    description: body.description || "",
    capabilities: body.capabilities || [],
    status: body.status || "draft",
    systemPrompt: body.systemPrompt,
    model: body.model || "gpt-4o-mini",
    temperature: body.temperature ?? 0.7,
    hasHandler: true,
    // Custom assistants use the generic LLM handler
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
  customAssistants[orgId][body.key] = assistant;
  res.status(201).json({ data: assistant });
});
router7.put("/:key", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const key = getParam5(req.params, "key");
  const body = req.body;
  if (!customAssistants[orgId] || !customAssistants[orgId][key]) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  const existing = customAssistants[orgId][key];
  const updated = {
    ...existing,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    capabilities: body.capabilities ?? existing.capabilities,
    status: body.status ?? existing.status,
    systemPrompt: body.systemPrompt ?? existing.systemPrompt,
    model: body.model ?? existing.model,
    temperature: body.temperature ?? existing.temperature,
    updatedAt: /* @__PURE__ */ new Date()
  };
  customAssistants[orgId][key] = updated;
  res.json({ data: updated });
});
router7.delete("/:key", (req, res) => {
  const orgId = req.headers["x-org-id"] || "default";
  const key = getParam5(req.params, "key");
  if (!customAssistants[orgId] || !customAssistants[orgId][key]) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  delete customAssistants[orgId][key];
  res.json({ success: true });
});
var assistants_admin_default = router7;

// ../../assistants/server/src/doc-routes.ts
import { registerDocRoutes } from "@symbia/md";

// ../../assistants/server/src/openapi.ts
var openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Assistants Backend API",
    version: "1.0.0",
    description: "Backend APIs for prompt graphs, actor principals, run orchestration, rules engine, and LLM settings."
  },
  servers: [
    {
      url: "/api",
      description: "API base"
    }
  ],
  tags: [
    { name: "health", description: "Service health and status" },
    { name: "graphs", description: "Prompt graph management" },
    { name: "runs", description: "Graph run history and logs" },
    { name: "actors", description: "Actor principal management" },
    { name: "webhooks", description: "Messaging webhooks" },
    { name: "rules", description: "Rules engine management (requires auth)" },
    { name: "settings", description: "LLM settings management (requires auth)" },
    { name: "assistants-admin", description: "Custom assistant management (requires auth)" }
  ],
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] },
    { cookieAuth: [] }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from Identity Service"
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key from Identity Service"
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "token",
        description: "Session cookie from Identity Service"
      }
    },
    parameters: {
      OrgId: {
        name: "orgId",
        in: "query",
        required: true,
        schema: { type: "string", format: "uuid" }
      }
    }
  },
  paths: {
    "/health": {
      get: {
        tags: ["health"],
        summary: "Health check",
        responses: {
          "200": { description: "Service is healthy" }
        }
      }
    },
    "/status": {
      get: {
        tags: ["health"],
        summary: "Database connectivity status",
        responses: {
          "200": { description: "Database connected" },
          "500": { description: "Database connection failed" }
        }
      }
    },
    "/graphs": {
      get: {
        tags: ["graphs"],
        summary: "List graphs",
        parameters: [{ $ref: "#/components/parameters/OrgId" }],
        responses: {
          "200": { description: "List of graphs" },
          "400": { description: "orgId required" }
        }
      },
      post: {
        tags: ["graphs"],
        summary: "Create graph",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orgId", "name", "graphJson"],
                properties: {
                  orgId: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  description: { type: "string" },
                  graphJson: { type: "object" },
                  triggerConditions: { type: "object" },
                  logLevel: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Graph created" },
          "400": { description: "Validation failed" }
        }
      }
    },
    "/graphs/{id}": {
      get: {
        tags: ["graphs"],
        summary: "Get graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Graph" },
          "404": { description: "Graph not found" }
        }
      },
      put: {
        tags: ["graphs"],
        summary: "Update graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  graphJson: { type: "object" },
                  triggerConditions: { type: "object" },
                  logLevel: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Graph updated" },
          "404": { description: "Graph not found" }
        }
      },
      delete: {
        tags: ["graphs"],
        summary: "Delete graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Graph deleted" },
          "404": { description: "Graph not found" }
        }
      }
    },
    "/graphs/{id}/publish": {
      post: {
        tags: ["graphs"],
        summary: "Publish graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Graph published" },
          "404": { description: "Graph not found" }
        }
      }
    },
    "/graphs/{id}/runs": {
      get: {
        tags: ["runs"],
        summary: "List runs for graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "List of runs" },
          "404": { description: "Graph not found" }
        }
      }
    },
    "/runs": {
      get: {
        tags: ["runs"],
        summary: "List runs",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "conversationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "graphId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["running", "paused", "waiting", "completed", "failed", "cancelled"]
            }
          }
        ],
        responses: {
          "200": { description: "List of runs" },
          "400": { description: "orgId required" }
        }
      }
    },
    "/runs/{id}": {
      get: {
        tags: ["runs"],
        summary: "Get run",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Run details" },
          "404": { description: "Run not found" }
        }
      }
    },
    "/runs/{id}/logs": {
      get: {
        tags: ["runs"],
        summary: "Get run logs",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "level", in: "query", required: false, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Run logs" },
          "404": { description: "Run not found" }
        }
      }
    },
    "/actors": {
      get: {
        tags: ["actors"],
        summary: "List actor principals",
        parameters: [{ $ref: "#/components/parameters/OrgId" }],
        responses: {
          "200": { description: "List of actors" },
          "400": { description: "orgId required" }
        }
      },
      post: {
        tags: ["actors"],
        summary: "Create actor principal",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orgId", "principalId", "name"],
                properties: {
                  orgId: { type: "string", format: "uuid" },
                  principalId: { type: "string" },
                  name: { type: "string" },
                  defaultGraphId: { type: "string", format: "uuid" },
                  capabilities: { type: "array", items: { type: "string" } },
                  webhooks: { type: "object" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Actor created" },
          "400": { description: "Validation failed" }
        }
      }
    },
    "/actors/{id}": {
      get: {
        tags: ["actors"],
        summary: "Get actor principal",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Actor" },
          "404": { description: "Actor not found" }
        }
      },
      put: {
        tags: ["actors"],
        summary: "Update actor principal",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  defaultGraphId: { type: "string", format: "uuid" },
                  capabilities: { type: "array", items: { type: "string" } },
                  webhooks: { type: "object" },
                  isActive: { type: "boolean" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Actor updated" },
          "404": { description: "Actor not found" }
        }
      },
      delete: {
        tags: ["actors"],
        summary: "Delete actor principal",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Actor deleted" },
          "404": { description: "Actor not found" }
        }
      }
    },
    "/webhook/message": {
      post: {
        tags: ["webhooks"],
        summary: "Handle incoming message",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["conversationId", "orgId", "to"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  conversationId: { type: "string", format: "uuid" },
                  orgId: { type: "string", format: "uuid" },
                  from: {
                    type: "object",
                    properties: {
                      principalId: { type: "string" },
                      principalType: { type: "string" }
                    }
                  },
                  to: {
                    type: "object",
                    required: ["principalId"],
                    properties: {
                      principalId: { type: "string" },
                      principalType: { type: "string" }
                    }
                  },
                  content: { type: "string" },
                  contentType: { type: "string" },
                  metadata: { type: "object" },
                  runId: { type: "string", format: "uuid" },
                  traceId: { type: "string" },
                  sequence: { type: "integer" },
                  priority: { type: "string", enum: ["low", "normal", "high", "critical"] },
                  interruptible: { type: "boolean" },
                  preemptedBy: { type: "string" },
                  createdAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Message accepted" },
          "400": { description: "Invalid message envelope" },
          "404": { description: "Actor not found" }
        }
      }
    },
    "/webhook/control": {
      post: {
        tags: ["webhooks"],
        summary: "Handle control event",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["event", "conversationId", "orgId"],
                properties: {
                  event: { type: "string" },
                  conversationId: { type: "string", format: "uuid" },
                  orgId: { type: "string", format: "uuid" },
                  target: {
                    type: "object",
                    properties: {
                      principalId: { type: "string" },
                      principalType: { type: "string" }
                    }
                  },
                  reason: { type: "string" },
                  preemptedBy: { type: "string" },
                  effectiveAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Control event accepted" },
          "400": { description: "Invalid control event" }
        }
      }
    },
    "/rules": {
      get: {
        tags: ["rules"],
        summary: "List all rule sets",
        responses: {
          "200": { description: "List of rule sets" },
          "401": { description: "Authentication required" }
        }
      },
      post: {
        tags: ["rules"],
        summary: "Create rule set",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orgId", "name"],
                properties: {
                  orgId: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  rules: { type: "array", items: { type: "object" } },
                  isActive: { type: "boolean" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Rule set created" },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" }
        }
      }
    },
    "/rules/{orgId}": {
      get: {
        tags: ["rules"],
        summary: "Get rule set for org",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Rule set" },
          "401": { description: "Authentication required" },
          "404": { description: "Rule set not found" }
        }
      },
      put: {
        tags: ["rules"],
        summary: "Update rule set",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Rule set updated" },
          "401": { description: "Authentication required" },
          "404": { description: "Rule set not found" }
        }
      }
    },
    "/rules/{orgId}/rules": {
      post: {
        tags: ["rules"],
        summary: "Add rule to set",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Rule added" },
          "401": { description: "Authentication required" },
          "404": { description: "Rule set not found" }
        }
      }
    },
    "/rules/execute": {
      post: {
        tags: ["rules"],
        summary: "Execute rules for event",
        responses: {
          "200": { description: "Execution result" },
          "401": { description: "Authentication required" }
        }
      }
    },
    "/settings/llm": {
      get: {
        tags: ["settings"],
        summary: "Get LLM settings",
        responses: {
          "200": { description: "LLM settings (API key masked)" },
          "401": { description: "Authentication required" }
        }
      },
      put: {
        tags: ["settings"],
        summary: "Update LLM settings",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  provider: { type: "string", enum: ["openai", "anthropic", "custom"] },
                  model: { type: "string" },
                  temperature: { type: "number" },
                  maxTokens: { type: "integer" },
                  apiKey: { type: "string", description: "Will be stored securely, never returned" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Settings updated" },
          "401": { description: "Authentication required" }
        }
      }
    },
    "/assistants-admin": {
      get: {
        tags: ["assistants-admin"],
        summary: "List custom assistants",
        responses: {
          "200": { description: "List of custom assistants" },
          "401": { description: "Authentication required" }
        }
      },
      post: {
        tags: ["assistants-admin"],
        summary: "Create custom assistant",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["key", "name"],
                properties: {
                  key: { type: "string", pattern: "^[a-z0-9-]+$" },
                  name: { type: "string" },
                  description: { type: "string" },
                  capabilities: { type: "array", items: { type: "string" } },
                  status: { type: "string", enum: ["active", "inactive", "draft"] },
                  systemPrompt: { type: "string" },
                  model: { type: "string" },
                  temperature: { type: "number" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Assistant created" },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
          "409": { description: "Assistant with key already exists" }
        }
      }
    },
    "/assistants-admin/{key}": {
      get: {
        tags: ["assistants-admin"],
        summary: "Get custom assistant",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assistant details" },
          "401": { description: "Authentication required" },
          "404": { description: "Assistant not found" }
        }
      },
      put: {
        tags: ["assistants-admin"],
        summary: "Update custom assistant",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assistant updated" },
          "401": { description: "Authentication required" },
          "404": { description: "Assistant not found" }
        }
      },
      delete: {
        tags: ["assistants-admin"],
        summary: "Delete custom assistant",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assistant deleted" },
          "401": { description: "Authentication required" },
          "404": { description: "Assistant not found" }
        }
      }
    }
  }
};
{
  const __autoDocumentedPaths = {
    "/rules/runs": {
      "delete": {
        "tags": [
          "Rules"
        ],
        "summary": "Delete runs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "get": {
        "tags": [
          "Rules"
        ],
        "summary": "List runs",
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
    "/rules/{orgId}/rules/{ruleId}": {
      "delete": {
        "tags": [
          "Rules"
        ],
        "summary": "Delete rules",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "orgId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "ruleId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
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
    "/assistants": {
      "get": {
        "tags": [
          "Assistants"
        ],
        "summary": "List assistants",
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
    "/assistants/mentionable": {
      "get": {
        "tags": [
          "Assistants"
        ],
        "summary": "Get mentionable",
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
    "/bootstrap/service": {
      "get": {
        "tags": [
          "Bootstrap"
        ],
        "summary": "Get service",
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
    "/webhook/messaging": {
      "post": {
        "tags": [
          "Webhook"
        ],
        "summary": "Messaging webhook messaging",
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

// ../../assistants/server/src/doc-routes.ts
function setupDocRoutes(app) {
  registerDocRoutes(app, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false
  });
}

// ../../assistants/server/src/routes.ts
init_provenance();
init_assistant_loader();
async function registerRoutes(_server, app) {
  setupDocRoutes(app);
  app.get("/api/provenance/key", (_req, res) => {
    const identity = provenanceSigningIdentity();
    if (!identity) {
      return res.status(503).json({
        error: "This service has no identity, so it is not signing envelopes.",
        signing: false
      });
    }
    res.json({
      signing: true,
      id: identity.id,
      role: identity.role_claimed,
      fingerprint: identity.fingerprint,
      publicKeyPem: identity.publicKeyPem,
      algorithm: "ed25519",
      canonicalisation: "RFC 8785",
      note: "Verify: recompute sha256 over the canonical envelope body for integrity, then check the ed25519 signature with this key for authenticity. Holding this key does not allow signing."
    });
  });
  if (isMemory) {
    console.log("Auto-seeding in-memory database...");
    try {
      const { orgs: orgs2, agentPrincipals: agentPrincipals2, promptGraphs: promptGraphs3 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { DEFAULT_ORG_IDS: DEFAULT_ORG_IDS2 } = await import("@symbia/seed");
      await db.insert(orgs2).values([
        {
          id: DEFAULT_ORG_IDS2.SYMBIA_LABS,
          name: "Symbia Labs",
          slug: "symbia-labs",
          planId: "plan-enterprise",
          createdAt: /* @__PURE__ */ new Date()
        },
        {
          id: DEFAULT_ORG_IDS2.ACME_CORP,
          name: "Acme Corp",
          slug: "acme-corp",
          planId: "plan-pro",
          createdAt: /* @__PURE__ */ new Date()
        },
        {
          id: DEFAULT_ORG_IDS2.TEST_ORG,
          name: "Test Organization",
          slug: "test-org",
          planId: "plan-free",
          createdAt: /* @__PURE__ */ new Date()
        }
      ]).onConflictDoNothing();
      console.log("[SEED] \u2713 Seeded orgs table");
      const { seedAssistantsData } = await import("@symbia/seed");
      await seedAssistantsData(db, {
        agents: agentPrincipals2,
        graphs: promptGraphs3
      }, {
        verbose: false,
        skipIfExists: true
      });
      console.log("\u2713 In-memory database seeded successfully");
    } catch (error) {
      console.error("Failed to seed in-memory database:", error);
    }
  }
  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ status: "ok", service: "assistants" });
  });
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "assistants",
      version: "1.0.0",
      description: "Rule-based assistant agents with prompt graphs and run orchestration",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt"
      },
      endpoints: {
        auth: "/api/auth",
        assistants: "/api/assistants",
        graphs: "/api/graphs",
        runs: "/api/runs",
        actors: "/api/actors",
        rules: "/api/rules",
        settings: "/api/settings",
        webhooks: "/api/webhook"
      },
      authentication: [
        "Bearer token (JWT)",
        "Session cookie (proxied to identity)"
      ]
    });
  });
  app.get("/api/status", async (_req, res) => {
    if (!process.env.DATABASE_URL) {
      res.json({
        status: "degraded",
        database: "unconfigured",
        message: "DATABASE_URL not set"
      });
      return;
    }
    try {
      const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const client = await pool2.connect();
      const result = await client.query("SELECT NOW() as time");
      client.release();
      res.json({
        status: "connected",
        database: "postgresql",
        serverTime: result.rows[0]?.time
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      res.json({ status: "degraded", database: "unreachable", message: msg });
    }
  });
  app.get("/api/stats", async (_req, res) => {
    try {
      const { promptGraphs: promptGraphs3, graphRuns: graphRuns2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { getAllLoadedAssistants: getAllLoadedAssistants2 } = await Promise.resolve().then(() => (init_assistant_loader(), assistant_loader_exports));
      const graphs = await db.select().from(promptGraphs3);
      const allRuns = await db.select().from(graphRuns2);
      const activeRuns = allRuns.filter((r) => r.status === "running");
      const loadedAssistants2 = getAllLoadedAssistants2();
      res.json({
        loadedAssistants: loadedAssistants2.length,
        totalGraphs: graphs.length,
        activeRuns: activeRuns.length,
        totalRuns: allRuns.length
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });
  app.use("/api/graphs", optionalAuth, graphs_default);
  app.use("/api/runs", optionalAuth, runs_default);
  app.use("/api/actors", actors_default);
  app.use("/api/rules", rules_default);
  app.use("/api/settings", settings_default);
  app.use("/api/assistants-admin", assistants_admin_default);
  app.use("/api/webhook", webhooks_default);
  app.use("/api/assistants", createAssistantsListRouter());
  const IDENTITY_ENDPOINT = process.env.IDENTITY_ENDPOINT || "https://identity.symbia-labs.com";
  app.use("/api/auth", async (req, res) => {
    try {
      const url = `${IDENTITY_ENDPOINT}/api/auth${req.url}`;
      const response = await fetch(url, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          ...req.headers.authorization ? { Authorization: req.headers.authorization } : {},
          ...req.headers.cookie ? { Cookie: req.headers.cookie } : {}
        },
        body: ["POST", "PUT", "PATCH"].includes(req.method) ? JSON.stringify(req.body) : void 0
      });
      const data = await response.json();
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        res.setHeader("Set-Cookie", setCookie);
      }
      res.status(response.status).json(data);
    } catch (error) {
      console.error("[Identity Proxy] Error:", error);
      res.status(502).json({ message: "Identity service unavailable" });
    }
  });
  app.get("/api/users/me", async (req, res) => {
    try {
      const url = `${IDENTITY_ENDPOINT}/api/users/me`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...req.headers.authorization ? { Authorization: req.headers.authorization } : {},
          ...req.headers.cookie ? { Cookie: req.headers.cookie } : {}
        }
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("[Identity Proxy] Error:", error);
      res.status(502).json({ message: "Identity service unavailable" });
    }
  });
  await loadAssistants(app);
}

// ../../assistants/server/src/service.ts
async function start(ctx) {
  await loadAssistants(ctx.app);
  await publishRulesToOrg();
}
async function publishRulesToOrg() {
  const orgId = process.env.SYMBIA_SYSTEM_ORG_ID;
  if (!orgId) {
    console.warn(
      "[assistants] SYMBIA_SYSTEM_ORG_ID is not set, so no rules were published to an org. Assistants will load and never fire: POST /api/rules/execute resolves rule sets by org."
    );
    return;
  }
  const byAssistant = getAllRuleSets();
  const merged = [];
  const sources = [];
  for (const [key, set] of Object.entries(byAssistant)) {
    if (key === orgId) continue;
    const rules = set?.rules ?? [];
    if (!rules.length) continue;
    merged.push(...rules);
    sources.push(`${key}(${rules.length})`);
  }
  if (!merged.length) return;
  registerRuleSet(orgId, {
    id: `org-${orgId}`,
    name: "Org rules",
    description: `Union of assistant rule sets: ${sources.join(", ")}`,
    version: 1,
    isActive: true,
    rules: merged
  });
  console.log(
    `[assistants] published ${merged.length} rule(s) to org ${orgId} from ${sources.join(", ")}`
  );
}
export {
  publishRulesToOrg,
  registerRoutes,
  start
};
