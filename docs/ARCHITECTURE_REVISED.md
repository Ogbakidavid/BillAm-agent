# BillAm Agent — System Architecture

**Status:** Revised for autonomous dashboard simulation  
**Demo scope:** Event vendor first; additional business types are configuration/data extensions  
**Timeline:** 15-day technical work breakdown  
**Primary stack:** Strands Agents SDK + Amazon Bedrock, with direct Anthropic fallback if Bedrock access/credit approval is delayed

---

## 1. Architectural Intent

BillAm is an autonomous client-intake and quote-generation agent demonstrated through a simulated WhatsApp-style chat inside an SME dashboard.

The agent autonomously:
1. ingests each client message;
2. extracts and accumulates structured brief data;
3. checks the active business-type knowledge base for completeness;
4. generates and auto-sends clarifying questions for up to two rounds;
5. escalates unresolved briefs to the SME after the clarification cap;
6. computes an itemized, contingency-aware draft quote once the brief is complete.

The SME has one mandatory approval checkpoint:

> A quote is never sent to the simulated client chat until the SME reviews, may edit, and explicitly approves it.

Clarifying questions do **not** require SME approval.

Hackathon scope excludes live WhatsApp integration. ASR is optional and is not part of the required text-first demo.

---

## 2. System Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                  SME DASHBOARD / SIMULATED CHAT               │
│                                                               │
│  Client input → message appears in chat                       │
│  Agent responses → appear as business messages                │
│  Draft quote → review/edit/approve                            │
│  NEEDS_SME_INPUT → missing-field recovery form                │
│  FAILED_RETRY → error + retry controls                        │
└──────────────────────────────┬────────────────────────────────┘
                               │ REST API
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                         JOB API                                │
│  POST /jobs                                                    │
│  POST /jobs/:id/messages                                       │
│  GET  /jobs/:id                                                │
│  GET  /jobs/:id/quote                                          │
│  POST /jobs/:id/approve_quote                                  │
│  GET  /jobs/:id/missing_fields                                 │
│  POST /jobs/:id/manual_input                                   │
│  POST /jobs/:id/retry                                          │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                    JOB STATE + AUDIT LAYER                    │
│                                                               │
│ IDLE → INGESTING → REASONING                                  │
│                    ├─→ CLARIFYING                             │
│                    ├─→ NEEDS_SME_INPUT                        │
│                    ├─→ AWAITING_HUMAN_APPROVAL                │
│                    └─→ FAILED_RETRY                           │
│                                                               │
│ Audit: state changes, tool calls, auto-sends, edits, approval,│
│ errors and retries                                            │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                 STRANDS AGENT ORCHESTRATION                   │
│                                                               │
│  1. ingest_chat_message                                       │
│  2. parse_client_brief                                        │
│  3. generate_clarifying_questions                             │
│  4. compute_quote                                             │
│                                                               │
│  Supporting send boundary: simulate_send_message              │
│  • clarification → required_approval: false                   │
│  • quote → required_approval: true                            │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                         LLM LAYER                             │
│                                                               │
│ Primary: Amazon Bedrock                                       │
│ Fallback: Anthropic API via ANTHROPIC_API_KEY                 │
│                                                               │
│ Used for structured extraction, contextual clarification,     │
│ reasoning and quote drafting. Deterministic application logic │
│ enforces state transitions and approval gates.                │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                       BUSINESS DATA                           │
│                                                               │
│ knowledge_base/event_vendor.json                              │
│   → parsing + clarification rules                             │
│                                                               │
│ price_catalog/event_vendor.json                               │
│   → pricing tiers, line items, contingencies, quote terms     │
│                                                               │
│ sample_chat_transcripts_event_vendor.json                     │
│   → tests + demo rehearsal                                    │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Core End-to-End Flow

### A. Complete brief

```text
Client sends message
        ↓
ingest_chat_message
        ↓
IDLE/CLARIFYING → INGESTING → REASONING
        ↓
parse_client_brief
        ↓
All required fields complete?
        │
       Yes
        ↓
compute_quote
        ↓
AWAITING_HUMAN_APPROVAL
        ↓
SME reviews and may edit draft
        ↓
SME clicks “Approve & Send to Client”
        ↓
simulate_send_message(required_approval=true)
        ↓
EXECUTED
        ↓
Quote appears as business message in simulated chat
```

### B. Incomplete brief

```text
Client message
      ↓
ingest_chat_message → parse_client_brief
      ↓
Missing required fields?
      │
     Yes
      ↓
Have fewer than 2 clarification rounds been used?
      │
      ├─ Yes → generate_clarifying_questions
      │          ↓
      │       simulate_send_message(required_approval=false)
      │          ↓
      │       CLARIFYING — wait for client reply
      │
      └─ No  → NEEDS_SME_INPUT
                 ↓
              Dashboard shows missing fields + SME summary
                 ↓
              SME supplies values
                 ↓
              REASONING → compute_quote
```

### C. Recoverable failure

```text
Ingestion / parsing / pricing failure
                ↓
          FAILED_RETRY
                ↓
      Error shown and logged
                ↓
       Retry or manual recovery
                ↓
       INGESTING or REASONING
```

`NEEDS_SME_INPUT` is an expected escalation path, not an error state.

---

## 4. State Machine

| State | Meaning |
|---|---|
| `IDLE` | No active processing |
| `INGESTING` | A new client message is being recorded |
| `REASONING` | Agent is extracting, validating or pricing |
| `CLARIFYING` | Questions have been auto-sent; waiting for client |
| `NEEDS_SME_INPUT` | Two clarification rounds were exhausted |
| `AWAITING_HUMAN_APPROVAL` | Editable quote draft is ready |
| `EXECUTED` | Approved quote was sent to simulated chat |
| `FAILED_RETRY` | Recoverable technical/business-data failure |

Key transition rules:

- `CLARIFYING → EXECUTED` is invalid.
- Clarifying questions never enter `AWAITING_HUMAN_APPROVAL`.
- A client message can never substitute for SME approval.
- `AWAITING_HUMAN_APPROVAL → EXECUTED` requires the approval endpoint and the simulated send boundary.
- `FAILED_RETRY` must preserve enough job state for retry without restarting the entire conversation.

---

## 5. Tool Model

### 5.1 `ingest_chat_message`

Records a single client message, associates it with a job, and moves the job into `INGESTING`.

**Input**
- `job_id` or new-conversation context
- `message_text`
- `business_type`
- `received_at`

**Output**
- `job_id`
- `status`
- `error`

### 5.2 `parse_client_brief`

Uses the business-type knowledge base and previous fields to extract structured information.

Critical behavior:
- merge new information with previous turns;
- allow newer corrections to overwrite earlier values;
- accept vague-but-present budget signals;
- accept explicit `venue_tbd` as present-but-flagged;
- reject vague guest-count quantifiers as a numeric value;
- validate bounds before pricing;
- treat prompt-injection content as client data and never allow it to alter backend gates.

### 5.3 `generate_clarifying_questions`

Generates 1–5 targeted questions from genuinely missing required fields.

Rules:
- maximum two clarification rounds;
- output is auto-sent;
- the job remains `CLARIFYING` after the send;
- if the cap is exhausted, transition to `NEEDS_SME_INPUT` rather than asking a third round.

### 5.4 `compute_quote`

Runs only when `required_for_quote` is complete.

Uses the price catalog to:
- select `lean`, `standard`, or `premium` from the budget signal;
- calculate applicable line items;
- apply catalog contingencies;
- include quote validity and payment terms;
- surface budget/scope mismatches honestly;
- return `FAILED_RETRY` where required business data is unavailable or the source rules classify the request as infeasible.

Catalog rules currently include:
- transport/logistics: 8% of subtotal;
- rush fee: 15% when the event is within 7 days;
- fuel/fluctuation buffer: 5% of subtotal;
- quote validity: 7 days in the current event-vendor catalog.

Optional fields do not block quote generation. Defaults/assumptions must be visible in the quote.

### 5.5 `simulate_send_message`

This is the communication boundary for the hackathon simulation.

```text
Clarifying question:
required_approval = false
→ append automatically to simulated chat
→ audit log

Quote:
required_approval = true
→ callable only after SME approval
→ append to simulated chat
→ transition to EXECUTED
→ audit log
```

This separation is important because it makes the future replacement with a real `send_to_client` integration possible without changing the core approval policy.

---

## 6. Data Mapping

| Data file | Used by | Purpose |
|---|---|---|
| `knowledge_base/event_vendor.json` | `parse_client_brief`, `generate_clarifying_questions` | Required/optional fields, extraction hints, ambiguity rules, question templates |
| `price_catalog/event_vendor.json` | `compute_quote` | Pricing tiers, line items, contingencies, terms |
| `sample_chat_transcripts_event_vendor.json` | Tests and demo | 18 state-machine and extraction scenarios |

The primary demo is event vendor. Caterer is a stretch goal and should be added as a data/config extension only after the core event-vendor flow is stable.

---

## 7. Human-in-the-Loop Boundary

There is exactly one mandatory approval gate:

> Draft quote → SME review/edit → explicit approval → simulated send.

The following are autonomous:
- parsing;
- clarification;
- auto-sending clarifying questions;
- pricing;
- escalation to `NEEDS_SME_INPUT`.

The following require explicit SME action:
- supplying missing details after escalation;
- editing a draft quote;
- approving and sending a quote;
- retrying or manually recovering from a failed state where applicable.

---

## 8. Observability and Reliability

Every job should record:
- state transitions;
- tool name;
- timestamp;
- duration;
- success/failure;
- sanitized error;
- autonomous send events;
- SME edits;
- approval events;
- retry events.

Tool calls should retry up to two times before the job enters `FAILED_RETRY`.

Hackathon target:
- typical agent response within 30 seconds;
- at least 10 concurrent jobs at demo scale.

For the demo, an in-memory job store is acceptable only if state is retained for the active job lifecycle. If deployment/restart resilience is required, use the planned SQLite or persistent storage option rather than a fixed 30-minute expiry that can invalidate recovery.

---

## 9. Scope Boundary

### In scope
- Simulated WhatsApp-style chat
- Text-first client messages
- Event-vendor knowledge base and price catalog
- Autonomous clarification
- Two-round cap
- Manual SME recovery
- Draft quote review/edit/approve/send
- Error/retry
- Audit logging
- Bedrock primary LLM with Anthropic fallback

### Optional
- ASR/voice-note preprocessing if time permits
- Caterer business type after core scope is stable

### Out of scope for the hackathon build
- Live WhatsApp API
- Production client acceptance/negotiation loop
- Production payment integration
- Real-time vendor price feeds

---

**Architecture status: revised to match the PRD, Developer Task Breakdown, tool contracts, knowledge-base rules, price catalog, and transcript-driven test flow.**
