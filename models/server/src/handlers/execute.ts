/**
 * Symbia-compatible execute endpoint
 * Matches the integrations service API pattern
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { getEngine } from "../llama/engine.js";
import { config } from "../config.js";

const executeRequestSchema = z.object({
  provider: z.string(),
  operation: z.string(),
  params: z.object({
    model: z.string(),
    messages: z.array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })
    ).optional(),
    prompt: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    input: z.union([z.string(), z.array(z.string())]).optional(),
  }),
});

export async function handleExecute(
  req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const parsed = executeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        errorCategory: "validation",
        retryable: false,
        requestId,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const { provider, operation, params } = parsed.data;

    // Verify this is for our provider
    if (provider !== config.providerName && provider !== "local") {
      res.status(400).json({
        success: false,
        error: `Provider '${provider}' not supported by this service`,
        errorCategory: "validation",
        retryable: false,
        requestId,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const engine = getEngine();

    if (operation === "chat.completions" || operation === "messages") {
      const messages = params.messages || [
        { role: "user" as const, content: params.prompt || "" },
      ];

      const result = await engine.chatCompletion(params.model, messages, {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });

      res.json({
        success: true,
        data: {
          provider: config.providerName,
          model: params.model,
          content: result.content,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          },
          finishReason: result.finishReason || "stop",
        },
        requestId,
        durationMs: Date.now() - startTime,
      });
    } else if (operation === "embeddings") {
      const input = params.input
        ? Array.isArray(params.input)
          ? params.input
          : [params.input]
        : [];

      const embeddings = await engine.embed(params.model, input);

      res.json({
        success: true,
        data: {
          provider: config.providerName,
          model: params.model,
          embeddings,
          usage: {
            promptTokens: input.join(" ").split(/\s+/).length,
            totalTokens: input.join(" ").split(/\s+/).length,
          },
        },
        requestId,
        durationMs: Date.now() - startTime,
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Operation '${operation}' not supported`,
        errorCategory: "validation",
        retryable: false,
        requestId,
        durationMs: Date.now() - startTime,
      });
    }
  } catch (err) {
    console.error("[execute] Error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Internal server error",
      errorCategory: "internal",
      retryable: true,
      requestId,
      durationMs: Date.now() - startTime,
    });
  }
}
