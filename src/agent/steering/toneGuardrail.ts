import { type Message } from "@strands-agents/sdk";
import { GoalLoop } from "@strands-agents/sdk/vended-plugins/goal";

/**
 * Tone Guardrail Steering
 *
 * Uses the GoalLoop plugin to enforce cheap, deterministic response checks.
 *
 * A natural-language GoalLoop goal creates an internal judge agent. That is
 * useful for complex quality evaluation, but it would make every BillAm turn
 * pay for another model call. These checks enforce the parts we can verify
 * without a second model: concise output, no raw JSON, and no leaked internal
 * implementation details. Tone remains primarily governed by the SOP.
 */

function responseText(response: Message): string {
  return response.content
    .flatMap((block) => (block.type === "textBlock" ? [block.text] : []))
    .join(" ")
    .trim();
}

export const toneGuardrail = new GoalLoop({
  goal: (response) => {
    const text = responseText(response);

    // Tool-only assistant messages do not need a client-facing tone check.
    if (!text) return true;

    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > 180) {
      return {
        passed: false,
        feedback: "Keep the client-facing response under 180 words and preserve the important details.",
      };
    }

    if (/```|\"(?:job_id|missing_required_fields|update_job_state|simulate_send_message)\"/.test(text)) {
      return {
        passed: false,
        feedback: "Rewrite the response as a natural client-facing message. Do not expose JSON, field names, or tool names.",
      };
    }

    return true;
  },
  // Retry only when a deterministic check fails; no internal LLM judge is used.
  maxAttempts: 2,
  timeout: 15_000,
});
