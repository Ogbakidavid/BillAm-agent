// Amazon Bedrock implementation
import { LLMClient, LLMProviderError } from "./LLMClient";

export class BedrockLLMClient implements LLMClient {
  async generateResponse(prompt: string): Promise<string> {
    if (!process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID.startsWith("xxxx")) {
      throw new LLMProviderError("bedrock", "AWS credentials not configured");
    }

    // Real Bedrock call goes here once credentials are confirmed working.
    throw new LLMProviderError("bedrock", "Bedrock call not yet implemented");
  }
}