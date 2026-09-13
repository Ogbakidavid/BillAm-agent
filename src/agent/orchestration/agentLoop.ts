import * as JobStore from "../../state/JobStore";
import * as AuditLog from "../../state/auditLog";
import { transitionJob } from "../../state/stateMachine";
import { Job } from "../../types/Job";
import { createBillamAgent } from "./agent";
import { randomUUID } from "crypto";

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
  let job = JobStore.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  try {
    if (job.state === "IDLE" || job.state === "INGESTING") {
      moveState(job, "REASONING");
    }

    const lastMessage = job.messages[job.messages.length - 1];

    const prompt = `
Please process this job according to the SOP.

current_date: ${new Date().toISOString().slice(0, 10)}
job_id: ${job.job_id}
business_type: ${job.business_type}
clarification_round: ${job.clarification_round}

existing_fields: ${JSON.stringify(job.extracted_fields, null, 2)}

client_message: "${lastMessage ? lastMessage.text : ""}"
    `.trim();

    // Create a fresh agent for this specific job execution
    const agent = createBillamAgent(jobId);

    // Invoke the autonomous Strands Agent with limits
    const result = await agent.invoke(prompt, {
      // A normal clarification takes 3–4 turns and a quote takes 4–5.
      // Six leaves one recovery turn without allowing an unbounded loop.
      limits: {
        turns: 6,
        outputTokens: 2500,
        totalTokens: 16000,
      },
    });

    const usage = result.metrics?.latestAgentInvocation?.usage;
    console.info(
      `[AgentUsage] job=${jobId} stop=${result.stopReason} ` +
        `input=${usage?.inputTokens ?? 0} output=${usage?.outputTokens ?? 0} ` +
        `total=${usage?.totalTokens ?? 0}`,
    );

    const updatedJob = JobStore.getJob(jobId);
    if (!updatedJob) {
      throw new Error(`Job mysteriously vanished from store: ${jobId}`);
    }

    return updatedJob;

  } catch (err) {
    job = JobStore.getJob(jobId) || job;
    moveState(job, "FAILED_RETRY");
    const errorMsg = err instanceof Error ? err.message : String(err);
    job.error_message = errorMsg;
    
    console.error(`[AgentLoop] Job ${job.job_id} encountered an error and entered FAILED_RETRY state:`, errorMsg);
    
    JobStore.appendMessage(job.job_id, {
      message_id: randomUUID(),
      job_id: job.job_id,
      sender: "agent",
      message_type: "TEXT",
      text: "I apologize, but I encountered a technical issue while processing your request. Please hold on while our team looks into this.",
      required_approval: false,
      created_at: new Date().toISOString(),
    });

    JobStore.updateJobState(job.job_id, "FAILED_RETRY");
    return JobStore.getJob(jobId) || job;
  }
}

export function handleClientReply(jobId: string): void {
  const job = JobStore.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  moveState(job, "INGESTING");
}
