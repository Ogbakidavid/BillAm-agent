// Simulated chat message structure

/**
 * ChatMessage.ts
 * Simulated chat message types
 * Source: API_SPECIFICATION.md & PRD v0.4
 */

export type MessageSender = "client" | "agent" | "sme" | "system";
export type MessageType = "TEXT" | "CLARIFICATION" | "QUOTE";

export interface ChatMessage {
  message_id: string;
  job_id: string;
  sender: MessageSender;
  message_type: MessageType;
  text: string;
  required_approval: boolean;
  created_at: Date;
}

export interface SendMessageRequest {
  job_id: string;
  message_type: MessageType;
  draft_message_to_client: string;
  sender: MessageSender;
  required_approval: boolean;
}

export interface SendMessageResponse {
  send_id: string;
  job_id: string;
  status: "SUCCESS" | "FAILED_RETRY";
  sent_at: Date;
  error: string | null;
}

export interface ChatThread {
  job_id: string;
  messages: ChatMessage[];
}
