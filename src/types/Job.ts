// Job and job-state definitions

/**
 * Job.ts
 * Core Job and JobState types
 * Source: API_SPECIFICATION.md & PRD v0.4 & Frontend Sync
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

export type BusinessType =
  | "event_vendor"
  | "caterer"
  | "tailor"
  | "photographer"
  | "event_planner"
  | "equipment_rental";

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
  business_type: BusinessType;
  state: JobState;
  clarification_round: number;
  messages: ChatMessage[];
  extracted_fields: ExtractedFields;
  missing_required_fields: string[];
  quote: Quote | null;
  error_message: string | null;
  audit_events: AuditEvent[];
  created_at: string;
  updated_at: string;
}

export type QuoteStatus = "draft" | "awaiting_approval" | "sent" | "expired";

export interface Quote {
  id: string;
  job_id: string;
  status: QuoteStatus;
  line_items: LineItem[];
  contingencies: Contingency[];
  subtotal: number;
  total: number;
  currency: string;
  validity_days: number;
  payment_terms: string;
  assumptions: string[];
  draft_message?: string;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Contingency {
  id: string;
  label: string;
  rate: number | null;
  amount: number;
}

export type MessageSender = "client" | "agent" | "sme" | "system";

export interface ChatMessage {
  message_id: string;
  job_id: string;
  sender: MessageSender;
  message_type: "TEXT" | "CLARIFICATION" | "QUOTE";
  text: string;
  required_approval: boolean;
  created_at: string;
}

export type AuditEventType = "agent" | "client" | "sme" | "system";

export interface AuditEvent {
  id: string;
  job_id?: string;
  type: AuditEventType;
  label: string;
  detail?: string;
  timestamp: string;
}
