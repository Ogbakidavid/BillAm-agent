/**
 * rateLimiterHook.ts
 *
 * Implements a Strands Agent plugin/hook to prevent runaway tool loops.
 */

import {
  Plugin,
  LocalAgent,
  BeforeInvocationEvent,
  BeforeToolCallEvent,
} from "@strands-agents/sdk";

const MAX_TOOL_CALLS_PER_INVOCATION = 5;

export class RateLimiterHook implements Plugin {
  name = "rate-limiter-hook";
  private toolCallCount = 0;

  initAgent(agent: LocalAgent): void {
    // Reset the counter at the start of every new invocation
    agent.addHook(BeforeInvocationEvent, () => {
      this.toolCallCount = 0;
    });

    // Intercept every tool call before execution
    agent.addHook(BeforeToolCallEvent, (event) => {
      this.toolCallCount += 1;

      if (this.toolCallCount > MAX_TOOL_CALLS_PER_INVOCATION) {
        console.warn(
          `[RATE LIMITER] ⚠️ Blocked tool call '${event.toolUse.name}'. Exceeded max ${MAX_TOOL_CALLS_PER_INVOCATION} calls.`,
        );
        // Canceling the event automatically sends the error message back to the model
        event.cancel = `Rate limit exceeded: You have made more than ${MAX_TOOL_CALLS_PER_INVOCATION} tool calls this turn. Please stop calling tools and respond to the user.`;
      }
    });
  }
}

// Export a singleton instance to be used in the agent loop
export const rateLimiterHook = new RateLimiterHook();
