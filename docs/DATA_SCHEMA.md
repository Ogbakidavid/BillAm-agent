# BillAm Agent — Data Schema

## 1. Shared Types
```ts
export type UUID = string;
export type ISODateTime = string;
export type CurrencyCode = "NGN";
```

## 2. JobState
```ts
export enum JobState {
  IDLE = "IDLE",
  INGESTING = "INGESTING",
  REASONING = "REASONING",
  CLARIFYING = "CLARIFYING",
  NEEDS_SME_INPUT = "NEEDS_SME_INPUT",
  AWAITING_HUMAN_APPROVAL = "AWAITING_HUMAN_APPROVAL",
  EXECUTED = "EXECUTED",
  FAILED_RETRY = "FAILED_RETRY"
}
```

### Allowed Flow
`IDLE → INGESTING → REASONING`
- `REASONING → CLARIFYING | NEEDS_SME_INPUT | AWAITING_HUMAN_APPROVAL | FAILED_RETRY`
- `CLARIFYING → INGESTING | NEEDS_SME_INPUT`
- `NEEDS_SME_INPUT → REASONING`
- `AWAITING_HUMAN_APPROVAL → EXECUTED | FAILED_RETRY`
- `FAILED_RETRY → INGESTING | REASONING`

Invalid invariant: `CLARIFYING → EXECUTED`.

## 3. Job
```ts
export interface Job {
  jobId: UUID;
  businessId: string;
  businessType: string;
  state: JobState;
  clarificationRound: number;
  retryCount: number;
  extractedFields: Record<string, unknown>;
  missingRequiredFields: string[];
  quoteId?: UUID | null;
  errorMessage?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

## 4. ChatMessage
```ts
export type MessageSender = "client" | "agent" | "sme";
export type MessageType = "general" | "clarification" | "quote" | "system";

export interface ChatMessage {
  messageId: UUID;
  jobId: UUID;
  sender: MessageSender;
  messageType: MessageType;
  text: string;
  createdAt: ISODateTime;
}
```

## 5. Quote
```ts
export type QuoteStatus = "DRAFT" | "APPROVED" | "SENT";

export interface Quote {
  quoteId: UUID;
  jobId: UUID;
  status: QuoteStatus;
  lineItems: LineItem[];
  contingencies: Contingency[];
  subtotal: number;
  contingencyTotal: number;
  total: number;
  currency: CurrencyCode;
  validityDays: number;
  terms: string;
  assumptions: string[];
  draftMessageToClient: string;
  approvedBy?: string | null;
  approvedAt?: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

## 6. LineItem
```ts
export interface LineItem {
  lineItemId: UUID;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  metadata?: Record<string, unknown>;
}
```
`subtotal = quantity × unitPrice`

## 7. Contingency
```ts
export interface Contingency {
  contingencyId: UUID;
  label: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}
```

## 8. AuditEvent
```ts
export type AuditEventType =
  | "JOB_CREATED" | "MESSAGE_RECEIVED" | "STATE_TRANSITION"
  | "TOOL_STARTED" | "TOOL_COMPLETED" | "TOOL_FAILED"
  | "CLARIFICATION_SENT" | "SME_INPUT_SUBMITTED"
  | "QUOTE_GENERATED" | "QUOTE_EDITED" | "QUOTE_APPROVED"
  | "QUOTE_SENT" | "RETRY_STARTED" | "RETRY_FAILED";

export interface AuditEvent {
  eventId: UUID;
  jobId: UUID;
  eventType: AuditEventType;
  actor: "client" | "agent" | "sme" | "system";
  fromState?: JobState;
  toState?: JobState;
  metadata: Record<string, unknown>;
  createdAt: ISODateTime;
}
```

# 9. Knowledge Base Schema
Location: `knowledge_base/event_vendor.json`

```ts
export interface KnowledgeBaseField {
  name: string;
  requiredForQuote: boolean;
  description: string;
  extractionHints: string[];
  validationRules?: {
    type?: "string" | "number" | "date" | "range";
    minimum?: number;
    maximum?: number;
  };
  clarificationGuidance?: string;
}

export interface KnowledgeBase {
  businessType: string;
  requiredFields: KnowledgeBaseField[];
  optionalFields: KnowledgeBaseField[];
  businessRules: string[];
  clarificationPolicy: {
    maxAutonomousRounds: number;
    maxQuestionsPerRound: number;
  };
}
```

Example:
```json
{
  "businessType": "event_vendor",
  "requiredFields": [
    {
      "name": "eventType",
      "requiredForQuote": true,
      "description": "The type of event.",
      "extractionHints": ["birthday", "wedding", "corporate event"],
      "clarificationGuidance": "Ask what type of event is being planned."
    }
  ],
  "optionalFields": [],
  "businessRules": [],
  "clarificationPolicy": {
    "maxAutonomousRounds": 2,
    "maxQuestionsPerRound": 5
  }
}
```

# 10. Price Catalog Schema
Location: `price_catalog/event_vendor.json`

```ts
export interface CatalogLineItem {
  id: string;
  description: string;
  unit: string;
  unitPrice: number;
  applicableWhen?: Record<string, unknown>;
}

export interface CatalogContingency {
  id: string;
  label: string;
  type: "fixed" | "percentage" | "conditional";
  value?: number;
  condition?: string;
}

export interface PriceCatalog {
  businessType: string;
  currency: CurrencyCode;
  lineItems: CatalogLineItem[];
  contingencies: CatalogContingency[];
  quoteTerms: {
    validityDays: number;
    defaultPaymentTerms: string;
  };
  feasibilityRules?: {
    minimumBudget?: number;
    maximumGuestCount?: number;
    warnings?: string[];
  };
}
```

# 11. Tool Payload Contracts

## IngestChatMessage
```ts
export interface IngestChatMessageInput {
  jobId?: UUID;
  businessId: string;
  businessType: string;
  message: { sender: "client"; text: string };
}
export interface IngestChatMessageOutput {
  jobId: UUID;
  messageId: UUID;
  state: JobState.INGESTING;
}
```

## ParseClientBrief
```ts
export interface ParseClientBriefInput {
  jobId: UUID;
  businessType: string;
  messages: ChatMessage[];
  existingFields: Record<string, unknown>;
}
export interface ParseClientBriefOutput {
  jobId: UUID;
  extractedFields: Record<string, unknown>;
  missingRequiredFields: string[];
  status: "SUCCESS" | "FAILED_RETRY";
  error?: string | null;
}
```
Rules: use the relevant knowledge base; merge multi-turn information; never invent missing values; later explicit corrections override earlier values.

## GenerateClarifyingQuestions
```ts
export interface GenerateClarifyingQuestionsInput {
  jobId: UUID;
  businessType: string;
  missingRequiredFields: string[];
  clarificationRound: number;
}
export interface GenerateClarifyingQuestionsOutput {
  jobId: UUID;
  questions: string[];
  draftMessageToClient: string;
  nextState: JobState.CLARIFYING | JobState.NEEDS_SME_INPUT;
  status: "SUCCESS" | "FAILED_RETRY";
  error?: string | null;
}
```
Rules: 1–5 questions; maximum two autonomous rounds; round 3 is prohibited; unresolved cases route to `NEEDS_SME_INPUT`.

## ComputeQuote
```ts
export interface ComputeQuoteInput {
  jobId: UUID;
  businessType: string;
  brief: Record<string, unknown>;
  knowledgeBase: KnowledgeBase;
  priceCatalog: PriceCatalog;
}
export interface ComputeQuoteOutput {
  jobId: UUID;
  quote?: Quote;
  feasibilityWarning?: string;
  nextState: JobState.AWAITING_HUMAN_APPROVAL | JobState.FAILED_RETRY;
  status: "SUCCESS" | "FAILED_RETRY";
  error?: string | null;
}
```
Rules: prices come from configured data/deterministic logic; missing prices are never invented; infeasible requests produce warning/failure; valid drafts move to `AWAITING_HUMAN_APPROVAL`.

## SimulateSendMessage
```ts
export interface SimulateSendMessageInput {
  jobId: UUID;
  messageType: "clarification" | "quote";
  draftMessageToClient: string;
  sender: "agent" | "sme";
  requiredApproval: boolean;
  approvalConfirmed?: boolean;
}
export interface SimulateSendMessageOutput {
  jobId: UUID;
  messageId: UUID;
  sentAt: ISODateTime;
  status: "SUCCESS" | "FAILED_RETRY";
  error?: string | null;
}
```
Clarification messages require no approval. Quote messages require `requiredApproval = true` and `approvalConfirmed = true`.

# 12. Entity Relationship Map
```text
Job
├── ChatMessage[]
├── extractedFields
├── missingRequiredFields
├── Quote
│   ├── LineItem[]
│   └── Contingency[]
└── AuditEvent[]

Business Type
├── knowledge_base/<businessType>.json
└── price_catalog/<businessType>.json
```
