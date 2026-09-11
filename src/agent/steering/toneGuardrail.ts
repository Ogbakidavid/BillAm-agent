import { GoalLoop } from "@strands-agents/sdk/vended-plugins/goal";

/**
 * Tone Guardrail Steering
 *
 * Uses the GoalLoop plugin to enforce runtime governance on the agent's tone.
 * This prevents the system prompt from being bloated with tone instructions.
 * The internal judge will evaluate the agent's response and force a retry
 * (up to 3 times) if the tone is not met.
 */
export const toneGuardrail = new GoalLoop({
  // Natural-language string judged by the internal judge agent
  goal:
    "The response must maintain a professional, empathetic, and highly concise tone. " +
    "Avoid overly complex jargon unless explicitly requested by the user. " +
    "Ensure the user feels supported. If the response sounds robotic, dismissive, or overly casual, it fails.",
  maxAttempts: 3,
});
