import { updateJobStateTool } from "../../src/agent/tools/updateJobState";

jest.mock("../../src/state/JobStore", () => ({
  getJob: jest.fn(),
  updateJobState: jest.fn(),
  mergeExtractedFields: jest.fn(),
  updateMissingFields: jest.fn(),
  appendMessage: jest.fn(),
}));

jest.mock("../../src/state/auditLog", () => ({
  logStateTransition: jest.fn(),
  logEvent: jest.fn(),
}));

jest.mock("../../src/state/stateMachine", () => ({
  transitionJob: jest.fn(),
}));

import * as JobStore from "../../src/state/JobStore";
import * as AuditLog from "../../src/state/auditLog";
import { transitionJob } from "../../src/state/stateMachine";

const mockGetJob = JobStore.getJob as jest.Mock;
const mockUpdateJobState = JobStore.updateJobState as jest.Mock;
const mockMergeExtractedFields = JobStore.mergeExtractedFields as jest.Mock;
const mockUpdateMissingFields = JobStore.updateMissingFields as jest.Mock;
const mockTransitionJob = transitionJob as jest.Mock;

const mockJob = {
  job_id: "job-001",
  business_type: "event_vendor",
  state: "REASONING",
  messages: [],
  extracted_fields: {},
  missing_required_fields: [],
  clarification_round: 0,
};

describe("updateJobStateTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetJob.mockReturnValue({ ...mockJob });
    mockTransitionJob.mockReturnValue({ success: true });
  });

  it("transitions job state successfully", async () => {
    const result = await updateJobStateTool.invoke(
      { job_id: "job-001", new_state: "CLARIFYING" },
    );

    expect(mockTransitionJob).toHaveBeenCalledWith("REASONING", "CLARIFYING");
    expect(mockUpdateJobState).toHaveBeenCalledWith("job-001", "CLARIFYING");
    expect(result).toMatchObject({
      job_id: "job-001",
      previous_state: "REASONING",
      new_state: "CLARIFYING",
      status: "SUCCESS",
    });
  });

  it("merges extracted fields when provided", async () => {
    await updateJobStateTool.invoke(
      {
        job_id: "job-001",
        new_state: "CLARIFYING",
        extracted_fields: { event_type: "wedding" },
      },
      {} as any,
    );
    expect(mockMergeExtractedFields).toHaveBeenCalledWith("job-001", {
      event_type: "wedding",
    });
  });

  it("updates missing fields when provided", async () => {
    await updateJobStateTool.invoke(
      {
        job_id: "job-001",
        new_state: "CLARIFYING",
        missing_required_fields: ["guest_count"],
      },
      {} as any,
    );
    expect(mockUpdateMissingFields).toHaveBeenCalledWith("job-001", [
      "event_type",
      "guest_count",
      "event_date",
      "venue_location",
      "budget_range",
    ]);
  });

  it("throws when job is not found", async () => {
    mockGetJob.mockReturnValue(undefined);
    await expect(
      updateJobStateTool.invoke(
        { job_id: "nonexistent", new_state: "CLARIFYING" },
        {} as any,
      ),
    ).rejects.toThrow("Job not found: nonexistent");
  });

  it("throws when state transition is invalid", async () => {
    mockTransitionJob.mockReturnValue({
      success: false,
      error: "Cannot go from REASONING to EXECUTED",
    });
    await expect(
      updateJobStateTool.invoke(
        { job_id: "job-001", new_state: "EXECUTED" },
        {} as any,
      ),
    ).rejects.toThrow("Invalid state transition");
  });
});
