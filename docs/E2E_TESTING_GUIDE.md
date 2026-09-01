# BillAm Agent — End-to-End API & Testing Guide

This document provides a step-by-step walkthrough for testing the **BillAm Agent REST API**, designed for the **Backend Developer**, **Product Designer**, and **Cloud Integrator**.

---

## 1. Quick Start & Documentation Endpoints

1. **Start the local backend server:**
   ```bash
   pnpm dev
   ```
2. **Interactive Swagger API Documentation:**
   Open your browser to:
   [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
   
   This serves interactive OpenAPI documentation where you can inspect request schemas, parameters, and test endpoints directly.

3. **Postman Collection:**
   The pre-configured Postman collection is located in the repository at:
   [`postman/BillAm_Agent_API.postman_collection.json`](../postman/BillAm_Agent_API.postman_collection.json)

---

## 2. Postman Collection Usage

1. Open **Postman**.
2. Click **Import** and select `postman/BillAm_Agent_API.postman_collection.json`.
3. The collection includes **automatic variable chaining**:
   - Running `1. Create Job` automatically extracts `data.job_id` from the response and populates the `{{job_id}}` variable.
   - All subsequent requests (`POST /messages`, `GET /quote`, `PATCH /quote`, `POST /approve_quote`) automatically use `{{job_id}}`. You just need to click **Send** in sequence!

---

## 3. End-to-End Test Flow Walkthrough & Expected Outputs

### Step 1: Health Check
* **Endpoint:** `GET /health`
* **Response:**
```json
{
  "status": "SUCCESS",
  "data": {
    "status": "healthy",
    "timestamp": "2026-09-01T17:00:00.000Z",
    "service": "billam-agent"
  }
}
```

---

### Step 2: Create Job Session
* **Endpoint:** `POST /jobs`
* **Request Body:**
```json
{
  "business_id": "biz_vendor_001",
  "business_type": "event_vendor"
}
```
* **Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "job_id": "825fb825-2498-4c33-957a-ef2f77a262a0",
    "business_id": "biz_vendor_001",
    "business_type": "event_vendor",
    "state": "IDLE",
    "clarification_round": 0,
    "messages": [
      {
        "message_id": "a1b2c3-uuid",
        "job_id": "825fb825-2498-4c33-957a-ef2f77a262a0",
        "sender": "system",
        "message_type": "TEXT",
        "text": "Job created",
        "required_approval": false,
        "created_at": "2026-09-01T17:01:00.000Z"
      }
    ],
    "extracted_fields": {},
    "missing_required_fields": [],
    "quote": null,
    "error_message": null
  }
}
```

---

### Step 3: Send Client Brief & Trigger Agent
* **Endpoint:** `POST /jobs/:id/messages`
* **Request Body:**
```json
{
  "message_text": "Good day! I am planning a wedding for about 150 guests on November 20th in Lekki. Our budget is around 2 million Naira.",
  "received_at": "2026-09-01T17:02:00.000Z"
}
```
* **Backend State Machine Execution:**
  `IDLE` $\rightarrow$ `INGESTING` $\rightarrow$ `REASONING` $\rightarrow$ `AWAITING_HUMAN_APPROVAL` (since all required fields were extracted).
* **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "job_id": "825fb825-2498-4c33-957a-ef2f77a262a0",
    "state": "AWAITING_HUMAN_APPROVAL",
    "extracted_fields": {
      "event_type": "wedding",
      "guest_count": 150,
      "event_date": "2026-11-20",
      "venue_location": "Lekki",
      "budget_range": "2000000"
    },
    "missing_required_fields": [],
    "quote": {
      "status": "DRAFT",
      "line_items": [
        { "name": "Decor Package (150 guests)", "total": 350000, "label": "Decor Package" },
        { "name": "Chairs & Tables (150 guests)", "total": 90000, "label": "Chairs & Tables" }
      ],
      "contingencies": [
        { "name": "Transport & Logistics (8%)", "amount": 35200, "label": "Transport & Logistics (8%)" },
        { "name": "Fuel / Fluctuation Buffer (5%)", "amount": 22000, "label": "Fuel / Fluctuation Buffer (5%)" }
      ],
      "subtotal": 440000,
      "total": 497200,
      "currency": "NGN",
      "validity_days": 7
    }
  }
}
```

---

### Step 4: Get Draft Quote
* **Endpoint:** `GET /jobs/:id/quote`
* **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "status": "DRAFT",
    "line_items": [
      { "name": "Decor Package", "total": 350000 },
      { "name": "Chairs & Tables", "total": 90000 }
    ],
    "contingencies": [
      { "name": "Transport & Logistics (8%)", "amount": 35200 },
      { "name": "Fuel / Fluctuation Buffer (5%)", "amount": 22000 }
    ],
    "subtotal": 440000,
    "total": 497200,
    "currency": "NGN",
    "validity_days": 7
  }
}
```

---

### Step 5: SME Edit Draft Quote
* **Endpoint:** `PATCH /jobs/:id/quote`
* **Request Body:**
```json
{
  "line_items": [
    { "name": "Decor Package Tiers", "quantity": 1, "unit_price": 300000, "total": 300000 },
    { "name": "Chairs & Tables Package", "quantity": 150, "unit_price": 500, "total": 75000 }
  ],
  "notes": "Applied SME direct consultation discount"
}
```
* **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "job_id": "825fb825-2498-4c33-957a-ef2f77a262a0",
    "state": "AWAITING_HUMAN_APPROVAL",
    "quote": {
      "status": "DRAFT",
      "total": 432200
    }
  }
}
```

---

### Step 6: Approve and Send Quote
* **Endpoint:** `POST /jobs/:id/approve_quote`
* **Request Body:**
```json
{
  "approved_by": "sme_owner_david"
}
```
* **Backend Action:** Dispatches message via `simulate_send_message` tool with `required_approval: true`, appends to chat transcript, logs audit event, and transitions state to `EXECUTED`.
* **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "job_id": "825fb825-2498-4c33-957a-ef2f77a262a0",
    "state": "EXECUTED",
    "quote_status": "SENT",
    "sent_at": "2026-09-01T17:05:00.000Z"
  }
}
```

---

## 4. Recovery & Clarification Flows

If a brief has missing fields (e.g. guest count missing):
1. **Clarification Flow**: The agent generates 1–5 WhatsApp clarifying questions, dispatches them via `simulate_send_message` (`required_approval: false`), and transitions to `CLARIFYING`.
2. **Escalation (`NEEDS_SME_INPUT`)**: If missing fields remain after 2 clarification turns:
   - Call `GET /jobs/:id/missing_fields` to view unresolved items.
   - Call `POST /jobs/:id/manual_input` to supply missing fields directly and re-run agent reasoning.

---

## 5. Summary Table for Team Reference

| Endpoint | Method | Purpose | Mandatory Human Gate |
|---|---|---|---|
| `/health` | `GET` | Server health check | No |
| `/jobs` | `POST` | Create new job session | No |
| `/jobs/:id/messages` | `POST` | Ingest client chat & run agent | No (Clarifications auto-sent) |
| `/jobs/:id` | `GET` | Get job state & details | No |
| `/jobs/:id/quote` | `GET` | Retrieve generated draft quote | No |
| `/jobs/:id/quote` | `PATCH` | SME edits line items / pricing | Yes (Draft edit) |
| `/jobs/:id/approve_quote` | `POST` | **Approve and send quote to client** | **YES (Required SME Approval)** |
| `/jobs/:id/missing_fields` | `GET` | Retrieve unresolved required fields | No |
| `/jobs/:id/manual_input` | `POST` | SME manually inputs unresolved values | Yes (Manual recovery) |
| `/jobs/:id/retry` | `POST` | Retry failed job | No |
