import request from "supertest";
import { app } from "../../src/app";
import {
  _clearAvailabilityStore,
  _reseedAvailabilityStore,
} from "../../src/state/AvailabilityStore";

describe("Availability API Endpoints", () => {
  beforeEach(() => {
    _reseedAvailabilityStore();
  });

  afterAll(() => {
    _clearAvailabilityStore();
  });

  // ── GET /availability ────────────────────────────────────────────────────────
  describe("GET /availability", () => {
    it("returns all blocked dates when no filter is applied", async () => {
      const res = await request(app).get("/availability");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("filters blocked dates by business_id", async () => {
      const res = await request(app).get("/availability?business_id=biz-001");
      expect(res.status).toBe(200);
      for (const entry of res.body.data) {
        expect(entry.business_id).toBe("biz-001");
      }
    });

    it("returns empty array for unknown business_id", async () => {
      const res = await request(app).get("/availability?business_id=biz-999");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ── POST /availability ───────────────────────────────────────────────────────
  describe("POST /availability", () => {
    it("blocks a date with UNAVAILABLE status", async () => {
      const res = await request(app).post("/availability").send({
        business_id: "biz-001",
        date: "2026-11-01",
        status: "UNAVAILABLE",
        reason: "Public holiday",
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("availability_date_id");
      expect(res.body.data.date).toBe("2026-11-01");
      expect(res.body.data.status).toBe("UNAVAILABLE");
      expect(res.body.data.reason).toBe("Public holiday");
    });

    it("blocks a date with BOOKED status", async () => {
      const res = await request(app).post("/availability").send({
        business_id: "biz-001",
        date: "2026-11-15",
        status: "BOOKED",
        reason: "Wedding — Adaeze & Chidi",
      });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("BOOKED");
    });

    it("returns validation error for missing required fields", async () => {
      const res = await request(app).post("/availability").send({
        business_id: "biz-001",
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns validation error for invalid date format", async () => {
      const res = await request(app).post("/availability").send({
        business_id: "biz-001",
        date: "15-11-2026",
        status: "UNAVAILABLE",
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── GET /availability/:id ────────────────────────────────────────────────────
  describe("GET /availability/:id", () => {
    it("retrieves a specific blocked date by ID", async () => {
      const createRes = await request(app).post("/availability").send({
        business_id: "biz-001",
        date: "2026-12-01",
        status: "BOOKED",
        reason: "Birthday party",
      });
      const id = createRes.body.data.availability_date_id;
      const getRes = await request(app).get(`/availability/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.availability_date_id).toBe(id);
    });

    it("returns 404 for non-existent ID", async () => {
      const res = await request(app).get("/availability/non-existent-id");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("AVAILABILITY_NOT_FOUND");
    });
  });

  // ── PATCH /availability/:id ──────────────────────────────────────────────────
  describe("PATCH /availability/:id", () => {
    it("updates the status and reason of a blocked date", async () => {
      const createRes = await request(app).post("/availability").send({
        business_id: "biz-001",
        date: "2026-12-10",
        status: "UNAVAILABLE",
        reason: "Original reason",
      });
      const id = createRes.body.data.availability_date_id;

      const patchRes = await request(app)
        .patch(`/availability/${id}`)
        .send({ status: "BOOKED", reason: "Updated — confirmed booking" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.status).toBe("BOOKED");
      expect(patchRes.body.data.reason).toBe("Updated — confirmed booking");
    });

    it("returns 404 when patching non-existent ID", async () => {
      const res = await request(app)
        .patch("/availability/non-existent-id")
        .send({ status: "BOOKED" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("AVAILABILITY_NOT_FOUND");
    });
  });

  // ── DELETE /availability/:id ─────────────────────────────────────────────────
  describe("DELETE /availability/:id", () => {
    it("unblocks a date and returns deleted: true", async () => {
      const createRes = await request(app).post("/availability").send({
        business_id: "biz-001",
        date: "2026-12-20",
        status: "UNAVAILABLE",
        reason: "Staff training",
      });
      const id = createRes.body.data.availability_date_id;

      const deleteRes = await request(app).delete(`/availability/${id}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.deleted).toBe(true);

      const getRes = await request(app).get(`/availability/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 when deleting a non-existent ID", async () => {
      const res = await request(app).delete("/availability/non-existent-id");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("AVAILABILITY_NOT_FOUND");
    });
  });

  // ── GET /availability/check ──────────────────────────────────────────────────
  describe("GET /availability/check", () => {
    it("returns available: true for an unblocked date", async () => {
      const res = await request(app).get(
        "/availability/check?business_id=biz-001&date=2026-11-30",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
      expect(res.body.data.blocked_entry).toBeNull();
    });

    it("returns available: false for a seeded blocked date", async () => {
      const res = await request(app).get(
        "/availability/check?business_id=biz-001&date=2026-09-15",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.blocked_entry).not.toBeNull();
      expect(res.body.data.blocked_entry.status).toBe("BOOKED");
    });

    it("returns validation error when date is missing", async () => {
      const res = await request(app).get(
        "/availability/check?business_id=biz-001",
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns validation error for invalid date format", async () => {
      const res = await request(app).get(
        "/availability/check?business_id=biz-001&date=15-09-2026",
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
