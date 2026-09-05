# API_SPECIFICATION.md — BillAm Agent

**Status:** MVP API contract  
**Base concept:** Job-oriented REST API  
**Primary demo:** Simulated WhatsApp-style chat for the Event Vendor business type

---

# 1. API Principles

The API models the lifecycle of a client request as a `Job`.

A client message does not directly call a quote endpoint. Instead:

```text
Create/retrieve job
        ↓
POST message
        ↓
Agent ingests and reasons
        ↓
Clarify OR escalate OR generate quote
        ↓
SME reviews quote
        ↓
SME edits if necessary
        ↓
SME explicitly approves
        ↓
Quote appears in simulated chat
```

The approval gate is enforced by the backend and state machine.

---

# 2. Base URL

Development:

```text
http://localhost:3001
```

API paths:

```text
/jobs
```

---

# 3. Common Response Shape

Successful responses may use:

```json
{
  "success": true,
  "data": {}
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Quote approval is not allowed in the current job state."
  }
}
```

Suggested error codes:

- `JOB_NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_STATE_TRANSITION`
- `QUOTE_NOT_AVAILABLE`
- `APPROVAL_REQUIRED`
- `PRICE_DATA_UNAVAILABLE`
- `LLM_PROVIDER_ERROR`
- `RETRY_NOT_ALLOWED`
- `INTERNAL_ERROR`

---

# 4. Job Object

```json
{
  "job_id": "job_123",
  "business_id": "business_001",
  "business_type": "event_vendor",
  "state": "CLARIFYING",
  "clarification_round": 1,
  "messages": [],
  "extracted_fields": {},
  "missing_required_fields": [
    "guest_count",
    "event_date"
  ],
  "quote": null,
  "error_message": null,
  "created_at": "2026-08-25T10:00:00.000Z",
  "updated_at": "2026-08-25T10:01:00.000Z"
}
```

---

# 5. Create Job

## `POST /jobs`

Creates a new job.

### Request

```json
{
  "business_id": "business_001",
  "business_type": "event_vendor"
}
```

### Response — `201 Created`

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "business_id": "business_001",
    "business_type": "event_vendor",
    "state": "IDLE",
    "clarification_round": 0,
    "messages": [],
    "extracted_fields": {},
    "missing_required_fields": [],
    "quote": null
  }
}
```

---

# 6. Send Client Message

## `POST /jobs/:id/messages`

This is the primary entry point for simulated client chat input.

### Request

```json
{
  "message_text": "Good afternoon. I am planning a wedding for about 200 guests on the 14th of next month in Lekki. Budget is around 3 million naira.",
  "received_at": "2026-08-25T10:05:00.000Z"
}
```

### Backend behavior

The endpoint should:

1. validate the job;
2. call `ingest_chat_message`;
3. append the client message;
4. transition to `INGESTING`;
5. invoke the agent flow;
6. parse and merge the brief;
7. determine the next valid state.

Possible outcomes:

```text
CLARIFYING
NEEDS_SME_INPUT
AWAITING_HUMAN_APPROVAL
FAILED_RETRY
```

The API should return the current state after the processing cycle completes.

### Example response — clarification needed

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "CLARIFYING",
    "clarification_round": 1,
    "missing_required_fields": [
      "guest_count",
      "event_date"
    ],
    "agent_message": "About how many guests are you expecting, and what date is the event planned for?"
  }
}
```

The agent message must also be appended to the simulated chat through `simulate_send_message`.

### Example response — quote ready

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "AWAITING_HUMAN_APPROVAL",
    "missing_required_fields": [],
    "quote_available": true
  }
}
```

A quote in this state has **not** been sent to the client chat.

---

# 7. Get Job

## `GET /jobs/:id`

Returns the current job.

### Response

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "AWAITING_HUMAN_APPROVAL",
    "clarification_round": 0,
    "messages": [],
    "extracted_fields": {
      "event_type": "wedding",
      "guest_count": 200,
      "event_date": "2026-09-14",
      "venue_location": "Lekki",
      "budget_range": "~3000000 NGN"
    },
    "missing_required_fields": [],
    "quote": {
      "status": "DRAFT"
    }
  }
}
```

---

# 8. Get Draft Quote

## `GET /jobs/:id/quote`

Returns the current draft quote.

This endpoint is valid when a quote has been generated.

### Response

```json
{
  "success": true,
  "data": {
    "status": "DRAFT",
    "line_items": [
      {
        "name": "Venue decor",
        "quantity": 1,
        "unit_price": 500000,
        "total": 500000
      }
    ],
    "contingencies": [
      {
        "name": "Transport and logistics",
        "amount": 40000
      }
    ],
    "subtotal": 500000,
    "total": 540000,
    "currency": "NGN",
    "validity_days": 7,
    "payment_terms": "From active price catalog",
    "assumptions": [],
    "draft_message": "Here is your draft quote..."
  }
}
```

The exact line items and amounts must be generated from the active price catalog rather than hardcoded in the API contract.

---

# 9. Edit Draft Quote

## `PATCH /jobs/:id/quote`

Allows the SME to edit line items or totals before approval.

This endpoint is only valid while:

```text
state = AWAITING_HUMAN_APPROVAL
```

### Example request

```json
{
  "line_items": [
    {
      "name": "Venue decor",
      "quantity": 1,
      "unit_price": 450000
    }
  ],
  "notes": "Adjusted after SME review"
}
```

### Backend behavior

1. validate current job state;
2. apply allowed edits;
3. recalculate the draft total where appropriate;
4. keep the quote in draft status;
5. write an audit event;
6. do not send the quote.

### Response

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "AWAITING_HUMAN_APPROVAL",
    "quote": {
      "status": "DRAFT",
      "total": 490000
    }
  }
}
```

---

# 10. Approve and Send Quote

## `POST /jobs/:id/approve_quote`

This is the only API action that can move an approved quote toward `EXECUTED`.

### Request

```json
{
  "approved_by": "sme_001"
}
```

### Required state

```text
AWAITING_HUMAN_APPROVAL
```

### Backend behavior

```text
Validate SME approval
        ↓
Record approval event
        ↓
Call simulate_send_message
        ↓
Append quote to simulated chat
        ↓
Transition to EXECUTED
```

### Response

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "EXECUTED",
    "quote_status": "SENT",
    "sent_at": "2026-08-25T10:30:00.000Z"
  }
}
```

A client message or LLM instruction must never substitute for this endpoint.

---

# 11. Get Missing Fields

## `GET /jobs/:id/missing_fields`

Used when:

```text
state = NEEDS_SME_INPUT
```

### Response

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "NEEDS_SME_INPUT",
    "missing_fields": [
      "guest_count",
      "event_date"
    ],
    "summary": "The client did not provide a usable guest count or specific event date after two clarification rounds.",
    "clarification_round": 2
  }
}
```

---

# 12. Submit Manual SME Input

## `POST /jobs/:id/manual_input`

Allows the SME to supply unresolved required values.

### Request

```json
{
  "supplied_fields": {
    "guest_count": 40,
    "event_date": "third Saturday of next month"
  },
  "source": "SME obtained details directly from client"
}
```

### Backend behavior

```text
NEEDS_SME_INPUT
        ↓
Merge supplied fields
        ↓
Validate completeness
        ↓
REASONING
        ↓
compute_quote
        ↓
AWAITING_HUMAN_APPROVAL
```

If the supplied data is still insufficient or invalid, return the job to the appropriate recovery state rather than generating an unsafe quote.

---

# 13. Retry Failed Job

## `POST /jobs/:id/retry`

Used when:

```text
state = FAILED_RETRY
```

### Backend behavior

The system should retry from the failed stage where possible.

It should preserve:
- messages;
- successfully extracted fields;
- clarification history;
- existing draft data where still valid.

It should not unnecessarily restart the entire conversation.

### Response

```json
{
  "success": true,
  "data": {
    "job_id": "job_123",
    "state": "REASONING",
    "retry_started": true
  }
}
```

The final state after retry may subsequently become:

```text
CLARIFYING
NEEDS_SME_INPUT
AWAITING_HUMAN_APPROVAL
FAILED_RETRY
```

---

# 14. State Transition Rules

| From | To | Trigger |
|---|---|---|
| `IDLE` | `INGESTING` | Client message received |
| `CLARIFYING` | `INGESTING` | Client replies |
| `INGESTING` | `REASONING` | Message stored |
| `REASONING` | `CLARIFYING` | Required fields missing and clarification rounds remain |
| `REASONING` | `NEEDS_SME_INPUT` | Required fields unresolved after two rounds |
| `REASONING` | `AWAITING_HUMAN_APPROVAL` | Complete brief and quote generated |
| Processing state | `FAILED_RETRY` | Recoverable failure |
| `NEEDS_SME_INPUT` | `REASONING` | SME submits manual input |
| `AWAITING_HUMAN_APPROVAL` | `EXECUTED` | SME approves and quote is simulated-sent |

The state machine should reject invalid transitions.

---

# 15. Chat Message Model

Every simulated chat message should have a consistent structure.

```json
{
  "message_id": "msg_001",
  "job_id": "job_123",
  "sender": "client",
  "message_type": "TEXT",
  "text": "I need decor for my birthday.",
  "created_at": "2026-08-25T10:05:00.000Z"
}
```

Possible senders:

```text
client
agent
sme
system
```

For autonomous clarification:

```json
{
  "sender": "agent",
  "message_type": "CLARIFICATION",
  "required_approval": false
}
```

For the approved quote:

```json
{
  "sender": "agent",
  "message_type": "QUOTE",
  "required_approval": true
}
```

The approval requirement should be enforced before the quote message is appended to the client-visible simulated conversation.

---

# 16. Validation Rules

The API layer should validate request structure. The business/agent layer should validate meaning.

Examples:

### Request validation

```text
message_text must be a non-empty string
job_id must exist
business_type must be supported
supplied_fields must be an object
```

### Business validation

```text
Guest count cannot be silently inferred from “small crowd”
Client corrections overwrite previous values
Explicit venue TBD counts as present but flagged
Vague budget signals may count as present
Out-of-bounds values must not flow directly into quote math
```

---

# 17. Error and Retry Policy

Every failure should create an audit event containing:

- job ID;
- state;
- operation/tool;
- timestamp;
- sanitized error message;
- retry count.

Bounded retries should be applied to transient tool/provider failures.

After retry exhaustion:

```text
FAILED_RETRY
```

The dashboard can then expose the retry action or appropriate manual intervention.

`NEEDS_SME_INPUT` is not an error and must not use the failure/retry path.

---

# 18. Audit Events

Suggested internal event shape:

```json
{
  "event_id": "audit_001",
  "job_id": "job_123",
  "event_type": "STATE_TRANSITION",
  "from_state": "REASONING",
  "to_state": "AWAITING_HUMAN_APPROVAL",
  "actor": "system",
  "created_at": "2026-08-25T10:20:00.000Z"
}
```

Event types can include:

```text
JOB_CREATED
MESSAGE_RECEIVED
STATE_TRANSITION
TOOL_STARTED
TOOL_COMPLETED
TOOL_FAILED
CLARIFICATION_SENT
SME_INPUT_SUBMITTED
QUOTE_GENERATED
QUOTE_EDITED
QUOTE_APPROVED
QUOTE_SENT
RETRY_STARTED
RETRY_FAILED
```

---

# 19. MVP Endpoint Summary

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/jobs` | Create job |
| `POST` | `/jobs/:id/messages` | Send simulated client message and trigger agent |
| `GET` | `/jobs/:id` | Get job state |
| `GET` | `/jobs/:id/quote` | Get draft quote |
| `PATCH` | `/jobs/:id/quote` | Edit draft quote |
| `POST` | `/jobs/:id/approve_quote` | Approve and send quote |
| `GET` | `/jobs/:id/missing_fields` | Get unresolved fields |
| `POST` | `/jobs/:id/manual_input` | Supply missing values |
| `POST` | `/jobs/:id/retry` | Retry recoverable failure |

---

# 20. Explicit Non-Endpoints

The MVP does not require:

```text
POST /whatsapp/send
POST /voice/transcribe
POST /payments
POST /quotes/:id/accept
```

Live WhatsApp and production client acceptance are outside the current hackathon scope.

ASR is optional and should only add a preprocessing layer if implemented.

---

# 21. Implementation Contract

The API is successful only if the following invariant remains true:

```text
Client can provide information
        ↓
Agent can autonomously reason and clarify
        ↓
Agent can autonomously compute a draft
        ↓
SME can review and edit
        ↓
Only explicit SME approval can send the quote
```

This invariant must survive:
- malformed input;
- vague language;
- corrections;
- missing fields;
- provider failures;
- retry;
- manual recovery;
- prompt injection attempts.

The state machine and API authorization boundary—not the LLM prompt—are the final enforcement mechanisms.
