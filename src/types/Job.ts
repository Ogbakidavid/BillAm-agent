// Job and job-state definitions

/**
 * Job.ts
 * Core Job and JobState types
 * Source: API_SPECIFICATION.md & PRD v0.4
 */

export type JobState =
  | "IDLE"
  | "INGESTING"
  | "REASONING"
  | "CLARIFYING"
  | "NEEDS_SME_INPUT"
  | "AWAITING_HUMAN_APPROVAL"
  | "EXECUTED"
  | "FAILED_RETRY";

export interface ExtractedFields {
  event_type?: string;
  guest_count?: number;
  event_date?: string;
  venue_location?: string;
  budget_range?: string;
  [key: string]: any;
}

export interface Job {
  job_id: string;
  business_id: string;
  business_type: "caterer" | "tailor" | "event_vendor";
  state: JobState;
  clarification_round: number;
  messages: ChatMessage[];
  extracted_fields: ExtractedFields;
  missing_required_fields: string[];
  quote: Quote | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Quote {
  status: "DRAFT" | "SENT";
  line_items: LineItem[];
  contingencies: Contingency[];
  subtotal: number;
  total: number;
  currency: string;
  validity_days: number;
  payment_terms: string;
  assumptions: string[];
  draft_message?: string;
}

export interface LineItem {
  name: string;
  quantity?: number;
  unit_price?: number;
  total: number;
  label?: string;
}

export interface Contingency {
  name: string;
  amount: number;
  label?: string;
}

export interface ChatMessage {
  message_id: string;
  job_id: string;
  sender: "client" | "agent" | "sme" | "system";
  message_type: "TEXT" | "CLARIFICATION" | "QUOTE";
  text: string;
  required_approval: boolean;
  created_at: Date;
}

export interface AuditEvent {
  event_id: string;
  job_id: string;
  event_type:
    | "JOB_CREATED"
    | "MESSAGE_RECEIVED"
    | "STATE_TRANSITION"
    | "TOOL_STARTED"
    | "TOOL_COMPLETED"
    | "TOOL_FAILED"
    | "CLARIFICATION_SENT"
    | "SME_INPUT_SUBMITTED"
    | "QUOTE_GENERATED"
    | "QUOTE_EDITED"
    | "QUOTE_APPROVED"
    | "QUOTE_SENT"
    | "RETRY_STARTED"
    | "RETRY_FAILED";
  from_state?: JobState;
  to_state?: JobState;
  actor: string;
  details?: Record<string, any>;
  created_at: Date;
}