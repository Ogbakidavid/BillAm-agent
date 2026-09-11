# BillAm Agent — End-to-End Testing Guide (Phase 3: Postman)

This guide documents the **4 Live E2E Scenarios** for testing the BillAm Agent via Postman. Each scenario validates a different state-machine path through the V2 Strands SDK orchestration.

> **Before you start:** Run `pnpm dev` to start the server on `http://localhost:3001`. Ensure your `.env` file contains a valid `ANTHROPIC_API_KEY`.

---

## Postman Setup

- **Collection:** `postman/collections/BillAm_Agent_API.postman_collection.json`
- **Environment:** `postman/environments/Local_Development.postman_environment.json` (`baseUrl`: `http://localhost:3001`)
- **OpenAPI Spec / Swagger UI:** `http://localhost:3001/api-docs`

After importing the collection, select the **Local Development** environment. The `{{job_id}}` variable is auto-captured from the `Create Job` step in each scenario.

---

## Scenario 1: Happy Path — Complete Brief (Wedding)

**Objective:** Client provides all 5 required fields in a single message. Agent skips clarification and goes straight to a draft quote.

**Expected State Path:**
`IDLE → INGESTING → REASONING → AWAITING_HUMAN_APPROVAL → EXECUTED`

### Step 1.1 — Create Job
**`POST /jobs`**
```json
{
  "business_id": "biz_vendor_001",
  "business_type": "event_vendor"
}
```
**Expected:** `201`, `state: "IDLE"`. Capture `job_id` as `{{s1_job_id}}`.

---

### Step 1.2 — Send Complete Brief
**`POST /jobs/{{s1_job_id}}/messages`**
```json
{
  "message_text": "Good afternoon! I am planning my daughter's wedding, we are expecting about 150 guests. It will hold on the 14th of next month, outdoors at our family compound in Lekki. Budget is around 3 million naira, we want it done nicely but not over the top.",
  "received_at": "2026-09-02T12:00:00.000Z"
}
```
**Expected:** `200`, `state: "AWAITING_HUMAN_APPROVAL"`.

**Verify extracted fields:**
- `event_type`: `"wedding"`
- `guest_count`: `150`
- `event_date`: present
- `venue_location`: `"Lekki"`
- `budget_range`: `"3 million naira"`
- `missing_required_fields`: `[]`
- `quote`: non-null, `status: "draft"`

---

### Step 1.3 — Retrieve Draft Quote
**`GET /jobs/{{s1_job_id}}/quote`**

**Expected:** `200`, returns quote object with:
- Line items (Decor, Chairs & Tables, Lighting, etc.)
- Contingencies: 8% transport logistics, 5% fuel buffer
- `total`: computed from standard/premium tier
- `status`: `"draft"`

---

### Step 1.4 — SME Approves Quote
**`POST /jobs/{{s1_job_id}}/approve_quote`**
```json
{
  "approved_by": "sme_owner_david"
}
```
**Expected:** `200`, `state: "EXECUTED"`, quote `status: "SENT"`.

---

## Scenario 2: Clarification Flow — Vague Pidgin Brief (Baby Shower)

**Objective:** Client sends a brief missing `guest_count`. Agent detects the gap and sends a clarifying question autonomously. After the client replies, agent drafts the quote.

**Expected State Path:**
`IDLE → INGESTING → REASONING → CLARIFYING → INGESTING → REASONING → AWAITING_HUMAN_APPROVAL`

### Step 2.1 — Create Job
**`POST /jobs`**
```json
{
  "business_id": "biz_vendor_002",
  "business_type": "event_vendor"
}
```
**Expected:** `201`, `state: "IDLE"`. Capture as `{{s2_job_id}}`.

---

### Step 2.2 — Send Vague Brief
**`POST /jobs/{{s2_job_id}}/messages`**
```json
{
  "message_text": "Hello good day, I dey plan small baby shower for my sister. Budget is around 300k, venue na for Ikeja hall last weekend of next month.",
  "received_at": "2026-09-02T12:05:00.000Z"
}
```
**Expected:** `200`, `state: "CLARIFYING"`.

**Verify:**
- `missing_required_fields` includes `guest_count`
- `clarification_round`: `1`
- `messages` array contains a new message from `sender: "agent"` with `message_type: "CLARIFICATION"`

---

### Step 2.3 — Client Replies with Missing Info
**`POST /jobs/{{s2_job_id}}/messages`**
```json
{
  "message_text": "Ah sorry, forgot to mention - it's for about 40 people.",
  "received_at": "2026-09-02T12:10:00.000Z"
}
```
**Expected:** `200`, `state: "AWAITING_HUMAN_APPROVAL"`.

**Verify:**
- `extracted_fields.guest_count`: `40`
- `missing_required_fields`: `[]`
- `quote`: non-null draft

---

### Step 2.4 — Retrieve Draft Quote
**`GET /jobs/{{s2_job_id}}/quote`**

**Expected:** Quote calculated for 40 guests, lean or standard tier.

---

## Scenario 3: SME Edit Flow — Corporate Product Launch

**Objective:** Complete brief for 80 corporate attendees. Agent produces initial draft quote. SME edits line items to apply a corporate discount, then approves.

**Expected State Path:**
`IDLE → REASONING → AWAITING_HUMAN_APPROVAL → (PATCH quote) → EXECUTED`

### Step 3.1 — Create Job
**`POST /jobs`**
```json
{
  "business_id": "biz_vendor_003",
  "business_type": "event_vendor"
}
```
Capture as `{{s3_job_id}}`.

---

### Step 3.2 — Send Corporate Brief
**`POST /jobs/{{s3_job_id}}/messages`**
```json
{
  "message_text": "Hello, we are planning our corporate product launch event for around 80 attendees. It will take place on the 2nd Friday of next month at our office premises in Victoria Island. Budget is roughly 500,000 Naira.",
  "received_at": "2026-09-02T12:15:00.000Z"
}
```
**Expected:** `200`, `state: "AWAITING_HUMAN_APPROVAL"`, quote total around ₦349,000–₦500,000 range.

---

### Step 3.3 — SME Edits Quote
**`PATCH /jobs/{{s3_job_id}}/quote`**
```json
{
  "line_items": [
    {
      "name": "Corporate Stage & Backdrop Setup",
      "quantity": 1,
      "unit_price": 200000,
      "total": 200000
    },
    {
      "name": "Banquet Chairs & Cocktails (80 guests)",
      "quantity": 80,
      "unit_price": 1000,
      "total": 80000
    }
  ],
  "notes": "Applied negotiated corporate client discount"
}
```
**Expected:** `200`, quote line items updated, subtotal and total recalculated.

---

### Step 3.4 — SME Approves
**`POST /jobs/{{s3_job_id}}/approve_quote`**
```json
{
  "approved_by": "sme_owner_david"
}
```
**Expected:** `200`, `state: "EXECUTED"`.

---

## Scenario 4: Safeguard Refusal — Infeasible Budget

**Objective:** Client requests full wedding service for 500 guests with an absurd ₦150k total budget. Agent detects budget/scope mismatch and transitions to `FAILED_RETRY` with an explicit feasibility error.

**Expected State Path:**
`IDLE → INGESTING → REASONING → FAILED_RETRY`

### Step 4.1 — Create Job
**`POST /jobs`**
```json
{
  "business_id": "biz_vendor_004",
  "business_type": "event_vendor"
}
```
Capture as `{{s4_job_id}}`.

---

### Step 4.2 — Send Infeasible Request
**`POST /jobs/{{s4_job_id}}/messages`**
```json
{
  "message_text": "I want a full wedding setup for 500 guests, premium decor, live band, the works. Date is in 10 days. My budget is 150k total though, that is all I have, please make it work.",
  "received_at": "2026-09-02T12:20:00.000Z"
}
```
**Expected:** `200`, `state: "FAILED_RETRY"`.

**Verify:**
- `quote`: `null`
- `error_message`: contains budget/scope mismatch explanation

---

### Step 4.3 — Verify Retry Endpoint Works
**`POST /jobs/{{s4_job_id}}/retry`**

**Expected:** `200`, state resets to `REASONING`, agent re-invoked.

---

## Additional Endpoints to Verify

### GET /jobs/:id/missing_fields
Verify that when a job is in `NEEDS_SME_INPUT`, this returns the array of missing field names.

### POST /jobs/:id/manual_input
```json
{
  "fields": {
    "guest_count": 60,
    "venue_location": "Abuja"
  }
}
```
**Expected:** Job transitions back to `REASONING`, agent re-invoked to complete the quote.

### GET /jobs/:id
Returns full job object at any point in the lifecycle. Use after every state transition to confirm the state machine progressed correctly.

---

## Swagger UI

Run `pnpm dev` and visit **`http://localhost:3001/api-docs`** for interactive API documentation.

---

**Phase 3 Status: PASS** — All 4 scenarios and supplemental endpoints verified via Postman against the V2 Strands SDK orchestration.
