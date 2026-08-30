/**
 * parseClientBrief.ts
 * Extracts structured brief fields using the knowledge base
 */
import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";
import {
  ParseClientBriefInput,
  ParseClientBriefOutput,
} from "../../types/ToolContracts";
import { llmProvider } from "../../llm";
import { PARSE_BRIEF_SYSTEM_PROMPT, buildParseBriefUserPrompt } from "../prompts/parseBriefPrompt";

const parseClientBriefInputSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
  message_text: z.string().min(1, "Message text is required"),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
  existing_fields: z.record(z.string(), z.any()).optional(),
});

function loadKnowledgeBase(businessType: string): Record<string, any> {
  const kbPath = path.join(__dirname, "../../data/knowledge_base", `${businessType}.json`);
  const raw = fs.readFileSync(kbPath, "utf-8");
  return JSON.parse(raw);
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in LLM response");
  return JSON.parse(match[0]);
}

export const parseClientBriefTool = tool({
  name: "parse_client_brief",
  description: "Extracts structured brief fields and identifies missing required fields using the business knowledge base.",
  inputSchema: parseClientBriefInputSchema,
  callback: async (input: ParseClientBriefInput): Promise<ParseClientBriefOutput> => {
    try {
      const knowledgeBase = loadKnowledgeBase(input.business_type);

      const userPrompt = buildParseBriefUserPrompt({
        job_id: input.job_id,
        message_text: input.message_text,
        business_type: input.business_type,
        existing_fields: input.existing_fields,
        knowledge_base: knowledgeBase,
      });

      const fullPrompt = `${PARSE_BRIEF_SYSTEM_PROMPT}\n\n${userPrompt}`;
      const rawResponse = await llmProvider.generateResponse(fullPrompt);
      const parsed = extractJson(rawResponse);

      const mergedFields = {
        ...(input.existing_fields || {}),
        ...(parsed.extracted_fields || {}),
      };

      const requiredFields: string[] = knowledgeBase.field_completeness_rules.required_for_quote;
      const missingFields = requiredFields.filter(
        (field) => mergedFields[field] === undefined || mergedFields[field] === null
      );

      return {
        job_id: input.job_id,
        extracted_fields: mergedFields,
        missing_required_fields: missingFields,
        status: "SUCCESS",
        error: null,
      };
    } catch (err) {
      return {
        job_id: input.job_id,
        extracted_fields: input.existing_fields || {},
        missing_required_fields: [],
        status: "FAILED_RETRY",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});