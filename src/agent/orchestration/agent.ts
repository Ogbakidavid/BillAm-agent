import { Agent, SessionManager } from "@strands-agents/sdk";
import { AgentSkills } from "@strands-agents/sdk/vended-plugins/skills";
import { LocalFileStorage } from "@strands-agents/sdk/storage";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import * as fs from "fs";
import * as path from "path";

// Tools
import { fetchKnowledgeBaseTool } from "../tools/fetchKnowledgeBase";
import { fetchPriceCatalogTool } from "../tools/fetchPriceCatalog";
import { updateJobStateTool } from "../tools/updateJobState";
import { simulateSendMessageTool } from "../tools/simulateSendMessage";

// Plugins / Hooks
import { toneGuardrail } from "../steering/toneGuardrail";
import { rateLimiterHook } from "../hooks/rateLimiterHook";

// Load the markdown SOP
const sopPath = path.join(__dirname, "billam-sop.md");
const systemPrompt = fs.readFileSync(sopPath, "utf-8");

// Shared dependencies
const storage = new LocalFileStorage(".billam-agent-storage");

const skillsPlugin = new AgentSkills({
  skills: [path.join(__dirname, "../skills")],
});

export function createBillamAgent(jobId: string): Agent {
  // Best Practice: Create one agent per request with a unique session ID
  const sessionManager = new SessionManager({
    sessionId: `job_${jobId}`,
    storage: storage,
  });

  return new Agent({
    name: "BillAm-Agent",
    systemPrompt,
    model: new AnthropicModel({
      modelId: "claude-sonnet-4-5",
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxTokens: 4096,
    }),
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
