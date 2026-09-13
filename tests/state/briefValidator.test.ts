import { getMissingRequiredFields, isQuoteReady } from "../../src/state/briefValidator";

describe("briefValidator", () => {
  it("requires every configured quote field", () => {
    expect(getMissingRequiredFields("event_vendor", {})).toEqual([
      "event_type",
      "guest_count",
      "event_date",
      "venue_location",
      "budget_range",
    ]);
  });

  it("accepts a complete brief and an explicitly undecided venue", () => {
    const fields = {
      event_type: "wedding",
      guest_count: 120,
      event_date: "2026-10-10",
      venue_location: "not yet decided",
      budget_range: "around 500k",
    };

    expect(getMissingRequiredFields("event_vendor", fields)).toEqual([]);
    expect(isQuoteReady("event_vendor", fields)).toBe(true);
  });

  it("does not treat vague guest counts or unresolved dates as complete", () => {
    expect(
      getMissingRequiredFields("event_vendor", {
        event_type: "birthday",
        guest_count: "small",
        event_date: "next month",
        venue_location: "Ikeja",
        budget_range: "tight",
      }),
    ).toEqual(["guest_count", "event_date"]);
  });

  it("enforces the configured guest-count bounds", () => {
    expect(
      getMissingRequiredFields("event_vendor", {
        event_type: "corporate",
        guest_count: 0,
        event_date: "2026-11-01",
        venue_location: "Lekki",
        budget_range: "1m",
      }),
    ).toContain("guest_count");
  });
});
