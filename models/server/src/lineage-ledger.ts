/**
 * The models service's artifact ledger.
 *
 * Every artifact this service acquires gets a signed `artifact.registered`
 * event, appended to a JSONL ledger BESIDE THE WEIGHTS (`.lineage.jsonl` in
 * MODELS_PATH), with the service's public key in a sidecar so the ledger
 * verifies from the directory alone. JSONL-on-disk is the dev persistence
 * ruling; the chain head is resumed from the last line, so a restart
 * continues the chain instead of quietly starting a new one — the defect
 * shape §4 of STATUS records for conversation chains.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadServiceIdentity,
  identityId,
  type ServiceIdentity,
} from "@symbia/crypto";
import {
  GENESIS,
  sealArtifactEvent,
  lineageLine,
  type ArtifactRegisteredPayload,
  type LineageEvent,
} from "@symbia/lineage";
import { config } from "./config.js";

let cachedIdentity: ServiceIdentity | null | undefined;
function serviceIdentity(): ServiceIdentity | null {
  if (cachedIdentity === undefined) {
    try {
      cachedIdentity = loadServiceIdentity({ role: "models" });
    } catch {
      cachedIdentity = null;
    }
  }
  return cachedIdentity;
}

const ledgerPath = () => join(config.modelsPath, ".lineage.jsonl");
const pubKeyPath = () => join(config.modelsPath, ".lineage.pub.pem");

/** Resume the chain from the ledger's last line; GENESIS for a fresh one. */
function chainHead(): string {
  const p = ledgerPath();
  if (!existsSync(p)) return GENESIS;
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return GENESIS;
  try {
    const last = JSON.parse(lines[lines.length - 1]) as LineageEvent;
    return typeof last.checksum === "string"
      ? last.checksum.replace(/^sha256:/, "")
      : GENESIS;
  } catch {
    // A corrupt tail breaks the chain from that point — the library's
    // documented degradation. Starting a fresh chain here would HIDE the
    // corruption; refusing to append is the honest failure.
    throw new Error(`ledger tail is not parseable JSON: ${p}`);
  }
}

/**
 * Seal and append an artifact.registered event. Returns the event, or null
 * when no service identity is available — an absent signature must look
 * absent, and the caller decides whether an unsigned registration is worth
 * recording (it is not: no event is written without an identity, because a
 * ledger of unsigned claims beside signed ones invites reading them alike).
 */
export function appendArtifactRegistered(
  payload: ArtifactRegisteredPayload
): LineageEvent | null {
  const sid = serviceIdentity();
  if (!sid) {
    console.warn("[ledger] no service identity — registration not recorded");
    return null;
  }
  const actor = identityId("service:models", sid.identity.fingerprint);
  const sealed = sealArtifactEvent({
    eventType: "artifact.registered",
    payload,
    actor,
    chain: chainHead(),
    parents: [null],
    identity: sid.identity,
  });
  appendFileSync(ledgerPath(), lineageLine(sealed.event));
  if (!existsSync(pubKeyPath())) {
    writeFileSync(pubKeyPath(), sid.identity.publicKeyPem);
  }
  return sealed.event;
}
