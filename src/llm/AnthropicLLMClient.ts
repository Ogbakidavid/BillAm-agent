// Direct Anthropic API fallback
import Anthropic from "@anthropic-ai/sdk";
import { LLMClient, LLMProviderError } from "./LLMClient";

export class AnthropicLLMClient implements LLMClient {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-xxxx")) {
      throw new LLMProviderError("anthropic", "Anthropic API key not configured");
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  async generateResponse(prompt: string): Promise<string> {
    const client = this.getClient();

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in Anthropic response");
      }

      return textBlock.text;
    } catch (err) {
      throw new LLMProviderError(
        "anthropic",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}