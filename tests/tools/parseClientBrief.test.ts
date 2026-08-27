import { parseClientBriefTool } from "../../src/agent/tools/parseClientBrief";

describe("parseClientBriefTool", () => {
  it("should successfully return stub parse result with valid inputs", async () => {
    const input = {
      job_id: "job-456",
      message_text: "I need 100 chairs and a stage backdrop for event on Sept 10",
      business_type: "event_vendor" as const,
      existing_fields: { guest_count: 100 },
    };

    const result = await parseClientBriefTool.invoke(input);

    expect(result).toBeDefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-456");
    expect(result.extracted_fields).toEqual({ guest_count: 100 });
    expect(Array.isArray(result.missing_required_fields)).toBe(true);
    expect(result.error).toBeNull();
  });

  it("should fail validation if job_id is empty", async () => {
    const input = {
      job_id: "",
      message_text: "Need decor",
      business_type: "event_vendor" as const,
    };

    await expect(parseClientBriefTool.invoke(input)).rejects.toThrow();
  });

  it("should fail validation if message_text is empty", async () => {
    const input = {
      job_id: "job-456",
      message_text: "",
      business_type: "event_vendor" as const,
    };

    await expect(parseClientBriefTool.invoke(input)).rejects.toThrow();
  });
});
