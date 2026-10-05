/**
 * Chat completions handler - OpenAI-compatible API
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { getEngine } from "../llama/engine.js";
// The provider list lives in remote.ts, beside the code that executes against
// it, so the registry and this router cannot disagree about what is brokered.
import { executeRemoteChat, REMOTE_PROVIDERS } from "../remote.js";

/**
 * Execute a remote completion by delegating to integrations.
 *
 * The caller's bearer is forwarded and nothing is stored. Without one this
 * refuses rather than guessing: integrations resolves credentials per user and
 * org, so an unauthenticated remote call has no identity to resolve against,
 * and saying so is more useful than a 500 from two services away.
 */
async function handleRemote(
  req: Request,
  res: Response,
  opts: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  }
): Promise<void> {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;

  if (!bearer) {
    res.status(401).json({
      error: {
        message:
          `Remote model '${opts.provider}/${opts.model}' requires an Authorization header. ` +
          `Credentials are resolved per user and organisation by the integrations service; ` +
          `this service forwards your token and holds no key of its own.`,
        type: "invalid_request_error",
        code: "authentication_required",
      },
    });
    return;
  }

  if (opts.stream) {
    // Said plainly rather than silently answering non-streamed. A caller that
    // asked for a stream and got one response would look like a hang.
    res.status(400).json({
      error: {
        message:
          "Streaming is not yet supported for remote models. The integrations execute API " +
          "returns a complete response; streaming remote completions is not built.",
        type: "invalid_request_error",
        code: "streaming_unsupported",
      },
    });
    return;
  }

  const orgId = req.headers["x-org-id"];
  const result = await executeRemoteChat(
    {
      provider: opts.provider,
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    },
    { token: bearer, orgId: typeof orgId === "string" ? orgId : undefined }
  );

  // EVERY BROKERED COMPLETION SAYS SO.
  //
  // This logged only when a parameter was dropped, so a successful brokered
  // call left no trace — and after stage 3 switched the assistants service
  // over, there was no way to tell from the outside whether completions were
  // going through the broker or still going direct to integrations. Absence of
  // evidence read as evidence, which is the one inference this project bans.
  console.log(
    `[chat] brokered ${opts.provider}/${opts.model} -> ran ${result.model}` +
      (result.droppedParams.length
        ? ` — dropped ${result.droppedParams.map((d) => `${d.param} (${d.reason})`).join(", ")}`
        : "")
  );

  res.json({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.content },
        finish_reason: result.finishReason ?? "stop",
      },
    ],
    usage: result.usage
      ? {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens:
            result.usage.totalTokens ??
            result.usage.promptTokens + result.usage.completionTokens,
        }
      : undefined,
    // Receipt material the OpenAI shape has no room for. Parameters the broker
    // refused to send are part of what happened, and a caller that asked for
    // temperature 0 and silently got the provider default could never find out.
    symbia: {
      source: "remote",
      provider: opts.provider,
      requestedModel: `${opts.provider}/${opts.model}`,
      ranModel: result.model,
      droppedParams: result.droppedParams,
    },
  });
}

const chatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  // ABSENT MEANS ABSENT — no default.
  //
  // This read `.default(0.7)`, so every request that did not mention
  // temperature acquired one. That is the precise failure measured on 12 Aug
  // against claude-sonnet-5 ("`temperature` is deprecated for this model"),
  // and it was sitting in the front door of the service meant to prevent it.
  //
  // A default nobody asked for is not a convenience; it is an unrequested
  // claim about how the caller wants the model to behave, and for some models
  // it is a hard error.
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
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

    // REMOTE MODELS ARE ADDRESSED `provider/model`, AS THE REGISTRY PUBLISHES
    // THEM. Anything without a known provider prefix is local, which keeps
    // every existing local caller working unchanged.
    const slash = model.indexOf("/");
    const maybeProvider = slash > 0 ? model.slice(0, slash) : null;
    if (maybeProvider && REMOTE_PROVIDERS.has(maybeProvider)) {
      await handleRemote(req, res, {
        provider: maybeProvider,
        model: model.slice(slash + 1),
        messages,
        temperature,
        maxTokens: max_tokens,
        stream,
      });
      return;
    }

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
