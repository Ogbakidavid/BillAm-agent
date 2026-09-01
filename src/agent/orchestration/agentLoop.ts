import { parseClientBriefTool } from "../tools/parseClientBrief";
import { generateClarifyingQuestionsTool } from "../tools/generateClarifyingQuestions";
import { computeQuoteTool } from "../tools/computeQuote";
import { simulateSendMessageTool } from "../tools/simulateSendMessage";
import * as JobStore from "../../state/JobStore";
import * as AuditLog from "../../state/auditLog";
import { transitionJob } from "../../state/stateMachine";
import { Job } from "../../types/Job";

const MAX_CLARIFICATION_ROUNDS = 2;

function moveState(job: Job, newState: Job["state"]): void {
  const result = transitionJob(job.state, newState);
  if (!result.success) {
    throw new Error(result.error ?? "Invalid transition");
  }
  AuditLog.logStateTransition(job.job_id, job.state, newState);
  JobStore.updateJobState(job.job_id, newState);
  job.state = newState;
}

export async function runAgentLoop(jobId: string): Promise<Job> {
  const job = JobStore.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  try {
    if (job.state === "IDLE") {
      moveState(job, "INGESTING");
    }
    moveState(job, "REASONING");

    const parseResult = await parseClientBriefTool.invoke({
      job_id: job.job_id,
      message_text: job.messages[job.messages.length - 1].text,
      business_type: job.business_type,
      existing_fields: job.extracted_fields,
    });

    if (parseResult.status !== "SUCCESS") {
      moveState(job, "FAILED_RETRY");
      JobStore.updateMissingFields(job.job_id, job.missing_required_fields);
      job.error_message = parseResult.error;
      return job;
    }

    JobStore.mergeExtractedFields(job.job_id, parseResult.extracted_fields);
    JobStore.updateMissingFields(
      job.job_id,
      parseResult.missing_required_fields,
    );
    job.extracted_fields = parseResult.extracted_fields;
    job.missing_required_fields = parseResult.missing_required_fields;

    const briefComplete = job.missing_required_fields.length === 0;

    if (briefComplete) {
      return await handleComputeQuote(job);
    }

    const nextRound = job.clarification_round + 1;

    if (nextRound > MAX_CLARIFICATION_ROUNDS) {
      moveState(job, "NEEDS_SME_INPUT");
      return job;
    }

    return await handleClarification(job, nextRound);
  } catch (err) {
    moveState(job, "FAILED_RETRY");
    job.error_message = err instanceof Error ? err.message : String(err);
    return job;
  }
}

async function handleClarification(job: Job, round: number): Promise<Job> {
  const clarifyResult = await generateClarifyingQuestionsTool.invoke({
    job_id: job.job_id,
    missing_required_fields: job.missing_required_fields,
    business_type: job.business_type,
    clarification_round: round,
  });

  if (clarifyResult.status !== "SUCCESS") {
    moveState(job, "FAILED_RETRY");
    job.error_message = clarifyResult.error;
    return job;
  }

  await simulateSendMessageTool.invoke({
    job_id: job.job_id,
    message_type: "clarifying_questions",
    draft_message_to_client: clarifyResult.draft_message_to_client,
    sender: "business",
    required_approval: false,
  });

  AuditLog.logClarificationSent(job.job_id, clarifyResult.questions, round);
  job.clarification_round = round;

  moveState(job, "CLARIFYING");
  return job;
}

async function handleComputeQuote(job: Job): Promise<Job> {
  const quoteResult = await computeQuoteTool.invoke({
    job_id: job.job_id,
    structured_brief: job.extracted_fields,
    business_type: job.business_type,
  });

  if (quoteResult.status !== "SUCCESS") {
    moveState(job, "FAILED_RETRY");
    job.error_message = quoteResult.error;
    return job;
  }

  // Tool output uses {label, amount}; Job.ts's Quote type expects {name, total}.
  job.quote = {
    status: "DRAFT",
    line_items: quoteResult.line_items.map((item) => ({
      name: item.label,
      total: item.amount,
      label: item.label,
    })),
    contingencies: quoteResult.contingencies.map((c) => ({
      name: c.label,
      amount: c.amount,
      label: c.label,
    })),
    subtotal: quoteResult.total_amount,
    total: quoteResult.total_amount,
    currency: "NGN",
    validity_days: quoteResult.validity_period_days,
    payment_terms: "",
    assumptions: [],
  };

  moveState(job, "AWAITING_HUMAN_APPROVAL");
  return job;
}

export function handleClientReply(jobId: string): void {
  const job = JobStore.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  moveState(job, "INGESTING");
}
