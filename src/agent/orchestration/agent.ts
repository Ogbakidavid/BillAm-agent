import { Agent } from "@strands-agents/sdk";
import { AgentSkills } from "@strands-agents/sdk/vended-plugins/skills";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import * as fs from "fs";
import * as path from "path";

import { env } from "../../config/env";

// Tools
import { fetchKnowledgeBaseTool } from "../tools/fetchKnowledgeBase";
import { fetchPriceCatalogTool } from "../tools/fetchPriceCatalog";
import { updateJobStateTool } from "../tools/updateJobState";
import { simulateSendMessageTool } from "../tools/simulateSendMessage";

// Plugins / Hooks
import { toneGuardrail } from "../steering/toneGuardrail";
import { rateLimiterHook } from "../hooks/rateLimiterHook";
import { getSessionManager } from "../session/sessionManager";

// Load the markdown SOP
const sopPath = path.join(__dirname, "billam-sop.md");
const systemPrompt = fs.readFileSync(sopPath, "utf-8");

const skillsPlugin = new AgentSkills({
  skills: [path.join(__dirname, "../skills")],
});

// Reuse the model provider across agent instances. The agent itself remains
// per-job because sessions are isolated, but the provider can reuse its client
// and Anthropic's cache can reuse the static prompt/tool prefix.
//
// Built lazily (not at module load) so this file no longer cares what order
// it gets imported in relative to config/env.ts. The first call to
// createBillamAgent() is what triggers construction, by which point env.ts
// has already run dotenv.config().
let billamModel: AnthropicModel | undefined;

function getBillamModel(): AnthropicModel {
  if (!billamModel) {
    if (!env.anthropicApiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is missing. Check your .env file and confirm " +
          "config/env.ts is loading before this module is used.",
      );
    }

    billamModel = new AnthropicModel({
      modelId: env.billamModelId,
      apiKey: env.anthropicApiKey,
      maxTokens: env.billamMaxOutputTokens,
      cacheConfig: {
        strategy: "anthropic",
        ttl: "5m",
        toolsTTL: "5m",
        systemPromptTTL: "5m",
        // Client messages and job state are dynamic; do not cache them.
        messagesTTL: false,
      },
    });
  }

  return billamModel;
}

export function createBillamAgent(jobId: string): Agent {
  // Best Practice: Create one agent per request with a unique session ID
  const sessionManager = getSessionManager(`job_${jobId}`);

  return new Agent({
    name: "BillAm-Agent",
    systemPrompt,
    model: getBillamModel(),
    // Keep long-running sessions useful without repeatedly sending all old
    // tool results to the model on every turn.
    contextManager: "auto",
    tools: [
      fetchKnowledgeBaseTool,
      fetchPriceCatalogTool,
      updateJobStateTool,
      simulateSendMessageTool,
    ],
    plugins: [
      sessionManager,
      skillsPlugin,
      toneGuardrail, // ToneGuardrail instance
      rateLimiterHook, // Passed as a plugin since it implements Plugin
    ],
  });
}