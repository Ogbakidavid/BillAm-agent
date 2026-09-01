import { runAgentLoop, handleClientReply } from "../../src/agent/orchestration/agentLoop";
import * as JobStore from "../../src/state/JobStore";
import { parseClientBriefTool } from "../../src/agent/tools/parseClientBrief";
import { generateClarifyingQuestionsTool } from "../../src/agent/tools/generateClarifyingQuestions";
import { computeQuoteTool } from "../../src/agent/tools/computeQuote";
import { simulateSendMessageTool } from "../../src/agent/tools/simulateSendMessage";

jest.mock("../../src/agent/tools/parseClientBrief");
jest.mock("../../src/agent/tools/generateClarifyingQuestions");
jest.mock("../../src/agent/tools/computeQuote");
jest.mock("../../src/agent/tools/simulateSendMessage");

function makeJobWithMessage(text: string) {
  return JobStore.createJob("biz_1", "event_vendor", {
    message_id: "m1",
    job_id: "temp",
    sender: "client",
    message_type: "TEXT",
    text,
    required_approval: false,
    created_at: new Date(),
  });
}

describe("End-to-End Agent Loop Integration (BE-14)", () => {
  beforeEach(() => {
    JobStore._clearAllJobs();
    jest.clearAllMocks();
  });

  it("Full autonomous clarification flow: INGESTING -> REASONING -> CLARIFYING -> INGESTING", async () => {
    const job = makeJobWithMessage("wedding, 100 people");

    (parseClientBriefTool.invoke as jest.Mock).mockResolvedValue({
      job_id: job.job_id,
      extracted_fields: { event_type: "wedding", guest_count: 100 },
      missing_required_fields: ["event_date", "venue_location", "budget_range"],
      status: "SUCCESS",
      error: null,
    });
    (generateClarifyingQuestionsTool.invoke as jest.Mock).mockResolvedValue({
      job_id: job.job_id,
      questions: ["What date?", "Where's the venue?"],
      draft_message_to_client: "What date?\nWhere's the venue?",
      status: "SUCCESS",
      error: null,
    });
    (simulateSendMessageTool.invoke as jest.Mock).mockResolvedValue({
      send_id: "s1",
      job_id: job.job_id,
      status: "SUCCESS",
      sent_at: new Date().toISOString(),
      error: null,
    });

    const result = await runAgentLoop(job.job_id);

    expect(result.state).toBe("CLARIFYING");
    expect(result.clarification_round).toBe(1);
    expect(simulateSendMessageTool.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ required_approval: false, message_type: "clarifying_questions" })
    );

    handleClientReply(job.job_id);
    const afterReply = JobStore.getJob(job.job_id);
    expect(afterReply?.state).toBe("INGESTING");
  });

  it("Full quote generation flow: REASONING -> AWAITING_HUMAN_APPROVAL", async () => {
    const job = makeJobWithMessage("wedding, 100 people, 15th Oct, Lekki, budget 500k");

    (parseClientBriefTool.invoke as jest.Mock).mockResolvedValue({
      job_id: job.job_id,
      extracted_fields: {
        event_type: "wedding",
        guest_count: 100,
        event_date: "2026-10-15",
        venue_location: "Lekki",
        budget_range: "500k",
      },
      missing_required_fields: [],
      status: "SUCCESS",
      error: null,
    });
    (computeQuoteTool.invoke as jest.Mock).mockResolvedValue({
      job_id: job.job_id,
      line_items: [{ label: "Decor", amount: 200000 }],
      contingencies: [{ label: "Transport", amount: 16000 }],
      total_amount: 216000,
      validity_period_days: 7,
      status: "SUCCESS",
      error: null,
    });

    const result = await runAgentLoop(job.job_id);

    expect(result.state).toBe("AWAITING_HUMAN_APPROVAL");
    expect(result.quote?.total).toBe(216000);
    expect(result.quote?.line_items[0].name).toBe("Decor");
    expect(simulateSendMessageTool.invoke).not.toHaveBeenCalled();
  });

  it("Escalation flow after round 2 clarification: REASONING -> NEEDS_SME_INPUT", async () => {
    const job = makeJobWithMessage("small event");
    JobStore.updateJobState(job.job_id, "IDLE");
    (JobStore.getJob(job.job_id) as any).clarification_round = 2;

    (parseClientBriefTool.invoke as jest.Mock).mockResolvedValue({
      job_id: job.job_id,
      extracted_fields: { event_type: "wedding" },
      missing_required_fields: ["guest_count", "event_date"],
      status: "SUCCESS",
      error: null,
    });

    const result = await runAgentLoop(job.job_id);

    expect(result.state).toBe("NEEDS_SME_INPUT");
    expect(generateClarifyingQuestionsTool.invoke).not.toHaveBeenCalled();
  });

  it("Failure flow: parse error -> FAILED_RETRY", async () => {
    const job = makeJobWithMessage("garbled input");

    (parseClientBriefTool.invoke as jest.Mock).mockResolvedValue({
      job_id: job.job_id,
      extracted_fields: {},
      missing_required_fields: [],
      status: "FAILED_RETRY",
      error: "LLM provider unavailable",
    });

    const result = await runAgentLoop(job.job_id);

    expect(result.state).toBe("FAILED_RETRY");
    expect(result.error_message).toBe("LLM provider unavailable");
  });
});