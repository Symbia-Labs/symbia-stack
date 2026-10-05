/**
 * Capability in three states: absent, granted-and-scoped, denied.
 *
 * The guest (file-reader.wasm) can only touch the filesystem through its
 * imported `host.read_byte`. The host backs that import with @symbia/pathguard
 * — the SAME confinement the platform already ships — so the grant is scoped
 * by real policy, not a toy check written for the demo.
 *
 * We show:
 *   State A  no capability wired  -> the component cannot even instantiate.
 *   State B  granted, in-workspace -> reads succeed, mediated, lane apocryphal.
 *   State C  granted, escaping path -> pathguard denies at the host boundary,
 *            the wasm read TRAPS, the escape never happens.
 *   State D  granted, blocked path (.env) -> denied by policy, same trap.
 *
 * Run:  node build.mjs && node spike.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfinedPath } from '../../symbia-pathguard/dist/index.js';

// ── Set up a workspace with one readable file, one blocked file, and a
//    secret OUTSIDE the workspace the guest must never reach. ────────────────
const workspace = mkdtempSync(join(tmpdir(), 'ws-'));
writeFileSync(join(workspace, 'data.bin'), Uint8Array.from([10, 20, 30, 40, 5, 6]));
writeFileSync(join(workspace, '.env'), 'SECRET=1\n');
writeFileSync(join(workspace, '..', 'secret.bin'), Uint8Array.from([99, 99, 99, 99]));

const policy = { paths: ['**/*'], blockedPaths: ['**/.env*', '.env*', '**/secrets/**'] };

// The host's slot table: which workspace-relative path each slot names.
// slot 0 is inside; slot 1 escapes; slot 2 is blocked by policy.
const slots = { 0: 'data.bin', 1: '../secret.bin', 2: '.env' };

const wasmBytes = readFileSync(new URL('./file-reader.wasm', import.meta.url));

// Every read is mediated by the host. A denial THROWS, which traps the wasm
// call — the read simply cannot occur.
const grantLog = [];

// resolveConfinedPath is async; wasm imports must be sync. So we pre-resolve
// each slot once (the grant decision) and hand the guest a sync reader over
// the resolved, allowed handles. Pre-resolution IS the capability check.
async function grantCapability() {
  const resolved = {};
  for (const [slot, rel] of Object.entries(slots)) {
    try {
      resolved[slot] = await resolveConfinedPath(workspace, rel, policy);
    } catch (e) {
      resolved[slot] = { denied: e.message };
    }
  }
  const read_byte = (slot, offset) => {
    const r = resolved[slot];
    if (r && r.denied) {
      grantLog.push(`DENY  slot ${slot} (${slots[slot]}): ${r.denied}`);
      throw new Error(`capability denied: ${r.denied}`); // traps the wasm call
    }
    const buf = readFileSync(r);
    grantLog.push(`ALLOW slot ${slot} (${slots[slot]}) offset ${offset} -> ${buf[offset]}`);
    return offset < buf.length ? buf[offset] : 0;
  };
  return { host: { read_byte } };
}

async function main() {
  console.log(`workspace: ${workspace}`);
  console.log('');

  // ── State A: no capability wired ──────────────────────────────────────────
  try {
    await WebAssembly.instantiate(wasmBytes, {}); // empty imports
    console.log('State A  UNEXPECTED: instantiated without the capability');
  } catch (e) {
    console.log(`State A  no capability wired -> ${e.constructor.name}: component cannot instantiate.`);
    console.log('         The authority is ABSENT, not merely denied. The module has no');
    console.log('         expressible way to read a byte.');
  }
  console.log('');

  // ── States B/C/D: capability granted (pathguard-scoped), varying paths ─────
  const imports = await grantCapability();
  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
  const checksum4 = instance.exports.checksum4;

  // B: in-workspace file
  grantLog.length = 0;
  const b = checksum4(0);
  console.log(`State B  granted + in-workspace (data.bin): checksum4 = ${b}  (predicted 100)`);
  grantLog.forEach((l) => console.log('         ' + l));
  console.log('         lane: APOCRYPHAL — file bytes are ambient input, not recomputable');
  console.log('         from the graph. Importing the fs capability FORCED the lane.');
  console.log('');

  // C: escaping path
  grantLog.length = 0;
  try {
    checksum4(1);
    console.log('State C  UNEXPECTED: escaping read succeeded');
  } catch (e) {
    console.log(`State C  granted + escaping (../secret.bin): wasm TRAPPED — ${e.message}`);
    grantLog.forEach((l) => console.log('         ' + l));
    console.log('         pathguard refused at the host boundary; the read never happened.');
  }
  console.log('');

  // D: blocked-by-policy path
  grantLog.length = 0;
  try {
    checksum4(2);
    console.log('State D  UNEXPECTED: blocked read succeeded');
  } catch (e) {
    console.log(`State D  granted + blocked (.env): wasm TRAPPED — ${e.message}`);
    grantLog.forEach((l) => console.log('         ' + l));
  }
  console.log('');

  const ok = b === 100;
  console.log(ok ? 'ADD-UP CHECK ✓ (hand-encoded module computes correctly)' : 'CHECK ✗');
  console.log('');
  console.log('The point: the guest never had ambient authority. It got exactly one');
  console.log('capability, scoped by pathguard, and could reach nothing else — by');
  console.log('construction, not by vigilance. That is the A1 boundary, structurally.');
  process.exit(ok ? 0 : 1);
}

main();
