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
import { randomUUID } from "crypto";

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
          text: "Thanks for sharing those details. I’ve prepared a quote for the business owner to review and will get back to you once it has been approved.",
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
