/**
 * Where the imagine host is listening. Imports nothing on purpose.
 *
 * This was inside host.mjs, and sidecar.mjs imported it back — host awaits
 * sidecar, sidecar awaits host, and ESM top-level await deadlocks. Not an
 * error, not a crash: execution simply stopped after "started assistants"
 * with no line in the log saying why. A shared constant with no dependencies
 * cannot participate in a cycle.
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ADDRESS_FILE = join(dirname(fileURLToPath(import.meta.url)), ".session", "host.json");

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
