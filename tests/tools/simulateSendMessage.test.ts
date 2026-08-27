import { simulateSendMessageTool } from "../../src/agent/tools/simulateSendMessage";

describe("simulateSendMessageTool", () => {
  it("should send clarifying questions autonomously with required_approval false", async () => {
    const input = {
      job_id: "job-202",
      message_type: "clarifying_questions" as const,
      draft_message_to_client: "What is your event location?",
      sender: "business" as const,
      required_approval: false,
    };

    const result = await simulateSendMessageTool.invoke(input);

    expect(result).toBeDefined();
    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-202");
    expect(result.send_id).toMatch(/^send-/);
    expect(result.sent_at).toBeDefined();
    expect(result.error).toBeNull();
  });

  it("should allow sending quote message when required_approval is true (SME approved)", async () => {
    const input = {
      job_id: "job-202",
      message_type: "quote" as const,
      draft_message_to_client: "Here is your quote of ₦150,000",
      sender: "business" as const,
      required_approval: true,
    };

    const result = await simulateSendMessageTool.invoke(input);

    expect(result.status).toBe("SUCCESS");
    expect(result.job_id).toBe("job-202");
  });

  it("should ENFORCE SME APPROVAL INVARIANT: fail validation if message_type is quote but required_approval is false", async () => {
    const input = {
      job_id: "job-202",
      message_type: "quote" as const,
      draft_message_to_client: "Attempting unapproved quote send",
      sender: "business" as const,
      required_approval: false,
    };

    await expect(simulateSendMessageTool.invoke(input)).rejects.toThrow(
      /Quote messages MUST have required_approval set to true/
    );
  });

  it("should fail validation if draft_message_to_client is empty", async () => {
    const input = {
      job_id: "job-202",
      message_type: "general" as const,
      draft_message_to_client: "",
      sender: "business" as const,
      required_approval: false,
    };

    await expect(simulateSendMessageTool.invoke(input)).rejects.toThrow();
  });
});
