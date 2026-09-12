/**
 * updateJobState.ts
 * Capability tool that persists job state changes to the JobStore.
 *
 * ARCHITECTURAL NOTE:
 * The Agent calls this tool to explicitly write state transitions, extracted
 * fields, missing fields, the computed quote, and clarification round updates.
 * This replaces the ad-hoc direct JobStore mutations that lived in agentLoop.ts.
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import * as JobStore from "../../state/JobStore";
import * as AuditLog from "../../state/auditLog";
import { transitionJob } from "../../state/stateMachine";
import { JobState } from "../../types/Job";
import { randomInt, randomUUID } from "crypto";

function buildQuoteReviewMessage(businessType: string): string {
  const messages: Record<string, string[]> = {
    caterer: [
      "Thanks for sharing the event details. I’ve put together the catering quote for the business owner to review, and we’ll come back to you once it’s approved.",
      "That gives us what we need to price the catering properly. The quote is now with the business owner for review, and we’ll update you shortly.",
      "I’ve captured the catering requirements and prepared the quote for the business owner’s review. We’ll follow up as soon as there’s an approval update.",
      "We have enough detail to move forward with the catering estimate. The business owner is reviewing it now, and we’ll be back in touch shortly.",
      "Your catering brief is complete. I’ve sent the quote for internal review and will share the next step once the business owner has looked it over.",
    ],
    photographer: [
      "Great, I have the details needed for your photography quote. It’s ready for the business owner’s review, and we’ll get back to you after approval.",
      "Thanks, that’s everything we need to shape the photography quote. The business owner will review it and come back to you soon.",
      "I’ve got the photography brief covered and prepared the quote for review. We’ll follow up once the business owner has confirmed it.",
      "Perfect, the photography requirements are clear now. The quote is with the business owner, and we’ll update you with the next step shortly.",
      "The photography quote is ready for an internal review. Thanks for the clear details — we’ll be in touch after the business owner responds.",
    ],
    tailor: [
      "Perfect, I’ve captured the outfit requirements. The quote is ready for the business owner to review, and we’ll be in touch once it’s approved.",
      "I have the details needed for your outfit request. I’m sending the quote to the business owner for review and will update you shortly.",
      "Your outfit brief is all set. I’ve prepared the quote for the business owner to review, and we’ll come back to you with an update.",
      "Thanks, I understand the tailoring requirements now. The quote is under review with the business owner, and we’ll follow up soon.",
      "I’ve put together the quote based on the outfit details you shared. The business owner will review it before we confirm the next step.",
    ],
    event_planner: [
      "Thanks, I’ve got the event brief. The planning quote is now ready for the business owner’s review, and we’ll come back to you with the next step.",
      "That’s enough detail for us to prepare the event quote. The business owner will review it and we’ll follow up once it’s approved.",
      "The event brief is complete and the planning quote is ready for internal review. We’ll let you know as soon as the business owner responds.",
      "I’ve captured the key planning requirements and sent the quote to the business owner for review. We’ll be back with the next step shortly.",
      "Thanks, we have a clear picture of the event now. The business owner is reviewing the planning quote, and we’ll follow up with an update.",
    ],
    equipment_rental: [
      "Thanks for the equipment details. I’ve prepared the rental quote for the business owner to review, and we’ll confirm the next step soon.",
      "I have what I need for the equipment request. The quote is now with the business owner for review, and we’ll get back to you shortly.",
      "The equipment requirements are clear, so I’ve prepared the rental quote for internal review. We’ll confirm the next step once it’s checked.",
      "Thanks, I’ve captured the rental details. The business owner is reviewing the quote now, and we’ll update you shortly.",
      "Your equipment request is ready for review. I’ve sent the quote to the business owner and will come back to you once it has been confirmed.",
    ],
    event_vendor: [
      "Thanks, I’ve captured the full event brief. The quote is ready for the business owner’s review, and we’ll update you once it’s approved.",
      "That gives us everything needed to prepare your event quote. It’s now with the business owner for review, and we’ll follow up shortly.",
      "I’ve got the full event details and prepared the quote for internal review. We’ll get back to you as soon as the business owner responds.",
      "Perfect, the event requirements are clear now. The business owner is reviewing the quote, and we’ll share the next step shortly.",
      "Your event brief is complete and the quote is ready for review. Thanks for the details — we’ll follow up once it’s been checked.",
    ],
  };
  const options = messages[businessType] ?? messages.event_vendor;
  return options[randomInt(options.length)];
}

function buildFailedRetryMessage(businessType: string): string {
  if (businessType === "caterer") {
    return "Thanks for sharing the event details. I’m reviewing the catering options with the business owner so we can recommend something suitable for your needs.";
  }
  return "Thanks for the details. I’m reviewing the best way to scope this request with the business owner so we can come back with practical options.";
}

const lineItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  total: z.number(),
});

const contingencySchema = z.object({
  label: z.string(),
  rate: z.number().nullable(),
  amount: z.number(),
});

const quoteSchema = z.object({
  line_items: z.array(lineItemSchema),
  contingencies: z.array(contingencySchema),
  subtotal: z.number(),
  total: z.number(),
  draft_message_to_client: z.string(),
  validity_period_days: z.number().default(7),
});

const updateJobStateInputSchema = z.object({
  job_id: z.string().min(1),
  new_state: z.enum([
    "IDLE",
    "INGESTING",
    "REASONING",
    "CLARIFYING",
    "NEEDS_SME_INPUT",
    "AWAITING_HUMAN_APPROVAL",
    "EXECUTED",
    "FAILED_RETRY",
  ]),
  extracted_fields: z.record(z.string(), z.any()).optional(),
  missing_required_fields: z.array(z.string()).optional(),
  clarification_round: z.number().int().min(0).max(2).optional(),
  quote: quoteSchema.optional(),
  error_message: z.string().optional(),
});

export type UpdateJobStateInput = z.infer<typeof updateJobStateInputSchema>;

export const updateJobStateTool = tool({
  name: "update_job_state",
  description:
    "Persists all job state changes to the central JobStore. " +
    "Call this after each major reasoning step to record: the new job state, " +
    "any newly extracted brief fields, remaining missing fields, clarification round number, " +
    "or a computed quote. This is the ONLY way to write state — never mutate the store directly. " +
    "For quote saves, include the full quote object and set new_state to AWAITING_HUMAN_APPROVAL.",
  inputSchema: updateJobStateInputSchema,
  callback: async (input: UpdateJobStateInput) => {
    const job = JobStore.getJob(input.job_id);
    if (!job) {
      throw new Error(`Job not found: ${input.job_id}`);
    }

    // Validate and apply state transition
    // Agents may persist fields while continuing to reason.  That is a data
    // update, not a state transition, so a REASONING → REASONING write must
    // not consume a tool turn or fail the whole workflow.
    const isStateUnchanged = job.state === input.new_state;
    const transition = isStateUnchanged
      ? { success: true, error: null }
      : transitionJob(job.state, input.new_state as JobState);
    if (!transition.success) {
      throw new Error(
        `Invalid state transition ${job.state} → ${input.new_state}: ${transition.error}`,
      );
    }

    AuditLog.logStateTransition(
      input.job_id,
      job.state,
      input.new_state as JobState,
    );

    // Apply all updates atomically
    if (input.extracted_fields) {
      JobStore.mergeExtractedFields(input.job_id, input.extracted_fields);
    }

    if (input.missing_required_fields !== undefined) {
      JobStore.updateMissingFields(input.job_id, input.missing_required_fields);
    }

    if (input.clarification_round !== undefined) {
      const currentJob = JobStore.getJob(input.job_id);
      if (currentJob) {
        currentJob.clarification_round = input.clarification_round;
      }
    }

    if (input.quote) {
      const currentJob = JobStore.getJob(input.job_id);
      if (currentJob) {
        currentJob.quote = {
          id: `q-${Date.now()}`,
          job_id: input.job_id,
          line_items: input.quote.line_items.map((li, i) => ({
            id: `li-${Date.now()}-${i}`,
            ...li,
          })),
          contingencies: input.quote.contingencies.map((c, i) => ({
            id: `c-${Date.now()}-${i}`,
            label: c.label,
            amount: c.amount,
            rate: c.rate || 0,
          })),
          subtotal: input.quote.subtotal,
          total: input.quote.total,
          currency: "NGN",
          validity_days: input.quote.validity_period_days,
          payment_terms:
            "50% deposit to confirm booking, balance due 3 days before the event.",
          assumptions: [],
          draft_message: input.quote.draft_message_to_client,
          status: "awaiting_approval",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    }

    if (input.error_message) {
      const currentJob = JobStore.getJob(input.job_id);
      if (currentJob) {
        currentJob.error_message = input.error_message;
      }
    }

    JobStore.updateJobState(input.job_id, input.new_state as JobState);

    // A draft quote intentionally remains hidden until SME approval, but the
    // client must still receive a visible acknowledgement in the live chat.
    // Persist it here so it cannot be lost when the model finishes after
    // saving the quote without separately calling simulate_send_message.
    if (input.quote && input.new_state === "AWAITING_HUMAN_APPROVAL") {
      const currentJob = JobStore.getJob(input.job_id);
      const lastMessage = currentJob?.messages[currentJob.messages.length - 1];
      if (!lastMessage || lastMessage.sender !== "agent") {
        JobStore.appendMessage(input.job_id, {
          message_id: randomUUID(),
          job_id: input.job_id,
          sender: "agent",
          message_type: "TEXT",
          text: buildQuoteReviewMessage(currentJob?.business_type ?? "event_vendor"),
          required_approval: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    if (input.new_state === "FAILED_RETRY") {
      const currentJob = JobStore.getJob(input.job_id);
      const lastMessage = currentJob?.messages[currentJob.messages.length - 1];
      if (!lastMessage || lastMessage.sender !== "agent") {
        JobStore.appendMessage(input.job_id, {
          message_id: randomUUID(),
          job_id: input.job_id,
          sender: "agent",
          message_type: "TEXT",
          text: buildFailedRetryMessage(currentJob?.business_type ?? "event_vendor"),
          required_approval: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    return {
      job_id: input.job_id,
      previous_state: job.state,
      new_state: input.new_state,
      updated_at: new Date().toISOString(),
      status: "SUCCESS",
    };
  },
});
