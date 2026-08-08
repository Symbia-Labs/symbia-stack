/**
 * Vision classification for captured frames.
 *
 * THERE IS NO VISION MODEL LOADED. Measured 7 Aug 2026: the models service has
 * no reference to mmproj, CLIP or image input anywhere, and the only GGUFs on
 * disk are text-only (llama-3.2-1b, llama-3.2-3b, qwen). node-llama-cpp 3.3.0
 * can do vision with a projector file, but no projector exists here.
 *
 * So this endpoint exists, is registered, is reachable over the mesh, and
 * REFUSES. It reports exactly what is missing and what would fix it. That is
 * deliberate: a classifier that returned a plausible guess with no model behind
 * it would be the purest form of the defect this platform exists to prevent —
 * a confident answer standing on nothing, wearing the costume of one that
 * stands on something.
 *
 * To make it real: put a vision GGUF and its mmproj projector in MODELS_PATH
 * and set VISION_MODEL / VISION_MMPROJ. The wiring below is complete up to the
 * point where a model would be invoked.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { config } from "./config.js";

export interface ClassifyRequest {
  /** PNG bytes, base64. */
  imageBase64: string;
  /** Optional question. Absent means "describe what this is". */
  prompt?: string;
  /** Where the frame came from, for the record. */
  source?: string;
}

export type ClassifyResult =
  | {
      ok: true;
      arena: "COMPOSED";
      model: string;
      description: string;
      imageDigest: string;
      bytes: number;
    }
  | {
      ok: false;
      arena: "REFUSED";
      reason: string;
      missing: string[];
      imageDigest: string;
      bytes: number;
      /** What would make this work. Stated, not left to be guessed at. */
      remedy: string;
    };

function modelPaths(): { model?: string; mmproj?: string } {
  const dir = config.modelsPath;
  const model = process.env.VISION_MODEL;
  const mmproj = process.env.VISION_MMPROJ;
  return {
    model: model ? path.resolve(dir, model) : undefined,
    mmproj: mmproj ? path.resolve(dir, mmproj) : undefined,
  };
}

/** What is missing, if anything. Empty array means a model could run. */
export function visionReadiness(): string[] {
  const { model, mmproj } = modelPaths();
  const missing: string[] = [];
  if (!model) missing.push("VISION_MODEL not set");
  else if (!existsSync(model)) missing.push(`VISION_MODEL not found at ${model}`);
  if (!mmproj) missing.push("VISION_MMPROJ not set (multimodal projector)");
  else if (!existsSync(mmproj)) missing.push(`VISION_MMPROJ not found at ${mmproj}`);
  return missing;
}

export async function classifyImage(req: ClassifyRequest): Promise<ClassifyResult> {
  const bytes = Buffer.byteLength(req.imageBase64, "base64");
  // The digest identifies the frame in a receipt without the receipt carrying
  // a second copy of the image.
  const imageDigest = createHash("sha256")
    .update(req.imageBase64)
    .digest("hex")
    .slice(0, 16);

  const missing = visionReadiness();
  if (missing.length > 0) {
    return {
      ok: false,
      arena: "REFUSED",
      reason: "No vision model is loaded, so this frame was not looked at.",
      missing,
      imageDigest,
      bytes,
      remedy:
        "Place a vision GGUF and its mmproj projector in MODELS_PATH, then set " +
        "VISION_MODEL and VISION_MMPROJ. Nothing else here needs to change.",
    };
  }

  // A model is present. Left unimplemented rather than approximated: wiring
  // node-llama-cpp's multimodal path without a model to test against would
  // produce code nobody has ever seen run, which is worse than an honest gap.
  return {
    ok: false,
    arena: "REFUSED",
    reason:
      "A vision model is configured but the inference path is not implemented yet.",
    missing: ["node-llama-cpp multimodal invocation"],
    imageDigest,
    bytes,
    remedy:
      "Implement the LlamaContext image path in models/server/src/vision.ts. " +
      "The model files are present, so this is the only remaining step.",
  };
}
