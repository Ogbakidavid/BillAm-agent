/**
 * parseClientBrief.ts
 * Extracts structured brief fields using the knowledge base
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  ParseClientBriefInput,
  ParseClientBriefOutput,
} from "../../types/ToolContracts";
import type { LLMClient } from "../../llm/LLMClient"; // Type hint only

const parseClientBriefInputSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
  message_text: z.string().min(1, "Message text is required"),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
  existing_fields: z.record(z.string(), z.any()).optional(),
});

/**
 * parse_client_brief
 * Strands Tool definition for extracting structured brief fields using business knowledge base.
 */
export const parseClientBriefTool = tool({
  name: "parse_client_brief",
  description: "Extracts structured brief fields and identifies missing required fields using the business knowledge base.",
  inputSchema: parseClientBriefInputSchema,
  callback: async (input: ParseClientBriefInput): Promise<ParseClientBriefOutput> => {
    // Orchestration layer (agentLoop.ts) will:
    // 1. Load the knowledge base for business_type (e.g. event_vendor.json)
    // 2. Call LLM via LLMClient using parseBriefPrompt.ts
    // 3. Parse JSON response and merge multi-turn extracted fields with existing_fields
    // 4. Compare extracted fields against required fields to compute missing_required_fields
    return {
      job_id: input.job_id,
      extracted_fields: input.existing_fields || {},
      missing_required_fields: [],
      status: "SUCCESS",
      error: null,
    };
  },
});
