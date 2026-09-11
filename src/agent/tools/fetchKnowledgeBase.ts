/**
 * fetchKnowledgeBase.ts
 * Capability tool that reads the knowledge base JSON for a given business type
 * and returns it to the Agent for field extraction and completeness checking.
 *
 * ARCHITECTURAL NOTE:
 * This tool is purely a data accessor. The Agent reasons over the returned
 * schema — no LLM call happens inside this tool.
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const fetchKnowledgeBaseInputSchema = z.object({
  business_type: z.enum([
    "event_vendor",
    "caterer",
    "tailor",
    "photographer",
    "event_planner",
    "equipment_rental",
  ]),
});

export const fetchKnowledgeBaseTool = tool({
  name: "fetch_knowledge_base",
  description:
    "Loads the required field schema and Knowledge Base for the given business type. " +
    "Use this at the start of every job to understand which fields are required for a quote, " +
    "what question templates to use, and what field-level validation rules apply. " +
    "Returns a JSON object containing required_for_quote fields, field definitions, and options.",
  inputSchema: fetchKnowledgeBaseInputSchema,
  callback: async (input: { business_type: string }) => {
    try {
      const kbPath = path.join(
        __dirname,
        "../../data/knowledge_base",
        `${input.business_type}.json`,
      );
      const raw = fs.readFileSync(kbPath, "utf-8");
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to load knowledge base for "${input.business_type}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
