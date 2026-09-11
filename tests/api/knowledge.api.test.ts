import request from "supertest";
import { app } from "../../src/app";
import {
  _clearKnowledgeStore,
  _reseedKnowledgeStore,
} from "../../src/state/KnowledgeStore";

describe("Knowledge Base API Endpoints", () => {
  beforeEach(() => {
    _reseedKnowledgeStore();
  });

  afterAll(() => {
    _clearKnowledgeStore();
  });

  describe("GET /knowledge", () => {
    it("returns all knowledge entries when no filter is applied", async () => {
      const res = await request(app).get("/knowledge");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("filters entries by business_id", async () => {
      const res = await request(app).get("/knowledge?business_id=biz-001");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      for (const entry of res.body.data) {
        expect(entry.business_id).toBe("biz-001");
      }
    });

    it("returns empty array for unknown business_id", async () => {
      const res = await request(app).get("/knowledge?business_id=biz-999");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("POST /knowledge", () => {
    it("creates a new knowledge entry with status PROCESSING", async () => {
      const res = await request(app).post("/knowledge").send({
        business_id: "biz-002",
        name: "New Price List",
        source_type: "Pricing",
        input_method: "file",
        file_name: "prices-2027.pdf",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("knowledge_id");
      expect(res.body.data.status).toBe("PROCESSING");
      expect(res.body.data.business_id).toBe("biz-002");
      expect(res.body.data.name).toBe("New Price List");
    });

    it("returns validation error when required fields are missing", async () => {
      const res = await request(app)
        .post("/knowledge")
        .send({ name: "Missing business_id" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns validation error for invalid source_type", async () => {
      const res = await request(app).post("/knowledge").send({
        business_id: "biz-002",
        name: "Test",
        source_type: "InvalidType",
        input_method: "manual",
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /knowledge/:id", () => {
    it("retrieves a specific entry by ID", async () => {
      // First create one, then fetch it
      const createRes = await request(app).post("/knowledge").send({
        business_id: "biz-001",
        name: "Test Entry",
        source_type: "Services",
        input_method: "manual",
      });

      const id = createRes.body.data.knowledge_id;
      const getRes = await request(app).get(`/knowledge/${id}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.knowledge_id).toBe(id);
    });

    it("returns 404 for a non-existent ID", async () => {
      const res = await request(app).get("/knowledge/non-existent-id");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("KNOWLEDGE_NOT_FOUND");
    });
  });

  describe("PATCH /knowledge/:id", () => {
    it("updates an existing entry's name and status", async () => {
      const createRes = await request(app).post("/knowledge").send({
        business_id: "biz-001",
        name: "Original Name",
        source_type: "Policies",
        input_method: "manual",
      });

      const id = createRes.body.data.knowledge_id;

      const patchRes = await request(app)
        .patch(`/knowledge/${id}`)
        .send({ name: "Updated Name", status: "READY" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.data.name).toBe("Updated Name");
      expect(patchRes.body.data.status).toBe("READY");
    });

    it("returns 404 when patching non-existent ID", async () => {
      const res = await request(app)
        .patch("/knowledge/non-existent-id")
        .send({ name: "Won't work" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("KNOWLEDGE_NOT_FOUND");
    });
  });

  describe("DELETE /knowledge/:id", () => {
    it("deletes an existing entry", async () => {
      const createRes = await request(app).post("/knowledge").send({
        business_id: "biz-001",
        name: "To Be Deleted",
        source_type: "Other",
        input_method: "manual",
      });

      const id = createRes.body.data.knowledge_id;

      const deleteRes = await request(app).delete(`/knowledge/${id}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.deleted).toBe(true);

      // Confirm it's gone
      const getRes = await request(app).get(`/knowledge/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 when deleting a non-existent ID", async () => {
      const res = await request(app).delete("/knowledge/non-existent-id");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("KNOWLEDGE_NOT_FOUND");
    });
  });
});
