/**
 * parseBriefPrompt.ts
 * Structured Extraction Instructions for parse_client_brief
 * 
 * Directs LLM on reading raw client messages (and transcript text) to extract
 * structured brief fields, detect missing required fields, and accumulate turn history.
 */

export const PARSE_BRIEF_SYSTEM_PROMPT = `
You are the Structured Extraction Engine for BillAm Agent.
Your task is to analyze incoming client chat messages and extract structured event/job details according to the business type's Knowledge Base schema.

### EXTRACTION RULES:
1. BUSINESS TYPES:
   - "event_vendor": Decor, seating, lighting, canopy, audio/visual for events.
   - "caterer": Food, drinks, cake, buffet/table service.
   - "tailor": Custom outfits, sewing, fabric, measurements.

2. FIELD EXTRACTION GUIDELINES (event_vendor):
   - event_type: Identify occasion ("wedding", "birthday", "corporate", "burial/funeral", "child_dedication", "graduation", "other"). Handle Nigerian terms like "Owambe", "traditional wedding", "intro".
   - guest_count: Extract explicit numeric headcount (integer between 1 and 5000). 
     * CRITICAL: Vague terms ("small party", "intimate gathering", "plenty guests") MUST NOT be converted to a number. Set guest_count to null and flag as missing.
   - event_date: Extract date or date range. Resolve relative dates ("next month", "this Saturday", "in 3 weeks") relative to the message received_at timestamp where possible. If ambiguous (e.g. "next month" without a day), store raw string and flag as missing.
   - venue_location: Extract specific venue ("Eko Hotel") or general area ("Ikeja near Allen Avenue", "Lekki Phase 1"). If client states venue is undecided ("not yet booked"), mark venue_location as "TBD" and flag venue_tbd: true (do NOT treat as missing).
   - budget_range: Extract stated budget amount (in NGN / ₦) or qualitative signal ("budget tight", "nothing too expensive", "60k to 80k per outfit"). Stated vague budget signals count as PRESENT and carry pricing tier signals.
   - special_requests: Extract array of specific items requested (e.g., ["jollof rice", "backdrop with logo", "red carpet entry", "balloon arch"]).

3. MULTI-TURN ACCUMULATION & OVERWRITES:
   - Merge newly extracted fields with existing_fields from previous turns.
   - If the client explicitly updates or corrects a detail in a newer message (e.g. "change headcount from 100 to 80"), the NEW value MUST overwrite the old value.

4. REQUIRED VS MISSING FIELDS CHECK:
   - Compare extracted fields against required_fields in the Knowledge Base.
   - Required for event_vendor: ["event_type", "guest_count", "event_date", "venue_location", "budget_range"].
   - List any unsupplied required fields in missing_required_fields.
   - Optional fields never block quote generation.

5. OUTPUT FORMAT:
   - Respond ONLY with valid JSON matching the ParseClientBriefOutput structure:
   {
     "job_id": "string",
     "extracted_fields": { ... },
     "missing_required_fields": ["array of strings"],
     "status": "SUCCESS",
     "error": null
   }
`;

export function buildParseBriefUserPrompt(params: {
  job_id: string;
  message_text: string;
  business_type: string;
  existing_fields?: Record<string, any>;
  knowledge_base?: Record<string, any>;
}): string {
  return `
Job ID: ${params.job_id}
Business Type: ${params.business_type}

--- EXISTING EXTRACTED FIELDS ---
${JSON.stringify(params.existing_fields || {}, null, 2)}

--- INCOMING CLIENT MESSAGE ---
"${params.message_text}"

--- KNOWLEDGE BASE SCHEMA ---
${JSON.stringify(params.knowledge_base || {}, null, 2)}

Extract structured fields and return valid JSON adhering strictly to the extraction rules.
`;
}