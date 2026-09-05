# BillAm Agent — End-to-End Live Scenarios & API Testing Guide

This guide documents the **4 Live E2E Scenarios** and standard REST API endpoints for testing the **BillAm Agent**, matching the live integration test suite verified with Claude.

---

## 1. Postman Workspace & Collection Structure

The Postman files in the repository are organized as follows:
* **Collection:** [`postman/collections/BillAm_Agent_API.postman_collection.json`](../postman/collections/BillAm_Agent_API.postman_collection.json)
* **Environment:** [`postman/environments/Local_Development.postman_environment.json`](../postman/environments/Local_Development.postman_environment.json)
* **OpenAPI Spec:** [`postman/specs/swagger.json`](../postman/specs/swagger.json)

### How to Connect & Run in Postman:
1. Open **Postman** and import the collection or connect your Git workspace to the `postman/` directory.
2. Select the **Local Development** environment (`baseUrl`: `http://localhost:3001`).
3. Each scenario folder has automatic `job_id` chaining — when you run the `Create Job` step in any scenario, the `{{job_id}}` (and scenario-specific variable) is automatically captured so you can simply hit **Send** on each request in order.

---

## 2. The 4 Live Verified E2E Scenarios

### 📁 Scenario 1: Happy Path Wedding (Complete Brief)
* **Objective:** All 5 required fields provided in a single natural brief. Agent skips clarification and produces a real quote (~₦1,926,650).
* **Expected State Path:** `IDLE` $\rightarrow$ `INGESTING` $\rightarrow$ `REASONING` $\rightarrow$ `AWAITING_HUMAN_APPROVAL` $\rightarrow$ `EXECUTED`

#### Step 1.1: `POST /jobs`
```json
{
  "business_id": "biz_vendor_001",
  "business_type": "event_vendor"
}
```
* **Output:** Status `201`, state `IDLE`.

#### Step 1.2: `POST /jobs/{{scenario_1_job_id}}/messages`
```json
{
  "message_text": "Good afternoon! I am planning my daughter's wedding, we are expecting about 150 guests. It will hold on the 14th of next month, outdoors at our family compound in Lekki. Budget is around 3 million naira, we want it done nicely but not over the top.",
  "received_at": "2026-09-02T12:00:00.000Z"
}
```
* **Output:** State transitions to `AWAITING_HUMAN_APPROVAL`.
* **Extracted Fields:**
  - `event_type`: `"wedding"`
  - `guest_count`: `150`
  - `event_date`: `14th of next month`
  - `venue_location`: `"Lekki"`
  - `budget_range`: `"3 million naira"`
  - `missing_required_fields`: `[]`

#### Step 1.3: `GET /jobs/{{scenario_1_job_id}}/quote`
* **Output:** Returns draft quote with line items (Decor, Chairs & Tables, Lighting), 8% Transport logistics, 5% fuel buffer, and computed total (~**₦1,926,650**).

#### Step 1.4: `POST /jobs/{{scenario_1_job_id}}/approve_quote`
```json
{
  "approved_by": "sme_owner_david"
}
```
* **Output:** Status `200`, state `EXECUTED`, quote `status: "SENT"`.

---

### 📁 Scenario 2: Vague Pidgin Brief (Clarification Flow)
* **Objective:** Client provides a brief missing `guest_count`. Agent detects the gap, generates a friendly WhatsApp clarifying question, client replies with `40 people`, and quote is drafted.
* **Expected State Path:** `IDLE` $\rightarrow$ `INGESTING` $\rightarrow$ `REASONING` $\rightarrow$ `CLARIFYING` $\rightarrow$ `INGESTING` $\rightarrow$ `REASONING` $\rightarrow$ `AWAITING_HUMAN_APPROVAL`

#### Step 2.1: `POST /jobs`
* Create job session for baby shower.

#### Step 2.2: `POST /jobs/{{scenario_2_job_id}}/messages`
```json
{
  "message_text": "Hello good day, I dey plan small baby shower for my sister. Budget is around 300k, venue na for Ikeja hall last weekend of next month.",
  "received_at": "2026-09-02T12:05:00.000Z"
}
```
* **Output:** State transitions to `CLARIFYING`.
* **Clarifying Questions:** Returns structured polite question asking for estimated guest count.

#### Step 2.3: `POST /jobs/{{scenario_2_job_id}}/messages` (Follow-up)
```json
{
  "message_text": "Ah sorry, forgot to mention - it's for about 40 people.",
  "received_at": "2026-09-02T12:10:00.000Z"
}
```
* **Output:** State transitions to `AWAITING_HUMAN_APPROVAL`.

#### Step 2.4: `GET /jobs/{{scenario_2_job_id}}/quote`
* **Output:** Quote calculated for 40 guests lean tier setup.

---

### 📁 Scenario 3: Corporate Launch (Quote Revision Flow)
* **Objective:** Corporate product launch for 80 attendees in Victoria Island. Produces initial quote (~₦349,170). SME edits line items to apply a corporate discount, then approves.
* **Expected State Path:** `IDLE` $\rightarrow$ `REASONING` $\rightarrow$ `AWAITING_HUMAN_APPROVAL` $\rightarrow$ (SME `PATCH /quote`) $\rightarrow$ `EXECUTED`

#### Step 3.1 & 3.2: Create Job & Send Corporate Brief
```json
{
  "message_text": "Hello, we are planning our corporate product launch event for around 80 attendees. It will take place on the 2nd Friday of next month at our office premises in Victoria Island. Budget is roughly 500,000 Naira.",
  "received_at": "2026-09-02T12:15:00.000Z"
}
```
* **Output:** State `AWAITING_HUMAN_APPROVAL`, quote total ~**₦349,170**.

#### Step 3.3: `PATCH /jobs/{{scenario_3_job_id}}/quote` (SME Edit)
```json
{
  "line_items": [
    { "name": "Corporate Stage & Backdrop Setup", "quantity": 1, "unit_price": 200000, "total": 200000 },
    { "name": "Banquet Chairs & Cocktails (80 guests)", "quantity": 80, "unit_price": 1000, "total": 80000 }
  ],
  "notes": "Applied negotiated corporate client discount"
}
```
* **Output:** Quote updated and subtotal/total recalculated.

#### Step 3.4: `POST /jobs/{{scenario_3_job_id}}/approve_quote`
* **Output:** State `EXECUTED`.

---

### 📁 Scenario 4: Infeasible / Malicious Budget (Safeguard Refusal Flow)
* **Objective:** Client demands full service for 500 guests with an absurd ₦150k budget. The system safeguard refuses to produce a normal quote and transitions to `FAILED_RETRY` with a real feasibility error.
* **Expected State Path:** `IDLE` $\rightarrow$ `INGESTING` $\rightarrow$ `REASONING` $\rightarrow$ `FAILED_RETRY`

#### Step 4.1 & 4.2: Create Job & Send Infeasible Request
```json
{
  "message_text": "I want a full wedding setup for 500 guests, premium decor, live band, the works. Date is in 10 days. My budget is 150k total though, that is all I have, please make it work.",
  "received_at": "2026-09-02T12:20:00.000Z"
}
```
* **Output:** State transitions to `FAILED_RETRY`.
* **Safeguard Verification:** `quote` is `null`, and `error_message` explicitly reports the budget and scope mismatch.

---

## 3. Swagger UI Verification
Run `pnpm dev` and visit:
👉 **[http://localhost:3001/api-docs](http://localhost:3001/api-docs)**
