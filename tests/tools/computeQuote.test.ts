import { computeQuoteTool } from "../../src/agent/tools/computeQuote";
import { llmProvider } from "../../src/llm";

jest.mock("../../src/llm", () => ({
  llmProvider: { generateResponse: jest.fn() },
}));

// Mock fs so price catalog reads don't hit the real filesystem in tests
jest.mock("fs", () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      tiers: { standard: {} },
      field_completeness_rules: { required_for_quote: [] },
    })
  ),
}));

describe("computeQuoteTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses LLM response and returns a structured quote on SUCCESS", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      JSON.stringify({
        line_items: [
          { description: "Chairs & Tables", unit_price: 500, quantity: 200, total: 100000 },
          { description: "Decor Package", unit_price: 150000, quantity: 1, total: 150000 },
        ],
        contingencies: [
          { label: "Transport & Logistics (8%)", amount: 20000 },
          { label: "Fuel/Fluctuation Buffer (5%)", amount: 12500 },
        ],
        total_amount: 282500,
        validity_period_days: 7,
        status: "SUCCESS",
        error: null,
      })
    );

    const input = {
      job_id: "job-101",
      structured_brief: {
        event_type: "wedding",
        guest_count: 200,
        venue_location: "Lekki",
        budget_range: "standard",
        event_date: "2025-12-25",
      },
      business_type: "event_vendor" as const,
    };

    const result = await computeQuoteTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-101");
    expect(Array.isArray(result.line_items)).toBe(true);
    expect(result.line_items.length).toBeGreaterThan(0);
    expect(Array.isArray(result.contingencies)).toBe(true);
    expect(result.total_amount).toBe(282500);
    expect(result.validity_period_days).toBe(7);
    expect(result.error).toBeNull();
  });

  it("returns FAILED_RETRY when the LLM provider fails", async () => {
    (llmProvider.generateResponse as jest.Mock).mockRejectedValue(
      new Error("all providers failed")
    );

    const input = {
      job_id: "job-102",
      structured_brief: { event_type: "birthday", guest_count: 50 },
      business_type: "caterer" as const,
    };

    const result = await computeQuoteTool.invoke(input);

    expect(result.status).toBe("FAILED_RETRY");
    expect(result.error).toContain("all providers failed");
    expect(result.line_items).toEqual([]);
    expect(result.contingencies).toEqual([]);
    expect(result.total_amount).toBe(0);
  });

  it("returns FAILED_RETRY when the LLM response is not valid JSON", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      "Sorry, I could not compute the quote."
    );

    const input = {
      job_id: "job-103",
      structured_brief: { event_type: "corporate", guest_count: 300 },
      business_type: "event_vendor" as const,
    };

    const result = await computeQuoteTool.invoke(input);

    expect(result.status).toBe("FAILED_RETRY");
    expect(result.error).toBeTruthy();
  });

  it("uses safe defaults (empty arrays, 0, 7 days) when LLM JSON omits fields", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      JSON.stringify({ total_amount: 500000 })
    );

    const input = {
      job_id: "job-104",
      structured_brief: { event_type: "wedding", guest_count: 100 },
      business_type: "tailor" as const,
    };

    const result = await computeQuoteTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.line_items).toEqual([]);
    expect(result.contingencies).toEqual([]);
    expect(result.total_amount).toBe(500000);
    expect(result.validity_period_days).toBe(7);
  });

  it("fails validation if job_id is empty", async () => {
    const input = {
      job_id: "",
      structured_brief: { event_type: "wedding" },
      business_type: "event_vendor" as const,
    };

    await expect(computeQuoteTool.invoke(input)).rejects.toThrow();
  });
});
