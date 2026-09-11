# BillAm Agent — Data Schema (V2)

## 1. Shared Types
```ts
export type UUID = string;
export type ISODateTime = string;
export type CurrencyCode = "NGN";
```

## 2. JobState
```ts
export type JobState =
  | "IDLE"
  | "INGESTING"
  | "REASONING"
  | "CLARIFYING"
  | "NEEDS_SME_INPUT"
  | "AWAITING_HUMAN_APPROVAL"
  | "EXECUTED"
  | "FAILED_RETRY";
```

### Allowed Flow
```
IDLE → INGESTING → REASONING
REASONING → CLARIFYING | NEEDS_SME_INPUT | AWAITING_HUMAN_APPROVAL | FAILED_RETRY
CLARIFYING → INGESTING | NEEDS_SME_INPUT
NEEDS_SME_INPUT → REASONING
AWAITING_HUMAN_APPROVAL → EXECUTED | FAILED_RETRY
FAILED_RETRY → INGESTING | REASONING
```

**Invariant:** `CLARIFYING → EXECUTED` is always invalid.

## 3. Job
```ts
export interface Job {
  job_id: UUID;
  business_id: string;
  business_type: string;
  state: JobState;
  clarification_round: number;
  retry_count: number;
  extracted_fields: Record<string, unknown>;
  missing_required_fields: string[];
  messages: ChatMessage[];
  quote: Quote | null;
  error_message: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
```

## 4. ChatMessage
```ts
export type MessageSender = "client" | "agent" | "sme";
export type MessageType = "TEXT" | "CLARIFICATION" | "QUOTE" | "SYSTEM";

export interface ChatMessage {
  message_id: UUID;
  job_id: UUID;
  sender: MessageSender;
  message_type: MessageType;
  text: string;
  required_approval: boolean;
  created_at: ISODateTime;
}
```

**Message type rules:**
- `CLARIFICATION` — autonomous agent sends, `required_approval: false`
- `QUOTE` — only after SME approval via `POST /jobs/:id/approve_quote`, `required_approval: true`
- `TEXT` — client or SME messages
- `SYSTEM` — internal state events

## 5. Quote
```ts
export type QuoteStatus = "draft" | "approved" | "SENT";

export interface Quote {
  quote_id: UUID;
  job_id: UUID;
  status: QuoteStatus;
  line_items: LineItem[];
  contingencies: Contingency[];
  subtotal: number;
  contingency_total: number;
  total: number;
  currency: CurrencyCode;
  validity_days: number;
  payment_terms: string;
  assumptions: string[];
  draft_message: string;
  approved_by: string | null;
  approved_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
```

## 6. LineItem
```ts
export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}
```
`total = quantity × unit_price`

## 7. Contingency
```ts
export interface Contingency {
  id: string;
  label: string;
  amount: number;
  rate: number;
}
```

## 8. AuditEvent
```ts
export type AuditEventType =
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

export interface AuditEvent {
  event_id: UUID;
  job_id: UUID;
  event_type: AuditEventType;
  actor: "client" | "agent" | "sme" | "system";
  from_state?: JobState;
  to_state?: JobState;
  metadata: Record<string, unknown>;
  created_at: ISODateTime;
}
```

## 9. Knowledge Base Schema
Location: `src/data/knowledge_base/{business_type}.json`

```ts
export interface KnowledgeBaseField {
  name: string;
  required_for_quote: boolean;
  description: string;
  extraction_hints: string[];
  validation_rules?: {
    type?: "string" | "number" | "date" | "range";
    minimum?: number;
    maximum?: number;
  };
  clarification_guidance?: string;
}

export interface KnowledgeBase {
  business_type: string;
  required_fields: KnowledgeBaseField[];
  optional_fields: KnowledgeBaseField[];
  business_rules: string[];
  clarification_policy: {
    max_autonomous_rounds: number;
    max_questions_per_round: number;
  };
}
```

## 10. Price Catalog Schema
Location: `src/data/price_catalog/{business_type}.json`

```ts
export interface CatalogLineItem {
  id: string;
  description: string;
  unit: string;
  unit_price: number;
  applicable_when?: Record<string, unknown>;
}

export interface CatalogContingency {
  id: string;
  label: string;
  type: "fixed" | "percentage" | "conditional";
  value?: number;
  condition?: string;
}

export interface PriceCatalog {
  business_type: string;
  currency: CurrencyCode;
  line_items: CatalogLineItem[];
  contingencies: CatalogContingency[];
  quote_terms: {
    validity_days: number;
    default_payment_terms: string;
  };
  feasibility_rules?: {
    minimum_budget?: number;
    maximum_guest_count?: number;
    warnings?: string[];
  };
}
```

## 11. Tool Payload Contracts (V2)

All tools are **pure capability tools** — they do not call the LLM. The Strands SDK manages all model interactions.

### fetch_knowledge_base
```ts
export interface FetchKnowledgeBaseInput {
  business_type: "caterer" | "tailor" | "event_vendor" | "photographer" | "event_planner" | "equipment_rental";
}

export interface FetchKnowledgeBaseOutput {
  knowledge_base: KnowledgeBase;
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}
```

### fetch_price_catalog
```ts
export interface FetchPriceCatalogInput {
  business_type: "caterer" | "tailor" | "event_vendor" | "photographer" | "event_planner" | "equipment_rental";
}

export interface FetchPriceCatalogOutput {
  price_catalog: PriceCatalog;
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}
```

### update_job_state
```ts
export interface UpdateJobStateInput {
  job_id: UUID;
  extracted_fields?: Record<string, unknown>;
  missing_required_fields?: string[];
  clarification_round?: number;
  new_state: JobState;
  quote?: {
    line_items: Array<{ name: string; quantity: number; unit_price: number; total: number }>;
    contingencies: Array<{ label: string; amount: number; rate?: number }>;
    subtotal: number;
    contingency_total: number;
    total: number;
    currency: CurrencyCode;
    validity_period_days: number;
    draft_message_to_client: string;
  };
  error_message?: string;
}

export interface UpdateJobStateOutput {
  job_id: UUID;
  new_state: JobState;
  quote_id: string | null;
  status: "SUCCESS" | "FAILED_RETRY";
  error: string | null;
}
```

### simulate_send_message
```ts
export interface SimulateSendMessageInput {
  job_id: UUID;
  message_type: "clarifying_questions" | "general";
  draft_message_to_client: string;
  sender: "business";
  required_approval: false; // Quotes are NEVER sent through this tool
}

export interface SimulateSendMessageOutput {
  send_id: string;
  job_id: UUID;
  status: "SUCCESS" | "FAILED_RETRY";
  sent_at: ISODateTime;
  error: string | null;
}
```

> **Architectural invariant:** Quotes are NEVER sent via `simulate_send_message`. They are saved via `update_job_state` and sent only after explicit SME approval through `POST /jobs/:id/approve_quote`.

## 12. Entity Relationship Map
```
Job
├── ChatMessage[]
├── extracted_fields: Record<string, unknown>
├── missing_required_fields: string[]
├── Quote (null until AWAITING_HUMAN_APPROVAL)
│   ├── LineItem[]
│   └── Contingency[]
└── AuditEvent[] (separate in-memory store)

Business Type Config
├── src/data/knowledge_base/{business_type}.json
└── src/data/price_catalog/{business_type}.json
```
