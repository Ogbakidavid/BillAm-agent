import { ingestChatMessageTool } from "../../src/agent/tools/ingestChatMessage";

describe("ingestChatMessageTool", () => {
  it("should successfully ingest a client message with valid inputs", async () => {
    const input = {
      job_id: "job-123",
      message_text: "Hello, I need event decor for a wedding",
      business_type: "event_vendor" as const,
      received_at: "2026-08-27T20:00:00.000Z",
    };

    const result = await ingestChatMessageTool.invoke(input);

    expect(result).toBeDefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-123");
    expect(result.error).toBeNull();
  });

  it("should generate a fallback job_id if not provided", async () => {
    const input = {
      message_text: "Inquiry about catering service",
      business_type: "caterer" as const,
      received_at: "2026-08-27T20:00:00.000Z",
    };

    const result = await ingestChatMessageTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-placeholder-id");
  });

  it("should fail validation if message_text is empty", async () => {
    const input = {
      job_id: "job-123",
      message_text: "",
      business_type: "event_vendor" as const,
      received_at: "2026-08-27T20:00:00.000Z",
    };

    await expect(ingestChatMessageTool.invoke(input)).rejects.toThrow();
  });
});
