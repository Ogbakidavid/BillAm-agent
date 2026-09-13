// API request and response types

/**
 * Api.ts
 * API request and response types
 * Source: API_SPECIFICATION.md & Frontend Sync
 */

// ==================== Common Response Shape ====================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export type ApiErrorCode =
  | "JOB_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVALID_STATE_TRANSITION"
  | "QUOTE_NOT_AVAILABLE"
  | "APPROVAL_REQUIRED"
  | "PRICE_DATA_UNAVAILABLE"
  | "LLM_PROVIDER_ERROR"
  | "RETRY_NOT_ALLOWED"
  | "INTERNAL_ERROR";

// ==================== POST /jobs ====================
export interface CreateJobRequest {
  business_id: string;
  business_type: "event_vendor" | "caterer" | "tailor" | "photographer" | "event_planner" | "equipment_rental";
}

export interface CreateJobResponse {
  job_id: string;
  business_id: string;
  business_type: string;
  state: string;
  clarification_round: number;
  messages: any[];
  extracted_fields: Record<string, any>;
  missing_required_fields: string[];
  quote: any | null;
  audit_events: any[];
}

// ==================== POST /jobs/:id/messages ====================
export interface SendMessageRequest {
  message_text: string;
  received_at: string;
  sender?: "client" | "sme"; // Added sender override so SMEs can inject messages
}

export interface SendMessageResponse {
  job_id: string;
  state: string;
  clarification_round: number;
  missing_required_fields: string[];
  agent_message?: string;
  quote_available?: boolean;
}

// ==================== GET /jobs/:id ====================
export interface GetJobResponse {
  job_id: string;
  state: string;
  clarification_round: number;
  messages: any[];
  extracted_fields: Record<string, any>;
  missing_required_fields: string[];
  quote: any | null;
  audit_events: any[];
}

// ==================== GET /jobs/:id/quote ====================
export interface GetQuoteResponse {
  id: string;
  job_id: string;
  status: "draft" | "awaiting_approval" | "sent" | "expired";
  line_items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  contingencies: Array<{
    id: string;
    label: string;
    rate: number | null;
    amount: number;
  }>;
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

// ==================== PATCH /jobs/:id/quote ====================
export interface EditQuoteRequest {
  line_items?: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  notes?: string;
}

export interface EditQuoteResponse {
  job_id: string;
  state: string;
  quote: {
    status: string;
    total: number;
  };
}

// ==================== POST /jobs/:id/approve_quote ====================
export interface ApproveQuoteRequest {
  approved_by: string;
}

export interface ApproveQuoteResponse {
  job_id: string;
  state: string;
  quote_status: string;
  sent_at: string;
}

// ==================== GET /jobs/:id/missing_fields ====================
export interface GetMissingFieldsResponse {
  job_id: string;
  state: string;
  missing_fields: string[];
  summary: string;
  clarification_round: number;
}

// ==================== POST /jobs/:id/manual_input ====================
export interface ManualInputRequest {
  supplied_fields: Record<string, any>;
  source: string;
}

export interface ManualInputResponse {
  job_id: string;
  state: string;
  missing_fields: string[];
}

// ==================== POST /jobs/:id/retry ====================
export interface RetryJobRequest {}

export interface RetryJobResponse {
  job_id: string;
  state: string;
  retry_started: boolean;
}

// ==================== Knowledge Base ====================
export interface KnowledgeEntry {
  knowledge_id: string;
  business_id: string;
  name: string;
  source_type: "Pricing" | "Business information" | "Services" | "Policies" | "Other";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  input_method: "file" | "manual";
  file_name?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeRequest {
  business_id: string;
  name: string;
  source_type: KnowledgeEntry["source_type"];
  input_method: KnowledgeEntry["input_method"];
  file_name?: string;
}

export interface UpdateKnowledgeRequest {
  name?: string;
  source_type?: KnowledgeEntry["source_type"];
  status?: KnowledgeEntry["status"];
  input_method?: KnowledgeEntry["input_method"];
  file_name?: string;
  error_message?: string;
}

// ==================== Availability ====================
export interface AvailabilityDate {
  availability_date_id: string;
  business_id: string;
  /** "YYYY-MM-DD" */
  date: string;
  status: "UNAVAILABLE" | "BOOKED";
  reason?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAvailabilityRequest {
  business_id: string;
  date: string;
  status: AvailabilityDate["status"];
  reason?: string;
}

export interface UpdateAvailabilityRequest {
  status?: AvailabilityDate["status"];
  reason?: string;
}

export interface CheckAvailabilityResponse {
  date: string;
  business_id: string;
  available: boolean;
  blocked_entry: AvailabilityDate | null;
}

