/**
 * One component, two runtimes, one interface.
 *
 * The question: what does `add` look like in TypeScript, what does it look like
 * in wasm, and what keeps us from supporting both behind ONE Symbia component
 * contract? Answer, demonstrated below: nothing but a thin host adapter, and
 * for the general case, a typed marshalling layer that Symbia's port schema
 * already describes.
 *
 * Both implementations conform to the runtime's real ComponentDefinition shape
 * (runtime/server/src/executor/components.ts): typed input/output ports and a
 * handler (input: FlowValue, ctx) => Record<port, FlowValue>. The registry —
 * and the provenance ledger — cannot tell them apart.
 *
 * Run:  node build.mjs && node spike.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ── The shared contract (mirrors runtime/executor/components.ts) ────────────
// A FlowValue carries a value and its provenance lane. A pure, recomputable
// component emits `canonical`. This is the same field in both runtimes.
//
// @typedef {{ value: unknown, lane: 'canonical' | 'apocryphal' }} FlowValue
//
// The manifest is runtime-agnostic. Only `runtime` and (for wasm) `module`
// differ between the two implementations — the ports, config, and lanes are
// identical, because they are the PUBLIC CONTRACT and the contract does not
// care how it is satisfied.
const manifestCommon = {
  id: 'symbia.math.add',
  name: 'Add',
  description: 'Emits the sum of a.value and b.value. Deterministic.',
  inputs: ['in'],           // in.value = { a: number, b: number }
  outputs: ['out'],         // out.value = number
  lanes: { out: { lane: 'canonical' } }, // recomputable from inputs => canonical
};

// ── Implementation A: TypeScript / builtin runtime ──────────────────────────
const tsComponent = {
  ...manifestCommon,
  runtime: 'builtin',
  handler: (input) => {
    const { a, b } = input.value;
    return { out: { value: a + b, lane: 'canonical' } };
  },
};

// ── Implementation B: wasm runtime ──────────────────────────────────────────
// The host adapter is the ENTIRE seam between "we support TS" and "we support
// wasm". It instantiates the module (no imports => no capabilities granted),
// marshals the two scalars across the ABI, and wraps the result in the same
// FlowValue the TS handler returns. After this factory runs, the object it
// returns has the identical shape to tsComponent.
async function loadWasmComponent(wasmPath) {
  const bytes = readFileSync(wasmPath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  // importObject is EMPTY. That is the sandbox: the module gets no filesystem,
  // no network, no clock, no env, because it imports none.
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const add = instance.exports.add;

  return {
    ...manifestCommon,
    runtime: 'wasm',
    module: { sha256: digest }, // the module hash is the component's identity
    handler: (input) => {
      const { a, b } = input.value;
      // ABI marshalling: JS number -> f64 arg -> f64 result -> JS number.
      // For scalars this is the identity function (a JS number IS an f64).
      const sum = add(a, b);
      return { out: { value: sum, lane: 'canonical' } };
    },
  };
}

// ── A host that cannot tell them apart ──────────────────────────────────────
// This is the runtime's dispatcher, reduced to its essence: given a component
// (either runtime) and an input, invoke and normalise. It never branches on
// `runtime`. That is the point.
async function invoke(component, inputValue) {
  const input = { value: inputValue, lane: 'canonical' };
  const emitted = await component.handler(input, { nodeId: 'n1', executionId: 'e1', config: {}, log: () => {} });
  return emitted.out;
}

async function main() {
  const wasmComponent = await loadWasmComponent(new URL('./add.wasm', import.meta.url));

  const cases = [
    { a: 2, b: 3 },
    { a: 0.1, b: 0.2 },        // the classic f64 case — both must agree, bit for bit
    { a: -7, b: 7 },
    { a: 1e308, b: 1e308 },    // overflow to Infinity — both must agree
  ];

  console.log('input            TS (builtin)     wasm             agree  lane');
  console.log('───────────────  ───────────────  ───────────────  ─────  ─────────');
  let allAgree = true;
  for (const c of cases) {
    const ts = await invoke(tsComponent, c);
    const wa = await invoke(wasmComponent, c);
    // Object.is so NaN===NaN and +0/-0 are distinguished — a real provenance
    // check must be exact, not merely ==.
    const agree = Object.is(ts.value, wa.value) && ts.lane === wa.lane;
    allAgree = allAgree && agree;
    const inp = `${c.a} + ${c.b}`.padEnd(15);
    console.log(`${inp}  ${String(ts.value).padEnd(15)}  ${String(wa.value).padEnd(15)}  ${agree ? ' yes ' : ' NO  '}  ${ts.lane}`);
  }

  console.log('');
  console.log(`interface seen by the registry:`);
  console.log(`  TS   : { id, inputs:['in'], outputs:['out'], runtime:'builtin' }`);
  console.log(`  wasm : { id, inputs:['in'], outputs:['out'], runtime:'wasm', module.sha256:${wasmComponent.module.sha256.slice(0, 12)}… }`);
  console.log(`  identical ports, identical lanes — only 'runtime' differs.`);
  console.log('');
  console.log(`provenance: the wasm result is REPLAYABLE. Anyone holding the`);
  console.log(`module hash + the inputs can re-run it and get the same bytes.`);
  console.log(`The TS result is only reproducible if you trust our source tree.`);
  console.log('');
  console.log(allAgree ? 'ALL CASES AGREE ✓' : 'DISAGREEMENT ✗');
  process.exit(allAgree ? 0 : 1);
}

main();
