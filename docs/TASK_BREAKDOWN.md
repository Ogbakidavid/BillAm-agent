# BillAm Agent — Task Breakdown

## Project Scope
- Timeline: 15 days
- Primary MVP: Event Vendor
- Interface: Simulated real-time dashboard chat
- Workflow: Client message → autonomous agent → clarification if needed → quote draft → single SME approval → simulated send
- No WhatsApp API in MVP; ASR optional.
- Caterer is a stretch goal only if Days 1–10 finish on schedule and the Event Vendor MVP is stable.

## Roles
| Role | Code | Responsibility |
|---|---|---|
| Product Manager | PM | Product rules, acceptance criteria, data, scenarios, UAT |
| Backend Engineer | BE | Agent orchestration, tools, state machine, APIs, quote logic |
| Cloud Integrator | CI | AWS/model setup, provider integration, deployment, observability |

## Phase Definitions of Done
### Foundation
Repository works; Job state machine is implemented; Event Vendor knowledge and pricing load; provider abstraction works; Anthropic fallback is configured; state transitions are unit-tested.

### Autonomous Intake
Messages ingest; fields extract; missing fields identify; clarification questions generate; autonomous clarification stops after two rounds; unresolved cases route to `NEEDS_SME_INPUT`.

### Quote and Approval
Valid briefs produce deterministic drafts; line items and contingencies calculate from configured data; SME can review/edit; quote cannot send without explicit approval; simulated send works.

### Validation and Delivery
Mock scenarios and state invariants pass; Event Vendor works end-to-end; runtime is verified; documentation and demo are complete.

# Day-by-Day Plan

## Day 1 — Foundation and Architecture
### PM-01 — Finalize MVP Operating Rules
**Deliverables:** Event Vendor MVP, simulated chat, single SME approval gate, clarification policy, five scenario acceptance criteria.
**Tests:** Validate every required state and confirm no scenario depends on WhatsApp.
**Done:** Product rules have no conflicting interpretations.

### BE-01 — Implement Core Job State Machine
**Deliverables:** `JobState`, transition validator, Job lifecycle, state-transition audit events.
**Tests:** Valid transitions pass; invalid transitions fail; `CLARIFYING -> EXECUTED` fails; execution requires approval.
**Done:** State transitions cannot be bypassed.

### CI-01 — Initialize Cloud and Model Provider Configuration
**Deliverables:** AWS/Bedrock setup where available, environment strategy, Anthropic fallback, secret rules.
**Tests:** Provider invocation; missing credentials fail safely; no secrets committed.
**Done:** Backend calls the LLM through a provider abstraction.

## Day 2 — Project Skeleton and Data Loading
### PM-02
Finalize Event Vendor knowledge base, price catalog, required/optional fields and clarification guidance.
### BE-02
Implement Job creation, message persistence and `IngestChatMessage`.
**Tests:** Message creates/resolves Job, ordering is preserved, Job enters `INGESTING`.
### CI-02
Configure local runtime, startup, baseline logging and environment validation.

## Day 3 — Agent Orchestration
### PM-03
Freeze demo flow: message → extract → identify missing data → clarify if necessary → quote draft → SME review → one approval → simulated send.
### BE-03
Implement routing between ingestion, reasoning, clarification, quote generation and escalation.
**Tests:** Complete briefs route to quote; incomplete briefs route to clarification.
### CI-03
Implement timeout handling, structured provider errors, safe failure handling and fallback readiness.

## Day 4 — Client Brief Parsing
### PM-04
Prepare clear, ambiguous, Pidgin and multi-turn correction fixtures.
### BE-04 — `ParseClientBrief`
Extract fields, load knowledge, detect missing fields, merge turns and handle explicit corrections.
**Tests:** Complete brief, missing data, Pidgin, no invented headcount, latest explicit value wins.

## Day 5 — Clarification Engine
### PM-05
Define field-specific question guidance and round-one/round-two behavior.
### BE-05 — `GenerateClarifyingQuestions`
Track rounds, generate 1–5 questions and enforce a two-round maximum.
**Tests:** Round 1, Round 2, answered fields not repeated, Round 3 blocked.
**Done:** Exceeded cap routes to `NEEDS_SME_INPUT`.

## Day 6 — Simulated Messaging
### BE-06 — `SimulateSendMessage`
Create outbound simulated messages, persist transcripts, audit events and enforce approval.
**Tests:** Clarification sends without approval; quote fails without approval; approved quote sends.
### CI-04
Connect backend to simulated chat UI with client, agent and SME actions.

## Day 7 — Autonomous Clarification Loop
### PM-06
Review clarification behavior, escalation and Pidgin handling.
### BE-07
Implement `REASONING → CLARIFYING → questions → send → client response → INGESTING → REASONING`.
**Tests:** Clarification state persists; response resumes processing; cap escalates.

## Day 8 — Quote Computation
### PM-07
Define expected line items, contingencies, terms, feasibility thresholds and option rules.
### BE-08 — `ComputeQuote`
Load catalog, calculate line items/contingencies, validate feasibility and generate draft.
**Tests:** Valid brief, contingency, missing price, budget/scope mismatch, out-of-bounds request.
**Done:** Valid draft enters `AWAITING_HUMAN_APPROVAL`; prices are never fabricated.

## Day 9 — SME Review and Approval
### BE-09
Implement quote retrieval, editing and audit history.
### BE-10
Implement explicit SME approval.
**Tests:** Wrong-state approval fails; client cannot approve; approved quote sends once.
**Done:** No path reaches `EXECUTED` without explicit SME approval.
### CI-05
Prepare deployable runtime, variables and health/logging checks.

## Day 10 — SME Recovery
### PM-08
Define missing-field summaries, manual recovery examples and continuation behavior.
### BE-11
Implement `NEEDS_SME_INPUT → REASONING` recovery.
**Tests:** Valid SME input resumes; invalid input rejects; valid prior fields persist.

## Caterer Stretch Goal Gate
Start only if Days 1–10 finish on schedule, Event Vendor works end-to-end, state tests pass, clarification cap works, approval cannot be bypassed, quote generation is stable and no blocking cloud/provider issue remains.
- **BE-S01:** Add Caterer knowledge and price data using the same schemas/orchestration.
- **PM-S01:** Validate Caterer fields, prices and fixtures.
- **CI-S01:** Confirm deployment/provider compatibility.

## Day 11 — Failure and Retry
### BE-12
Implement `FAILED_RETRY`, failure metadata and bounded retry behavior.
**Tests:** Provider failure, missing knowledge, missing pricing, context preservation.
### CI-06
Add logs for state transitions, tool failures and provider errors.

## Day 12 — Full Test Execution
### PM-09
Run all five mock scenarios and classify deviations.
### BE-13
Run state-machine, tool, API and approval tests.

## Day 13 — End-to-End Stabilization
### BE-14
Stabilize intake, clarification, quote, SME editing, approval and simulated send.
### CI-07
Validate deployment, provider configuration and fallback readiness.

## Day 14 — Demo Rehearsal and Freeze
### PM-10
Conduct UAT, demo walkthrough and backup scenario.
### BE-15
Bug fixes only; run regression tests after critical fixes.

## Day 15 — Final Delivery
### PM-11
Finalize README, architecture, technical specification, file structure, API specification, task breakdown, data schema, test plan and demo materials.
### BE-16
Verify clean install, startup and required tests.
### CI-08
Verify deployment, environment variables, secret safety and logging.
