// Input/output contracts for tools

/**
 * ToolContracts.ts
 * Input/Output contracts for all Strands tools
 * Source: PRD v0.4 Section 4 (Tool Contracts)
 */

// ==================== ingest_chat_message ====================
export interface IngestChatMessageInput {
  job_id?: string;
  message_text: string;
  business_type: "caterer" | "tailor" | "event_vendor";
  received_at: string;
}

export interface IngestChatMessageOutput {
  job_id: string;
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}

// ==================== parse_client_brief ====================
export interface ParseClientBriefInput {
  job_id: string;
  message_text: string;
  business_type: "caterer" | "tailor" | "event_vendor";
  existing_fields?: Record<string, any>;
}

export interface ParseClientBriefOutput {
  job_id: string;
  extracted_fields: Record<string, any>;
  missing_required_fields: string[];
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}

// ==================== generate_clarifying_questions ====================
export interface GenerateClarifyingQuestionsInput {
  job_id: string;
  missing_required_fields: string[];
  business_type: "caterer" | "tailor" | "event_vendor";
  clarification_round: number;
}

export interface GenerateClarifyingQuestionsOutput {
  job_id: string;
  questions: string[];
  draft_message_to_client: string;
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}

// ==================== compute_quote ====================
export interface ComputeQuoteInput {
  job_id: string;
  structured_brief: Record<string, any>;
  business_type: "caterer" | "tailor" | "event_vendor";
}

export interface ComputeQuoteOutput {
  job_id: string;
  line_items: Array<{
    label: string;
    amount: number;
  }>;
  contingencies: Array<{
    label: string;
    amount: number;
  }>;
  total_amount: number;
  validity_period_days: number;
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}

// ==================== simulate_send_message ====================
export interface SimulateSendMessageInput {
  job_id: string;
  message_type: "clarifying_questions" | "quote" | "general";
  draft_message_to_client: string;
  sender: "client" | "business";
  required_approval: boolean;
}

export interface SimulateSendMessageOutput {
  send_id: string;
  job_id: string;
  status: "SUCCESS" | "FAILED_RETRY";
  sent_at: string;
  error: string | null;
}

// ==================== Generic Tool Response ====================
export interface ToolResponse<T> {
  status: "SUCCESS" | "FAILED_RETRY";
  data?: T;
  error?: string;
}
