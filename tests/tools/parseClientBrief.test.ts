import { parseClientBriefTool } from "../../src/agent/tools/parseClientBrief";
import { llmProvider } from "../../src/llm";

jest.mock("../../src/llm", () => ({
  llmProvider: { generateResponse: jest.fn() },
}));

describe("parseClientBriefTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts fields and merges with existing ones from the LLM response", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      JSON.stringify({
        job_id: "job-456",
        extracted_fields: { event_type: "wedding", venue_location: "Lekki" },
        missing_required_fields: [],
        status: "SUCCESS",
        error: null,
      })
    );

    const input = {
      job_id: "job-456",
      message_text: "wedding in Lekki",
      business_type: "event_vendor" as const,
      existing_fields: { guest_count: 100 },
    };

    const result = await parseClientBriefTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.extracted_fields.guest_count).toBe(100);
    expect(result.extracted_fields.event_type).toBe("wedding");
  });

  it("computes missing_required_fields from the knowledge base, not the LLM response", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      JSON.stringify({
        extracted_fields: { event_type: "wedding" },
      })
    );

    const input = {
      job_id: "job-1",
      message_text: "wedding, not sure on details yet",
      business_type: "event_vendor" as const,
    };

    const result = await parseClientBriefTool.invoke(input);

    expect(result.missing_required_fields).toEqual(
      expect.arrayContaining(["guest_count", "event_date", "venue_location", "budget_range"])
    );
    expect(result.missing_required_fields).not.toContain("event_type");
  });

  it("returns FAILED_RETRY when the LLM provider fails", async () => {
    (llmProvider.generateResponse as jest.Mock).mockRejectedValue(
      new Error("all providers failed")
    );

    const input = {
      job_id: "job-2",
      message_text: "small wedding",
      business_type: "event_vendor" as const,
    };

    const result = await parseClientBriefTool.invoke(input);

    expect(result.status).toBe("FAILED_RETRY");
    expect(result.error).toContain("all providers failed");
  });

  it("returns FAILED_RETRY when the LLM response isn't valid JSON", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue("not json at all");

    const input = {
      job_id: "job-3",
      message_text: "hello",
      business_type: "event_vendor" as const,
    };

    const result = await parseClientBriefTool.invoke(input);

    expect(result.status).toBe("FAILED_RETRY");
  });

  it("fails validation if job_id is empty", async () => {
    const input = { job_id: "", message_text: "Need decor", business_type: "event_vendor" as const };
    await expect(parseClientBriefTool.invoke(input)).rejects.toThrow();
  });

  it("fails validation if message_text is empty", async () => {
    const input = { job_id: "job-456", message_text: "", business_type: "event_vendor" as const };
    await expect(parseClientBriefTool.invoke(input)).rejects.toThrow();
  });
});