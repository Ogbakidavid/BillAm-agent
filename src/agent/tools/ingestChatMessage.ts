import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  IngestChatMessageInput,
  IngestChatMessageOutput,
} from "../../types/ToolContracts";

const ingestChatMessageInputSchema = z.object({
  job_id: z.string().optional(),
  message_text: z.string().min(1, "Message text cannot be empty"),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
  received_at: z.string(),
});

/**
 * ingest_chat_message
 * Strands Tool definition for receiving and recording incoming client messages.
 */
export const ingestChatMessageTool = tool({
  name: "ingest_chat_message",
  description: "Receives and records each incoming client message into the job transcript.",
  inputSchema: ingestChatMessageInputSchema,
  callback: async (
    input: IngestChatMessageInput,
  ): Promise<IngestChatMessageOutput> => {
    // Orchestration layer (agentLoop.ts) will:
    // 1. Create or retrieve the active Job entity via JobStore
    // 2. Append the message to the job transcript
    // 3. Transition the job state to INGESTING
    return {
      job_id: input.job_id || "job-placeholder-id",
      status: "SUCCESS",
      error: null,
    };
  },
});
