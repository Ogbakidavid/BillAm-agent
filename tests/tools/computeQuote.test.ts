import { computeQuoteTool } from "../../src/agent/tools/computeQuote";

describe("computeQuoteTool", () => {
  it("should compute quote stub for valid structured brief input", async () => {
    const input = {
      job_id: "job-101",
      structured_brief: {
        event_type: "wedding",
        guest_count: 200,
        services: ["decoration", "lighting"],
      },
      business_type: "event_vendor" as const,
    };

    const result = await computeQuoteTool.invoke(input);

    expect(result).toBeDefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-101");
    expect(Array.isArray(result.line_items)).toBe(true);
    expect(Array.isArray(result.contingencies)).toBe(true);
    expect(typeof result.total_amount).toBe("number");
    expect(result.validity_period_days).toBe(7);
    expect(result.error).toBeNull();
  });

  it("should fail validation if job_id is empty", async () => {
    const input = {
      job_id: "",
      structured_brief: {},
      business_type: "event_vendor" as const,
    };

    await expect(computeQuoteTool.invoke(input)).rejects.toThrow();
  });
});
