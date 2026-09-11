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

  test("logStateTransition records system event type", () => {
    logStateTransition("job_1", "IDLE", "INGESTING");
    const trail = getAuditTrail("job_1");

    expect(trail).toHaveLength(1);
    expect(trail[0].type).toBe("system");
    expect(trail[0].label).toBe("system");
  });

  test("logClarificationSent records details and false required_approval", () => {
    logClarificationSent("job_1", ["What's your budget?"], 1);
    const trail = getAuditTrail("job_1");

    expect(trail[0].type).toBe("system");
    const details = JSON.parse(trail[0].detail ?? "{}");
    expect(details.required_approval).toBe(false);
    expect(details.questions).toEqual(["What's your budget?"]);
  });

  test("logQuoteApproved records sme event and true required_approval", () => {
    logQuoteApproved("job_1", 507000);
    const trail = getAuditTrail("job_1");

    expect(trail[0].type).toBe("sme");
    const details = JSON.parse(trail[0].detail ?? "{}");
    expect(details.required_approval).toBe(true);
    expect(details.quote_total).toBe(507000);
  });

  test("logQuoteEdited records the SME's changes", () => {
    logQuoteEdited("job_1", { total: 490000 });
    const trail = getAuditTrail("job_1");

    expect(trail[0].type).toBe("sme");
    const details = JSON.parse(trail[0].detail ?? "{}");
    expect(details.changes).toEqual({ total: 490000 });
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
    expect(trail.map((e) => e.type)).toEqual([
      "system",
      "system",
      "sme",
    ]);
  });
});