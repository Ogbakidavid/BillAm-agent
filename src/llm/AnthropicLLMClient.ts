// Direct Anthropic API fallback
import Anthropic from "@anthropic-ai/sdk";
import { LLMClient, LLMProviderError } from "./LLMClient";

export class AnthropicLLMClient implements LLMClient {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    const key = process.env.ANTHROPIC_API_KEY;
    console.log("[AnthropicLLMClient] API Key check:");
    console.log("[AnthropicLLMClient] Key exists:", !!key);
    console.log("[AnthropicLLMClient] Key length:", key?.length);
    console.log("[AnthropicLLMClient] First 15 chars:", key?.substring(0, 15));
    console.log("[AnthropicLLMClient] Last 10 chars:", key?.substring(Math.max(0, key.length - 10)));
    console.log("[AnthropicLLMClient] Starts with sk-ant:", key?.startsWith("sk-ant"));

    if (!key || key.startsWith("sk-ant-xxxx")) {
      throw new LLMProviderError("anthropic", "Anthropic API key not configured");
    }

    if (!this.client) {
      console.log("[AnthropicLLMClient] Creating new Anthropic client with key");
      this.client = new Anthropic({ apiKey: key });
      console.log("[AnthropicLLMClient] Client created successfully");
    }
    return this.client;
  }

  async generateResponse(prompt: string): Promise<string> {
    const client = this.getClient();

    try {
      console.log("[AnthropicLLMClient] Calling messages.create with model: claude-sonnet-4-5");
      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      console.log("[AnthropicLLMClient] Response received:", message.stop_reason);
      const textBlock = message.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in Anthropic response");
      }

      return textBlock.text;
    } catch (err) {
      console.error("[AnthropicLLMClient] ERROR:", err);
      throw new LLMProviderError(
        "anthropic",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}