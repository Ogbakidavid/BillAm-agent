# BillAm Agent — Prompts Architecture & Reference Guide

This document summarizes the role, responsibilities, and key configuration rules for the **5 prompt files** located in `src/agent/prompts/`.

All 5 prompt files have been directly populated with clean, ready-to-run TypeScript code in `src/agent/prompts/`.

---

## Overview of the 5 Prompt Files

### 1. `src/agent/prompts/systemPrompt.ts`
- **File Link:** [`systemPrompt.ts`](file:///home/creativeogbaki/Desktop/billam-agent/src/agent/prompts/systemPrompt.ts)
- **Role:** Defines overall BillAm Agent identity, domain context (Nigerian SMEs), state machine boundaries, and safety invariants.
- **Key Rules:**
  - **Single Approval Gate:** Quotes must NEVER be sent to clients without explicit SME owner approval (`POST /jobs/:id/approve_quote`).
  - **Autonomous Clarification:** Clarifying questions are sent automatically (`required_approval: false`), up to a 2-round maximum cap.
  - **Escalation:** Transition to `NEEDS_SME_INPUT` if missing fields persist after 2 clarification rounds.
  - **State Machine Integrity:** Obey valid state transitions; strictly forbid `CLARIFYING -> EXECUTED`.
  - **Nigerian Nuances:** Handles Pidgin/English mix, Naira (`₦`) amounts, vague guest counts (must not be converted to numbers), and undecided venues (`venue_tbd: true`).

---

### 2. `src/agent/prompts/parseBriefPrompt.ts`
- **File Link:** [`parseBriefPrompt.ts`](file:///home/creativeogbaki/Desktop/billam-agent/src/agent/prompts/parseBriefPrompt.ts)
- **Used By:** `src/agent/tools/parseClientBrief.ts`
- **Role:** Directs Claude / Bedrock on extracting structured JSON fields from raw client chat messages.
- **Key Rules:**
  - Maps incoming messages against Knowledge Base schemas (`event_vendor.json`, `caterer.json`, `tailor.json`).
  - Extracts required fields (`event_type`, `guest_count`, `event_date`, `venue_location`, `budget_range`) and optional fields.
  - Vague quantifiers (*"small crowd"*, *"plenty people"*) are **never** converted to numbers (flagged as missing).
  - Handles multi-turn updates where newer explicit client statements overwrite older ones.

---

### 3. `src/agent/prompts/clarificationPrompt.ts`
- **File Link:** [`clarificationPrompt.ts`](file:///home/creativeogbaki/Desktop/billam-agent/src/agent/prompts/clarificationPrompt.ts)
- **Used By:** `src/agent/tools/generateClarifyingQuestions.ts`
- **Role:** Formulates 1–5 targeted, WhatsApp-style clarifying questions for missing required fields.
- **Key Rules:**
  - Creates friendly, WhatsApp-ready message (`draft_message_to_client`) with numbered questions.
  - Includes **budget feasibility warning logic** if requested scope heavily exceeds stated budget (e.g., 500 guests for ₦150k).
  - Requests contact validation if client phone format is invalid.

---

### 4. `src/agent/prompts/quoteDraftPrompt.ts`
- **File Link:** [`quoteDraftPrompt.ts`](file:///home/creativeogbaki/Desktop/billam-agent/src/agent/prompts/quoteDraftPrompt.ts)
- **Used By:** `src/agent/tools/computeQuote.ts`
- **Role:** Computes itemized, contingency-aware quotes using structured brief details and the SME's Price Catalog.
- **Key Rules:**
  - Tier selection (`lean`, `standard`, `premium`) based on budget signals.
  - Applies mandatory Nigerian contingencies:
    - **Transport & Logistics:** 8% of subtotal.
    - **Rush Fee:** 15% of subtotal (if event date <= 7 days away).
    - **Fuel / Price Volatility Buffer:** 5% of subtotal.
  - Formats professional WhatsApp draft message with line items, contingencies, total in Naira (`₦`), and payment terms (50% deposit).
  - Returns `FAILED_RETRY` status if budget is absurdly below market minimums.

---

### 5. `src/agent/prompts/smeSummaryPrompt.ts` *(5th Prompt File)*
- **File Link:** [`smeSummaryPrompt.ts`](file:///home/creativeogbaki/Desktop/billam-agent/src/agent/prompts/smeSummaryPrompt.ts)
- **Used By:** Internal Dashboard Escalation & Notifications
- **Role:** Generates clear, actionable internal summaries for the SME owner when human intervention is needed.
- **Key Rules:**
  - Formats **"Agent Needs Your Input"** summaries when 2 clarification rounds are completed with missing fields remaining.
  - Formats **"Feasibility Warning"** summaries when scope/budget mismatch requires manual SME negotiation.
