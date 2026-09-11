import { GoalLoop } from "@strands-agents/sdk/vended-plugins/goal";

// Mock the GoalLoop class before importing the guardrail
jest.mock("@strands-agents/sdk/vended-plugins/goal", () => {
  return {
    GoalLoop: jest.fn().mockImplementation((config) => config),
  };
});

import { toneGuardrail } from "../../src/agent/steering/toneGuardrail";

describe("Tone Guardrail Steering", () => {
  it("should initialize GoalLoop with the correct tone constraints and attempt limits", () => {
    // Because we mocked GoalLoop to return its config, toneGuardrail is actually the config object
    const config: any = toneGuardrail;

    expect(config).toBeDefined();

    // Verify attempt limit
    expect(config.maxAttempts).toBe(3);

    // Verify the goal string contains our key governance instructions
    expect(config.goal).toContain(
      "professional, empathetic, and highly concise",
    );
    expect(config.goal).toContain("Avoid overly complex jargon");

    // Verify the GoalLoop constructor was called
    expect(GoalLoop).toHaveBeenCalledTimes(1);
  });
});
