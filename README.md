# BillAm Agent Backend

BillAm Agent is the backend for an AI-assisted client-intake and quoting workflow for Nigerian informal SMEs. It receives client messages, extracts a structured brief, asks clarifying questions when required, calculates an itemised NGN quote, and waits for explicit SME approval before sending that quote.

## Current workflow

1. The dashboard creates a job with `POST /jobs`.
2. Client messages are sent to `POST /jobs/:id/messages`.
3. The agent loads the business knowledge base and price catalog, then updates the persisted job.
4. Missing information is clarified for up to two rounds. Unresolved jobs move to `NEEDS_SME_INPUT`.
5. Complete briefs produce a quote with status `awaiting_approval` and job state `AWAITING_HUMAN_APPROVAL`.
6. An SME can edit the quote or call `POST /jobs/:id/approve_quote`. Approval changes the quote to `sent`, the job to `EXECUTED`, and appends the outbound quote message.

Quotes are never sent autonomously. `simulate_send_message` is reserved for clarification/general messages; quote delivery is performed only by the approval endpoint.

## Stack

- Node.js 18+, TypeScript, Express 5
- Strands Agents SDK
- Amazon Bedrock or Anthropic as the configured LLM provider
- File-backed `JobStore` for local development and deterministic seeded jobs
- Jest, ts-jest, and Supertest

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The development server listens on `http://localhost:3001` by default. Health check:

```text
GET http://localhost:3001/health
```

Set `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, or configure the Bedrock credentials and region when using Bedrock. Never commit `.env` or API keys.

## API surface

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/jobs` | Create a client job |
| `GET` | `/jobs` | List jobs, optionally filtered by `business_id` |
| `GET` | `/jobs/:id` | Read the current job, messages, quote, and audit events |
| `POST` | `/jobs/:id/messages` | Process a client message through the agent |
| `GET` | `/jobs/:id/quote` | Read the generated quote |
| `PATCH` | `/jobs/:id/quote` | Edit an awaiting-approval quote |
| `POST` | `/jobs/:id/approve_quote` | Approve and send a quote |
| `GET` | `/jobs/:id/missing_fields` | Read unresolved required fields |
| `POST` | `/jobs/:id/manual_input` | Supply SME values after escalation |
| `POST` | `/jobs/:id/retry` | Retry a failed job |

The dashboard uses `business_id=biz-event-decoration` for the event-decoration workspace.

## Tests and checks

```bash
pnpm build
pnpm typecheck
pnpm test -- --runInBand
```

## Repository guide

- `src/agent/` — orchestration, tools, prompts, and session handling
- `src/api/` — Express routes, handlers, and validators
- `src/state/` — job persistence, state transitions, availability, and audit data
- `src/data/` — knowledge bases and price catalogs
- `tests/` — unit, API, and integration coverage
- `docs/` — API, architecture, schema, and test documentation

The backend seeds representative jobs for local dashboard development. Newly created jobs receive generated client identity data when the request does not provide it; this is development/demo behavior, not an external CRM integration.
