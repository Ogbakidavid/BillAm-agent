import { ProviderFactory } from "../../src/llm/providerFactory";
import { LLMClient } from "../../src/llm/LLMClient";
import { BedrockConfigError } from "../../src/llm/BedrockLLMClient";

function makeFakeProvider(behavior: "success" | "always-fail" | "fail-then-succeed" | "config-error"): { client: LLMClient; getCallCount: () => number } {
  let callCount = 0;
  return {
    getCallCount: () => callCount,
    client: {
      generateResponse: async (prompt: string) => {
        callCount++;
        if (behavior === "success") return `response to: ${prompt}`;
        if (behavior === "always-fail") throw new Error("simulated failure");
        if (behavior === "config-error") throw new BedrockConfigError("bedrock", "AWS credentials not configured");
        if (behavior === "fail-then-succeed") {
          if (callCount < 2) throw new Error("simulated transient failure");
          return `recovered response to: ${prompt}`;
        }
        throw new Error("unreachable");
      },
    },
  };
}

describe("ProviderFactory", () => {
  test("uses primary provider when it succeeds", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("success").client);
    factory.register("anthropic", makeFakeProvider("success").client);

    const result = await factory.generateResponse("hello");
    expect(result).toBe("response to: hello");
  });

  test("falls back to second provider when primary fails", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("always-fail").client);
    factory.register("anthropic", makeFakeProvider("success").client);

    const result = await factory.generateResponse("hello");
    expect(result).toBe("response to: hello");
  });

  test("retries a transient failure before giving up on that provider", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("fail-then-succeed").client);

    const result = await factory.generateResponse("hello");
    expect(result).toBe("recovered response to: hello");
  });

  test("fails fast on BedrockConfigError without retrying", async () => {
    const factory = new ProviderFactory();
    const bedrockMock = makeFakeProvider("config-error");
    const anthropicMock = makeFakeProvider("success");

    factory.register("bedrock", bedrockMock.client);
    factory.register("anthropic", anthropicMock.client);

    const startTime = Date.now();
    const result = await factory.generateResponse("hello");
    const duration = Date.now() - startTime;

    expect(result).toBe("response to: hello");
    expect(bedrockMock.getCallCount()).toBe(1); // Called exactly once, no retries
    expect(anthropicMock.getCallCount()).toBe(1);
    expect(duration).toBeLessThan(100); // Fail-fast in < 100ms
  });

  test("throws when all providers fail", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("always-fail").client);
    factory.register("anthropic", makeFakeProvider("always-fail").client);

    await expect(factory.generateResponse("hello")).rejects.toThrow("All providers failed");
  });

  test("throws immediately when no providers are registered", async () => {
    const factory = new ProviderFactory();
    await expect(factory.generateResponse("hello")).rejects.toThrow("No providers registered");
  });
});