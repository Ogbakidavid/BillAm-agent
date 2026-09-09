# Proposed Changes 1: Core Schema & Type Alignment

## Objective
Ensure the backend's core `Job` and `Quote` schemas (and their sub-components like `LineItem`, `Contingency`, `AuditEvent`, and `ChatMessage`) strictly match the frontend's expectations to avoid serialization and mapping issues.

## Changes Made
1. **Enums & Constants**:
   - Updated `QuoteStatus` from `"DRAFT" | "SENT"` to `"draft" | "awaiting_approval" | "sent" | "expired"`.
   - Expanded `business_type` in `Job` and `CreateJobRequest` to include all 6 frontend business types (`event_vendor`, `caterer`, `tailor`, `photographer`, `event_planner`, `equipment_rental`).
   - Standardized `MessageSender` across the board as `"client" | "agent" | "sme" | "system"`.

2. **Data Models (`Job.ts`)**:
   - Modified `LineItem` to include `id`, making `quantity` and `unit_price` strictly numbers (not optional).
   - Modified `Contingency` to use `id`, `label` (instead of `name`), and `rate: number | null`.
   - Modified `Quote` to include `id`, `job_id`, `created_at`, `updated_at`.
   - Redefined `AuditEvent` to exactly mirror the frontend shape: `{ id, job_id, type, label, detail, timestamp }`.
   - Added `audit_events: AuditEvent[]` to the `Job` interface.
   - Standardized date fields (`timestamp`, `created_at`, `updated_at`) to strictly be ISO 8601 strings rather than `Date` objects, to guarantee payload consistency.

3. **API Contracts (`Api.ts`)**:
   - Synchronized `GetJobResponse`, `CreateJobResponse` to include `audit_events`.
   - Updated `GetQuoteResponse` and `EditQuoteRequest` to match the newly shaped `LineItem` and `Contingency`.

4. **Test Adjustments (`jobs.api.test.ts`)**:
   - Adjusted mock `quote` structures to include `id`, `label` instead of `name` for contingencies, and lowercase `"draft"` / `"sent"` statuses.
   - The test assertions now check for lowercase `"sent"` instead of `"SENT"`.
