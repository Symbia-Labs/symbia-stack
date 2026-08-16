/**
 * Where the imagine host is listening. Imports nothing on purpose.
 *
 * This was inside host.mjs, and sidecar.mjs imported it back — host awaits
 * sidecar, sidecar awaits host, and ESM top-level await deadlocks. Not an
 * error, not a crash: execution simply stopped after "started assistants"
 * with no line in the log saying why. A shared constant with no dependencies
 * cannot participate in a cycle.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ADDRESS_FILE = join(dirname(fileURLToPath(import.meta.url)), ".session", "host.json");

/**
 * Write the address a shim will attach to.
 *
 * MODE 0600, AND THE REASON IS THE FILE'S CONTENTS.
 *
 * This file used to hold a base URL and a pid, and was written 0644 because
 * neither is a secret. It now also holds the session token — the only thing
 * that gets a client past the gate — so the permissions became load-bearing
 * the moment the token arrived. Written with mode on `open`, not chmod'ed
 * afterwards: a file that is briefly world-readable and then tightened was
 * world-readable.
 *
 * The token is minted per spawn and dies with the process. Nothing to paste
 * into a config file, nothing to rotate, and no value that outlives the thing
 * it authorises. Same construction as the session signing identity, applied to
 * transport instead of to signatures.
 */
export function writeAddress(address) {
  mkdirSync(dirname(ADDRESS_FILE), { recursive: true });
  writeFileSync(ADDRESS_FILE, JSON.stringify(address, null, 2), { mode: 0o600 });
}

/**
 * The recorded address, or null. Existence is a HINT — the file is removed
 * on clean takedown, so a file left behind means the host died badly. A
 * caller must confirm with a request before believing it.
 */
export function readAddress() {
  if (!existsSync(ADDRESS_FILE)) return null;
  try { return JSON.parse(readFileSync(ADDRESS_FILE, "utf8")); } catch { return null; }
}

export function clearAddress() {
  try { unlinkSync(ADDRESS_FILE); } catch { /* already gone */ }
}
