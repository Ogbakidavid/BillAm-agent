import { simulateSendMessageTool } from "../../src/agent/tools/simulateSendMessage";

jest.mock("../../src/state/JobStore", () => ({
  appendMessage: jest.fn(),
  getJob: jest.fn(),
}));

jest.mock("../../src/state/auditLog", () => ({
  logClarificationSent: jest.fn(),
}));

describe("simulateSendMessageTool", () => {
  it("should send clarifying questions autonomously with required_approval false", async () => {
    const input = {
      job_id: "job-202",
      message_type: "clarifying_questions" as const,
      draft_message_to_client: "What is your event location?",
      sender: "business" as const,
      required_approval: false as const,
    };

    const result = await simulateSendMessageTool.invoke(input);

    expect(result).toBeDefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-202");
    expect(result.send_id).toMatch(/^send-/);
    expect(result.sent_at).toBeDefined();
    expect(result.error).toBeNull();
  });

  it("should reject message_type 'quote' — quotes are sent via SME dashboard only", async () => {
    // The new schema no longer accepts "quote" as a message_type.
    // This is now enforced at the TypeScript level — the union only allows
    // "clarifying_questions" | "general". This test documents that intent.
    const schemaCheck = (simulateSendMessageTool as any).inputSchema?.safeParse?.({
      job_id: "job-202",
      message_type: "quote",
      draft_message_to_client: "Here is your quote",
      sender: "business",
      required_approval: false,
    });
    expect(schemaCheck?.success).toBe(false);
  });

  it("should fail validation if draft_message_to_client is empty", async () => {
    const schemaCheck = (simulateSendMessageTool as any).inputSchema?.safeParse?.({
      job_id: "job-202",
      message_type: "general",
      draft_message_to_client: "",
      sender: "business",
      required_approval: false,
    });
    expect(schemaCheck?.success).toBe(false);
  });
});
