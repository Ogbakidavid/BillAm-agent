/**
 * simulateSendMessage.ts
 * Appends autonomous clarifications or approved quotes to the simulated chat and audit log
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  SimulateSendMessageInput,
  SimulateSendMessageOutput,
} from "../../types/ToolContracts";

// CRITICAL ARCHITECTURAL INVARIANT: Quotes require mandatory SME approval (required_approval: true)
const simulateSendMessageInputSchema = z
  .object({
    job_id: z.string().min(1, "Job ID is required"),
    message_type: z.enum(["clarifying_questions", "quote", "general"]),
    draft_message_to_client: z.string().min(1, "Draft message cannot be empty"),
    sender: z.enum(["client", "business"]),
    required_approval: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.message_type === "quote") {
        return data.required_approval === true;
      }
      return true;
    },
    {
      message: "Quote messages MUST have required_approval set to true. Bypassing human SME approval is illegal.",
      path: ["required_approval"],
    }
  );

/**
 * simulate_send_message
 * Strands Tool definition for appending autonomous clarifications or approved quotes to simulated chat & audit log.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * - Clarifying questions (required_approval: false) are sent autonomously to the client.
 * - Quotes (required_approval: true) ONLY send after explicit SME owner approval via POST /jobs/:id/approve_quote.
 */
export const simulateSendMessageTool = tool({
  name: "simulate_send_message",
  description: "Appends outbound messages to the simulated client chat transcript and audit log.",
  inputSchema: simulateSendMessageInputSchema,
  callback: async (
    input: SimulateSendMessageInput
  ): Promise<SimulateSendMessageOutput> => {
    // Orchestration layer (agentLoop.ts) will:
    // 1. Enforce that required_approval matches message_type rules
    // 2. Append message to job chat transcript
    // 3. Record event in state/auditLog.ts with required_approval flag
    // 4. Return unique send_id and ISO sent_at timestamp
    return {
      send_id: `send-${Date.now()}`,
      job_id: input.job_id,
      status: "SUCCESS",
      sent_at: new Date().toISOString(),
      error: null,
    };
  },
});
