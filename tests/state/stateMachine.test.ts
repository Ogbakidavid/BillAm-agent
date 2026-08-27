import { transitionJob, isValidTransition } from "../../src/state/stateMachine";

describe("stateMachine", () => {
  test("IDLE -> INGESTING is valid", () => {
    expect(isValidTransition("IDLE", "INGESTING")).toBe(true);
  });

  test("INGESTING -> REASONING is valid", () => {
    expect(isValidTransition("INGESTING", "REASONING")).toBe(true);
  });

  test("REASONING -> CLARIFYING is valid", () => {
    expect(isValidTransition("REASONING", "CLARIFYING")).toBe(true);
  });

  test("REASONING -> AWAITING_HUMAN_APPROVAL is valid", () => {
    expect(isValidTransition("REASONING", "AWAITING_HUMAN_APPROVAL")).toBe(true);
  });

  test("REASONING -> NEEDS_SME_INPUT is valid", () => {
    expect(isValidTransition("REASONING", "NEEDS_SME_INPUT")).toBe(true);
  });

  test("CLARIFYING -> INGESTING is valid (client replies)", () => {
    expect(isValidTransition("CLARIFYING", "INGESTING")).toBe(true);
  });

  test("AWAITING_HUMAN_APPROVAL -> EXECUTED is valid (SME approves)", () => {
    expect(isValidTransition("AWAITING_HUMAN_APPROVAL", "EXECUTED")).toBe(true);
  });

  test("NEEDS_SME_INPUT -> REASONING is valid (SME supplies missing fields)", () => {
    expect(isValidTransition("NEEDS_SME_INPUT", "REASONING")).toBe(true);
  });

  test("CLARIFYING -> EXECUTED is INVALID (v1 bug guard)", () => {
    const result = transitionJob("CLARIFYING", "EXECUTED");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Illegal transition");
  });

  test("IDLE -> EXECUTED is INVALID (can't skip the whole flow)", () => {
    expect(isValidTransition("IDLE", "EXECUTED")).toBe(false);
  });

  test("CLARIFYING -> AWAITING_HUMAN_APPROVAL is INVALID (quotes only come from REASONING)", () => {
    expect(isValidTransition("CLARIFYING", "AWAITING_HUMAN_APPROVAL")).toBe(false);
  });

  test("EXECUTED -> CLARIFYING is INVALID (no going backwards)", () => {
    expect(isValidTransition("EXECUTED", "CLARIFYING")).toBe(false);
  });
});