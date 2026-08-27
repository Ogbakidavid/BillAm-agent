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
import type { LLMClient } from "../../llm/LLMClient"; // Type hint only

// CRITICAL ARCHITECTURAL INVARIANT: Max 2 clarification rounds enforced at Zod validation level
const generateClarifyingQuestionsInputSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
  missing_required_fields: z.array(z.string()).min(1, "At least one missing field is required"),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
  clarification_round: z
    .number()
    .int()
    .min(1, "Clarification round must be at least 1")
    .max(2, "Clarification cap reached: max 2 autonomous clarification rounds allowed"),
});

/**
 * generate_clarifying_questions
 * Strands Tool definition for producing 1–5 WhatsApp-style follow-up questions.
 *
 * CRITICAL INVARIANT: Hard cap of 2 clarification rounds. Round > 2 MUST escalate to NEEDS_SME_INPUT.
 */
export const generateClarifyingQuestionsTool = tool({
  name: "generate_clarifying_questions",
  description: "Generates targeted, polite WhatsApp-style clarifying questions for missing required brief fields.",
  inputSchema: generateClarifyingQuestionsInputSchema,
  callback: async (
    input: GenerateClarifyingQuestionsInput
  ): Promise<GenerateClarifyingQuestionsOutput> => {
    // Orchestration layer (agentLoop.ts) will:
    // 1. Call LLM using clarificationPrompt.ts with missing_required_fields and field-level guidance
    // 2. Receive 1-5 bulleted questions formatted for WhatsApp
    // 3. Format complete draft message string
    // 4. Return array of questions and single draft message string
    return {
      job_id: input.job_id,
      questions: [],
      draft_message_to_client: "",
      status: "SUCCESS",
      error: null,
    };
  },
});
