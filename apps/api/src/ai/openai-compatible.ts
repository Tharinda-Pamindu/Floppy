import OpenAI, { APIConnectionError, APIError } from "openai";
import { z } from "zod";
import { AiProviderError, type AiProvider } from "../ports.js";

/**
 * Any OpenAI-compatible chat completions endpoint: Groq
 * (https://api.groq.com/openai/v1) or xAI (https://api.x.ai/v1). The model
 * is asked for a JSON object described by a JSON Schema, and the reply is
 * validated with zod — never trusted as-is.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    baseURL: string,
    public readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 1 });
  }

  async generateObject<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    schemaName: string;
    temperature: number;
    signal: AbortSignal;
  }) {
    const jsonSchema = z.toJSONSchema(input.schema, { target: "draft-7" });
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model: this.model,
          temperature: input.temperature,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${input.system}\n\nJSON schema (${input.schemaName}):\n${JSON.stringify(jsonSchema)}`,
            },
            { role: "user", content: input.prompt },
          ],
        },
        { signal: input.signal },
      );
    } catch (err) {
      if (input.signal.aborted) throw new AiProviderError("timeout", "AI request timed out");
      if (err instanceof APIConnectionError) throw new AiProviderError("unreachable", err.message);
      if (err instanceof APIError) {
        if (err.status === 429) throw new AiProviderError("rate_limited", err.message, 429);
        throw new AiProviderError("provider_http", err.message, err.status);
      }
      throw new AiProviderError("unreachable", String(err));
    }
    const text = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiProviderError("invalid_output", "Model reply was not JSON");
    }
    const result = input.schema.safeParse(parsed);
    if (!result.success) throw new AiProviderError("invalid_output", result.error.message);
    return {
      object: result.data,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
    };
  }
}
