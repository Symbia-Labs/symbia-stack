import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/sidecar/host-address.mjs
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_ADDRESS_FILE = join(dirname(fileURLToPath(import.meta.url)), ".session", "host.json");
function addressFile() {
  return process.env.IMAGINE_ADDRESS_FILE || DEFAULT_ADDRESS_FILE;
}
var ADDRESS_FILE = DEFAULT_ADDRESS_FILE;
function writeAddress(address) {
  const file = addressFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(address, null, 2), { mode: 384 });
}
function readAddress() {
  const file = addressFile();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function clearAddress() {
  try {
    unlinkSync(addressFile());
  } catch {
  }
}

export {
  addressFile,
  ADDRESS_FILE,
  writeAddress,
  readAddress,
  clearAddress
};
