import { generateClarifyingQuestionsTool } from "../../src/agent/tools/generateClarifyingQuestions";
import { llmProvider } from "../../src/llm";

jest.mock("../../src/llm", () => ({
  llmProvider: { generateResponse: jest.fn() },
}));

describe("generateClarifyingQuestionsTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts questions from LLM response and returns them for round 1", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      "1. What is the event date?\n2. Where will the event be held?\n3. How many guests are expected?"
    );

    const input = {
      job_id: "job-789",
      missing_required_fields: ["event_date", "venue_location", "guest_count"],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    const result = await generateClarifyingQuestionsTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-789");
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.draft_message_to_client).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("accepts valid round 2 input and returns SUCCESS", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      "1. What is your budget range?"
    );

    const input = {
      job_id: "job-789",
      missing_required_fields: ["budget_range"],
      business_type: "event_vendor" as const,
      clarification_round: 2,
    };

    const result = await generateClarifyingQuestionsTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.questions.length).toBeGreaterThan(0);
  });

  it("returns FAILED_RETRY when the LLM provider fails", async () => {
    (llmProvider.generateResponse as jest.Mock).mockRejectedValue(
      new Error("all providers failed")
    );

    const input = {
      job_id: "job-789",
      missing_required_fields: ["event_date"],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    const result = await generateClarifyingQuestionsTool.invoke(input);

    expect(result.status).toBe("FAILED_RETRY");
    expect(result.error).toContain("all providers failed");
    expect(result.questions).toEqual([]);
    expect(result.draft_message_to_client).toBe("");
  });

  it("caps questions at 5 even if LLM returns more", async () => {
    (llmProvider.generateResponse as jest.Mock).mockResolvedValue(
      "1. Q1?\n2. Q2?\n3. Q3?\n4. Q4?\n5. Q5?\n6. Q6?\n7. Q7?"
    );

    const input = {
      job_id: "job-789",
      missing_required_fields: ["event_date", "venue_location", "guest_count", "budget_range", "event_type", "catering_included", "lighting"],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    const result = await generateClarifyingQuestionsTool.invoke(input);

    expect(result.questions.length).toBeLessThanOrEqual(5);
  });

  it("ENFORCES MAX 2 ROUNDS INVARIANT: fails validation if clarification_round > 2", async () => {
    const input = {
      job_id: "job-789",
      missing_required_fields: ["budget_range"],
      business_type: "event_vendor" as const,
      clarification_round: 3,
    };

    await expect(generateClarifyingQuestionsTool.invoke(input)).rejects.toThrow();
  });

  it("fails validation if missing_required_fields is empty", async () => {
    const input = {
      job_id: "job-789",
      missing_required_fields: [],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    await expect(generateClarifyingQuestionsTool.invoke(input)).rejects.toThrow();
  });

  it("fails validation if job_id is empty", async () => {
    const input = {
      job_id: "",
      missing_required_fields: ["event_date"],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    await expect(generateClarifyingQuestionsTool.invoke(input)).rejects.toThrow();
  });
});
