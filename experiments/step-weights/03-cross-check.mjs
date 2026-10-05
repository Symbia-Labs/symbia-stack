/**
 * The counter-designs to same-model self-consistency, measured (PS5, PS6).
 *
 * PS5: one greedy answer per SUBSTRATE (q2k, q4km, f16) — does weight
 *      heterogeneity surface the error that homogeneous sampling hid?
 * PS6: the deterministic check — the problem is arithmetic, so a COMPUTED
 *      verifier needs no model and no consensus at all.
 */
const MODELS_URL = process.env.MODELS_URL || "http://localhost:5098";
const PROBLEM = "A store discounts an $80 item by 15%, then adds 8% sales tax on the discounted price. What is the final price in dollars? Think step by step, briefly. End with a line: ANSWER: <number>";
const EXPECTED = Math.round(80 * 0.85 * 1.08 * 100) / 100; // 73.44 — the COMPUTED verifier

function parseAnswer(text) {
  const num = (s) => { const n = Number(String(s).replaceAll(",", "").replace(/\$/g, "")); return Number.isFinite(n) ? n : null; };
  let m = [...text.matchAll(/ANSWER:\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/gi)].pop();
  if (m) return num(m[1]);
  m = [...text.matchAll(/\\boxed\{\s*\$?\s*(-?[\d,]+(?:\.\d+)?)\s*\}/g)].pop();
  if (m) return num(m[1]);
  const lines = text.trim().split("\n").filter((l) => l.trim());
  m = [...(lines[lines.length - 1] ?? "").matchAll(/(-?[\d,]+(?:\.\d+)?)/g)].pop();
  return m ? num(m[1]) : null;
}

async function chat(model, temperature = 0) {
  const res = await fetch(`${MODELS_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: PROBLEM }], temperature, max_tokens: 400 }),
  });
  if (!res.ok) throw new Error(`${model} -> ${res.status}`);
  return parseAnswer((await res.json()).choices?.[0]?.message?.content ?? "");
}

const panel = ["child-q2k", "child-q4km-run1", "qwen2-5-0-5b-instruct-fp16"];
const answers = {};
for (const m of panel) {
  answers[m] = await chat(m);
  console.log(`${m}: ${answers[m]}`);
}

const distinct = new Set(Object.values(answers));
console.log(`\nPS5 cross-substrate: ${distinct.size} distinct answer(s) ${[...distinct].join(", ")} → ${distinct.size >= 2 ? "DISAGREEMENT SURFACES (held)" : "unanimous across substrates (broken)"}`);

const verdicts = Object.entries(answers).map(([m, a]) => `${m}: ${a === EXPECTED ? "verified" : `REFUTED (computed ${EXPECTED})`}`);
console.log(`PS6 computed verifier (${EXPECTED}):`);
for (const v of verdicts) console.log(`  ${v}`);
