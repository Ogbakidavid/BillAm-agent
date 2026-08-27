import { generateClarifyingQuestionsTool } from "../../src/agent/tools/generateClarifyingQuestions";

describe("generateClarifyingQuestionsTool", () => {
  it("should generate clarifying questions stub for valid round 1 input", async () => {
    const input = {
      job_id: "job-789",
      missing_required_fields: ["event_date", "location"],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    const result = await generateClarifyingQuestionsTool.invoke(input);

    expect(result).toBeDefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-789");
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.error).toBeNull();
  });

  it("should accept valid round 2 input", async () => {
    const input = {
      job_id: "job-789",
      missing_required_fields: ["budget"],
      business_type: "event_vendor" as const,
      clarification_round: 2,
    };

    const result = await generateClarifyingQuestionsTool.invoke(input);
    expect(result.status).toBe("SUCCESS");
  });

  it("should ENFORCE MAX 2 ROUNDS INVARIANT: fail validation if clarification_round > 2", async () => {
    const input = {
      job_id: "job-789",
      missing_required_fields: ["budget"],
      business_type: "event_vendor" as const,
      clarification_round: 3,
    };

    await expect(generateClarifyingQuestionsTool.invoke(input)).rejects.toThrow();
  });

  it("should fail validation if missing_required_fields is empty", async () => {
    const input = {
      job_id: "job-789",
      missing_required_fields: [],
      business_type: "event_vendor" as const,
      clarification_round: 1,
    };

    await expect(generateClarifyingQuestionsTool.invoke(input)).rejects.toThrow();
  });
});
