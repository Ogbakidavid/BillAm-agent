# BillAm Agent — System Architecture (V2)

**Status:** V2 — Refactored for native Strands Agents SDK orchestration  
**Demo scope:** Event vendor first; additional business types are data/config extensions  
**Stack:** Strands Agents SDK + Anthropic Claude Sonnet 4.5 via `AnthropicModel`  
**Hackathon:** AWS x Strands Devpost Hackathon

---

## 1. Architectural Intent

BillAm is an autonomous client-intake and quote-generation agent demonstrated through a simulated WhatsApp-style chat inside an SME dashboard.

The agent autonomously:
1. ingests each client message (handled at the API layer by `postMessageHandler`);
2. extracts and accumulates structured brief data using `update_job_state`;
3. checks the active business-type knowledge base using `fetch_knowledge_base`;
4. generates and auto-sends clarifying questions for up to two rounds using `simulate_send_message`;
5. escalates unresolved briefs to the SME after the clarification cap;
6. computes an itemized, contingency-aware draft quote using `fetch_price_catalog` + `update_job_state`.

The SME has one mandatory approval checkpoint:

> A quote is never sent to the simulated client chat until the SME reviews, may edit, and explicitly approves it via `POST /jobs/:id/approve_quote`.

Clarifying questions do **not** require SME approval — they are sent autonomously.

Hackathon scope excludes live WhatsApp integration.

---

## 2. System Architecture

```
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
│  PATCH /jobs/:id/quote                                         │
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
│ Audit: state changes, tool calls, auto-sends, edits,          │
│ approval, errors and retries                                  │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│              STRANDS AGENT ORCHESTRATION (V2)                 │
│                                                               │
│  Orchestration: createBillamAgent(jobId) → Agent.invoke()     │
│                                                               │
│  SOP: billam-sop.md (Markdown Standard Operating Procedure)   │
│                                                               │
│  Tools (pure capability tools):                               │
│  • fetch_knowledge_base    → loads KB JSON for business type  │
│  • fetch_price_catalog     → loads pricing JSON               │
│  • update_job_state        → mutates job fields + quote       │
│  • simulate_send_message   → autonomous clarification sends   │
│                                                               │
│  Skills (modular SOPs loaded by AgentSkills plugin):          │
│  • conversation-style/SKILL.md  → tone + language rules       │
│  • quote-generation/SKILL.md    → pricing logic guidance      │
│                                                               │
│  Plugins:                                                     │
│  • SessionManager   → persists conversation state per job     │
│  • ToneGuardrail    → GoalLoop enforcing professional tone    │
│  • RateLimiterHook  → blocks runaway tool-call loops (max 5)  │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                       LLM LAYER (V2)                          │
│                                                               │
│  Model: AnthropicModel (claude-sonnet-4-5)                    │
│  Managed natively by @strands-agents/sdk                      │
│  Auth: ANTHROPIC_API_KEY from environment                     │
│                                                               │
│  The SDK manages: context window, tool-call parsing,          │
│  multi-turn history, streaming, and recursive tool loops.     │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                       BUSINESS DATA                           │
│                                                               │
│ knowledge_base/{business_type}.json                           │
│   → required fields, extraction hints, clarification rules   │
│                                                               │
│ price_catalog/{business_type}.json                            │
│   → pricing tiers, line items, contingencies, quote terms    │
│                                                               │
│ sample_chat_transcripts_event_vendor.json                     │
│   → tests + demo rehearsal                                    │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Core End-to-End Flow

### A. Complete brief

```
Client sends message
        ↓
API: POST /jobs/:id/messages
  - appendMessage() to JobStore
  - transitionJob(state, "INGESTING")
        ↓
runAgentLoop(jobId)
  - createBillamAgent(jobId)
  - agent.invoke(prompt, { limits: { turns: 10 } })
        ↓
Agent → fetch_knowledge_base
        ↓
Agent → update_job_state (all required fields complete)
        ↓
Agent → fetch_price_catalog
        ↓
Agent → update_job_state(quote, state: "AWAITING_HUMAN_APPROVAL")
        ↓
SME reviews draft in dashboard
        ↓
POST /jobs/:id/approve_quote
        ↓
Quote status: "SENT", job state: "EXECUTED"
Quote appears in simulated client chat
```

### B. Incomplete brief

```
Client message (missing fields)
      ↓
Agent → fetch_knowledge_base
      ↓
Missing required fields detected?
      │
     Yes
      ↓
Have fewer than 2 clarification rounds been used?
      │
      ├─ Yes → Agent → simulate_send_message(clarifying_questions)
      │          ↓
      │       update_job_state(state: "CLARIFYING")
      │          ↓
      │       Wait for client reply → repeat loop
      │
      └─ No  → update_job_state(state: "NEEDS_SME_INPUT")
                 ↓
              Dashboard shows missing fields
                 ↓
              POST /jobs/:id/manual_input
                 ↓
              REASONING → compute quote
```

### C. Recoverable failure

```
Agent / tool error
              ↓
        FAILED_RETRY
              ↓
    Error shown and logged in audit
              ↓
     POST /jobs/:id/retry
              ↓
     INGESTING → agent re-invoked
```

---

## 4. State Machine

| State | Meaning |
|---|---|
| `IDLE` | Job created, no processing started |
| `INGESTING` | New client message recorded, agent not yet started |
| `REASONING` | Agent is actively executing its loop |
| `CLARIFYING` | Clarifying questions auto-sent; awaiting client reply |
| `NEEDS_SME_INPUT` | Two clarification rounds exhausted; SME must supply values |
| `AWAITING_HUMAN_APPROVAL` | Editable quote draft ready for SME review |
| `EXECUTED` | Approved quote sent to simulated client chat |
| `FAILED_RETRY` | Recoverable technical or business-data failure |

Key transition rules:

- `CLARIFYING → EXECUTED` is invalid.
- Clarifying questions never enter `AWAITING_HUMAN_APPROVAL`.
- A client message can never substitute for SME approval.
- `AWAITING_HUMAN_APPROVAL → EXECUTED` requires `POST /jobs/:id/approve_quote`.
- `FAILED_RETRY` preserves full job state for retry without restarting conversation.

---

## 5. Tool Contracts (V2)

All tools are **pure capability tools** — they do not call the LLM themselves. The Strands SDK manages all model interactions natively.

### 5.1 `fetch_knowledge_base`

Loads the JSON knowledge base for the given business type from disk.

**Input:** `business_type`  
**Output:** Full KB object: required fields, extraction hints, question templates, ambiguity rules.

### 5.2 `fetch_price_catalog`

Loads the JSON price catalog for the given business type from disk.

**Input:** `business_type`  
**Output:** Full catalog: tiers, line items, contingency rules, validity period, payment terms.

### 5.3 `update_job_state`

The primary mutation tool. The agent calls this to persist its reasoning back to the job store.

**Input:** `job_id`, `extracted_fields`, `missing_required_fields`, `clarification_round`, `new_state`, `quote`, `error_message`  
**Output:** Updated job summary.

### 5.4 `simulate_send_message`

The autonomous outbound communication boundary.

- `message_type: "clarifying_questions"` → appended autonomously to simulated chat, audit logged.
- Quotes are **NEVER** sent through this tool. They are saved via `update_job_state` and sent only after SME approval.

---

## 6. Data Mapping

| Data file | Used by tool | Purpose |
|---|---|---|
| `knowledge_base/{type}.json` | `fetch_knowledge_base` | Required/optional fields, extraction hints, ambiguity rules |
| `price_catalog/{type}.json` | `fetch_price_catalog` | Pricing tiers, line items, contingencies, terms |
| `sample_chat_transcripts_event_vendor.json` | Tests and demo | 18 E2E scenarios |

Supported business types: `event_vendor`, `caterer`, `tailor`, `photographer`, `event_planner`, `equipment_rental`

---

## 7. Human-in-the-Loop Boundary

**Autonomous (no SME needed):**
- Knowledge base lookup
- Field extraction and accumulation
- Clarifying question generation and sending (up to 2 rounds)
- Price catalog lookup and quote computation
- Escalation to `NEEDS_SME_INPUT`

**Requires explicit SME action:**
- Supplying missing values after escalation (`POST /jobs/:id/manual_input`)
- Editing a draft quote (`PATCH /jobs/:id/quote`)
- Approving and sending a quote (`POST /jobs/:id/approve_quote`)
- Triggering a retry (`POST /jobs/:id/retry`)

---

## 8. Observability

Every job records to the in-memory audit log:
- State transitions (from → to, timestamp)
- Tool invocations (name, input, output, duration)
- Autonomous clarification sends
- SME edits and approval events
- Retry events and error messages

**Safeguards:** `RateLimiterHook` blocks any single invocation exceeding 5 tool calls. `GoalLoop` (ToneGuardrail) enforces professional tone with up to 3 retry attempts per response.

---

## 9. Scope Boundary

### In scope
- Simulated WhatsApp-style chat
- Text-first client messages
- Event vendor + caterer + tailor knowledge and price catalogs
- Autonomous clarification with two-round cap
- Manual SME recovery
- Draft quote review / edit / approve / send
- Error / retry flow
- Audit logging
- Claude Sonnet 4.5 via Strands SDK `AnthropicModel`

### Out of scope
- Live WhatsApp API
- Production payment integration
- Real-time vendor price feeds
- ASR / voice-note preprocessing

---

**Architecture status: V2 — reflects full Strands SDK native orchestration, Markdown SOP, plugin architecture, and pure capability tools.**
