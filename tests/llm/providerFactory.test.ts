import { ProviderFactory } from "../../src/llm/providerFactory";
import { LLMClient } from "../../src/llm/LLMClient";

function makeFakeProvider(behavior: "success" | "always-fail" | "fail-then-succeed"): LLMClient {
  let callCount = 0;
  return {
    generateResponse: async (prompt: string) => {
      callCount++;
      if (behavior === "success") return `response to: ${prompt}`;
      if (behavior === "always-fail") throw new Error("simulated failure");
      if (behavior === "fail-then-succeed") {
        if (callCount < 2) throw new Error("simulated transient failure");
        return `recovered response to: ${prompt}`;
      }
      throw new Error("unreachable");
    },
  };
}

describe("ProviderFactory", () => {
  test("uses primary provider when it succeeds", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("success"));
    factory.register("anthropic", makeFakeProvider("success"));

    const result = await factory.generateResponse("hello");
    expect(result).toBe("response to: hello");
  });

  test("falls back to second provider when primary fails", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("always-fail"));
    factory.register("anthropic", makeFakeProvider("success"));

    const result = await factory.generateResponse("hello");
    expect(result).toBe("response to: hello");
  });

  test("retries a transient failure before giving up on that provider", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("fail-then-succeed"));

    const result = await factory.generateResponse("hello");
    expect(result).toBe("recovered response to: hello");
  });

  test("throws when all providers fail", async () => {
    const factory = new ProviderFactory();
    factory.register("bedrock", makeFakeProvider("always-fail"));
    factory.register("anthropic", makeFakeProvider("always-fail"));

    await expect(factory.generateResponse("hello")).rejects.toThrow("All providers failed");
  });

  test("throws immediately when no providers are registered", async () => {
    const factory = new ProviderFactory();
    await expect(factory.generateResponse("hello")).rejects.toThrow("No providers registered");
  });
});