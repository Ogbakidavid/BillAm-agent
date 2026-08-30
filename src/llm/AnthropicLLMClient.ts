// Direct Anthropic API fallback
import { LLMClient, LLMProviderError } from "./LLMClient";

export class AnthropicLLMClient implements LLMClient {
  async generateResponse(prompt: string): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("sk-ant-xxxx")) {
      throw new LLMProviderError("anthropic", "Anthropic API key not configured");
    }

    // Real Anthropic call goes here once the key is available.
    throw new LLMProviderError("anthropic", "Anthropic call not yet implemented");
  }
}