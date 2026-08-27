import {
  logStateTransition,
  logClarificationSent,
  logQuoteApproved,
  logQuoteEdited,
  getAuditTrail,
  _clearAuditLog,
} from "../../src/state/auditLog";

describe("auditLog", () => {
  beforeEach(() => {
    _clearAuditLog();
  });

  test("logStateTransition records from and to state", () => {
    logStateTransition("job_1", "IDLE", "INGESTING");
    const trail = getAuditTrail("job_1");

    expect(trail).toHaveLength(1);
    expect(trail[0].event_type).toBe("STATE_TRANSITION");
    expect(trail[0].from_state).toBe("IDLE");
    expect(trail[0].to_state).toBe("INGESTING");
  });

  test("logClarificationSent always sets required_approval to false", () => {
    logClarificationSent("job_1", ["What's your budget?"], 1);
    const trail = getAuditTrail("job_1");

    expect(trail[0].event_type).toBe("CLARIFICATION_SENT");
    expect(trail[0].details?.required_approval).toBe(false);
  });

  test("logQuoteApproved always sets required_approval to true", () => {
    logQuoteApproved("job_1", 507000);
    const trail = getAuditTrail("job_1");

    expect(trail[0].event_type).toBe("QUOTE_APPROVED");
    expect(trail[0].details?.required_approval).toBe(true);
    expect(trail[0].actor).toBe("sme");
  });

  test("logQuoteEdited records the SME's changes", () => {
    logQuoteEdited("job_1", { total: 490000 });
    const trail = getAuditTrail("job_1");

    expect(trail[0].event_type).toBe("QUOTE_EDITED");
    expect(trail[0].details?.changes).toEqual({ total: 490000 });
  });

  test("getAuditTrail only returns events for the given job", () => {
    logStateTransition("job_1", "IDLE", "INGESTING");
    logStateTransition("job_2", "IDLE", "INGESTING");

    expect(getAuditTrail("job_1")).toHaveLength(1);
    expect(getAuditTrail("job_2")).toHaveLength(1);
  });

  test("getAuditTrail preserves order across multiple events on one job", () => {
    logStateTransition("job_1", "IDLE", "INGESTING");
    logClarificationSent("job_1", ["question"], 1);
    logQuoteApproved("job_1", 100000);

    const trail = getAuditTrail("job_1");
    expect(trail.map((e) => e.event_type)).toEqual([
      "STATE_TRANSITION",
      "CLARIFICATION_SENT",
      "QUOTE_APPROVED",
    ]);
  });
});