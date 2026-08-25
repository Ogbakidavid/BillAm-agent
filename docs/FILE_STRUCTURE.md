# FILE_STRUCTURE.md — BillAm Agent

**Status:** Build reference structure  
**Scope:** Event-vendor MVP first  
**Primary ownership:** Backend Engineer and Cloud Integrator  
**Purpose:** Provide a stable repository map before implementation begins.

---

## 1. Repository Structure

```text
billam-agent/
│
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── .gitignore
├── .env.example
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL_SPECIFICATION.md
│   ├── FILE_STRUCTURE.md
│   └── API_SPECIFICATION.md
│
├── src/
│   │
│   ├── index.ts
│   ├── app.ts
│   │
│   ├── agent/
│   │   ├── orchestration/
│   │   │   └── agentLoop.ts
│   │   │
│   │   ├── tools/
│   │   │   ├── ingestChatMessage.ts
│   │   │   ├── parseClientBrief.ts
│   │   │   ├── generateClarifyingQuestions.ts
│   │   │   ├── computeQuote.ts
│   │   │   └── simulateSendMessage.ts
│   │   │
│   │   └── prompts/
│   │       ├── systemPrompt.ts
│   │       ├── parseBriefPrompt.ts
│   │       ├── clarificationPrompt.ts
│   │       └── quoteDraftPrompt.ts
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
│   │   │
│   │   ├── price_catalog/
│   │   │   └── event_vendor.json
│   │   │
│   │   └── transcripts/
│   │       └── sample_chat_transcripts_event_vendor.json
│   │
│   ├── types/
│   │   ├── Job.ts
│   │   ├── Quote.ts
│   │   ├── ChatMessage.ts
│   │   ├── ToolContracts.ts
│   │   └── Api.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   └── utils/
│       ├── errors.ts
│       └── logger.ts
│
├── tests/
│   ├── state/
│   │   └── stateMachine.test.ts
│   │
│   ├── tools/
│   │   ├── ingestChatMessage.test.ts
│   │   ├── parseClientBrief.test.ts
│   │   ├── generateClarifyingQuestions.test.ts
│   │   ├── computeQuote.test.ts
│   │   └── simulateSendMessage.test.ts
│   │
│   ├── api/
│   │   └── jobs.api.test.ts
│   │
│   ├── integration/
│   │   └── agentFlow.test.ts
│   │
│   └── fixtures/
│       └── sample_chat_transcripts_event_vendor.json
│
├── infrastructure/
│   ├── README.md
│   └── deployment/
│       └── README.md
│
└── scripts/
    └── runTranscriptScenario.ts
```

---

# 2. File Ownership

## Backend Engineer — Primary Ownership

### Application entry

| File | Responsibility |
|---|---|
| `src/index.ts` | Starts the server and loads configuration |
| `src/app.ts` | Express application setup, middleware and route registration |

### Agent orchestration

| File | Responsibility |
|---|---|
| `src/agent/orchestration/agentLoop.ts` | Coordinates ingestion, parsing, clarification, quote computation and state transitions |
| `src/agent/tools/ingestChatMessage.ts` | Receives and records each client message |
| `src/agent/tools/parseClientBrief.ts` | Extracts structured brief fields using the knowledge base |
| `src/agent/tools/generateClarifyingQuestions.ts` | Generates targeted questions for genuinely missing required fields |
| `src/agent/tools/computeQuote.ts` | Uses the price catalog to generate line items, contingencies, totals and quote terms |
| `src/agent/tools/simulateSendMessage.ts` | Appends autonomous clarifications or approved quotes to the simulated chat and audit log |

### Prompt definitions

| File | Responsibility |
|---|---|
| `systemPrompt.ts` | Defines agent role and hard behavioral boundaries |
| `parseBriefPrompt.ts` | Structured extraction instructions |
| `clarificationPrompt.ts` | Clarifying-question generation instructions |
| `quoteDraftPrompt.ts` | Quote drafting instructions |

The prompts must not be the only protection for approval or state transitions. Those invariants belong in backend/state logic.

### API

| File | Responsibility |
|---|---|
| `src/api/jobs.routes.ts` | Declares the job-oriented REST routes |
| `src/api/jobs.handlers.ts` | Handles requests and invokes the agent/state layer |
| `src/api/validators.ts` | Validates request bodies and route inputs |

### State and persistence

| File | Responsibility |
|---|---|
| `src/state/JobStore.ts` | Stores and retrieves active jobs |
| `src/state/stateMachine.ts` | Enforces valid job-state transitions |
| `src/state/auditLog.ts` | Records state changes, tool calls, sends, edits, approvals, errors and retries |

### Types

| File | Responsibility |
|---|---|
| `src/types/Job.ts` | Job and job-state definitions |
| `src/types/Quote.ts` | Quote, line item and contingency definitions |
| `src/types/ChatMessage.ts` | Simulated chat message structure |
| `src/types/ToolContracts.ts` | Input/output contracts for tools |
| `src/types/Api.ts` | API request and response types |

### Validation and utilities

| File | Responsibility |
|---|---|
| `src/config/env.ts` | Reads and validates environment configuration |
| `src/utils/errors.ts` | Shared application error definitions |
| `src/utils/logger.ts` | Shared logging utilities |

### Tests

The Backend Engineer owns the core implementation and test coverage for:

- state transitions;
- each agent tool;
- API behavior;
- transcript scenarios;
- approval-bypass prevention;
- retry behavior;
- manual SME recovery.

---

# 3. Cloud Integrator — Primary Ownership

The Cloud Integrator should own the deployment and model-provider infrastructure, while coordinating the interface with the Backend Engineer.

## LLM provider integration

| File | Responsibility |
|---|---|
| `src/llm/LLMClient.ts` | Shared provider interface |
| `src/llm/BedrockLLMClient.ts` | Amazon Bedrock implementation |
| `src/llm/AnthropicLLMClient.ts` | Direct Anthropic API fallback |
| `src/llm/providerFactory.ts` | Selects the active provider based on environment configuration |

The intended provider order is:

```text
Amazon Bedrock
      │
      ├── available → use Bedrock
      │
      └── unavailable / not approved in time
                    ↓
             Anthropic API fallback
```

The Backend Engineer should only depend on `LLMClient`, not on a specific provider implementation.

## Infrastructure

| Location | Responsibility |
|---|---|
| `infrastructure/README.md` | Documents required cloud resources and deployment assumptions |
| `infrastructure/deployment/README.md` | Deployment procedure, environment variables and runtime configuration |

The exact AWS deployment files should only be added after the Cloud Integrator decides the final deployment mechanism. The current source documents establish AWS/Bedrock integration and deployment responsibilities, but do not require a specific IaC format.

## Cloud Integrator testing responsibilities

- Bedrock connectivity;
- model invocation;
- credentials/configuration;
- fallback-provider verification;
- deployed API availability;
- logging/observability setup;
- deployment stability.

---

# 4. Shared Files

## Business data

These files are shared because the Backend Engineer consumes them while the team uses them as the business and test source of truth.

```text
src/data/
├── knowledge_base/
│   └── event_vendor.json
│
├── price_catalog/
│   └── event_vendor.json
│
└── transcripts/
    └── sample_chat_transcripts_event_vendor.json
```

### `knowledge_base/event_vendor.json`

Used by:

- `parseClientBrief.ts`
- `generateClarifyingQuestions.ts`

Contains:

- required fields;
- optional fields;
- extraction hints;
- ambiguity/completeness rules;
- clarifying-question templates.

### `price_catalog/event_vendor.json`

Used by:

- `computeQuote.ts`

Contains:

- pricing tiers;
- line items;
- contingency rules;
- quote validity;
- payment terms.

### `sample_chat_transcripts_event_vendor.json`

Used by:

- automated tests;
- integration tests;
- demo rehearsal;
- manual simulation.

The transcript file contains the scenario expectations that should be used to verify both extracted data and state transitions.

---

# 5. Documentation Files

These should live under `/docs` and serve as repository-level references.

```text
docs/
├── ARCHITECTURE.md
├── TECHNICAL_SPECIFICATION.md
├── FILE_STRUCTURE.md
└── API_SPECIFICATION.md
```

Recommended GitHub workflow:

1. Create the directory structure.
2. Add placeholder files where implementation has not started.
3. Add these four technical documents.
4. Add the three data files.
5. Commit the structure before substantial implementation begins.

This gives every engineer a shared reference and prevents architecture from existing only inside chat conversations.

---

# 6. State Ownership

The following file is especially important:

```text
src/state/stateMachine.ts
```

It must centrally enforce:

```text
IDLE
  ↓
INGESTING
  ↓
REASONING
  ├── CLARIFYING
  ├── NEEDS_SME_INPUT
  ├── AWAITING_HUMAN_APPROVAL
  └── FAILED_RETRY

AWAITING_HUMAN_APPROVAL
  ↓
EXECUTED
```

Invalid transitions should be rejected here rather than relying on the LLM.

Examples:

```text
CLARIFYING → EXECUTED
```

Invalid.

```text
Client message → quote approval
```

Invalid.

```text
AWAITING_HUMAN_APPROVAL → EXECUTED
```

Valid only after authenticated SME approval and the simulated send action.

---

# 7. Suggested Build Order

The repository does not need to be implemented from top to bottom.

## Backend Engineer

1. `types/`
2. `state/`
3. `data/`
4. `tools/ingestChatMessage.ts`
5. `tools/parseClientBrief.ts`
6. `tools/generateClarifyingQuestions.ts`
7. `tools/computeQuote.ts`
8. `tools/simulateSendMessage.ts`
9. `agentLoop.ts`
10. `api/`
11. tests

## Cloud Integrator

Can work in parallel on:

1. environment configuration;
2. Bedrock access;
3. `LLMClient.ts`;
4. Bedrock adapter;
5. Anthropic fallback adapter;
6. provider selection;
7. deployment;
8. logging/observability.

---

# 8. Environment Variables

`.env.example` should document at least:

```env
PORT=3000
NODE_ENV=development

# LLM provider selection
LLM_PROVIDER=bedrock

# AWS / Bedrock
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Anthropic fallback
ANTHROPIC_API_KEY=

# Optional deployment/runtime configuration
LOG_LEVEL=info
```

Do not commit actual credentials.

The exact model identifiers should be configured separately once the Cloud Integrator confirms Bedrock model access and the fallback model selection.

---

# 9. Stretch Scope

Do not create production implementation files for stretch goals until the Event Vendor MVP is stable.

Potential later additions:

```text
src/data/knowledge_base/caterer.json
src/data/price_catalog/caterer.json
```

The architecture should support this as a data extension rather than requiring a separate agent codebase.

ASR remains optional. If implemented, add it as a preprocessing component without changing the text-based core flow.

---

# 10. Definition of a Healthy Repository

Before implementation is considered structurally ready, the repository should contain:

- the four technical documents;
- the event-vendor knowledge base;
- the event-vendor price catalog;
- transcript test fixtures;
- explicit ownership of backend and cloud files;
- environment-variable documentation;
- an LLM abstraction supporting Bedrock and Anthropic fallback;
- a central state machine;
- placeholders for all five operational tools.

The directory tree is a reference architecture. Engineers can add implementation-specific helper files as needed without changing the core responsibilities defined here.
