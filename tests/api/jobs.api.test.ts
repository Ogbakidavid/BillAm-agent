import request from "supertest";
import { app } from "../../src/app";
import { _clearAllJobs, getJob, updateJobState, mergeExtractedFields, updateMissingFields } from "../../src/state/JobStore";
import { _clearAuditLog } from "../../src/state/auditLog";

describe("REST API Endpoint Handlers (BE-09, BE-10, BE-11)", () => {
  beforeEach(() => {
    _clearAllJobs();
    _clearAuditLog();
  });

  describe("POST /jobs", () => {
    it("creates a new job with valid input", async () => {
      const res = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("job_id");
      expect(res.body.data.state).toBe("IDLE");
      expect(res.body.data.business_id).toBe("business-1");
      expect(res.body.data.business_type).toBe("event_vendor");
    });

    it("returns validation error on empty fields", async () => {
      const res = await request(app)
        .post("/jobs")
        .send({
          business_id: "",
          business_type: "invalid_type",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /jobs/:id", () => {
    it("retrieves details for an existing job", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;

      const getRes = await request(app).get(`/jobs/${jobId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.job_id).toBe(jobId);
    });

    it("returns 404 error when job is not found", async () => {
      const res = await request(app).get("/jobs/non-existent-uuid");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("JOB_NOT_FOUND");
    });
  });

  describe("POST /jobs/:id/messages", () => {
    it("ingests client message, appends to log, and returns state", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;

      const msgRes = await request(app)
        .post(`/jobs/${jobId}/messages`)
        .send({
          message_text: "I need decor for a party.",
          received_at: new Date().toISOString(),
        });

      expect(msgRes.status).toBe(200);
      expect(msgRes.body.success).toBe(true);
      
      const job = getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.messages.some((m) => m.text === "I need decor for a party.")).toBe(true);
    });

    it("returns 409 error if job state is not ready to receive message", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;
      updateJobState(jobId, "INGESTING"); // Mutate state to busy state

      const msgRes = await request(app)
        .post(`/jobs/${jobId}/messages`)
        .send({
          message_text: "Another message",
          received_at: new Date().toISOString(),
        });

      expect(msgRes.status).toBe(409);
      expect(msgRes.body.success).toBe(false);
      expect(msgRes.body.error.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("GET /jobs/:id/quote & PATCH /jobs/:id/quote", () => {
    it("returns 404 for quote if no quote is generated", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;

      const quoteRes = await request(app).get(`/jobs/${jobId}/quote`);
      expect(quoteRes.status).toBe(404);
      expect(quoteRes.body.error.code).toBe("QUOTE_NOT_AVAILABLE");
    });

    it("allows SME to edit quote and recalculate subtotal if state is AWAITING_HUMAN_APPROVAL", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;
      const job = getJob(jobId)!;
      job.quote = {
        status: "DRAFT",
        line_items: [{ name: "Standard Decor", quantity: 1, unit_price: 100000, total: 100000 }],
        contingencies: [{ name: "Logistics", amount: 10000 }],
        subtotal: 100000,
        total: 110000,
        currency: "NGN",
        validity_days: 7,
        payment_terms: "50/50",
        assumptions: [],
      };
      updateJobState(jobId, "AWAITING_HUMAN_APPROVAL");

      const editRes = await request(app)
        .patch(`/jobs/${jobId}/quote`)
        .send({
          line_items: [{ name: "Standard Decor", quantity: 1, unit_price: 120000 }],
          notes: "Updated price",
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.success).toBe(true);
      expect(editRes.body.data.quote.total).toBe(130000); // 120000 subtotal + 10000 logistics
    });
  });

  describe("POST /jobs/:id/approve_quote", () => {
    it("approves the quote and transitions state to EXECUTED", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;
      const job = getJob(jobId)!;
      job.quote = {
        status: "DRAFT",
        line_items: [{ name: "Standard Decor", quantity: 1, unit_price: 100000, total: 100000 }],
        contingencies: [{ name: "Logistics", amount: 10000 }],
        subtotal: 100000,
        total: 110000,
        currency: "NGN",
        validity_days: 7,
        payment_terms: "50/50",
        assumptions: [],
      };
      updateJobState(jobId, "AWAITING_HUMAN_APPROVAL");

      const approveRes = await request(app)
        .post(`/jobs/${jobId}/approve_quote`)
        .send({
          approved_by: "sme-1",
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.state).toBe("EXECUTED");
      expect(job.quote.status).toBe("SENT");
    });
  });

  describe("GET /jobs/:id/missing_fields & POST /jobs/:id/manual_input", () => {
    it("returns unresolved fields when in NEEDS_SME_INPUT state", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;
      updateMissingFields(jobId, ["event_date", "guest_count"]);
      updateJobState(jobId, "NEEDS_SME_INPUT");

      const missingRes = await request(app).get(`/jobs/${jobId}/missing_fields`);

      expect(missingRes.status).toBe(200);
      expect(missingRes.body.success).toBe(true);
      expect(missingRes.body.data.missing_fields).toEqual(["event_date", "guest_count"]);
    });

    it("allows manual recovery by inputting missing fields", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;
      updateMissingFields(jobId, ["event_date"]);
      updateJobState(jobId, "NEEDS_SME_INPUT");

      const inputRes = await request(app)
        .post(`/jobs/${jobId}/manual_input`)
        .send({
          supplied_fields: { event_date: "2025-10-10" },
          source: "Call with client",
        });

      expect(inputRes.status).toBe(200);
      expect(inputRes.body.success).toBe(true);

      const job = getJob(jobId);
      expect(job?.extracted_fields.event_date).toBe("2025-10-10");
    });
  });

  describe("POST /jobs/:id/retry", () => {
    it("allows retrying a job that has FAILED_RETRY", async () => {
      const createRes = await request(app)
        .post("/jobs")
        .send({
          business_id: "business-1",
          business_type: "event_vendor",
        });

      const jobId = createRes.body.data.job_id;
      updateJobState(jobId, "FAILED_RETRY");

      const retryRes = await request(app).post(`/jobs/${jobId}/retry`);

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.state).toBe("REASONING");
    });
  });
});
