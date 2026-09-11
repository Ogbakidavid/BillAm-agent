import { rateLimiterHook } from "../../src/agent/hooks/rateLimiterHook";
import {
  LocalAgent,
  BeforeInvocationEvent,
  BeforeToolCallEvent,
} from "@strands-agents/sdk";

describe("Rate Limiter Hook", () => {
  let mockAgent: any;

  beforeEach(() => {
    mockAgent = {
      addHook: jest.fn(),
    };
  });

  it("should register exactly two hooks on initAgent", () => {
    rateLimiterHook.initAgent(mockAgent as unknown as LocalAgent);

    expect(mockAgent.addHook).toHaveBeenCalledTimes(2);

    // First hook should be BeforeInvocationEvent
    expect(mockAgent.addHook).toHaveBeenNthCalledWith(
      1,
      BeforeInvocationEvent,
      expect.any(Function),
    );

    // Second hook should be BeforeToolCallEvent
    expect(mockAgent.addHook).toHaveBeenNthCalledWith(
      2,
      BeforeToolCallEvent,
      expect.any(Function),
    );
  });

  it("should enforce the tool call rate limit (max 5)", () => {
    rateLimiterHook.initAgent(mockAgent as unknown as LocalAgent);

    // Extract the registered callback functions
    const beforeInvocationCallback = mockAgent.addHook.mock.calls[0][1];
    const beforeToolCallCallback = mockAgent.addHook.mock.calls[1][1];

    // Reset the counter by firing BeforeInvocationEvent
    beforeInvocationCallback();

    // Simulate 5 allowed tool calls
    for (let i = 0; i < 5; i++) {
      const event: any = { toolUse: { name: "test_tool" } };
      beforeToolCallCallback(event);
      expect(event.cancel).toBeUndefined(); // Should not be canceled
    }

    // Simulate the 6th tool call (which should trigger the rate limit)
    const blockedEvent: any = { toolUse: { name: "test_tool_6" } };
    beforeToolCallCallback(blockedEvent);

    expect(blockedEvent.cancel).toBeDefined();
    expect(blockedEvent.cancel).toMatch(/Rate limit exceeded/);
  });
});
