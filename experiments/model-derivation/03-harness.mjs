/**
 * Stage 3: the same six problems against parent (f16), Q4_K_M, and Q2_K.
 *
 * Parent runs greedy only. Each child runs greedy + 3 sampled runs
 * (temp 0.7, fixed seeds) — the sampled runs measure self-consistency,
 * which is the escalation signal the theory needs (P4).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLlama, LlamaChatSession } from "node-llama-cpp";

const here = path.dirname(fileURLToPath(import.meta.url));
const problems = [
  { q: "A shop sells pens at $3 each. Ben buys 7 pens and pays with a $50 bill. How much change does he get, in dollars?", a: 29 },
  { q: "Sara has 24 apples. She gives one third of them to Tom, then eats 2 of the remaining. How many apples does Sara have left?", a: 14 },
  { q: "A train travels 60 miles in 1.5 hours. At the same speed, how many miles does it travel in 4 hours?", a: 160 },
  { q: "What is 17 multiplied by 23?", a: 391 },
  { q: "Lisa reads 12 pages a day for 5 days, then 8 pages a day for 3 days. How many pages does she read in total?", a: 84 },
  { q: "A rectangle is 9 cm long and 6 cm wide. What is its perimeter in cm?", a: 30 },
];
const SYSTEM = "You are a careful math assistant. Think step by step, briefly. End your reply with a line of the form: ANSWER: <number>";

const models = [
  { name: "f16-parent", file: "data/qwen2.5-0.5b-instruct-fp16.gguf", runs: [{ id: "greedy", temperature: 0 }] },
  { name: "q4km-child", file: "data/child-q4km-run1.gguf", runs: [
    { id: "greedy", temperature: 0 },
    { id: "s101", temperature: 0.7, seed: 101 },
    { id: "s102", temperature: 0.7, seed: 102 },
    { id: "s103", temperature: 0.7, seed: 103 },
  ]},
  { name: "q2k-child", file: "data/child-q2k.gguf", runs: [
    { id: "greedy", temperature: 0 },
    { id: "s101", temperature: 0.7, seed: 101 },
    { id: "s102", temperature: 0.7, seed: 102 },
    { id: "s103", temperature: 0.7, seed: 103 },
  ]},
];

function parseAnswer(text) {
  // Tier 1: the requested marker. Tier 2: "answer is N". Tier 3: last number
  // in the final non-empty line. Recorded per-run so scoring stays honest —
  // a 0.5B model does not reliably follow format instructions, and the first
  // run of this harness scored a visibly correct reply as a miss (see RESULTS).
  const num = (s) => {
    const n = Number(String(s).replaceAll(",", "").replace(/\$/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  let m = [...text.matchAll(/ANSWER:\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/gi)].pop();
  if (m) return { value: num(m[1]), how: "marker" };
  m = [...text.matchAll(/answer is[:\s]*\\?\(?\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/gi)].pop();
  if (m) return { value: num(m[1]), how: "answer-is" };
  m = [...text.matchAll(/\\boxed\{\s*\$?\s*(-?[\d,]+(?:\.\d+)?)\s*\}/g)].pop();
  if (m) return { value: num(m[1]), how: "boxed" };
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const last = lines[lines.length - 1] ?? "";
  m = [...last.matchAll(/(-?[\d,]+(?:\.\d+)?)/g)].pop();
  if (m) return { value: num(m[1]), how: "last-number" };
  return { value: null, how: "none" };
}

const llama = await getLlama();
const results = [];
for (const spec of models) {
  const model = await llama.loadModel({ modelPath: path.join(here, spec.file) });
  for (const run of spec.runs) {
    for (let i = 0; i < problems.length; i++) {
      const context = await model.createContext({ contextSize: 1024 });
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: SYSTEM,
      });
      const t0 = Date.now();
      const out = await session.prompt(problems[i].q, {
        maxTokens: 600,
        temperature: run.temperature,
        ...(run.seed !== undefined ? { seed: run.seed } : {}),
      });
      const { value: parsed, how } = parseAnswer(out);
      results.push({
        model: spec.name, run: run.id, problem: i, expected: problems[i].a,
        parsed, parsedVia: how, correct: parsed === problems[i].a, ms: Date.now() - t0,
        output: out.slice(0, 1500),
      });
      console.log(`${spec.name}/${run.id} p${i}: parsed=${parsed} (${how}) expected=${problems[i].a} ${parsed === problems[i].a ? "OK" : "X"} (${Date.now() - t0}ms)`);
      await context.dispose();
    }
  }
  await model.dispose();
}

fs.writeFileSync(path.join(here, "data", "runs.json"), JSON.stringify(results, null, 2));

// -- summary ---------------------------------------------------------------
const summary = {};
for (const spec of models) {
  const rows = results.filter((r) => r.model === spec.name);
  const greedy = rows.filter((r) => r.run === "greedy");
  const sampled = rows.filter((r) => r.run.startsWith("s"));
  let disagree = 0;
  for (let i = 0; i < problems.length; i++) {
    const answers = new Set(sampled.filter((r) => r.problem === i).map((r) => r.parsed));
    if (answers.size > 1) disagree++;
  }
  summary[spec.name] = {
    greedyCorrect: greedy.filter((r) => r.correct).length,
    of: problems.length,
    sampledRuns: sampled.length,
    problemsWithSelfDisagreement: sampled.length ? disagree : null,
  };
}
console.log(JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(here, "data", "summary.json"), JSON.stringify(summary, null, 2));
