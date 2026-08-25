# Technical Specification — BillAm Agent

**Status:** Revised after source cross-check  
**Demo mode:** Autonomous real-time simulated chat in SME dashboard  
**Primary business type:** Event vendor  
**Timeline:** 15-day technical work breakdown  
**Core requirement:** Autonomous intake and clarification; SME approval only for quote send

---

## 1. Technical Stack

### Runtime
- Node.js 18+
- TypeScript
- Express REST backend
- React/Vite or a minimal frontend implementation for the dashboard

### Agent and LLM
- Strands Agents SDK for orchestration and tool calling
- Amazon Bedrock as primary model provider
- Direct Anthropic API as fallback when Bedrock access/credit approval is delayed
- Environment variable: `ANTHROPIC_API_KEY`

The provider selection must be isolated behind a single LLM adapter so application logic and tool contracts do not change when switching providers.

Suggested interface:

```ts
interface LLMClient {
  generate(input: LLMRequest): Promise<LLMResponse>;
}
```

Implementations:
- `BedrockLLMClient`
- `AnthropicLLMClient`

Provider selection should be configuration-driven, not a manual rewrite across the agent.

### State and persistence
Hackathon baseline:
- in-memory job store is acceptable for active demo jobs;
- job state must remain available through clarification, manual input, quote review and retry.

If deployment restart resilience is required, use SQLite or another small persistent store. Do not rely on a fixed session expiry that can discard a job before `FAILED_RETRY` or `NEEDS_SME_INPUT` recovery.

### Data
JSON files:
- `knowledge_base/event_vendor.json`
- `price_catalog/event_vendor.json`
- `sample_chat_transcripts_event_vendor.json`

### Testing
- Jest + TypeScript test support
- unit tests for state transitions and tools
- integration tests for API endpoints
- transcript scenarios used as test fixtures and demo scripts

Exact package versions should be resolved and locked in `package-lock.json`/lockfile after the team confirms the installed Strands and SDK versions. They should not be treated as architectural requirements unless the repository has already validated them.

---

## 2. System Model

The system is job-centric rather than only conversation-centric.

Minimum `Job` fields:

```ts
interface Job {
  job_id: string;
  business_id: string;
  business_type: "event_vendor" | "caterer" | "tailor";
  state: JobState;
  messages: ChatMessage[];
  extracted_fields: Record<string, unknown>;
  missing_required_fields: string[];
  clarification_round: number;
  quote?: Quote;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}
```

Required states:

```ts
type JobState =
  | "IDLE"
  | "INGESTING"
  | "REASONING"
  | "CLARIFYING"
  | "NEEDS_SME_INPUT"
  | "AWAITING_HUMAN_APPROVAL"
  | "EXECUTED"
  | "FAILED_RETRY";
```

---

## 3. Tool Contracts

The revised build should recognize the full operational tool flow rather than only the three reasoning tools.

### 3.1 `ingest_chat_message`

Called on every client send.

Input:
- `job_id` where available
- `message_text`
- `business_type`
- `received_at`

Behavior:
- create or locate job;
- append message;
- transition to `INGESTING`;
- audit the event.

### 3.2 `parse_client_brief`

Input:
- `job_id`
- current message text
- `business_type`
- previously extracted fields

Behavior:
- load the correct knowledge base;
- extract structured values;
- merge values across turns;
- let explicit corrections overwrite earlier values;
- identify missing required fields;
- validate values before pricing.

Important knowledge-base behavior:
- `small crowd` is not a valid numeric guest count;
- vague budget signals such as “tight” can count as present;
- venue explicitly marked undecided can count as present with `venue_tbd`;
- optional fields do not block quote generation;
- required quote fields are the only completion gate;
- prompt-injection content must never alter state or approval rules.

### 3.3 `generate_clarifying_questions`

Input:
- `job_id`
- missing required fields
- `business_type`
- clarification round

Output:
- 1–5 questions;
- a natural-language message for the client;
- success/failure metadata.

Rules:
- rounds 1 and 2 may generate questions;
- after two completed clarification rounds, unresolved required fields produce `NEEDS_SME_INPUT`;
- questions are automatically sent through `simulate_send_message`;
- the job remains `CLARIFYING`.

### 3.4 `compute_quote`

Input:
- `job_id`
- complete structured brief
- `business_type`

Output should contain:
- line items;
- contingencies;
- total amount;
- validity period;
- draft message;
- status/error metadata.

The implementation must use the active price catalog rather than hardcoded illustrative figures.

Current event-vendor catalog behavior includes:
- pricing tiers: `lean`, `standard`, `premium`;
- transport/logistics contingency: 8% of subtotal;
- rush fee: 15% when event is within 7 days;
- fuel/fluctuation buffer: 5% of subtotal;
- quote validity period: 7 days;
- default payment terms from the catalog.

Do not replace these with an undocumented 10% generic contingency or an undocumented outdoor +15% modifier.

### 3.5 `simulate_send_message`

This supporting tool is required for the revised simulated-chat architecture.

Input:
- `job_id`
- `message_type`
- `draft_message_to_client`
- `sender`
- `required_approval`

Rules:

```ts
// Autonomous clarification
required_approval = false;

// Quote after explicit SME approval
required_approval = true;
```

The tool appends the message to the simulated chat and writes an audit event.

---

## 4. Agent Loop

```text
CLIENT SEND
    ↓
ingest_chat_message
    ↓
INGESTING
    ↓
parse_client_brief
    ↓
REASONING
    ├── Missing required fields + rounds remaining
    │       ↓
    │   generate_clarifying_questions
    │       ↓
    │   simulate_send_message(false)
    │       ↓
    │   CLARIFYING
    │
    ├── Missing fields + cap exhausted
    │       ↓
    │   NEEDS_SME_INPUT
    │
    ├── Complete brief
    │       ↓
    │   compute_quote
    │       ↓
    │   AWAITING_HUMAN_APPROVAL
    │
    └── Tool/data failure
            ↓
        FAILED_RETRY
```

Approval path:

```text
AWAITING_HUMAN_APPROVAL
    ↓
SME may edit quote
    ↓
SME explicitly approves
    ↓
simulate_send_message(true)
    ↓
EXECUTED
```

---

## 5. API Specification

Use job-oriented routes to match the revised Developer Task Breakdown.

### `POST /jobs`

Creates a job.

### `POST /jobs/:id/messages`

Adds a client message and triggers the ingestion/agent cycle.

### `GET /jobs/:id`

Returns job state, accumulated brief data, messages and current status.

### `GET /jobs/:id/quote`

Returns the draft quote when available.

### Quote editing

The PRD requires that the SME can edit line items or totals before approval. The implementation should expose an explicit update route, for example:

`PATCH /jobs/:id/quote`

This route must:
- only operate while the job is `AWAITING_HUMAN_APPROVAL`;
- record the edit in the audit log;
- return the revised draft;
- never mark the quote as sent.

### `POST /jobs/:id/approve_quote`

Allowed only from `AWAITING_HUMAN_APPROVAL`.

Behavior:
1. validate SME approval;
2. call `simulate_send_message` with `required_approval: true`;
3. append quote to simulated chat;
4. audit approval and send;
5. transition to `EXECUTED`.

### `GET /jobs/:id/missing_fields`

Used in `NEEDS_SME_INPUT`.

Returns:
- unresolved fields;
- SME-facing explanation/summary;
- current extracted values where useful.

### `POST /jobs/:id/manual_input`

Accepts SME-supplied missing values.

Behavior:
- merge values into the structured brief;
- transition `NEEDS_SME_INPUT → REASONING`;
- re-run completion check and quote generation.

### `POST /jobs/:id/retry`

For `FAILED_RETRY`.

Behavior:
- preserve prior successful work;
- retry from the appropriate stage;
- avoid restarting the entire conversation unnecessarily.

---

## 6. Approval and Safety Invariants

These rules must be enforced by backend/state logic, not by prompt wording alone.

1. A client message can never approve a quote.
2. Clarifying questions never require approval.
3. `CLARIFYING → EXECUTED` is invalid.
4. Only a quote can enter `AWAITING_HUMAN_APPROVAL`.
5. A quote is not appended to the simulated client chat before explicit SME approval.
6. Prompt injection cannot bypass the approval endpoint.
7. Out-of-bounds extracted values cannot flow directly into pricing.
8. A severe technical/data failure uses `FAILED_RETRY`; clarification-cap exhaustion uses `NEEDS_SME_INPUT`.

---

## 7. Audit and Observability

Log:
- job creation;
- every state transition;
- every tool invocation;
- sanitized input/output metadata where appropriate;
- duration;
- autonomous clarifying-question sends;
- quote edits;
- quote approvals;
- quote sends;
- errors;
- retries.

Expose at minimum:
- total jobs;
- successful quote completions;
- jobs in `NEEDS_SME_INPUT`;
- failures/retries.

Cloud logging is owned by the cloud integration workstream if AWS deployment is used.

---

## 8. Error Handling

All tool calls should have bounded retry behavior with a maximum of two retries.

Failure examples:
- LLM/provider error;
- missing knowledge base;
- missing price data;
- malformed or invalid input.

On terminal recoverable failure:

```text
current processing state
        ↓
FAILED_RETRY
        ↓
store error_message + audit event
        ↓
SME can retry or manually recover
```

The two-round clarification cap is not an error and must not transition to `FAILED_RETRY`.

---

## 9. Testing Matrix

Tests must cover the supplied transcript scenarios, including:

- complete brief in one message;
- one clarification round;
- two rounds then `NEEDS_SME_INPUT`;
- manual-input recovery;
- vague budget accepted as present;
- vague guest quantifier rejected;
- volunteered information captured even if unasked;
- later client correction overwriting earlier values;
- rush-fee trigger;
- venue TBD accepted as present-but-flagged;
- small-talk/noise with no false extraction;
- garbled low-confidence input;
- approval-bypass prompt injection;
- instruction-override prompt injection;
- unrealistic budget/scope mismatch;
- out-of-bounds guest count;
- abusive/off-topic input;
- out-of-scope declined quote explicitly excluded from the MVP.

Tests should assert both:
- extracted/quoted data;
- expected state transitions.

---

## 10. File Structure

```text
billam-agent/
├── src/
│   ├── agent/
│   │   ├── orchestration/
│   │   │   └── agentLoop.ts
│   │   └── tools/
│   │       ├── ingestChatMessage.ts
│   │       ├── parseClientBrief.ts
│   │       ├── generateClarifyingQuestions.ts
│   │       ├── computeQuote.ts
│   │       └── simulateSendMessage.ts
│   │
│   ├── api/
│   │   ├── jobs.routes.ts
│   │   ├── jobs.handlers.ts
│   │   └── validators.ts
│   │
│   ├── state/
│   │   ├── JobStore.ts
│   │   ├── stateMachine.ts
│   │   └── auditLog.ts
│   │
│   ├── llm/
│   │   ├── LLMClient.ts
│   │   ├── BedrockLLMClient.ts
│   │   ├── AnthropicLLMClient.ts
│   │   └── providerFactory.ts
│   │
│   ├── data/
│   │   ├── knowledge_base/
│   │   │   └── event_vendor.json
│   │   └── price_catalog/
│   │       └── event_vendor.json
│   │
│   ├── types/
│   │   ├── Job.ts
│   │   ├── Quote.ts
│   │   ├── ChatMessage.ts
│   │   └── ToolContracts.ts
│   │
│   └── index.ts
│
├── tests/
│   ├── state/
│   ├── tools/
│   ├── api/
│   ├── integration/
│   └── fixtures/
│       └── sample_chat_transcripts_event_vendor.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL_SPECIFICATION.md
│   ├── FILE_STRUCTURE.md
│   └── API_SPECIFICATION.md
│
└── README.md
```

---

## 11. 15-Day Build Alignment

### Days 1–3
- job model and state machine;
- AWS/Bedrock setup;
- ingestion tool;
- Strands skeleton;
- chat API.

### Days 4–7
- parsing;
- knowledge-base integration;
- clarifying questions;
- Bedrock wiring;
- simulated auto-send flow;
- basic chat UI.

### Days 8–11
- quote computation;
- quote review/edit/approval;
- `NEEDS_SME_INPUT` recovery;
- deployment;
- error/retry;
- audit logging and basic metrics.

### Days 12–14
- transcript-driven tests;
- edge cases;
- demo rehearsal;
- observability and deployment stabilization.

### Day 15
- final polish;
- demo recording;
- architecture and README;
- submission.

Caterer remains a stretch goal only if the event-vendor flow is stable ahead of schedule.

---

## 12. Scope Boundary

Required:
- event-vendor demo;
- simulated WhatsApp-style chat;
- autonomous clarification;
- maximum two clarification rounds;
- manual SME recovery;
- quote generation;
- editable quote draft;
- explicit approval before simulated send;
- retry/error handling;
- audit trail.

Optional:
- ASR;
- caterer data pack.

Excluded:
- live WhatsApp API;
- live external price feeds;
- post-quote negotiation/acceptance detection.

---

**Technical specification status: revised to align with the current PRD, state machine, Developer Task Breakdown, tool contracts, mock inputs, knowledge-base rules, price catalog and transcript scenarios.**
