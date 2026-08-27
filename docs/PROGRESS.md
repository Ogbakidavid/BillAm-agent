# BillAm Agent — Progress Tracker

> **Source of Truth:** [TASK_BREAKDOWN.md](./TASK_BREAKDOWN.md)
>
> **Legend:**
>
> - ✅ **Complete** — Fully implemented and present in the codebase.
> - 🔶 **In Progress** — File exists and has foundational work (types, stubs with documented intent, or partial content), but implementation logic is not yet written.
> - ❌ **Incomplete** — Not yet started; file is an empty comment stub or does not exist.
>
> **Note on "In Progress":** A file counts as _In Progress_ if it has meaningful content beyond a one-line comment (e.g. documented flow, prompt content, or a populated type file). Pure one-line-comment stubs are marked ❌.

---

## Day 1 — Foundation and Architecture

| Task                                             | Status         | Related Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-01** Finalize MVP Operating Rules           | ✅ Complete    | [`docs/ARCHITECTURE_REVISED.md`](./ARCHITECTURE_REVISED.md), [`docs/TECHNICAL_SPECIFICATION_CROSSCHECKED.md`](./TECHNICAL_SPECIFICATION_CROSSCHECKED.md), [`docs/FILE_STRUCTURE.md`](./FILE_STRUCTURE.md)                                                                                                                                                                                                                                                                                                            |
| **BE-01** Implement Core Job State Machine       | ✅ Complete    | [`src/types/Job.ts`](../src/types/Job.ts) — `JobState` type + all 8 states fully defined. [`src/state/stateMachine.ts`](../src/state/stateMachine.ts) — transition validator fully implemented (`transitionJob`, `isValidTransition`), including explicit rejection of `CLARIFYING → EXECUTED` (v1 bug guard). [`tests/state/stateMachine.test.ts`](../tests/state/stateMachine.test.ts) — 12 unit tests, all passing.                                                                                               |
| **CI-01** Cloud and Model Provider Configuration | 🔶 In Progress | [`src/llm/LLMClient.ts`](../src/llm/LLMClient.ts) — shared provider interface implemented. [`src/llm/providerFactory.ts`](../src/llm/providerFactory.ts) — fully implemented with model abstraction (registered provider list, not hardcoded), retry logic, and fallback chain, 5 unit tests passing. [`src/llm/BedrockLLMClient.ts`](../src/llm/BedrockLLMClient.ts), [`src/llm/AnthropicLLMClient.ts`](../src/llm/AnthropicLLMClient.ts) — blocked on AWS account access + Anthropic API key, not yet implemented. |

---

## Day 2 — Project Skeleton and Data Loading

| Task                                                                 | Status         | Related Files                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-02** Finalize Event Vendor Knowledge Base and Price Catalog     | ✅ Complete    | [`src/data/knowledge_base/event_vendor.json`](../src/data/knowledge_base/event_vendor.json), [`src/data/price_catalog/event_vendor.json`](../src/data/price_catalog/event_vendor.json)                                                                                                                           |
| **BE-02** Job Creation, Message Persistence and `IngestChatMessage`  | 🔶 In Progress | [`src/state/JobStore.ts`](../src/state/JobStore.ts) — fully implemented (createJob, getJob, appendMessage, mergeExtractedFields, updateJobState, updateMissingFields), 7 unit tests passing. [`src/agent/tools/ingestChatMessage.ts`](../src/agent/tools/ingestChatMessage.ts) — stub only, not yet implemented. |
| **CI-02** Local Runtime, Startup, Logging and Environment Validation | ✅ Complete    | [`src/index.ts`](../src/index.ts) — server startup with graceful shutdown fully implemented. [`src/utils/logger.ts`](../src/utils/logger.ts) — structured logger with level filtering fully implemented. [`src/config/env.ts`](../src/config/env.ts) — env validation implemented.                               |

---

## Day 3 — Agent Orchestration

| Task                                                               | Status         | Related Files                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-03** Freeze Demo Flow                                         | ✅ Complete    | [`docs/TASK_BREAKDOWN.md`](./TASK_BREAKDOWN.md), [`docs/TECHNICAL_SPECIFICATION_CROSSCHECKED.md`](./TECHNICAL_SPECIFICATION_CROSSCHECKED.md) — flow fully documented.                                                                                                                  |
| **BE-03** Implement Agent Loop Routing                             | 🔶 In Progress | [`src/agent/orchestration/agentLoop.ts`](../src/agent/orchestration/agentLoop.ts) — full 5-step orchestration flow documented in JSDoc comments (INGESTING → REASONING → CLARIFYING / NEEDS_SME_INPUT / AWAITING_HUMAN_APPROVAL / FAILED_RETRY). Implementation logic not yet written. |
| **CI-03** Timeout Handling, Provider Errors and Fallback Readiness | ❌ Incomplete  | [`src/llm/BedrockLLMClient.ts`](../src/llm/BedrockLLMClient.ts), [`src/llm/AnthropicLLMClient.ts`](../src/llm/AnthropicLLMClient.ts), [`src/llm/providerFactory.ts`](../src/llm/providerFactory.ts) — stubs only.                                                                      |

---

## Day 4 — Client Brief Parsing

| Task                                             | Status         | Related Files                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-04** Prepare Parsing Fixtures               | ✅ Complete    | [`tests/fixtures/mock_briefs.json`](../tests/fixtures/mock_briefs.json), [`tests/fixtures/sample_chat_transcripts_event_vendor.json`](../tests/fixtures/sample_chat_transcripts_event_vendor.json), [`src/data/transcripts/sample_chat_transcripts_event_vendor.json`](../src/data/transcripts/sample_chat_transcripts_event_vendor.json) |
| **BE-04** `ParseClientBrief` Tool Implementation | 🔶 In Progress | [`src/agent/prompts/parseBriefPrompt.ts`](../src/agent/prompts/parseBriefPrompt.ts) — full extraction prompt + `buildParseBriefUserPrompt()` helper implemented. [`src/agent/tools/parseClientBrief.ts`](../src/agent/tools/parseClientBrief.ts) — stub only, Strands tool logic not yet written.                                         |

---

## Day 5 — Clarification Engine

| Task                                                        | Status         | Related Files                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-05** Define Field-Specific Question Guidance           | ✅ Complete    | [`src/data/knowledge_base/event_vendor.json`](../src/data/knowledge_base/event_vendor.json) — field-level clarification guidance present.                                                                                                                                                                                           |
| **BE-05** `GenerateClarifyingQuestions` Tool Implementation | 🔶 In Progress | [`src/agent/prompts/clarificationPrompt.ts`](../src/agent/prompts/clarificationPrompt.ts) — full clarification prompt + `buildClarificationUserPrompt()` helper implemented. [`src/agent/tools/generateClarifyingQuestions.ts`](../src/agent/tools/generateClarifyingQuestions.ts) — stub only, Strands tool logic not yet written. |

---

## Day 6 — Simulated Messaging

| Task                                                | Status         | Related Files                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BE-06** `SimulateSendMessage` Tool Implementation | 🔶 In Progress | [`src/state/auditLog.ts`](../src/state/auditLog.ts) — fully implemented (logStateTransition, logClarificationSent, logQuoteApproved, logQuoteEdited, getAuditTrail), 6 unit tests passing. [`src/agent/tools/simulateSendMessage.ts`](../src/agent/tools/simulateSendMessage.ts) — stub only, not yet implemented. |
| **CI-04** Connect Backend to Simulated Chat UI      | ❌ Incomplete  | No frontend UI files exist yet.                                                                                                                                                                                                                                                                                    |

---

## Day 7 — Autonomous Clarification Loop

| Task                                                                                        | Status        | Related Files                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-06** Review Clarification Behavior                                                     | ✅ Complete   | [`docs/TECHNICAL_SPECIFICATION_CROSSCHECKED.md`](./TECHNICAL_SPECIFICATION_CROSSCHECKED.md) — Section 3.3 clarification round logic documented. |
| **BE-07** Full Clarification Loop (`REASONING → CLARIFYING → send → INGESTING → REASONING`) | ❌ Incomplete | Depends on `agentLoop.ts`, `generateClarifyingQuestions.ts`, and `simulateSendMessage.ts` — all pending.                                        |

---

## Day 8 — Quote Computation

| Task                                                             | Status         | Related Files                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-07** Define Line Items, Contingencies and Feasibility Rules | ✅ Complete    | [`src/data/price_catalog/event_vendor.json`](../src/data/price_catalog/event_vendor.json) — pricing tiers, contingency rates, feasibility rules defined.                                                                                                                                                                                              |
| **BE-08** `ComputeQuote` Tool Implementation                     | 🔶 In Progress | [`src/agent/prompts/quoteDraftPrompt.ts`](../src/agent/prompts/quoteDraftPrompt.ts) — full pricing rules prompt + `buildQuoteDraftUserPrompt()` helper implemented (8% transport, 15% rush fee, 5% fuel buffer, tier logic). [`src/agent/tools/computeQuote.ts`](../src/agent/tools/computeQuote.ts) — stub only, Strands tool logic not yet written. |

---

## Day 9 — SME Review and Approval

| Task                                                      | Status         | Related Files                                                                                                                                                                                              |
| --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BE-09** Quote Retrieval, Editing and Audit History      | ❌ Incomplete  | [`src/api/jobs.handlers.ts`](../src/api/jobs.handlers.ts) — stub only. [`src/api/jobs.routes.ts`](../src/api/jobs.routes.ts) — route declarations listed as comments, not registered.                      |
| **BE-10** Explicit SME Approval Endpoint                  | ❌ Incomplete  | [`src/api/jobs.routes.ts`](../src/api/jobs.routes.ts) — `POST /:id/approve_quote` noted as comment only.                                                                                                   |
| **CI-05** Deployable Runtime, Variables and Health Checks | 🔶 In Progress | [`src/index.ts`](../src/index.ts) — server starts and graceful shutdown works. [`src/app.ts`](../src/app.ts) — `GET /health` endpoint implemented. Deployment config (AWS/infrastructure) not yet created. |

---

## Day 10 — SME Recovery

| Task                                                                             | Status        | Related Files                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-08** Define Missing-Field Summaries and Manual Recovery Examples            | ✅ Complete   | [`src/agent/prompts/smeSummaryPrompt.ts`](../src/agent/prompts/smeSummaryPrompt.ts) — full escalation summary prompt + `buildSmeSummaryUserPrompt()` helper implemented for `NEEDS_SME_INPUT` and `FAILED_RETRY` scenarios. |
| **BE-11** `NEEDS_SME_INPUT → REASONING` Recovery (`POST /jobs/:id/manual_input`) | ❌ Incomplete | [`src/api/jobs.routes.ts`](../src/api/jobs.routes.ts) — `POST /:id/manual_input` noted as comment only, not implemented.                                                                                                    |

---

## Caterer Stretch Goal Gate

| Task                                            | Status         | Related Files                                                                                                                 |
| ----------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Gate Check**                                  | ❌ Not Started | Gate condition: Days 1–10 must be complete and Event Vendor MVP stable first. See [`TASK_BREAKDOWN.md`](./TASK_BREAKDOWN.md). |
| **BE-S01** Add Caterer Knowledge and Price Data | ❌ Not Started | Would create `src/data/knowledge_base/caterer.json`, `src/data/price_catalog/caterer.json`                                    |
| **PM-S01** Validate Caterer Fields and Fixtures | ❌ Not Started | —                                                                                                                             |
| **CI-S01** Deployment/Provider Compatibility    | ❌ Not Started | —                                                                                                                             |

---

## Day 11 — Failure and Retry

| Task                                                                       | Status         | Related Files                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BE-12** `FAILED_RETRY` State, Failure Metadata and Bounded Retry         | ❌ Incomplete  | [`src/utils/errors.ts`](../src/utils/errors.ts) — `ToolExecutionError` and `LLMProviderError` classes exist. `FAILED_RETRY` state is defined in [`src/types/Job.ts`](../src/types/Job.ts). Retry orchestration in `agentLoop.ts` not yet implemented. |
| **CI-06** Logging for State Transitions, Tool Failures and Provider Errors | 🔶 In Progress | [`src/utils/logger.ts`](../src/utils/logger.ts) — structured logger with `debug/info/warn/error` levels fully implemented. Per-tool and per-transition logging calls not yet wired inside tools.                                                      |

---

## Day 12 — Full Test Execution

| Task                                                      | Status        | Related Files                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PM-09** Run All Five Mock Scenarios                     | ❌ Incomplete | [`tests/fixtures/mock_briefs.json`](../tests/fixtures/mock_briefs.json), [`tests/fixtures/expected_quotes.json`](../tests/fixtures/expected_quotes.json), [`tests/fixtures/expected_clarifying_questions.json`](../tests/fixtures/expected_clarifying_questions.json), [`tests/fixtures/test_case_summary.json`](../tests/fixtures/test_case_summary.json) — fixture data files exist. Test runners not yet implemented. |
| **BE-13** Run State Machine, Tool, API and Approval Tests | ❌ Incomplete | [`tests/state/stateMachine.test.ts`](../tests/state/stateMachine.test.ts), [`tests/tools/*.test.ts`](../tests/tools/), [`tests/api/jobs.api.test.ts`](../tests/api/jobs.api.test.ts), [`tests/integration/agentFlow.test.ts`](../tests/integration/agentFlow.test.ts) — all test files exist as empty stubs.                                                                                                             |

---

## Day 13 — End-to-End Stabilization

| Task                                                               | Status        | Related Files                                                       |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------- |
| **BE-14** Stabilize Full End-to-End Flow                           | ❌ Incomplete | Depends on all tools and agentLoop being implemented first.         |
| **CI-07** Validate Deployment, Provider Configuration and Fallback | ❌ Incomplete | [`infrastructure/`](../infrastructure/) — README placeholders only. |

---

## Day 14 — Demo Rehearsal and Freeze

| Task                                                | Status        | Related Files                                                                                                                                                                          |
| --------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-10** UAT, Demo Walkthrough and Backup Scenario | ❌ Incomplete | [`tests/fixtures/sample_chat_transcripts_event_vendor.json`](../tests/fixtures/sample_chat_transcripts_event_vendor.json) — scenario data exists for demo use. Demo not yet rehearsed. |
| **BE-15** Bug Fixes and Regression Tests            | ❌ Incomplete | Pending test implementation.                                                                                                                                                           |

---

## Day 15 — Final Delivery

| Task                                                             | Status         | Related Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM-11** Finalize All Documentation and Demo Materials          | 🔶 In Progress | [`docs/ARCHITECTURE_REVISED.md`](./ARCHITECTURE_REVISED.md) ✅, [`docs/TECHNICAL_SPECIFICATION_CROSSCHECKED.md`](./TECHNICAL_SPECIFICATION_CROSSCHECKED.md) ✅, [`docs/FILE_STRUCTURE.md`](./FILE_STRUCTURE.md) ✅, [`docs/API_SPECIFICATION.md`](./API_SPECIFICATION.md) ✅, [`docs/TASK_BREAKDOWN.md`](./TASK_BREAKDOWN.md) ✅, [`docs/DATA_SCHEMA.md`](./DATA_SCHEMA.md) ✅, [`docs/TEST_PLAN.md`](./TEST_PLAN.md) ✅, [`docs/PROMPT_FILES_MAPPING.md`](./PROMPT_FILES_MAPPING.md) ✅. README.md not yet created. |
| **BE-16** Verify Clean Install, Startup and Required Tests       | ❌ Incomplete  | `npx tsc --noEmit` passes with 0 errors. Full test suite not yet runnable.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **CI-08** Verify Deployment, Env Vars, Secret Safety and Logging | ❌ Incomplete  | `.env.example` ✅ exists. Deployment verification pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## Summary

| Status         | Count |
| -------------- | ----- |
| ✅ Complete    | 12    |
| 🔶 In Progress | 10    |
| ❌ Incomplete  | 17    |

### What Is Fully Ready (Complete or In Progress)

- All **TypeScript type definitions** (`src/types/`)
- All **5 LLM prompt files** (`src/agent/prompts/`)
- All **runtime data files** (`src/data/knowledge_base/`, `src/data/price_catalog/`, `src/data/transcripts/`)
- All **test fixture files** (`tests/fixtures/`)
- **Application core** (`src/app.ts`, `src/index.ts`, `src/config/env.ts`)
- **Utilities** (`src/utils/errors.ts`, `src/utils/logger.ts`)
- **All 7 documentation files** in `docs/`
- **Agent loop flow documentation** (`src/agent/orchestration/agentLoop.ts`)

### What Comes Next (BE + CI to implement)

- `src/state/JobStore.ts` — In-memory job store (BE-02)
- `src/state/auditLog.ts` — Audit event writer (BE-06)
- `src/agent/tools/*.ts` — All 5 Strands tool implementations (BE-04 through BE-08)
- `src/agent/orchestration/agentLoop.ts` — Full orchestration implementation (BE-03)
- `src/api/jobs.routes.ts` + `jobs.handlers.ts` + `validators.ts` — REST API (BE-09, BE-10, BE-11)
- `src/llm/` — LLM provider implementations (CI-01, CI-03)
- All test files under `tests/` (BE-13)
