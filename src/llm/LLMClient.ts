// Shared provider interface
export interface LLMClient {
  generateResponse(prompt: string): Promise<string>;
}

export class LLMProviderError extends Error {
  constructor(public provider: string, message: string) {
    super(message);
    this.name = "LLMProviderError";
  }
}