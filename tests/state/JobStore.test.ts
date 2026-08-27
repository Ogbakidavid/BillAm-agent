import {
  createJob,
  getJob,
  appendMessage,
  mergeExtractedFields,
  updateJobState,
  updateMissingFields,
  _clearAllJobs,
} from "../../src/state/JobStore";
import { ChatMessage } from "../../src/types/Job";

function makeMessage(text: string): ChatMessage {
  return {
    message_id: "msg_" + Math.random(),
    job_id: "temp",
    sender: "client",
    message_type: "TEXT",
    text,
    required_approval: false,
    created_at: new Date(),
  };
}

describe("JobStore", () => {
  beforeEach(() => {
    _clearAllJobs();
  });

  test("createJob creates a new job with the first message", () => {
    const msg = makeMessage("small wedding, 150 people");
    const job = createJob("biz_001", "event_vendor", msg);

    expect(job.job_id).toBeDefined();
    expect(job.business_id).toBe("biz_001");
    expect(job.business_type).toBe("event_vendor");
    expect(job.state).toBe("IDLE");
    expect(job.messages).toHaveLength(1);
    expect(job.messages[0].text).toBe("small wedding, 150 people");
  });

  test("getJob retrieves an existing job by id", () => {
    const msg = makeMessage("hello");
    const created = createJob("biz_001", "event_vendor", msg);

    const fetched = getJob(created.job_id);
    expect(fetched).toBeDefined();
    expect(fetched?.job_id).toBe(created.job_id);
  });

  test("getJob returns undefined for an unknown job id", () => {
    expect(getJob("does-not-exist")).toBeUndefined();
  });

  test("appendMessage adds to an existing job's messages, not a new job", () => {
    const first = createJob("biz_001", "event_vendor", makeMessage("first message"));
    const updated = appendMessage(first.job_id, makeMessage("second message"));

    expect(updated?.messages).toHaveLength(2);
    expect(updated?.messages[1].text).toBe("second message");
    expect(updated?.job_id).toBe(first.job_id);
  });

  test("mergeExtractedFields merges new fields without wiping existing ones", () => {
    const job = createJob("biz_001", "event_vendor", makeMessage("brief"));

    mergeExtractedFields(job.job_id, { guest_count: 150 });
    const afterSecondMerge = mergeExtractedFields(job.job_id, { event_type: "wedding" });

    expect(afterSecondMerge?.extracted_fields.guest_count).toBe(150);
    expect(afterSecondMerge?.extracted_fields.event_type).toBe("wedding");
  });

  test("updateJobState persists the new state", () => {
    const job = createJob("biz_001", "event_vendor", makeMessage("brief"));
    const updated = updateJobState(job.job_id, "REASONING");

    expect(updated?.state).toBe("REASONING");
  });

  test("updateMissingFields sets missing_required_fields", () => {
    const job = createJob("biz_001", "event_vendor", makeMessage("brief"));
    const updated = updateMissingFields(job.job_id, ["event_date", "budget_range"]);

    expect(updated?.missing_required_fields).toEqual(["event_date", "budget_range"]);
  });
});