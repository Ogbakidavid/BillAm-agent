# Frontend & Backend Integration Audit Report — BillAm Agent

**Prepared for:** Product Manager, Product Designer & Engineering Team  
**Date:** September 2, 2026  
**Scope:** Review of the frontend Next.js application (`billam`) against the backend core quoting engine & REST API (`billam-agent`).

---

## 1. Executive Summary

A comprehensive structural audit was performed across all dashboard folders, pages, and components in the Next.js frontend (`billam`) to evaluate readiness for live integration with the backend (`billam-agent`).

**Current Status:**
* The frontend UI design, component layout, and user flows are complete.
* **However, the frontend currently runs 100% on static in-memory mock data and timer simulations (`setTimeout`).**
* Direct connection without an adaptation/service layer will break key features due to naming mismatches, state representation differences, and missing HTTP clients.

---

## 2. Inconsistencies & Contract Mismatches

| Area | Frontend (`billam`) | Backend (`billam-agent`) | Inconsistency & Impact |
| :--- | :--- | :--- | :--- |
| **Job States** | Lowercase strings: `'in_progress'`, `'clarifying'`, `'needs_input'`, `'awaiting_approval'`, `'executed'`, `'failed'` | Uppercase enum: `'IDLE'`, `'INGESTING'`, `'REASONING'`, `'CLARIFYING'`, `'NEEDS_SME_INPUT'`, `'AWAITING_HUMAN_APPROVAL'`, `'EXECUTED'`, `'FAILED_RETRY'` | Status badge lookups will fail/show `undefined`. States like `needs_input` vs `NEEDS_SME_INPUT` and `failed` vs `FAILED_RETRY` do not match. |
| **Quote Line Items** | `{ id, description, qty, unit, unitPrice, editedPrice }` | `{ name, quantity, unit_price, total }` | Line items will render blank because the UI reads `.description` and `.unitPrice` while backend returns `.name` and `.unit_price`. |
| **Quote Contingencies** | `{ id, description, amount }` | `{ label, rate, amount }` | Mismatch between `description` and `label`. |
| **Amounts / Currency** | Formatted string (e.g. `"₦1,250,000"`) | Number / Float (e.g. `1250000`) | Frontend expects pre-formatted strings with naira symbols; backend sends raw numbers for accurate math and calculations. |
| **Chat Messages** | `{ id, role: 'client' \| 'agent', text, time: '10:02 AM' }` | `{ id, sender: 'client' \| 'agent' \| 'sme', text, timestamp: "2026-09-02T12:00:00Z" }` | 1. `role` vs `sender`<br>2. `time` vs `timestamp` (ISO string)<br>3. UI has no visual handling for SME manual intervention messages (`'sme'`). |
| **Brief Extraction** | Static array: `briefFields: [{ label, value, status }]` | Dynamic object: `extracted_fields: Record<string, any>` + `missing_fields: string[]` | Frontend cannot dynamically display AI-extracted fields from client transcripts. |
| **Job Identifiers** | Integer strings (`'1'`, `'2'`, `'QT-001'`) | Standard UUIDs (`"94e616a2-d394-4b7a-9a77-67894fdc8402"`) | Dynamic routing `/dashboard/jobs/[id]` needs to support standard UUID parameters. |
| **Business Scope** | 6 Personas (`event_decoration`, `photography`, `tailoring`, `catering`, `event_planning`, `equipment_rental`) | 3 Business Types (`event_vendor`, `caterer`, `tailor`) | Backend MVP is specifically scoped to `event_vendor` (which covers decor, equipment, and event coordination). |

---

## 3. Detailed Dashboard Files & Potential Bugs

### 📁 `src/app/dashboard/jobs/[id]/page.tsx` & `ChatPanel.tsx`
* **Bug 1 (Simulated Chat Execution):** `ChatPanel.tsx` uses a local `setTimeout(..., 1800)` that returns random canned strings. It never calls `POST /jobs/:id/messages`, so the real Anthropic agent loop is never triggered.
* **Bug 2 (Timestamp Parsing Crash):** `ChatPanel` renders `msg.time` (e.g. `"10:04 AM"`). The backend sends `timestamp: "2026-09-02T12:00:00.000Z"`. This will display as `undefined` without a date formatter.
* **Bug 3 (Sender Role Detection):** `ChatPanel` checks `msg.role === 'client'`. The backend sends `msg.sender === 'client'`. Without mapping, all bubbles render as agent responses.

### 📁 `src/app/dashboard/jobs/[id]/QuoteCard.tsx` & `QuoteEditor.tsx`
* **Bug 4 (Blank Line Items):** `QuoteCard` reads `item.description` and `item.unitPrice`. The backend sends `item.name` and `item.unit_price`.
* **Bug 5 (Quote Modification Payload):** When saving line item edits, `QuoteEditor.tsx` does not send the backend's `PATCH /jobs/:id/quote` schema (`{ line_items: [{ name, quantity, unit_price, total }], notes }`).
* **Bug 6 (Approve & Send Action):** The "Approve & Send" button in `QuoteCard.tsx` and `ApprovalModal.tsx` only sets local React state (`setApproved(true)`) instead of issuing `POST /jobs/:id/approve_quote`.

### 📁 `src/app/dashboard/jobs/[id]/BriefPanel.tsx`
* **Bug 7 (Hardcoded Brief Fields):** `BriefPanel.tsx` renders a hardcoded list of brief fields. It needs to read dynamically from `job.extracted_fields` and `job.missing_fields`.
* **Bug 8 (Static Agent Timeline):** The timeline steps are hardcoded rather than derived from state transitions and audit logs.

### 📁 `src/app/dashboard/components/WorkflowModals.tsx`
* **Bug 9 (Manual Input Recovery):** `ResolveModal` collects a single unparsed text string. The backend recovery endpoint `POST /jobs/:id/manual_input` requires structured key-value pairs:
  ```json
  {
    "supplied_fields": { "guest_count": 150, "event_date": "2026-11-20" },
    "source": "SME obtained details directly via phone call"
  }
  ```
* **Bug 10 (Job Retry):** `ReviewIssueModal` does not trigger `POST /jobs/:id/retry` when clicking the "Retry" button.

### 📁 `src/app/dashboard/components/StatusBadge.tsx`
* **Bug 11 (Lookup Crash on Live States):** `StatusBadge` uses a static map `statusConfig[status]`. Passing uppercase backend states (e.g. `AWAITING_HUMAN_APPROVAL`, `NEEDS_SME_INPUT`, `FAILED_RETRY`) results in an unhandled lookup (`undefined`).

### 📁 `src/app/dashboard/context/PersonaContext.tsx`
* **Bug 12 (No Backend API Client):** All job tables, metrics, and quotes are read from static JSON objects. No HTTP service layer (`fetch` / `axios`) currently exists.

---

## 4. Recommended Action Plan for Engineering

To achieve seamless end-to-end integration without breaking UI styling:

1. **Build a Centralized API Client (`src/lib/api.ts`):**
   Implement standard API helper functions targeting `http://localhost:3001`:
   * `createJob(business_id, business_type)`
   * `getJob(job_id)`
   * `sendClientMessage(job_id, message_text)`
   * `getQuote(job_id)`
   * `patchQuote(job_id, line_items, notes)`
   * `approveQuote(job_id, approved_by)`
   * `submitManualInput(job_id, supplied_fields, source)`
   * `retryJob(job_id)`

2. **Implement Data Adapters / Transformers:**
   Create utility functions that bridge the backend responses to frontend component props:
   * Map `JobState` (`AWAITING_HUMAN_APPROVAL`) to user-friendly badge labels.
   * Map `LineItem` (`name`, `quantity`, `unit_price`) to editor table rows.
   * Format ISO timestamps (`timestamp`) to local time strings (`time`).
   * Format raw numeric amounts (`total: 1926650`) to formatted currency (`"₦1,926,650"`).

3. **Replace Mock Handlers in Interactive Components:**
   * Wire `ChatPanel.tsx` to `POST /jobs/:id/messages` and poll/listen for state transitions.
   * Wire `ApprovalModal.tsx` to `POST /jobs/:id/approve_quote`.
   * Wire `QuoteEditor.tsx` to `PATCH /jobs/:id/quote`.
   * Wire `ResolveModal` to `POST /jobs/:id/manual_input`.
   * Wire `ReviewIssueModal` to `POST /jobs/:id/retry`.

---

## 5. Summary & Next Steps

The frontend design system and UI flows match the product vision. Once the data adapter and API client layers are wired to the existing REST endpoints, the system will be 100% operational live end-to-end.
