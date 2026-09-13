// Stores and retrieves active jobs
import { Job, JobState, ExtractedFields, ChatMessage } from "../types/Job";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const jobs = new Map<string, Job>();

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORE_FILE = path.resolve(process.cwd(), ".jobs-store.json");

function persist(): void {
  try {
    const data = JSON.stringify(Array.from(jobs.values()), null, 2);
    fs.writeFileSync(STORE_FILE, data, "utf-8");
  } catch (err) {
    console.error("[JobStore] Failed to persist jobs to disk:", err);
  }
}

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed: Job[] = JSON.parse(raw);
    parsed.forEach((job) => jobs.set(job.job_id, job));
    console.log(`[JobStore] Loaded ${parsed.length} jobs from disk.`);
  } catch (err) {
    console.error("[JobStore] Failed to load jobs from disk:", err);
  }
}

export function createJob(
  businessId: string,
  businessType:
    | "event_vendor"
    | "caterer"
    | "tailor"
    | "photographer"
    | "event_planner"
    | "equipment_rental",
  message: ChatMessage,
): Job {
  const now = new Date().toISOString();

  const job: Job = {
    job_id: randomUUID(),
    business_id: businessId,
    business_type: businessType,
    state: "IDLE",
    clarification_round: 0,
    messages: [message],
    extracted_fields: {},
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: now,
    updated_at: now,
  };

  jobs.set(job.job_id, job);
  persist();
  return job;
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function appendMessage(
  jobId: string,
  message: ChatMessage,
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.messages.push(message);
  job.updated_at = new Date().toISOString();
  persist();
  return job;
}

export function mergeExtractedFields(
  jobId: string,
  newFields: ExtractedFields,
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.extracted_fields = { ...job.extracted_fields, ...newFields };
  job.updated_at = new Date().toISOString();
  persist();
  return job;
}

export function updateJobState(
  jobId: string,
  newState: JobState,
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.state = newState;
  job.updated_at = new Date().toISOString();
  persist();
  return job;
}

export function updateMissingFields(
  jobId: string,
  missing: string[],
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.missing_required_fields = missing;
  job.updated_at = new Date().toISOString();
  persist();
  return job;
}

export function setClarificationRound(
  jobId: string,
  round: number,
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.clarification_round = round;
  job.updated_at = new Date().toISOString();
  persist();
  return job;
}

/** Returns all jobs, optionally filtered by business_id */
export function getAllJobs(businessId?: string): Job[] {
  const all = Array.from(jobs.values());
  if (!businessId) return all;
  return all.filter((j) => j.business_id === businessId);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function msg(
  messageId: string,
  jobId: string,
  sender: "client" | "agent" | "sme" | "system",
  type: "TEXT" | "CLARIFICATION" | "QUOTE",
  text: string,
  requiredApproval: boolean,
  ts: string,
): ChatMessage {
  return {
    message_id: messageId,
    job_id: jobId,
    sender,
    message_type: type,
    text,
    required_approval: requiredApproval,
    created_at: ts,
  };
}

function simpleQuote(
  quoteId: string,
  jobId: string,
  status: "draft" | "awaiting_approval" | "sent" | "expired",
  items: Array<{ name: string; qty: number; unit: number }>,
  ts: string,
) {
  const line_items = items.map((it, i) => ({
    id: `li-${quoteId}-${i + 1}`,
    name: it.name,
    quantity: it.qty,
    unit_price: it.unit,
    total: it.qty * it.unit,
  }));
  const subtotal = line_items.reduce((s, li) => s + li.total, 0);
  const serviceCharge = Math.round(subtotal * 0.05);
  return {
    id: quoteId,
    job_id: jobId,
    status,
    line_items,
    contingencies: [
      {
        id: `c-${quoteId}`,
        label: "Service Charge",
        rate: 0.05,
        amount: serviceCharge,
      },
    ],
    subtotal,
    total: subtotal + serviceCharge,
    currency: "NGN",
    validity_days: 14,
    payment_terms: "50% deposit upon approval, 50% on event date",
    assumptions: ["Prices valid for 14 days", "Transport included"],
    created_at: ts,
    updated_at: ts,
  };
}

// ─── Main seed ────────────────────────────────────────────────────────────────

export function seedInitialJobs(): void {
  // Always try to load persisted jobs from disk first
  loadFromDisk();
  // Persisted runtime jobs must not suppress the demo records for the active
  // business. Only skip seeding when the canonical seed set is already
  // present; this allows a fresh store (or a store containing another
  // business's test job) to still populate the dashboard fixtures.
  if (jobs.has("ed-job-001")) return;

  // Timestamps (spread over a few days so the dashboard looks realistic)
  const t = {
    sep1_am: "2026-09-01T09:00:00Z",
    sep1_pm: "2026-09-01T14:00:00Z",
    aug31_am: "2026-08-31T09:00:00Z",
    aug31_pm: "2026-08-31T15:00:00Z",
    aug30_am: "2026-08-30T10:00:00Z",
    aug30_pm: "2026-08-30T16:00:00Z",
    aug29: "2026-08-29T11:00:00Z",
    aug27: "2026-08-27T08:00:00Z",
    aug10: "2026-08-10T08:00:00Z",
  };

  // ── EVENT DECORATION (biz-event-decoration / event_vendor / Stellar Decor) ──

  jobs.set("ed-job-001", {
    job_id: "ed-job-001",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ed-001-1",
        "ed-job-001",
        "client",
        "TEXT",
        "Hi, I need full venue decoration for a wedding of 300 guests in Lekki on December 20, 2026. We want floral arrangements, lighting, and stage setup.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-ed-001-2",
        "ed-job-001",
        "agent",
        "TEXT",
        "I've prepared a draft quote for your wedding decoration of 300 guests. Please review and approve.",
        true,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Decoration",
      guest_count: 300,
      venue_location: "Lekki",
      event_date: "2026-12-20",
      client_name: "Adaeze Okonkwo",
      client_phone: "+234 801 234 5678",
      amount: 850000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ed-001",
      "ed-job-001",
      "awaiting_approval",
      [
        { name: "Full Venue Floral Decoration", qty: 1, unit: 350000 },
        { name: "Stage & Backdrop Setup", qty: 1, unit: 180000 },
        { name: "Lighting Rig", qty: 1, unit: 120000 },
        { name: "Entrance Arch", qty: 1, unit: 160000 },
      ],
      t.sep1_pm,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ed-job-001",
        type: "agent",
        label: "Draft quote generated",
        detail: "₦850,000",
        timestamp: t.sep1_pm,
      },
    ],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("ed-job-002", {
    job_id: "ed-job-002",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "NEEDS_SME_INPUT",
    clarification_round: 1,
    messages: [
      msg(
        "m-ed-002-1",
        "ed-job-002",
        "client",
        "TEXT",
        "We want stage decoration and custom backdrop for a corporate event in Victoria Island.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-ed-002-2",
        "ed-job-002",
        "agent",
        "CLARIFICATION",
        "Could you provide the venue floor plan and the dimensions of the backdrop wall?",
        false,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Event Decoration",
      venue_location: "Victoria Island",
      client_name: "Bola Fashola",
      client_phone: "+234 802 345 6789",
      amount: 420000,
    },
    missing_required_fields: ["venue_floor_plan", "backdrop_dimensions"],
    quote: null,
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ed-job-002",
        type: "agent",
        label: "Clarification sent to client",
        detail: "1 question",
        timestamp: t.sep1_pm,
      },
    ],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("ed-job-003", {
    job_id: "ed-job-003",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "FAILED_RETRY",
    clarification_round: 1,
    messages: [
      msg(
        "m-ed-003-1",
        "ed-job-003",
        "client",
        "TEXT",
        "Birthday decoration for a small party in Ikeja. Budget is ₦200,000.",
        false,
        t.aug31_am,
      ),
    ],
    extracted_fields: {
      event_type: "Birthday Styling",
      venue_location: "Ikeja",
      budget_range: "200000",
      client_name: "Chioma Obi",
      client_phone: "+234 803 456 7890",
      amount: 310000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ed-006",
      "ed-job-003",
      "expired",
      [
        { name: "Table Styling (20 tables)", qty: 20, unit: 8000 },
        { name: "Balloon Decor", qty: 1, unit: 65000 },
        { name: "Photo Backdrop", qty: 1, unit: 85000 },
      ],
      t.aug10,
    ),
    error_message:
      "Budget exceeds requested scope. Estimate of ₦310,000 against client budget of ₦200,000.",
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ed-job-003",
        type: "system",
        label: "Quote expired — budget mismatch",
        timestamp: t.aug31_pm,
      },
    ],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("ed-job-004", {
    job_id: "ed-job-004",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ed-004-1",
        "ed-job-004",
        "client",
        "TEXT",
        "Traditional ceremony decor for 150 guests in Yaba. Floral and cultural themed.",
        false,
        t.aug31_am,
      ),
      msg(
        "m-ed-004-2",
        "ed-job-004",
        "agent",
        "CLARIFICATION",
        "What cultural theme would you prefer and do you have a specific colour palette?",
        false,
        t.aug31_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Traditional Ceremony Decor",
      guest_count: 150,
      venue_location: "Yaba",
      client_name: "Damilola Ade",
      client_phone: "+234 804 567 8901",
      amount: 280000,
    },
    missing_required_fields: ["cultural_theme", "colour_palette"],
    quote: simpleQuote(
      "qt-ed-004",
      "ed-job-004",
      "draft",
      [
        { name: "Floral Centrepieces (per table)", qty: 15, unit: 8000 },
        { name: "Entrance Arch — Cultural", qty: 1, unit: 65000 },
        { name: "Backdrop & Drapery", qty: 1, unit: 95000 },
      ],
      t.aug31_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("ed-job-005", {
    job_id: "ed-job-005",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "EXECUTED",
    clarification_round: 2,
    messages: [
      msg(
        "m-ed-005-1",
        "ed-job-005",
        "client",
        "TEXT",
        "Full venue decoration for a wedding of 400 guests in Lekki. Luxury theme.",
        false,
        t.aug27,
      ),
      msg(
        "m-ed-005-2",
        "ed-job-005",
        "agent",
        "TEXT",
        "Quote approved and sent. Execution confirmed.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Decor — Full Venue",
      guest_count: 400,
      venue_location: "Lekki",
      client_name: "Emeka Nwosu",
      client_phone: "+234 805 678 9012",
      amount: 920000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ed-003",
      "ed-job-005",
      "sent",
      [
        { name: "Full Venue Floral Decoration", qty: 1, unit: 420000 },
        { name: "Stage & Luxury Backdrop", qty: 1, unit: 200000 },
        { name: "Lighting Rig — Premium", qty: 1, unit: 180000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ed-job-005",
        type: "sme",
        label: "Quote approved & sent",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug27,
    updated_at: t.aug29,
  });

  jobs.set("ed-job-006", {
    job_id: "ed-job-006",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "REASONING",
    clarification_round: 0,
    messages: [
      msg(
        "m-ed-006-1",
        "ed-job-006",
        "client",
        "TEXT",
        "Corporate launch event decor including lighting and stage in Ikeja.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Launch Decor",
      venue_location: "Ikeja",
      client_name: "Funke Akindele",
      client_phone: "+234 806 789 0123",
      amount: 540000,
    },
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ed-job-007", {
    job_id: "ed-job-007",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ed-007-1",
        "ed-job-007",
        "client",
        "TEXT",
        "Birthday setup in Surulere. Entrance decor and balloons.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Birthday Setup",
      venue_location: "Surulere",
      client_name: "Gbenga Olatunji",
      client_phone: "+234 807 890 1234",
      amount: 195000,
    },
    missing_required_fields: ["guest_count", "event_date"],
    quote: simpleQuote(
      "qt-ed-005",
      "ed-job-007",
      "draft",
      [
        { name: "Entrance Arch & Decor", qty: 1, unit: 80000 },
        { name: "Balloon Columns (x4)", qty: 4, unit: 15000 },
        { name: "Table Centrepieces", qty: 8, unit: 5000 },
      ],
      t.aug30_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_pm,
  });

  jobs.set("ed-job-008", {
    job_id: "ed-job-008",
    business_id: "biz-event-decoration",
    business_type: "event_vendor",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ed-008-1",
        "ed-job-008",
        "client",
        "TEXT",
        "Traditional wedding decor in Abuja. Cultural theme with floral.",
        false,
        t.aug29,
      ),
      msg(
        "m-ed-008-2",
        "ed-job-008",
        "agent",
        "TEXT",
        "Draft quote ready for your review and approval.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Traditional Ceremony Decor",
      venue_location: "Abuja",
      client_name: "Halima Bello",
      client_phone: "+234 808 901 2345",
      amount: 380000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ed-002",
      "ed-job-008",
      "awaiting_approval",
      [
        { name: "Cultural Backdrop & Drapery", qty: 1, unit: 130000 },
        { name: "Floral Centrepieces", qty: 20, unit: 7000 },
        { name: "Entrance Arch", qty: 1, unit: 90000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ed-job-008",
        type: "agent",
        label: "Draft quote generated",
        detail: "₦380,000",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug29,
    updated_at: t.aug29,
  });

  // ── PHOTOGRAPHY (biz-photography / photographer / Lens & Light Studio) ────────

  jobs.set("ph-job-001", {
    job_id: "ph-job-001",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-001-1",
        "ph-job-001",
        "client",
        "TEXT",
        "Wedding photography in Lekki on October 5. We need 2 photographers and videography.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-ph-001-2",
        "ph-job-001",
        "agent",
        "TEXT",
        "Quote prepared for your wedding photography package. Ready for review.",
        true,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Photography",
      venue_location: "Lekki",
      event_date: "2026-10-05",
      client_name: "Ngozi Okafor",
      client_phone: "+234 801 234 5678",
      amount: 320000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ph-001",
      "ph-job-001",
      "awaiting_approval",
      [
        { name: "Lead Photographer (8 hrs)", qty: 1, unit: 120000 },
        { name: "Second Photographer (8 hrs)", qty: 1, unit: 80000 },
        { name: "Videography — Full Day", qty: 1, unit: 80000 },
      ],
      t.sep1_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("ph-job-002", {
    job_id: "ph-job-002",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "NEEDS_SME_INPUT",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-002-1",
        "ph-job-002",
        "client",
        "TEXT",
        "Corporate event coverage in Victoria Island. Need photographer for 1 day.",
        false,
        t.sep1_am,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Event Coverage",
      venue_location: "Victoria Island",
      client_name: "Temi Lawson",
      client_phone: "+234 802 345 6789",
      amount: 180000,
    },
    missing_required_fields: ["event_schedule", "expected_deliverables"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_am,
  });

  jobs.set("ph-job-003", {
    job_id: "ph-job-003",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "FAILED_RETRY",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-003-1",
        "ph-job-003",
        "client",
        "TEXT",
        "Product photography for 20 items in studio. Budget is ₦60,000.",
        false,
        t.aug31_am,
      ),
    ],
    extracted_fields: {
      event_type: "Product Photography",
      item_count: 20,
      budget_range: "60000",
      client_name: "Kola Adesanya",
      client_phone: "+234 803 456 7890",
      amount: 95000,
    },
    missing_required_fields: [],
    quote: null,
    error_message:
      "Budget of ₦60,000 is below minimum for 20-item product shoot (₦95,000).",
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_am,
  });

  jobs.set("ph-job-004", {
    job_id: "ph-job-004",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-004-1",
        "ph-job-004",
        "client",
        "TEXT",
        "Graduation shoot in Yaba, 3 outfit changes.",
        false,
        t.aug31_am,
      ),
      msg(
        "m-ph-004-2",
        "ph-job-004",
        "agent",
        "CLARIFICATION",
        "What date works best and how many edited photos do you need?",
        false,
        t.aug31_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Graduation Shoot",
      venue_location: "Yaba",
      outfit_changes: 3,
      client_name: "Yetunde Adeyemi",
      client_phone: "+234 804 567 8901",
      amount: 75000,
    },
    missing_required_fields: ["event_date", "photo_count"],
    quote: simpleQuote(
      "qt-ph-004",
      "ph-job-004",
      "draft",
      [
        { name: "Portrait Session (3 hr)", qty: 1, unit: 45000 },
        { name: "Outfit Change (per set)", qty: 3, unit: 5000 },
      ],
      t.aug31_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("ph-job-005", {
    job_id: "ph-job-005",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "EXECUTED",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-005-1",
        "ph-job-005",
        "client",
        "TEXT",
        "Wedding photography — full day coverage in Abuja.",
        false,
        t.aug27,
      ),
      msg(
        "m-ph-005-2",
        "ph-job-005",
        "agent",
        "TEXT",
        "Quote approved. Coverage confirmed.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Photography",
      venue_location: "Abuja",
      client_name: "Seun Kuti",
      client_phone: "+234 805 678 9012",
      amount: 450000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ph-003",
      "ph-job-005",
      "sent",
      [
        { name: "Lead Photographer (10 hrs)", qty: 1, unit: 180000 },
        { name: "Second Photographer (10 hrs)", qty: 1, unit: 120000 },
        { name: "Videography — Premium", qty: 1, unit: 100000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ph-job-005",
        type: "sme",
        label: "Quote approved & sent",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug27,
    updated_at: t.aug29,
  });

  jobs.set("ph-job-006", {
    job_id: "ph-job-006",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "REASONING",
    clarification_round: 0,
    messages: [
      msg(
        "m-ph-006-1",
        "ph-job-006",
        "client",
        "TEXT",
        "Portrait session for a family of 5 in studio.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Portrait Session",
      subject_count: 5,
      client_name: "Amara Eze",
      client_phone: "+234 806 789 0123",
      amount: 65000,
    },
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ph-job-007", {
    job_id: "ph-job-007",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-007-1",
        "ph-job-007",
        "client",
        "TEXT",
        "Corporate event coverage for a conference in Lagos.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Event Coverage",
      venue_location: "Lagos",
      client_name: "Biodun Olatunji",
      client_phone: "+234 807 890 1234",
      amount: 220000,
    },
    missing_required_fields: ["event_date", "duration_hours"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ph-job-008", {
    job_id: "ph-job-008",
    business_id: "biz-photography",
    business_type: "photographer",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ph-008-1",
        "ph-job-008",
        "client",
        "TEXT",
        "Graduation shoot at University of Lagos for 2 outfits.",
        false,
        t.aug29,
      ),
      msg(
        "m-ph-008-2",
        "ph-job-008",
        "agent",
        "TEXT",
        "Draft quote prepared. Please review.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Graduation Shoot",
      venue_location: "Lagos",
      client_name: "Chiamaka Nwosu",
      client_phone: "+234 808 901 2345",
      amount: 85000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ph-002",
      "ph-job-008",
      "awaiting_approval",
      [
        { name: "Portrait Session (2 hrs)", qty: 1, unit: 50000 },
        { name: "Outfit Change", qty: 2, unit: 5000 },
        { name: "Edited Photos (50)", qty: 1, unit: 20000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug29,
    updated_at: t.aug29,
  });

  // ── TAILORING (biz-tailoring / tailor / Prestige Tailors) ────────────────────

  jobs.set("tl-job-001", {
    job_id: "tl-job-001",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-001-1",
        "tl-job-001",
        "client",
        "TEXT",
        "3-piece bespoke suit in Surulere. Measurements already taken.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-tl-001-2",
        "tl-job-001",
        "agent",
        "TEXT",
        "Quote prepared based on your measurements. Ready for approval.",
        true,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Bespoke Suits — 3 pieces",
      venue_location: "Surulere",
      quantity: 3,
      client_name: "Tunde Bello",
      client_phone: "+234 801 234 5678",
      amount: 185000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-tl-001",
      "tl-job-001",
      "awaiting_approval",
      [
        { name: "Bespoke Jacket", qty: 1, unit: 65000 },
        { name: "Bespoke Trousers", qty: 1, unit: 35000 },
        { name: "Bespoke Waistcoat", qty: 1, unit: 55000 },
      ],
      t.sep1_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("tl-job-002", {
    job_id: "tl-job-002",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "NEEDS_SME_INPUT",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-002-1",
        "tl-job-002",
        "client",
        "TEXT",
        "Traditional Agbada set for a wedding in Ikeja.",
        false,
        t.sep1_am,
      ),
    ],
    extracted_fields: {
      event_type: "Traditional Agbada Set",
      venue_location: "Ikeja",
      client_name: "Ola Martins",
      client_phone: "+234 802 345 6789",
      amount: 95000,
    },
    missing_required_fields: ["fabric_preference", "event_date"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_am,
  });

  jobs.set("tl-job-003", {
    job_id: "tl-job-003",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "FAILED_RETRY",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-003-1",
        "tl-job-003",
        "client",
        "TEXT",
        "Luxury wedding outfit for groom in Lekki. Budget ₦150,000.",
        false,
        t.aug31_am,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Outfit — Groom",
      venue_location: "Lekki",
      budget_range: "150000",
      client_name: "Chukwu Eze",
      client_phone: "+234 803 456 7890",
      amount: 220000,
    },
    missing_required_fields: [],
    quote: null,
    error_message:
      "Budget of ₦150,000 is below minimum estimate of ₦220,000 for luxury groom outfit.",
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_am,
  });

  jobs.set("tl-job-004", {
    job_id: "tl-job-004",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-004-1",
        "tl-job-004",
        "client",
        "TEXT",
        "10 corporate uniforms for our team in Victoria Island.",
        false,
        t.aug31_am,
      ),
      msg(
        "m-tl-004-2",
        "tl-job-004",
        "agent",
        "CLARIFICATION",
        "What style (formal/casual) and do you have a brand colour guide?",
        false,
        t.aug31_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Uniforms x10",
      quantity: 10,
      venue_location: "Victoria Island",
      client_name: "Sade Adu",
      client_phone: "+234 804 567 8901",
      amount: 340000,
    },
    missing_required_fields: ["uniform_style", "brand_colours"],
    quote: simpleQuote(
      "qt-tl-004",
      "tl-job-004",
      "draft",
      [
        { name: "Corporate Shirt (per piece)", qty: 10, unit: 18000 },
        { name: "Corporate Trousers (per piece)", qty: 10, unit: 16000 },
      ],
      t.aug31_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("tl-job-005", {
    job_id: "tl-job-005",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "EXECUTED",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-005-1",
        "tl-job-005",
        "client",
        "TEXT",
        "2-piece bespoke suit for a formal dinner.",
        false,
        t.aug27,
      ),
    ],
    extracted_fields: {
      event_type: "Bespoke Suit — 2 pieces",
      client_name: "Femi Kuti",
      client_phone: "+234 805 678 9012",
      amount: 125000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-tl-003",
      "tl-job-005",
      "sent",
      [
        { name: "Bespoke Jacket", qty: 1, unit: 65000 },
        { name: "Bespoke Trousers", qty: 1, unit: 45000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "tl-job-005",
        type: "sme",
        label: "Quote approved & sent",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug27,
    updated_at: t.aug29,
  });

  jobs.set("tl-job-006", {
    job_id: "tl-job-006",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "REASONING",
    clarification_round: 0,
    messages: [
      msg(
        "m-tl-006-1",
        "tl-job-006",
        "client",
        "TEXT",
        "Traditional Iro and Buba set for a naming ceremony.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Traditional Attire",
      client_name: "Ngozi Peters",
      client_phone: "+234 806 789 0123",
      amount: 78000,
    },
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("tl-job-007", {
    job_id: "tl-job-007",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-007-1",
        "tl-job-007",
        "client",
        "TEXT",
        "Wedding outfit set for bride and groom.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Outfit Set",
      client_name: "Emeka Obi",
      client_phone: "+234 807 890 1234",
      amount: 195000,
    },
    missing_required_fields: [
      "measurements",
      "fabric_preference",
      "event_date",
    ],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("tl-job-008", {
    job_id: "tl-job-008",
    business_id: "biz-tailoring",
    business_type: "tailor",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-tl-008-1",
        "tl-job-008",
        "client",
        "TEXT",
        "5 corporate uniforms for staff. Brand colours are navy and gold.",
        false,
        t.aug29,
      ),
      msg(
        "m-tl-008-2",
        "tl-job-008",
        "agent",
        "TEXT",
        "Draft quote prepared for 5 corporate uniforms. Ready for approval.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Uniforms x5",
      quantity: 5,
      client_name: "Amaka Eze",
      client_phone: "+234 808 901 2345",
      amount: 175000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-tl-002",
      "tl-job-008",
      "awaiting_approval",
      [
        { name: "Corporate Shirt — Navy/Gold", qty: 5, unit: 18000 },
        { name: "Corporate Trousers — Navy/Gold", qty: 5, unit: 17000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug29,
    updated_at: t.aug29,
  });

  // ── CATERING (biz-catering / caterer / Savour Catering Co.) ──────────────────

  jobs.set("ct-job-001", {
    job_id: "ct-job-001",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-001-1",
        "ct-job-001",
        "client",
        "TEXT",
        "Wedding catering for 120 guests in Ikeja. Jollof rice, fried rice, chicken, salad.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-ct-001-2",
        "ct-job-001",
        "agent",
        "TEXT",
        "Draft quote prepared for your wedding catering. Ready for your review.",
        true,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Catering",
      guest_count: 120,
      venue_location: "Ikeja",
      client_name: "Sarah Adeyemi",
      client_phone: "+234 801 234 5678",
      amount: 507000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ct-001",
      "ct-job-001",
      "awaiting_approval",
      [
        { name: "Jollof & Fried Rice Combo (per plate)", qty: 120, unit: 2500 },
        { name: "Grilled Chicken & Fish (per plate)", qty: 120, unit: 1200 },
        { name: "Fresh Salad & Desserts", qty: 120, unit: 325 },
      ],
      t.sep1_pm,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ct-job-001",
        type: "agent",
        label: "Draft quote generated",
        detail: "₦507,000",
        timestamp: t.sep1_pm,
      },
    ],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("ct-job-002", {
    job_id: "ct-job-002",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "NEEDS_SME_INPUT",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-002-1",
        "ct-job-002",
        "client",
        "TEXT",
        "Corporate catering for a conference in Lekki Phase 1. Need buffet for 80 people.",
        false,
        t.sep1_am,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Catering",
      guest_count: 80,
      venue_location: "Lekki Phase 1",
      client_name: "Michael Okoro",
      client_phone: "+234 802 345 6789",
      amount: 280000,
    },
    missing_required_fields: ["menu_confirmation", "dietary_requirements"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_am,
  });

  jobs.set("ct-job-003", {
    job_id: "ct-job-003",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "FAILED_RETRY",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-003-1",
        "ct-job-003",
        "client",
        "TEXT",
        "Corporate launch catering in Victoria Island. Budget ₦300,000 for 100 guests.",
        false,
        t.aug31_am,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Launch",
      guest_count: 100,
      venue_location: "Victoria Island",
      budget_range: "300000",
      client_name: "David James",
      client_phone: "+234 803 456 7890",
      amount: 415000,
    },
    missing_required_fields: [],
    quote: null,
    error_message:
      "Budget of ₦300,000 is below estimate of ₦415,000 for 100-guest corporate catering.",
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_am,
  });

  jobs.set("ct-job-004", {
    job_id: "ct-job-004",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-004-1",
        "ct-job-004",
        "client",
        "TEXT",
        "Birthday catering for 80 guests in Yaba. Small chops and jollof.",
        false,
        t.aug31_am,
      ),
      msg(
        "m-ct-004-2",
        "ct-job-004",
        "agent",
        "CLARIFICATION",
        "What time does the event start and will you need serving staff?",
        false,
        t.aug31_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Birthday Catering",
      guest_count: 80,
      venue_location: "Yaba",
      client_name: "Amaka Nwosu",
      client_phone: "+234 804 567 8901",
      amount: 195000,
    },
    missing_required_fields: ["start_time", "serving_staff_needed"],
    quote: simpleQuote(
      "qt-ct-004",
      "ct-job-004",
      "draft",
      [
        { name: "Small Chops (per plate)", qty: 80, unit: 1200 },
        { name: "Jollof Rice (per plate)", qty: 80, unit: 1000 },
      ],
      t.aug31_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("ct-job-005", {
    job_id: "ct-job-005",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "EXECUTED",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-005-1",
        "ct-job-005",
        "client",
        "TEXT",
        "Corporate catering for 50 staff — quarterly town hall.",
        false,
        t.aug27,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Catering — 50 pax",
      guest_count: 50,
      client_name: "Tunde Bello",
      client_phone: "+234 805 678 9012",
      amount: 185000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ct-003",
      "ct-job-005",
      "sent",
      [
        { name: "Buffet Combo (per plate)", qty: 50, unit: 2500 },
        { name: "Drinks & Desserts", qty: 50, unit: 800 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ct-job-005",
        type: "sme",
        label: "Quote approved & sent",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug27,
    updated_at: t.aug29,
  });

  jobs.set("ct-job-006", {
    job_id: "ct-job-006",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "REASONING",
    clarification_round: 0,
    messages: [
      msg(
        "m-ct-006-1",
        "ct-job-006",
        "client",
        "TEXT",
        "Wedding catering for 200 guests in Abuja. Premium menu.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Catering — 200 pax",
      guest_count: 200,
      venue_location: "Abuja",
      client_name: "Ngozi Okafor",
      client_phone: "+234 806 789 0123",
      amount: 820000,
    },
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ct-job-007", {
    job_id: "ct-job-007",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-007-1",
        "ct-job-007",
        "client",
        "TEXT",
        "Birthday catering for 80 guests in Lagos.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Birthday Catering — 80 pax",
      guest_count: 80,
      venue_location: "Lagos",
      client_name: "Emeka Eze",
      client_phone: "+234 807 890 1234",
      amount: 295000,
    },
    missing_required_fields: ["menu_selection"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ct-job-008", {
    job_id: "ct-job-008",
    business_id: "biz-catering",
    business_type: "caterer",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ct-008-1",
        "ct-job-008",
        "client",
        "TEXT",
        "Cocktail catering for 60 guests in Lekki.",
        false,
        t.aug29,
      ),
      msg(
        "m-ct-008-2",
        "ct-job-008",
        "agent",
        "TEXT",
        "Quote ready for your cocktail event. Please review.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Cocktail Event — 60 pax",
      guest_count: 60,
      venue_location: "Lekki",
      client_name: "Fatima Bello",
      client_phone: "+234 808 901 2345",
      amount: 245000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ct-002",
      "ct-job-008",
      "awaiting_approval",
      [
        { name: "Cocktail Drinks (per person)", qty: 60, unit: 2500 },
        { name: "Canapés & Finger Food", qty: 60, unit: 1300 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug29,
    updated_at: t.aug29,
  });

  // ── EVENT PLANNING (biz-event-planning / event_planner / Grand Events Co.) ───

  jobs.set("ep-job-001", {
    job_id: "ep-job-001",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-001-1",
        "ep-job-001",
        "client",
        "TEXT",
        "Gala dinner for 200 guests in Victoria Island. Full event planning.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-ep-001-2",
        "ep-job-001",
        "agent",
        "TEXT",
        "Gala dinner planning quote is ready for your review.",
        true,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Gala Dinner Planning",
      guest_count: 200,
      venue_location: "Victoria Island",
      client_name: "Emeka Eze",
      client_phone: "+234 801 234 5678",
      amount: 1250000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ep-001",
      "ep-job-001",
      "awaiting_approval",
      [
        { name: "Event Coordination (2 days)", qty: 1, unit: 350000 },
        { name: "Venue Sourcing & Liaison", qty: 1, unit: 150000 },
        { name: "Catering Coordination", qty: 1, unit: 200000 },
        { name: "Décor & Styling", qty: 1, unit: 300000 },
        { name: "AV & Entertainment", qty: 1, unit: 200000 },
      ],
      t.sep1_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("ep-job-002", {
    job_id: "ep-job-002",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "NEEDS_SME_INPUT",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-002-1",
        "ep-job-002",
        "client",
        "TEXT",
        "Full wedding planning in Lekki. 300 guests, luxury theme.",
        false,
        t.sep1_am,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Planning",
      guest_count: 300,
      venue_location: "Lekki",
      client_name: "Lola Okafor",
      client_phone: "+234 802 345 6789",
      amount: 2800000,
    },
    missing_required_fields: ["vendor_list", "preferred_vendors"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_am,
  });

  jobs.set("ep-job-003", {
    job_id: "ep-job-003",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "FAILED_RETRY",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-003-1",
        "ep-job-003",
        "client",
        "TEXT",
        "Product launch event in Ikeja. Budget ₦500,000.",
        false,
        t.aug31_am,
      ),
    ],
    extracted_fields: {
      event_type: "Product Launch Event",
      venue_location: "Ikeja",
      budget_range: "500000",
      client_name: "Chidi Obi",
      client_phone: "+234 803 456 7890",
      amount: 680000,
    },
    missing_required_fields: [],
    quote: null,
    error_message:
      "Budget of ₦500,000 is below minimum estimate of ₦680,000 for the requested scope.",
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_am,
  });

  jobs.set("ep-job-004", {
    job_id: "ep-job-004",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-004-1",
        "ep-job-004",
        "client",
        "TEXT",
        "Birthday party planning for 100 guests in Yaba.",
        false,
        t.aug31_am,
      ),
      msg(
        "m-ep-004-2",
        "ep-job-004",
        "agent",
        "CLARIFICATION",
        "What entertainment do you prefer and is there a theme?",
        false,
        t.aug31_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Birthday Party Planning",
      guest_count: 100,
      venue_location: "Yaba",
      client_name: "Amara Obi",
      client_phone: "+234 804 567 8901",
      amount: 450000,
    },
    missing_required_fields: ["entertainment_type", "theme"],
    quote: simpleQuote(
      "qt-ep-004",
      "ep-job-004",
      "draft",
      [
        { name: "Event Coordination", qty: 1, unit: 200000 },
        { name: "Venue Booking", qty: 1, unit: 100000 },
        { name: "Décor Coordination", qty: 1, unit: 100000 },
      ],
      t.aug31_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("ep-job-005", {
    job_id: "ep-job-005",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "EXECUTED",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-005-1",
        "ep-job-005",
        "client",
        "TEXT",
        "Corporate conference for 150 attendees in Lagos.",
        false,
        t.aug27,
      ),
    ],
    extracted_fields: {
      event_type: "Corporate Conference",
      guest_count: 150,
      venue_location: "Lagos",
      client_name: "Seun Adesanya",
      client_phone: "+234 805 678 9012",
      amount: 950000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ep-003",
      "ep-job-005",
      "sent",
      [
        { name: "Conference Management (2 days)", qty: 1, unit: 400000 },
        { name: "AV & Tech Setup", qty: 1, unit: 200000 },
        { name: "Catering Coordination", qty: 1, unit: 250000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "ep-job-005",
        type: "sme",
        label: "Quote approved & sent",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug27,
    updated_at: t.aug29,
  });

  jobs.set("ep-job-006", {
    job_id: "ep-job-006",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "REASONING",
    clarification_round: 0,
    messages: [
      msg(
        "m-ep-006-1",
        "ep-job-006",
        "client",
        "TEXT",
        "Full wedding planning for 400 guests in Abuja. Luxury.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Wedding Planning",
      guest_count: 400,
      venue_location: "Abuja",
      client_name: "Bisi Olatunji",
      client_phone: "+234 806 789 0123",
      amount: 3200000,
    },
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ep-job-007", {
    job_id: "ep-job-007",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-007-1",
        "ep-job-007",
        "client",
        "TEXT",
        "Birthday party for 50 guests. Need full planning.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Birthday Party — 50 guests",
      guest_count: 50,
      client_name: "Kemi Adeyemi",
      client_phone: "+234 807 890 1234",
      amount: 380000,
    },
    missing_required_fields: ["venue_preference", "theme", "event_date"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("ep-job-008", {
    job_id: "ep-job-008",
    business_id: "biz-event-planning",
    business_type: "event_planner",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-ep-008-1",
        "ep-job-008",
        "client",
        "TEXT",
        "Product launch event for a tech startup in Lagos.",
        false,
        t.aug29,
      ),
      msg(
        "m-ep-008-2",
        "ep-job-008",
        "agent",
        "TEXT",
        "Quote for your product launch event is ready.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Product Launch Event",
      venue_location: "Lagos",
      client_name: "Fola Bello",
      client_phone: "+234 808 901 2345",
      amount: 720000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-ep-002",
      "ep-job-008",
      "awaiting_approval",
      [
        { name: "Event Coordination", qty: 1, unit: 300000 },
        { name: "Venue & AV Setup", qty: 1, unit: 200000 },
        { name: "Press & Media Liaison", qty: 1, unit: 150000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug29,
    updated_at: t.aug29,
  });

  // ── EQUIPMENT RENTAL (biz-equipment-rental / equipment_rental / ProRent) ─────

  jobs.set("er-job-001", {
    job_id: "er-job-001",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-001-1",
        "er-job-001",
        "client",
        "TEXT",
        "Sound system rental for a 2-day event in Ikeja.",
        false,
        t.sep1_am,
      ),
      msg(
        "m-er-001-2",
        "er-job-001",
        "agent",
        "TEXT",
        "Quote for sound system rental prepared. Ready for review.",
        true,
        t.sep1_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Sound System Rental",
      duration_days: 2,
      venue_location: "Ikeja",
      client_name: "Ade Okafor",
      client_phone: "+234 801 234 5678",
      amount: 185000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-er-001",
      "er-job-001",
      "awaiting_approval",
      [
        { name: "PA Sound System (per day)", qty: 2, unit: 55000 },
        { name: "Microphone Set", qty: 1, unit: 25000 },
        { name: "Setup & Breakdown", qty: 1, unit: 25000 },
      ],
      t.sep1_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_pm,
  });

  jobs.set("er-job-002", {
    job_id: "er-job-002",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "NEEDS_SME_INPUT",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-002-1",
        "er-job-002",
        "client",
        "TEXT",
        "Generator and lighting rig for an outdoor event in Lekki.",
        false,
        t.sep1_am,
      ),
    ],
    extracted_fields: {
      event_type: "Generator + Lighting Rig",
      venue_location: "Lekki",
      client_name: "Bisi Eze",
      client_phone: "+234 802 345 6789",
      amount: 320000,
    },
    missing_required_fields: ["event_date", "generator_kva_required"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.sep1_am,
    updated_at: t.sep1_am,
  });

  jobs.set("er-job-003", {
    job_id: "er-job-003",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "FAILED_RETRY",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-003-1",
        "er-job-003",
        "client",
        "TEXT",
        "Full AV package for a conference in Victoria Island. Budget ₦350,000.",
        false,
        t.aug31_am,
      ),
    ],
    extracted_fields: {
      event_type: "Full AV Package",
      venue_location: "Victoria Island",
      budget_range: "350000",
      client_name: "Chuks Nwosu",
      client_phone: "+234 803 456 7890",
      amount: 480000,
    },
    missing_required_fields: [],
    quote: null,
    error_message:
      "Budget of ₦350,000 below estimate of ₦480,000 for full AV package.",
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_am,
  });

  jobs.set("er-job-004", {
    job_id: "er-job-004",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-004-1",
        "er-job-004",
        "client",
        "TEXT",
        "Tent and furniture rental for 200 guests outdoor event in Yaba.",
        false,
        t.aug31_am,
      ),
      msg(
        "m-er-004-2",
        "er-job-004",
        "agent",
        "CLARIFICATION",
        "Do you need chairs and tables included, and for how many days?",
        false,
        t.aug31_pm,
      ),
    ],
    extracted_fields: {
      event_type: "Tent & Furniture Rental",
      guest_count: 200,
      venue_location: "Yaba",
      client_name: "Dupe Martins",
      client_phone: "+234 804 567 8901",
      amount: 250000,
    },
    missing_required_fields: ["duration_days", "furniture_type"],
    quote: simpleQuote(
      "qt-er-004",
      "er-job-004",
      "draft",
      [
        { name: "Event Tent (10m x 20m)", qty: 1, unit: 120000 },
        { name: "Chairs (per unit)", qty: 200, unit: 300 },
        { name: "Tables (per unit)", qty: 25, unit: 600 },
      ],
      t.aug31_pm,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug31_am,
    updated_at: t.aug31_pm,
  });

  jobs.set("er-job-005", {
    job_id: "er-job-005",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "EXECUTED",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-005-1",
        "er-job-005",
        "client",
        "TEXT",
        "Sound system for a wedding reception. 1-day event.",
        false,
        t.aug27,
      ),
    ],
    extracted_fields: {
      event_type: "Sound System — Wedding",
      duration_days: 1,
      client_name: "Emeka Bello",
      client_phone: "+234 805 678 9012",
      amount: 145000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-er-003",
      "er-job-005",
      "sent",
      [
        { name: "PA Sound System (1 day)", qty: 1, unit: 80000 },
        { name: "DJ Booth Setup", qty: 1, unit: 30000 },
        { name: "Microphone Set", qty: 1, unit: 15000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [
      {
        id: randomUUID(),
        job_id: "er-job-005",
        type: "sme",
        label: "Quote approved & sent",
        timestamp: t.aug29,
      },
    ],
    created_at: t.aug27,
    updated_at: t.aug29,
  });

  jobs.set("er-job-006", {
    job_id: "er-job-006",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "REASONING",
    clarification_round: 0,
    messages: [
      msg(
        "m-er-006-1",
        "er-job-006",
        "client",
        "TEXT",
        "Generator rental for 3 days for a wedding in Abuja.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Generator Rental — 3 days",
      duration_days: 3,
      venue_location: "Abuja",
      client_name: "Funmi Olatunji",
      client_phone: "+234 806 789 0123",
      amount: 210000,
    },
    missing_required_fields: [],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("er-job-007", {
    job_id: "er-job-007",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "CLARIFYING",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-007-1",
        "er-job-007",
        "client",
        "TEXT",
        "Lighting rig for a corporate event in Lagos.",
        false,
        t.aug30_am,
      ),
    ],
    extracted_fields: {
      event_type: "Lighting Rig — Corporate",
      venue_location: "Lagos",
      client_name: "Goke Adeyemi",
      client_phone: "+234 807 890 1234",
      amount: 175000,
    },
    missing_required_fields: ["venue_dimensions", "event_date"],
    quote: null,
    error_message: null,
    audit_events: [],
    created_at: t.aug30_am,
    updated_at: t.aug30_am,
  });

  jobs.set("er-job-008", {
    job_id: "er-job-008",
    business_id: "biz-equipment-rental",
    business_type: "equipment_rental",
    state: "AWAITING_HUMAN_APPROVAL",
    clarification_round: 1,
    messages: [
      msg(
        "m-er-008-1",
        "er-job-008",
        "client",
        "TEXT",
        "Full AV package for a conference — 2 days.",
        false,
        t.aug29,
      ),
      msg(
        "m-er-008-2",
        "er-job-008",
        "agent",
        "TEXT",
        "Full AV package quote ready for approval.",
        true,
        t.aug29,
      ),
    ],
    extracted_fields: {
      event_type: "Full AV Package",
      duration_days: 2,
      client_name: "Hauwa Eze",
      client_phone: "+234 808 901 2345",
      amount: 390000,
    },
    missing_required_fields: [],
    quote: simpleQuote(
      "qt-er-002",
      "er-job-008",
      "awaiting_approval",
      [
        { name: "Projector & Screen (per day)", qty: 2, unit: 50000 },
        { name: "PA Sound System (per day)", qty: 2, unit: 55000 },
        { name: "Lighting Rig", qty: 1, unit: 80000 },
        { name: "Setup & Teardown", qty: 1, unit: 40000 },
      ],
      t.aug29,
    ),
    error_message: null,
    audit_events: [],
    created_at: t.aug29,
    updated_at: t.aug29,
  });
}

export function _clearAllJobs(): void {
  jobs.clear();
}
