// Coordinates ingestion, parsing, clarification, quote computation and state transitions

/**
 * How it works
 * 
 * 1. CLIENT SEND 
      ↓
 * 2. Calls ingest_chat_message (State -> INGESTING)
      ↓
 * 3. Calls parse_client_brief (State -> REASONING)
      ↓
 * 4. Checks missing_required_fields & clarification_round:
   ├── Fields missing & round <= 2:
   │     Calls generate_clarifying_questions -> calls simulate_send_message(required_approval: false) -> State -> CLARIFYING
   │
   ├── Fields missing & round > 2:
   │     Calls buildSmeSummaryUserPrompt -> State -> NEEDS_SME_INPUT (Dashboard Alert)
   │
   └── Brief Complete (0 missing required fields):
         Calls compute_quote -> State -> AWAITING_HUMAN_APPROVAL (Draft Quote ready for SME Review)

 * 5. On Tool/Data Error:
   State -> FAILED_RETRY

 */