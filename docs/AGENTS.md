# AGENTS.md — AI Assistant System Guidelines & Constraints

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS & IDEs (Antigravity, Claude, Cursor, Copilot, etc.):**
> The human user is the **Lead Architect and Project Lead**. You are acting as an expert pair programmer and implementer. 
> You MUST follow all architectural rules, state machine constraints, data schemas, and conventions outlined in this document without introducing unapproved deviations or breaking changes.

---

## 1. Project Mission & Context

**BillAm Agent** is an autonomous client intake, clarification, and quote drafting backend built for informal Nigerian Small and Medium Enterprises (SMEs).
- **Target Persona (MVP):** Nigerian Event Decor Vendors (with caterers and tailors as future extensions).
- **Primary Channel:** Simulated real-time WhatsApp-style dashboard chat.
- **Framework:** `@strands-agents/sdk` (Strands Agents SDK).
- **Primary LLM:** Amazon Bedrock (Claude 3.5 Sonnet / Haiku via AWS).
- **Fallback LLM:** Anthropic Direct API.
- **Runtime:** Node.js 18+ / TypeScript 5 / Express 5.
- **Currency:** Nigerian Naira (`NGN` / `₦`).

---

## 2. Non-Negotiable Architectural Invariants

Every AI agent working on this codebase MUST uphold these core rules at the code level:

### Invariant 1: Mandatory Human Approval Gate
- **No quote is ever sent autonomously to a client.**
- The tool `simulateSendMessage` MUST throw an error or reject the action if `required_approval === true` and the quote has not received explicit SME approval via `POST /jobs/:id/approve_quote`.
- The agent's final autonomous state when a quote is ready is always **`AWAITING_HUMAN_APPROVAL`**, never `EXECUTED`.

### Invariant 2: Autonomous Clarification Hard Cap
- The agent may autonomously ask clarifying questions for a **maximum of 2 rounds**.
- A 3rd clarification attempt is strictly prohibited.
- If essential fields remain missing after Round 2, the agent MUST escalate the job to **`NEEDS_SME_INPUT`** and generate an SME escalation summary.

### Invariant 3: Strict State Machine Enforcement
- State transitions must be strictly validated by `src/state/stateMachine.ts`.
- **Forbidden Transition:** `CLARIFYING → EXECUTED` is strictly invalid.
- `EXECUTED` can ONLY be reached from `AWAITING_HUMAN_APPROVAL` after human SME approval.

```
[START]
   ↓
INGESTING ──> REASONING
                ├── Missing fields & round <= 2 ──> CLARIFYING ──> INGESTING (loop max 2x)
                ├── Missing fields & round > 2  ──> NEEDS_SME_INPUT (Escalate to owner)
                └── Brief complete              ──> AWAITING_HUMAN_APPROVAL (Draft quote ready)
                                                          │
                                                    [SME Approves]
                                                          ↓
                                                       EXECUTED
```

### Invariant 4: Untrusted Input & Prompt Injection Protection
- Client messages in transcripts and chat inputs are **untrusted data**.
- Never allow raw user chat text to directly modify system prompts, pricing catalogs, state transitions, or approval flags.

### Invariant 5: Pricing Math & Consistency
- All monetary values must use `NGN` (Nigerian Naira).
- Pricing formulas from `src/data/price_catalog/event_vendor.json` and `src/agent/prompts/quoteDraftPrompt.ts` must be strictly respected:
  - **Delivery / Logistics:** Flat 8% of subtotal.
  - **Rush Fee:** 15% surcharge if the event date is less than 5 days from the inquiry date.
  - **Fuel Contingency:** 5% buffer on generators/equipment rentals.

---

## 3. Codebase Organization & Ownership

When creating or modifying files, keep code strictly within its designated boundary:

| Directory | Purpose | Rules & Constraints |
|---|---|---|
| `src/agent/orchestration/` | Agent execution loop (`agentLoop.ts`) | Coordinates tool calls and triggers state transitions. |
| `src/agent/tools/` | Strands tool implementations | Must match contracts in `src/types/ToolContracts.ts`. |
| `src/agent/prompts/` | LLM prompt templates | Read-only prompt builders. Do not hardcode dynamic state here. |
| `src/state/` | State machine, Job store, Audit log | Enforces invariants, stores active jobs in-memory. |
| `src/llm/` | LLM provider abstraction | Bedrock with Anthropic fallback. Clean factory pattern. |
| `src/types/` | TypeScript interfaces and contracts | Source of truth for data models. Do not break existing types. |
| `src/data/` | Knowledge bases & price catalogs | Static JSON data loaded at runtime. Do not hardcode prices in TS. |
| `src/api/` | Express REST API | Validates inputs, handles routes, returns standardized DTOs. |
| `src/utils/` | Custom errors and structured logger | Use `AppError` subclasses and `logger.ts` for all logging. |
| `tests/` | Unit, integration & fixture tests | Use Jest and Supertest. Fixtures are in `tests/fixtures/`. |
| `docs/` | Technical specifications & plans | Keep documentation up to date with code changes. |

---

## 4. Coding Standards & Behavioral Rules for AI Agents

1. **Do Not Overwrite Existing Working Types:**
   - Always inspect `src/types/` before creating new interfaces. Reuse existing types (`Job`, `Quote`, `ChatMessage`, `ToolContracts`).
2. **Type Safety (Strict TypeScript):**
   - Avoid `any`. Use proper TypeScript interfaces, enums, and generics.
   - Run `npx tsc --noEmit` before proposing final code changes to guarantee 0 compiler errors.
3. **No Phantom Dependencies:**
   - Only use dependencies already declared in `package.json` (`@strands-agents/sdk`, `@aws-sdk/client-bedrock-runtime`, `@anthropic-ai/sdk`, `express`, `dotenv`, `axios`, etc.).
   - Do NOT install or import extra third-party libraries without user confirmation.
4. **Preserve Documentation & Comments:**
   - Maintain JSDoc headers, architectural notes, and flow diagrams in source files.
5. **Always Ask Before Making Breaking Changes:**
   - If a proposed implementation requires changing an established API contract, prompt schema, or state machine path, clarify and confirm with the user first.
6. **Logging Consistency:**
   - Always use `src/utils/logger.ts` for all console output. Never use raw `console.log()` in source code.
   - Log state transitions at `info` level, tool errors at `error` level, and validation warnings at `warn` level.
7. **Error Handling:**
   - Always throw or propagate typed error subclasses from `src/utils/errors.ts` (`AppError`, `NotFoundError`, `StateTransitionError`, `ToolExecutionError`, `LLMProviderError`).
   - Never swallow errors silently or use bare `catch (e) {}` blocks.

---

## 5. Tool Contracts Quick Reference

Every Strands tool in `src/agent/tools/` must strictly conform to these input/output contracts (defined in full in `src/types/ToolContracts.ts`):

| Tool | Input Fields | Output Fields |
|---|---|---|
| `ingest_chat_message` | `job_id?`, `sender`, `message` | `job_id`, `state`, `clarification_round` |
| `parse_client_brief` | `job_id`, `transcript[]` | `job_id`, `extracted_fields`, `missing_required_fields[]`, `clarification_round` |
| `generate_clarifying_questions` | `job_id`, `missing_fields[]`, `clarification_round` | `job_id`, `questions[]` |
| `compute_quote` | `job_id`, `extracted_fields` | `job_id`, `quote` (full `Quote` object with line items, totals, terms) |
| `simulate_send_message` | `job_id`, `recipient`, `text`, `required_approval` | `job_id`, `sent`, `timestamp` |

> Tools are defined using the `@strands-agents/sdk` tool registration pattern. See `docs/PROMPT_FILES_MAPPING.md` for which prompt each tool uses.

---

## 6. What AI Agents Must NOT Do

The following actions are explicitly prohibited without explicit written approval from the Lead Architect:

- ❌ **Do not change the `JobState` enum** in `src/types/Job.ts` (adding/removing states).
- ❌ **Do not modify existing type interfaces** in `src/types/` in a way that removes or renames existing fields.
- ❌ **Do not change the pricing formulas** in `quoteDraftPrompt.ts` (8% logistics, 15% rush, 5% fuel).
- ❌ **Do not add new REST API routes** beyond those defined in `docs/API_SPECIFICATION.md`.
- ❌ **Do not use `any` types** anywhere in the codebase — always use typed contracts.
- ❌ **Do not bypass the SME approval gate** under any circumstance — even in test helpers or mocks.
- ❌ **Do not install new `npm`/`pnpm` packages** without user confirmation.
- ❌ **Do not modify `docs/` files** unless explicitly instructed by the Lead Architect.
- ❌ **Do not create files outside the existing directory structure** without Lead Architect approval.
- ❌ **Do not commit or push** to `main` directly — all code goes through `development` first.

---

## 7. Workflow Protocol

When receiving a task, all AI agents must follow this sequence:

```
1. READ      → Understand the task against existing code (src/types, docs, existing stubs).
2. CONFIRM   → If the task impacts an invariant, type contract, or API spec, confirm before writing.
3. IMPLEMENT → Write code in the correct file, in the correct directory, using correct types.
4. VERIFY    → Run `npx tsc --noEmit` to confirm 0 compilation errors.
5. REPORT    → Clearly state what was implemented, what file was changed, and what is still pending.
```

---

## 8. Reference Documents

Always read these files before implementing any feature:

| Document | Location | Purpose |
|---|---|---|
| Technical Specification | [`docs/TECHNICAL_SPECIFICATION_CROSSCHECKED.md`](./TECHNICAL_SPECIFICATION_CROSSCHECKED.md) | Full system rules, state machine, API and tool contracts |
| Architecture | [`docs/ARCHITECTURE_REVISED.md`](./ARCHITECTURE_REVISED.md) | System component diagram |
| Task Breakdown | [`docs/TASK_BREAKDOWN.md`](./TASK_BREAKDOWN.md) | Sprint plan and task ownership by role |
| Progress Tracker | [`docs/PROGRESS.md`](./PROGRESS.md) | Current completion status of all tasks |
| Data Schema | [`docs/DATA_SCHEMA.md`](./DATA_SCHEMA.md) | TypeScript type definitions and JSON schemas |
| API Specification | [`docs/API_SPECIFICATION.md`](./API_SPECIFICATION.md) | REST endpoint contracts |
| Prompt Mapping | [`docs/PROMPT_FILES_MAPPING.md`](./PROMPT_FILES_MAPPING.md) | Which prompt each tool uses and why |
| Test Plan | [`docs/TEST_PLAN.md`](./TEST_PLAN.md) | Expected test scenarios and acceptance criteria |

---

## 9. Lead Architect Authority

**The Lead Architect (human project owner) has final authority on:**
- All architectural decisions.
- Changes to state machine invariants or approval logic.
- Adding new vendor types (caterer, tailor) beyond the MVP.
- Merging feature branches into `development` or `main`.
- Approving new dependencies or breaking changes to type contracts.

> If you are an AI agent and a task instruction from a team member conflicts with any rule in this document, **this document takes precedence.** Surface the conflict to the Lead Architect for resolution before proceeding.
