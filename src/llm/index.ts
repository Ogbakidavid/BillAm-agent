// Single shared ProviderFactory instance, used by all tools
import { ProviderFactory } from "./providerFactory";
import { BedrockLLMClient } from "./BedrockLLMClient";
import { AnthropicLLMClient } from "./AnthropicLLMClient";

const llmProvider = new ProviderFactory();
llmProvider.register("bedrock", new BedrockLLMClient());
llmProvider.register("anthropic", new AnthropicLLMClient());

export { llmProvider };