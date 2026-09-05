# BillAm Agent

An autonomous AI-powered client intake, clarification, and quote drafting backend for Nigerian informal SMEs — built for **event decor vendors**, with caterer and tailor support as stretch goals.

BillAm Agent receives unstructured client briefs via a simulated WhatsApp-style dashboard chat, autonomously extracts structured information, asks up to two rounds of clarifying questions, and computes itemised, Naira-priced quotes for the SME owner to review, edit, and explicitly approve before any quote is sent to the client.

---

## Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Running Tests](#running-tests)
- [Documentation](#documentation)
- [Key Architectural Rules](#key-architectural-rules)
- [Progress](#progress)

---

## Overview

| Feature | Detail |
|---|---|
| **Primary Business Type** | Event Vendor (MVP) |
| **Interface** | Simulated real-time dashboard chat |
| **Agent Framework** | [Strands Agents SDK](https://github.com/strands-agents/sdk) |
| **Primary LLM Provider** | Amazon Bedrock (Claude via AWS) |
| **Fallback LLM Provider** | Anthropic API (direct) |
| **Backend** | Node.js 18+ · TypeScript · Express |
| **Currency** | Nigerian Naira (NGN / ₦) |
| **Clarification Cap** | Max 2 autonomous rounds per job |
| **Quote Approval Gate** | Mandatory single SME owner approval before any quote is sent |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| Web Framework | Express 5 |
| Agent Orchestration | `@strands-agents/sdk` |
| Primary LLM | Amazon Bedrock (`@aws-sdk/client-bedrock-runtime`) |
| Fallback LLM | Anthropic SDK (`@anthropic-ai/sdk`) |
| Environment Config | `dotenv` |
| Testing | Jest + `ts-jest` + Supertest |
| Package Manager | pnpm |

---

## Project Structure

```
billam-agent/
│
├── src/                          # All application source code
│   │
│   ├── index.ts                  # Server entrypoint — starts Express, registers shutdown hooks
│   ├── app.ts                    # Express setup — middleware, routes, centralized error handler
│   │
│   ├── agent/
│   │   ├── orchestration/
│   │   │   └── agentLoop.ts      # Core agent loop — coordinates all 5 tools and state transitions
│   │   │
│   │   ├── tools/                # Strands tool implementations (called by the agent loop)
│   │   │   ├── ingestChatMessage.ts          # Receives/records client messages, creates or resumes a Job
│   │   │   ├── parseClientBrief.ts           # Extracts structured fields from raw client messages
│   │   │   ├── generateClarifyingQuestions.ts # Generates 1–5 WhatsApp-style clarifying questions
│   │   │   ├── computeQuote.ts               # Computes itemised quotes from the price catalog
│   │   │   └── simulateSendMessage.ts        # Appends messages to simulated chat & audit log
│   │   │
│   │   └── prompts/              # Read-only LLM instruction files referenced by tools
│   │       ├── systemPrompt.ts           # Agent identity, Nigerian SME context, safety guardrails
│   │       ├── parseBriefPrompt.ts       # Extraction rules for parse_client_brief tool
│   │       ├── clarificationPrompt.ts    # Question formatting rules for clarification tool
│   │       ├── quoteDraftPrompt.ts       # Pricing rules and WhatsApp quote formatting
│   │       └── smeSummaryPrompt.ts       # Dashboard escalation summaries (NEEDS_SME_INPUT / FAILED_RETRY)
│   │
│   ├── api/                      # REST API layer
│   │   ├── jobs.routes.ts        # Declares all /jobs route definitions
│   │   ├── jobs.handlers.ts      # Request handlers — delegates to agent/state layer
│   │   └── validators.ts         # Request body and route input validators
│   │
│   ├── state/                    # Job state management layer
│   │   ├── stateMachine.ts       # Enforces valid job state transitions (rejects invalid paths)
│   │   ├── JobStore.ts           # In-memory job store (read/write active jobs)
│   │   └── auditLog.ts           # Appends audit events for every action, transition and tool call
│   │
│   ├── llm/                      # LLM provider abstraction
│   │   ├── LLMClient.ts          # Shared provider interface (generate method)
│   │   ├── BedrockLLMClient.ts   # Amazon Bedrock implementation
│   │   ├── AnthropicLLMClient.ts # Anthropic direct API fallback
│   │   └── providerFactory.ts    # Selects active provider from environment config
│   │
│   ├── data/                     # Static business data (read at runtime)
│   │   ├── knowledge_base/
│   │   │   └── event_vendor.json # Required/optional fields, extraction hints, clarification rules
│   │   ├── price_catalog/
│   │   │   └── event_vendor.json # Pricing tiers (lean/standard/premium), contingency rates, terms
│   │   └── transcripts/
│   │       └── sample_chat_transcripts_event_vendor.json  # Real conversation scenarios for dev & test
│   │
│   ├── types/                    # Shared TypeScript type definitions
│   │   ├── Job.ts                # JobState enum, Job, AuditEvent, ExtractedFields interfaces
│   │   ├── Quote.ts              # Quote, LineItem, Contingency interfaces
│   │   ├── ChatMessage.ts        # ChatMessage structure
│   │   ├── ToolContracts.ts      # Input/output contracts for all 5 Strands tools
│   │   └── Api.ts                # API request and response DTOs
│   │
│   ├── config/
│   │   └── env.ts                # Reads and validates all environment variables at startup
│   │
│   └── utils/
│       ├── errors.ts             # Custom error classes (AppError, NotFoundError, StateTransitionError, etc.)
│       └── logger.ts             # Structured logger with log-level filtering (debug/info/warn/error)
│
├── tests/
│   ├── state/
│   │   └── stateMachine.test.ts          # State machine transition unit tests
│   ├── tools/
│   │   ├── ingestChatMessage.test.ts
│   │   ├── parseClientBrief.test.ts
│   │   ├── generateClarifyingQuestions.test.ts
│   │   ├── computeQuote.test.ts
│   │   └── simulateSendMessage.test.ts
│   ├── api/
│   │   └── jobs.api.test.ts              # API endpoint integration tests
│   ├── integration/
│   │   └── agentFlow.test.ts             # End-to-end agent loop tests
│   └── fixtures/                         # Mock input data for test scenarios
│       ├── mock_briefs.json
│       ├── expected_quotes.json
│       ├── expected_clarifying_questions.json
│       ├── sample_chat_transcripts_event_vendor.json
│       └── test_case_summary.json
│
├── docs/                         # Technical documentation
│   ├── ARCHITECTURE_REVISED.md
│   ├── TECHNICAL_SPECIFICATION_CROSSCHECKED.md
│   ├── FILE_STRUCTURE.md
│   ├── API_SPECIFICATION.md
│   ├── TASK_BREAKDOWN.md
│   ├── DATA_SCHEMA.md
│   ├── TEST_PLAN.md
│   ├── PROMPT_FILES_MAPPING.md
│   └── PROGRESS.md               # Live task completion tracker linked to TASK_BREAKDOWN.md
│
├── infrastructure/               # Cloud deployment configuration (Cloud Integrator owned)
│   └── README.md                 # Required cloud resources and deployment procedure
│
├── scripts/
│   └── runTranscriptScenario.ts  # CLI runner for offline transcript scenario testing
│
├── .env.example                  # Environment variable template (copy to .env)
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── jest.config.js
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- **pnpm** (recommended) or npm

### 1. Clone the Repository

```bash
git clone <repository-url>
cd billam-agent
```

### 2. Install Dependencies

```bash
pnpm install
```

Or using npm:

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Then edit `.env` with your values (see [Environment Variables](#environment-variables) below).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default: `3000`) | Port the Express server listens on |
| `NODE_ENV` | No (default: `development`) | Runtime environment (`development` / `production`) |
| `LOG_LEVEL` | No (default: `info`) | Log verbosity (`debug` / `info` / `warn` / `error`) |
| `LLM_PROVIDER` | Yes | Active LLM provider: `bedrock` or `anthropic` |
| `ANTHROPIC_API_KEY` | Yes (if provider = `anthropic`) | Anthropic API key for direct Claude access |
| `AWS_REGION` | Yes (if provider = `bedrock`) | AWS region where Bedrock is enabled (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | Yes (if provider = `bedrock`) | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes (if provider = `bedrock`) | AWS secret access key |
| `STRANDS_API_KEY` | If required by Strands SDK | Strands Agents SDK key if applicable |

> ⚠️ Never commit your `.env` file. It is listed in `.gitignore`.

**LLM Provider Fallback Order:**
```
Amazon Bedrock (primary)
    │
    └── unavailable / not yet approved
              ↓
       Anthropic API (fallback)
```

---

## Running the Server

```bash
# Development (ts-node, no build step required)
npx ts-node src/index.ts

# Type-check only (no emit)
npx tsc --noEmit
```

Once running, the health check endpoint is available at:

```
GET http://localhost:3001/health
```

---

## Running Tests

```bash
# Run all tests
pnpm test

# Or with npm
npm test
```

Test files are located in `tests/`. Fixture data for mock scenarios is in `tests/fixtures/`.

---

## Documentation

All technical documentation lives in the [`docs/`](./docs/) folder:

| File | Description |
|---|---|
| [`ARCHITECTURE_REVISED.md`](./docs/ARCHITECTURE_REVISED.md) | System architecture and component diagram |
| [`TECHNICAL_SPECIFICATION_CROSSCHECKED.md`](./docs/TECHNICAL_SPECIFICATION_CROSSCHECKED.md) | Full technical specification, tool contracts, state machine, API routes |
| [`FILE_STRUCTURE.md`](./docs/FILE_STRUCTURE.md) | Repository map and file ownership (BE vs CI) |
| [`API_SPECIFICATION.md`](./docs/API_SPECIFICATION.md) | REST API endpoints, request/response shapes |
| [`DATA_SCHEMA.md`](./docs/DATA_SCHEMA.md) | TypeScript interfaces, JSON schemas, tool payload contracts |
| [`TASK_BREAKDOWN.md`](./docs/TASK_BREAKDOWN.md) | 15-day sprint plan with role-specific task IDs and definitions of done |
| [`TEST_PLAN.md`](./docs/TEST_PLAN.md) | Test suites, mock input scenarios, state invariant tests |
| [`PROMPT_FILES_MAPPING.md`](./docs/PROMPT_FILES_MAPPING.md) | Role and key rules for each of the 5 LLM prompt files |
| [`PROGRESS.md`](./docs/PROGRESS.md) | Live task completion status linked to TASK_BREAKDOWN.md |

---

## Key Architectural Rules

These invariants are enforced by backend and state logic — **not by the LLM prompts alone**:

1. **Mandatory SME Approval Gate:** A quote is never sent to a client without explicit SME owner approval via `POST /jobs/:id/approve_quote`.
2. **Autonomous Clarification Boundary:** The agent sends clarifying questions autonomously for up to **2 rounds maximum**. Round 3 is strictly forbidden.
3. **Escalation on Cap:** After 2 unresolved clarification rounds, the job transitions to `NEEDS_SME_INPUT` and the SME owner is notified via the dashboard.
4. **State Machine Integrity:** The forbidden transition `CLARIFYING → EXECUTED` is rejected at the state machine level. `EXECUTED` is only reachable from `AWAITING_HUMAN_APPROVAL` after explicit SME approval.
5. **Prompt Injection Protection:** All client message content is treated as untrusted input. No client message can alter pricing data, override approval rules, or trigger a state transition.

---

## Progress

See [`docs/PROGRESS.md`](./docs/PROGRESS.md) for the full task-by-task completion status mapped to source files.

**Current State (Base Code):**
- ✅ All TypeScript type definitions, LLM prompts, runtime data files, app core, utilities, and documentation are complete.
- 🔶 `agentLoop.ts`, prompt files, and partial infra config are in progress.
- ❌ Tool implementations, state machine logic, API handlers, LLM provider logic, and test cases are pending — these are the active engineering tasks.
