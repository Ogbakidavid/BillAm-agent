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

    // The guardrail uses a programmatic validator so normal responses do not
    // trigger a second LLM judge call.
    expect(typeof config.goal).toBe("function");
    expect(config.maxAttempts).toBe(2);
    expect(config.timeout).toBe(15_000);

    // Verify the GoalLoop constructor was called
    expect(GoalLoop).toHaveBeenCalledTimes(1);
  });
});
