/**
 * jobs.handler.ts
 * Handles requests and invokes the agent/state layer
 */

import { Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  createJob,
  getJob,
  appendMessage,
  updateJobState,
  mergeExtractedFields,
} from "../state/JobStore";
import {
  logStateTransition,
  logQuoteApproved,
  logQuoteEdited,
} from "../state/auditLog";
import { transitionJob } from "../state/stateMachine";
import {
  createJobSchema,
  postMessageSchema,
  editQuoteSchema,
  approveQuoteSchema,
  manualInputSchema,
} from "./validators";
import { simulateSendMessageTool } from "../agent/tools/simulateSendMessage";
import type { ChatMessage, LineItem } from "../types/Job";

import { runAgentLoop } from "../agent/orchestration/agentLoop";

/**
 * POST /jobs
 */
export async function createJobHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }

  const { business_id, business_type } = parsed.data;

  const systemMessage: ChatMessage = {
    message_id: randomUUID(),
    job_id: "pending",
    sender: "system",
    message_type: "TEXT",
    text: "Job created",
    required_approval: false,
    created_at: new Date(),
  };

  const job = createJob(business_id, business_type, systemMessage);
  job.messages[0].job_id = job.job_id;

  res.status(201).json({ success: true, data: job });
}

/**
 * POST /jobs/:id/messages
 */

export async function postMessageHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  const parsed = postMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const { message_text, received_at } = parsed.data;
  // Guard: only valid states can receive new client messages
  const validInboundStates = ["IDLE", "CLARIFYING", "FAILED_RETRY"];
  if (!validInboundStates.includes(job.state)) {
    res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot receive a message in state: ${job.state}`,
      },
    });
    return;
  }
  // 1. Append the client message
  const clientMessage: ChatMessage = {
    message_id: randomUUID(),
    job_id: job.job_id,
    sender: "client",
    message_type: "TEXT",
    text: message_text,
    required_approval: false,
    created_at: new Date(received_at),
  };
  appendMessage(job.job_id, clientMessage);
  // 2. Transition to INGESTING
  const ingesting = transitionJob(job.state, "INGESTING");
  updateJobState(job.job_id, "INGESTING");
  logStateTransition(job.job_id, job.state, "INGESTING");
  // 3. Invoke the agent loop (stub — wires in when agentLoop is delivered)
  const updatedJob = await runAgentLoop(job.job_id );
  res.status(200).json({ success: true, data: updatedJob });
}

/**
 * GET /jobs/:id 
 */
export async function getJobHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  res.status(200).json({ success: true, data: job });
}

/**
 * GET /jobs/:id/quote 
 */
export async function getQuoteHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  if (!job.quote) {
    res.status(404).json({
      success: false,
      error: { code: "QUOTE_NOT_AVAILABLE", message: "No quote has been generated for this job yet" },
    });
    return;
  }
  res.status(200).json({ success: true, data: job.quote });
}

/**
 * PATCH /jobs/:id/quote 
 */
export async function editQuoteHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  if (job.state !== "AWAITING_HUMAN_APPROVAL") {
    res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATE_TRANSITION",
        message: "Quote can only be edited while in AWAITING_HUMAN_APPROVAL state",
      },
    });
    return;
  }
  if (!job.quote) {
    res.status(404).json({
      success: false,
      error: { code: "QUOTE_NOT_AVAILABLE", message: "No quote to edit" },
    });
    return;
  }
  const parsed = editQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const { line_items, notes } = parsed.data;
  // Apply edits
  if (line_items) {
    job.quote.line_items = line_items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total ?? (item.quantity ?? 1) * (item.unit_price ?? 0),
    })) as LineItem[];
    // Recalculate totals
    const subtotal = job.quote.line_items.reduce((sum, item) => sum + item.total, 0);
    const contingencyTotal = job.quote.contingencies.reduce((sum, c) => sum + c.amount, 0);
    job.quote.subtotal = subtotal;
    job.quote.total = subtotal + contingencyTotal;
  }
  job.updated_at = new Date();
  logQuoteEdited(job.job_id, { line_items, notes });
  res.status(200).json({
    success: true,
    data: {
      job_id: job.job_id,
      state: job.state,
      quote: { status: job.quote.status, total: job.quote.total },
    },
  });
}

/**
 * POST /jobs/:id/approve_quote 
 */
export async function approveQuoteHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  if (job.state !== "AWAITING_HUMAN_APPROVAL") {
    res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATE_TRANSITION",
        message: "Quote approval is not allowed in the current job state",
      },
    });
    return;
  }
  if (!job.quote) {
    res.status(404).json({
      success: false,
      error: { code: "QUOTE_NOT_AVAILABLE", message: "No quote to approve" },
    });
    return;
  }
  const parsed = approveQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  // 1. Record approval
  logQuoteApproved(job.job_id, job.quote.total);
  // 2. Simulate sending the quote via the tool
  const sentAt = new Date().toISOString();
  await simulateSendMessageTool.invoke({
    job_id: job.job_id,
    message_type: "quote",
    draft_message_to_client: job.quote.draft_message ?? "Your quote is ready.",
    sender: "business",
    required_approval: true,
  });
  // 3. Update quote status and append to messages
  job.quote.status = "SENT";
  const quoteMessage: ChatMessage = {
    message_id: randomUUID(),
    job_id: job.job_id,
    sender: "agent",
    message_type: "QUOTE",
    text: job.quote.draft_message ?? "Your quote is ready.",
    required_approval: true,
    created_at: new Date(sentAt),
  };
  appendMessage(job.job_id, quoteMessage);
  // 4. Transition to EXECUTED
  logStateTransition(job.job_id, "AWAITING_HUMAN_APPROVAL", "EXECUTED");
  updateJobState(job.job_id, "EXECUTED");
  res.status(200).json({
    success: true,
    data: {
      job_id: job.job_id,
      state: "EXECUTED",
      quote_status: "SENT",
      sent_at: sentAt,
    },
  });
}

/**
 * GET /jobs/:id/missing_fields 
 */
export async function getMissingFieldsHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  if (job.state !== "NEEDS_SME_INPUT") {
    res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATE_TRANSITION",
        message: `Missing fields endpoint is only valid in NEEDS_SME_INPUT state. Current state: ${job.state}`,
      },
    });
    return;
  }
  res.status(200).json({
    success: true,
    data: {
      job_id: job.job_id,
      state: job.state,
      missing_fields: job.missing_required_fields,
      summary: job.error_message ?? "Some required fields could not be resolved after two clarification rounds.",
      clarification_round: job.clarification_round,
    },
  });
}

/**
 * POST /jobs/:id/manual_input 
 */
export async function manualInputHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  if (job.state !== "NEEDS_SME_INPUT") {
    res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATE_TRANSITION",
        message: "Manual input is only allowed in NEEDS_SME_INPUT state",
      },
    });
    return;
  }
  const parsed = manualInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const { supplied_fields, source } = parsed.data;
  // 1. Merge SME-supplied fields
  mergeExtractedFields(job.job_id, supplied_fields);
  // 2. Log the SME input event
  logStateTransition(job.job_id, "NEEDS_SME_INPUT", "REASONING");
  // 3. Transition to REASONING and re-run the agent loop
  updateJobState(job.job_id, "REASONING");
  const updatedJob = await runAgentLoop(job.job_id);
  res.status(200).json({ success: true, data: updatedJob });
}

/**
 * POST /jobs/:id/retry 
 */
export async function retryJobHandler(req: Request, res: Response): Promise<void> {
  const job = getJob(req.params.id as string);
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: "Job not found" },
    });
    return;
  }
  if (job.state !== "FAILED_RETRY") {
    res.status(409).json({
      success: false,
      error: {
        code: "INVALID_STATE_TRANSITION",
        message: "Retry is only allowed in FAILED_RETRY state",
      },
    });
    return;
  }
  // Transition back to REASONING and re-run the loop
  logStateTransition(job.job_id, "FAILED_RETRY", "REASONING");
  updateJobState(job.job_id, "REASONING");
  // Agent loop will determine the next valid state
  await runAgentLoop(job.job_id);
  res.status(200).json({
    success: true,
    data: {
      job_id: job.job_id,
      state: "REASONING",
      retry_started: true,
    },
  });
}
