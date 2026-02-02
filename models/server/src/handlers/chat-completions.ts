/**
 * Chat completions handler - OpenAI-compatible API
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { getEngine } from "../llama/engine.js";

const chatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().positive().optional().default(2048),
  stream: z.boolean().optional().default(false),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function handleChatCompletions(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const parsed = chatCompletionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          message: "Invalid request body",
          type: "invalid_request_error",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { model, messages, temperature, max_tokens, stream, stop } = parsed.data;
    const engine = getEngine();

    if (stream) {
      // Server-Sent Events for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const requestId = `chatcmpl-${Date.now()}`;
      let totalTokens = 0;

      try {
        await engine.chatCompletion(
          model,
          messages,
          {
            temperature,
            maxTokens: max_tokens,
            stop: typeof stop === "string" ? [stop] : stop,
          },
          (token: string) => {
            totalTokens++;
            const chunk = {
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: token },
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        );

        // Send final chunk with finish_reason
        const finalChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (err) {
        const errorChunk = {
          error: {
            message: err instanceof Error ? err.message : "Streaming error",
            type: "server_error",
          },
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming response
      const startTime = Date.now();
      const result = await engine.chatCompletion(model, messages, {
        temperature,
        maxTokens: max_tokens,
        stop: typeof stop === "string" ? [stop] : stop,
      });

      const response = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: result.content,
            },
            finish_reason: result.finishReason || "stop",
          },
        ],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        },
      };

      res.json(response);
    }
  } catch (err) {
    console.error("[chat-completions] Error:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Internal server error",
        type: "server_error",
      },
    });
  }
}
