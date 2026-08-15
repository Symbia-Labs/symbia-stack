/**
 * Spike runner: a routine whose steps resolve weights independently.
 *
 * Inference goes through the RUNNING models service — never node-llama-cpp
 * directly — so anything this needs and cannot get is a platform gap, not
 * a spike shortcut. Resolution modes:
 *
 *   pin         — a digest names the bytes; the registry says which ids
 *                 currently serve them (several may — content addressing).
 *   constraints — the step states needs; the live registry answers; the
 *                 pick rule is deterministic and recorded WITH candidates.
 *   escalation  — sampled self-disagreement above threshold hands the step
 *                 to a pinned fallback; the receipt records both models,
 *                 the trigger, and every sample.
 *
 * Every step is sealed as a signed lineage event chained per run: the
 * receipt does not say "GENERATED", it says WHICH BYTES generated, per step.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateIdentity, identityFromPrivatePem, exportPrivatePem, identityId,
} from "@symbia/crypto";
import { GENESIS, advance, signEvent, eventDigest, lineageLine } from "@symbia/lineage";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODELS_URL = process.env.MODELS_URL || "http://localhost:5098";
const routine = JSON.parse(fs.readFileSync(path.join(here, "routine.json"), "utf8"));

fs.mkdirSync(path.join(here, "data"), { recursive: true });
fs.mkdirSync(path.join(here, "chain"), { recursive: true });

// -- identity ---------------------------------------------------------------
const keyPath = path.join(here, "data", "spike-identity.pem");
let identity;
if (fs.existsSync(keyPath)) identity = identityFromPrivatePem(fs.readFileSync(keyPath));
else {
  identity = generateIdentity();
  fs.writeFileSync(keyPath, exportPrivatePem(identity), { mode: 0o600 });
}
fs.writeFileSync(path.join(here, "chain", "spike-identity.pub.pem"), identity.publicKeyPem);
const actor = identityId("spike:step-weights", identity.fingerprint);

// -- registry ---------------------------------------------------------------
const registry = (await (await fetch(`${MODELS_URL}/api/models`)).json()).data;
const locals = registry.filter((m) => m.symbia.source === "local");

function resolvePin(pin) {
  const matches = locals.filter((m) => m.symbia.digest === pin.digest);
  if (matches.length === 0) throw new Error(`no local model serves ${pin.digest.slice(0, 20)}…`);
  return {
    chosen: { id: matches[0].id, digest: matches[0].symbia.digest },
    // Content addressing means a digest can resolve to several names.
    allIds: matches.map((m) => m.id),
  };
}

function resolveConstraints(c) {
  const candidates = locals
    .filter((m) => c.source !== "local" || m.symbia.source === "local")
    .filter((m) => !c.capability || !m.capabilities || m.capabilities.includes(c.capability))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length === 0) throw new Error("no model satisfies constraints");
  return {
    chosen: { id: candidates[0].id, digest: candidates[0].symbia.digest },
    candidates: candidates.map((m) => m.id),
    rule: "lexicographically first id (deterministic, recorded so it can be argued with)",
  };
}

async function chat(modelId, prompt, opts = {}) {
  const res = await fetch(`${MODELS_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`chat ${modelId} -> ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const body = await res.json();
  return body.choices?.[0]?.message?.content ?? "";
}

function parseAnswer(text) {
  const num = (s) => {
    const n = Number(String(s).replaceAll(",", "").replace(/\$/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  let m = [...text.matchAll(/ANSWER:\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/gi)].pop();
  if (m) return num(m[1]);
  m = [...text.matchAll(/answer is[:\s]*\\?\(?\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/gi)].pop();
  if (m) return num(m[1]);
  m = [...text.matchAll(/\\boxed\{\s*\$?\s*(-?[\d,]+(?:\.\d+)?)\s*\}/g)].pop();
  if (m) return num(m[1]);
  const lines = text.trim().split("\n").filter((l) => l.trim());
  m = [...(lines[lines.length - 1] ?? "").matchAll(/(-?[\d,]+(?:\.\d+)?)/g)].pop();
  return m ? num(m[1]) : null;
}

// -- sealed step receipts ---------------------------------------------------
let chain = GENESIS;
const events = [];
let previousStepEventId = null;
function sealStep(stepId, payload) {
  const ev = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor_identity: actor,
    event_type: "assistant.step.executed",
    payload: { routineId: routine.routineId, stepId, ...payload },
    parent_links: [previousStepEventId],
    checksum: "",
    signature: null,
  };
  chain = advance(chain, eventDigest(ev));
  ev.checksum = `sha256:${chain}`;
  ev.signature = signEvent(ev, identity);
  events.push(ev);
  previousStepEventId = ev.event_id;
  return ev;
}

// -- execute ----------------------------------------------------------------
const input = "What do I owe for the discounted item?"; // routed, not consulted
let carried = {};

for (const step of routine.steps) {
  const started = Date.now();

  if (step.kind === "route") {
    const matched = Object.entries(step.patterns).find(([, re]) => new RegExp(re).test(routine.steps[1].prompt));
    sealStep(step.id, {
      mode: "computed",
      resolvedModel: null,
      note: "deterministic pattern tier — no weights consulted",
      matchedBranch: matched?.[0] ?? null,
      ms: Date.now() - started,
    });
    console.log(`[${step.id}] computed  branch=${matched?.[0]}`);
    continue;
  }

  if (step.kind === "think") {
    const resolution = resolveConstraints(step.llm.constraints);
    const s = step.llm.sampling;
    const samples = [];
    for (let i = 0; i < s.samples; i++) {
      const out = await chat(resolution.chosen.id, step.prompt, { temperature: s.temperature, maxTokens: s.maxTokens });
      samples.push({ text: out.slice(0, 400), parsed: parseAnswer(out) });
      console.log(`[${step.id}] sample ${i + 1}/${s.samples} on ${resolution.chosen.id}: parsed=${samples[i].parsed}`);
    }
    const distinct = new Set(samples.map((x) => x.parsed));
    const disagreed = distinct.size >= step.llm.onDisagreement.threshold;

    let finalAnswer, escalation = null;
    if (disagreed) {
      const esc = step.llm.onDisagreement.escalateTo;
      const escResolution = resolvePin(esc.pin);
      const out = await chat(escResolution.chosen.id, step.prompt, { temperature: esc.temperature, maxTokens: esc.maxTokens });
      finalAnswer = parseAnswer(out);
      escalation = {
        trigger: { distinctAnswers: [...distinct], threshold: step.llm.onDisagreement.threshold },
        resolvedModel: escResolution.chosen,
        pinResolvedIds: escResolution.allIds,
        parsed: finalAnswer,
      };
      console.log(`[${step.id}] ESCALATED to ${escResolution.chosen.id}: parsed=${finalAnswer}`);
    } else {
      finalAnswer = samples[0].parsed;
      console.log(`[${step.id}] unanimous (${finalAnswer}) — no escalation`);
    }

    carried.answer = finalAnswer;
    sealStep(step.id, {
      mode: escalation ? "escalated" : "resolved",
      resolvedModel: resolution.chosen,
      candidatesConsidered: resolution.candidates,
      pickRule: resolution.rule,
      samples,
      escalation,
      answer: finalAnswer,
      ms: Date.now() - started,
    });
    continue;
  }

  if (step.kind === "say") {
    const resolution = resolvePin(step.llm.pin);
    const prompt = step.promptTemplate.replace("{answer}", String(carried.answer));
    const out = await chat(resolution.chosen.id, prompt, { temperature: step.llm.temperature, maxTokens: step.llm.maxTokens });
    sealStep(step.id, {
      mode: "pinned",
      resolvedModel: resolution.chosen,
      pinResolvedIds: resolution.allIds,
      output: out.slice(0, 300),
      ms: Date.now() - started,
    });
    console.log(`[${step.id}] pinned to ${resolution.chosen.id} (digest also served by: ${resolution.allIds.join(", ")})`);
    console.log(`[${step.id}] → ${out.trim().slice(0, 120)}`);
  }
}

fs.writeFileSync(path.join(here, "chain", "run-events.jsonl"), events.map(lineageLine).join(""));
console.log(`\nsealed ${events.length} step events (actor ${actor})`);
