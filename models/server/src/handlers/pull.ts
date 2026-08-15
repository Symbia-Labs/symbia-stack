/**
 * POST /api/models/pull — acquire a weights artifact through the platform.
 *
 * Closes DEFECTS.md §2 (models-defect-closure stage 4). The BYTES come in
 * through the integrations service (`/api/integrations/download`) — ruling
 * 15 Aug: models come in through integrations; this service orchestrates,
 * selects, applies, manages. It decides WHAT to pull, hands the fetch over
 * with the caller's own bearer, digests DURING the stream, registers a
 * signed `artifact.registered` event in the ledger beside the weights, and
 * writes the catalog card. No socket to a third party is opened here, and
 * no credential is held here — same delegation shape as remote.ts.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { registeredPayload } from "@symbia/lineage";
import { getEngine } from "../llama/engine.js";
import { config } from "../config.js";
import { appendArtifactRegistered } from "../lineage-ledger.js";
import { syncModelsToCatalog } from "../catalog/model-sync.js";

const pullSchema = z.object({
  /** HuggingFace `owner/repo`. */
  repo: z.string().regex(/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/),
  /** A GGUF filename — no path separators, so it cannot escape MODELS_PATH. */
  file: z.string().regex(/^[A-Za-z0-9][\w.-]*\.gguf$/),
  revision: z.string().regex(/^[\w.-]+$/).default("main"),
});

/** Same derivation the scanner uses, so pull and scan agree on identity. */
function modelIdFor(filename: string): string {
  return filename.replace(/\.gguf$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export async function handlePullModel(req: Request, res: Response): Promise<void> {
  const parsed = pullSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "repo and file required (file must be a plain .gguf name)", details: parsed.error.issues } });
    return;
  }
  const { repo, file, revision } = parsed.data;
  const dest = join(config.modelsPath, file);
  const id = modelIdFor(file);

  if (existsSync(dest)) {
    // Idempotent: the artifact is content-addressed, so a re-pull of a
    // present file answers with what is already known rather than 409ing.
    const existing = await getEngine().getModel(id);
    res.status(200).json({
      id,
      alreadyPresent: true,
      digest: existing?.digest ? `sha256:${existing.digest}` : undefined,
    });
    return;
  }

  const partial = `${dest}.partial`;
  const hash = createHash("sha256");
  let bytes = 0;

  try {
    // FORWARDED, NOT HELD — the caller's bearer goes to integrations, which
    // owns egress and the vault. Same discipline as the registry's remote
    // listing.
    const upstream = await fetch(`${config.integrationsServiceUrl}/api/integrations/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      body: JSON.stringify({ provider: "huggingface", repo, file, revision }),
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      res.status(502).json({ error: { message: `integrations download returned ${upstream.status}: ${detail.slice(0, 200)}` } });
      return;
    }
    const sourceUrl = upstream.headers.get("x-source-url") ?? `https://huggingface.co/${repo}/resolve/${revision}/${file}`;

    const hasher = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        bytes += chunk.length;
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(upstream.body as never), hasher, createWriteStream(partial));
    await rename(partial, dest);

    const digestHex = hash.digest("hex");
    const fileStat = await stat(dest);

    // Rescan so the engine registers it; its independent hash of the same
    // bytes must agree with the stream hash, or the write itself is suspect.
    const engine = getEngine();
    await engine.scanModels();
    const model = await engine.getModel(id);
    if (!model) {
      res.status(500).json({ error: { message: "pulled file did not register on rescan" } });
      return;
    }
    if (model.digest && model.digest !== digestHex) {
      res.status(500).json({ error: { message: `stream digest ${digestHex.slice(0, 16)}… != scanned digest ${model.digest.slice(0, 16)}… — file altered between write and scan` } });
      return;
    }

    const event = appendArtifactRegistered(
      registeredPayload({
        digest: `sha256:${digestHex}`,
        bytes: fileStat.size,
        format: "gguf",
        source: { type: "huggingface", repo, file, url: sourceUrl },
      })
    );

    await syncModelsToCatalog([model]);

    res.status(201).json({
      id,
      digest: `sha256:${digestHex}`,
      bytes: fileStat.size,
      source: { repo, file, revision },
      registered: event
        ? { eventId: event.event_id, checksum: event.checksum, signed: event.signature != null }
        : null,
    });
  } catch (err) {
    await unlink(partial).catch(() => {});
    res.status(500).json({ error: { message: err instanceof Error ? err.message : "pull failed" } });
  }
}
