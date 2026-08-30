/**
 * generateClarifyingQuestions.ts
 * Generates targeted questions for genuinely missing required fields
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  GenerateClarifyingQuestionsInput,
  GenerateClarifyingQuestionsOutput,
} from "../../types/ToolContracts";
import {
  CLARIFICATION_SYSTEM_PROMPT,
  buildClarificationUserPrompt,
} from "../prompts/clarificationPrompt";
import { llmProvider } from "../../llm";

// CRITICAL ARCHITECTURAL INVARIANT: Max 2 clarification rounds enforced at Zod validation level
const generateClarifyingQuestionsInputSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
  missing_required_fields: z
    .array(z.string())
    .min(1, "At least one missing field is required"),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
  clarification_round: z
    .number()
    .int()
    .min(1, "Clarification round must be at least 1")
    .max(
      2,
      "Clarification cap reached: max 2 autonomous clarification rounds allowed",
    ),
});

function extractQuestions(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[\s\-\*\d\.]+/, "").trim())
    .filter((l) => l.length > 0 && l.includes("?"));
  return lines.slice(0, 5);
}

/**
 * generate_clarifying_questions
 * Strands Tool definition for producing 1–5 WhatsApp-style follow-up questions.
 *
 * CRITICAL INVARIANT: Hard cap of 2 clarification rounds. Round > 2 MUST escalate to NEEDS_SME_INPUT.
 */
export const generateClarifyingQuestionsTool = tool({
  name: "generate_clarifying_questions",
  description:
    "Generates targeted, polite WhatsApp-style clarifying questions for missing required brief fields.",
  inputSchema: generateClarifyingQuestionsInputSchema,
  callback: async (
    input: GenerateClarifyingQuestionsInput,
  ): Promise<GenerateClarifyingQuestionsOutput> => {
    try {
      const userPrompt = buildClarificationUserPrompt({
        job_id: input.job_id,
        missing_required_fields: input.missing_required_fields,
        business_type: input.business_type,
        clarification_round: input.clarification_round,
      });

      const fullPrompt = `${CLARIFICATION_SYSTEM_PROMPT}\n\n${userPrompt}`;
      const rawResponse = await llmProvider.generateResponse(fullPrompt);

      const questions = extractQuestions(rawResponse);
      const draft_message_to_client = questions.join("\n");

      return {
        job_id: input.job_id,
        questions,
        draft_message_to_client,
        status: "SUCCESS",
        error: null,
      };
    } catch (err) {
      return {
        job_id: input.job_id,
        questions: [],
        draft_message_to_client: "",
        status: "FAILED_RETRY",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
