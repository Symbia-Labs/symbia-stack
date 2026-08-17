/**
 * Emit add.wasm from hand-encoded bytes — no wasm toolchain required, so the
 * spike has zero external dependency (the "build it through our own stack"
 * rule applies to experiments too).
 *
 * The bytes below are the exact binary encoding of add.wat. Layout:
 *   magic+version | type section | func section | export section | code section
 */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const bytes = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // \0asm, version 1
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7c, 0x7c, 0x01, 0x7c, // type: (f64,f64)->f64
  0x03, 0x02, 0x01, 0x00,                         // func: one func, type 0
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // export "add" -> func 0
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0xa0, 0x0b, // code: get 0, get 1, f64.add, end
]);

const out = new URL('./add.wasm', import.meta.url);
writeFileSync(out, bytes);

const digest = createHash('sha256').update(bytes).digest('hex');
console.log(`wrote add.wasm (${bytes.length} bytes)`);
console.log(`sha256: ${digest}`);
console.log('^ that hash is the component. It IS the catalog checksum, and it');
console.log('  is stable: rebuild on any machine, same bytes, same identity.');
