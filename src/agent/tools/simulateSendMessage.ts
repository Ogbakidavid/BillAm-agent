/**
 * simulateSendMessage.ts
 * Appends autonomous clarifications to the job chat transcript and audit log.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * - Clarifying questions (required_approval: false) are sent autonomously to the client.
 * - Quotes (message_type: "quote") MUST NEVER be sent through this tool.
 *   Quotes are saved via update_job_state and sent only after SME approval
 *   via the POST /jobs/:id/approve_quote endpoint.
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import * as JobStore from "../../state/JobStore";
import * as AuditLog from "../../state/auditLog";
import {
  SimulateSendMessageInput,
  SimulateSendMessageOutput,
} from "../../types/ToolContracts";
import { validateClarificationMessage } from "../../state/clarificationMessageValidator";

const simulateSendMessageInputSchema = z
  .object({
    job_id: z.string().min(1, "Job ID is required"),
    message_type: z.enum(["clarifying_questions", "general"]),
    draft_message_to_client: z.string().min(1, "Draft message cannot be empty"),
    sender: z.literal("business"),
    required_approval: z.literal(false),
  });

export const simulateSendMessageTool = tool({
  name: "simulate_send_message",
  description:
    "Appends an outbound clarification or general message to the client chat transcript and audit log. " +
    "Use this ONLY for clarifying questions and general messages (message_type: 'clarifying_questions' or 'general'). " +
    "DO NOT use this for quotes — quotes are saved via update_job_state and sent by the SME via the dashboard.",
  inputSchema: simulateSendMessageInputSchema,
  callback: async (
    input: SimulateSendMessageInput
  ): Promise<SimulateSendMessageOutput> => {
    if (input.message_type === "clarifying_questions") {
      const validationError = validateClarificationMessage(input.draft_message_to_client);
      if (validationError) {
        return {
          send_id: "",
          job_id: input.job_id,
          status: "FAILED_RETRY",
          sent_at: new Date().toISOString(),
          error: validationError,
        };
      }
    }

    const existingJob = JobStore.getJob(input.job_id);
    const lastAgentMessage = existingJob?.messages
      .slice()
      .reverse()
      .find((message) => message.sender === "agent");

    // A clarification is a side effect. If the model retries the same tool
    // call, return success without appending the same client message twice.
    if (
      lastAgentMessage?.message_type === "CLARIFICATION" &&
      lastAgentMessage.text === input.draft_message_to_client
    ) {
      return {
        send_id: lastAgentMessage.message_id,
        job_id: input.job_id,
        status: "SUCCESS",
        sent_at: lastAgentMessage.created_at,
        error: null,
      };
    }

    const sendId = `send-${Date.now()}`;
    const sentAt = new Date().toISOString();

    // Persist the message to the job transcript
    JobStore.appendMessage(input.job_id, {
      message_id: sendId,
      job_id: input.job_id,
      sender: "agent",
      message_type: "CLARIFICATION",
      text: input.draft_message_to_client,
      required_approval: false,
      created_at: sentAt,
    });

    AuditLog.logClarificationSent(
      input.job_id,
      [input.draft_message_to_client],
      0, // round tracking is handled by update_job_state tool
    );

    return {
      send_id: sendId,
      job_id: input.job_id,
      status: "SUCCESS",
      sent_at: sentAt,
      error: null,
    };
  },
});
