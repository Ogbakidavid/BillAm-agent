// Selects the active provider based on environment configuration

import { LLMClient, LLMProviderError } from "./LLMClient";

interface ProviderEntry {
  name: string;
  client: LLMClient;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry(entry: ProviderEntry, prompt: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await entry.client.generateResponse(prompt);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw new LLMProviderError(
    entry.name,
    `${entry.name} failed after ${MAX_RETRIES + 1} attempts: ${lastError}`
  );
}

export class ProviderFactory {
  private providers: ProviderEntry[] = [];

  register(name: string, client: LLMClient): void {
    this.providers.push({ name, client });
  }

  async generateResponse(prompt: string): Promise<string> {
    if (this.providers.length === 0) {
      throw new LLMProviderError("none", "No providers registered");
    }

    const failures: string[] = [];

    for (const entry of this.providers) {
      try {
        return await callWithRetry(entry, prompt);
      } catch (err) {
        failures.push(`${entry.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    throw new LLMProviderError(
      "all",
      `All providers failed — ${failures.join(" | ")}`
    );
  }
}