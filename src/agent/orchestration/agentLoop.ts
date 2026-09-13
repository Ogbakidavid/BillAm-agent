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

    const roundBeforeInvoke = job.clarification_round;

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
      // Raised from the original 6/16000 after live testing showed the
      // mandatory KB/catalog lookups alone were consuming the full budget
      // before the agent ever reached quote computation.
      limits: {
        turns: 10,
        outputTokens: 4000,
        totalTokens: 50000,
      },
    });

    const usage = result.metrics?.latestAgentInvocation?.usage;
    console.info(
      `[AgentUsage] job=${jobId} stop=${result.stopReason} ` +
        `input=${usage?.inputTokens ?? 0} output=${usage?.outputTokens ?? 0} ` +
        `total=${usage?.totalTokens ?? 0}`,
    );

    // Anything other than a clean completion means the agent stopped
    // before producing a real answer (hit a turn/token limit, was
    // refused, got content-filtered, etc). Left unhandled, this used to
    // return silently with no new message and no state change, leaving
    // the client-facing chat looking empty with no error anywhere.
    const updatedJob = JobStore.getJob(jobId);
    if (!updatedJob) {
      throw new Error(`Job mysteriously vanished from store: ${jobId}`);
    }

    // The model is responsible for incrementing clarification_round via
    // update_job_state, but it isn't required to, and a non-informative
    // client reply (e.g. "not sure yet") can leave the model with nothing
    // new to save, so it skips the increment entirely. Left unenforced,
    // this lets the 2-round escalation cap never actually engage, since
    // the round it depends on never advances. Force it here, deterministically,
    // whenever the job is still asking for clarification.
    // Don't gate this on missing_required_fields: the greeting-only path
    // through the SOP treats this conversationally and never populates that
    // list at all, even though every required field is genuinely absent.
    // The state itself is the reliable signal: if the job is still sitting
    // in CLARIFYING or REASONING at the end of a turn, rather than having
    // moved on to a quote or approval, the conversation is unresolved,
    // regardless of what any specific field says.
    const jobIsMidConversation =
      updatedJob.state === "CLARIFYING" || updatedJob.state === "REASONING";

    if (
      jobIsMidConversation &&
      updatedJob.clarification_round === roundBeforeInvoke
    ) {
      const nextRound = Math.min(roundBeforeInvoke + 1, 2);
      JobStore.setClarificationRound(updatedJob.job_id, nextRound);
      console.info(
        `[AgentLoop] Job ${updatedJob.job_id} clarification_round forced ` +
          `${roundBeforeInvoke} → ${nextRound} (model did not advance it).`,
      );

      // The SOP correctly rests bare-greeting/no-signal conversations in
      // REASONING rather than CLARIFYING, since nothing was formally asked
      // yet. But that means this is the only place that can reliably notice
      // "two rounds have now passed with no real information" and force the
      // SME-escalation the PRD promises, since the model isn't guaranteed to
      // check the round counter and act on it itself. Only REASONING is a
      // legal transition source to NEEDS_SME_INPUT; a job already sitting in
      // CLARIFYING follows its own existing SOP-driven escalation path.
      if (nextRound >= 2 && updatedJob.state === "REASONING") {
        moveState(updatedJob, "NEEDS_SME_INPUT");
        JobStore.appendMessage(updatedJob.job_id, {
          message_id: randomUUID(),
          job_id: updatedJob.job_id,
          sender: "agent",
          message_type: "TEXT",
          text: "Thanks for your patience! I've passed your enquiry to our team so they can follow up with you directly once we have a bit more detail.",
          required_approval: false,
          created_at: new Date().toISOString(),
        });
        console.info(
          `[AgentLoop] Job ${updatedJob.job_id} escalated to NEEDS_SME_INPUT ` +
            `after 2 rounds with no usable client information.`,
        );
        return JobStore.getJob(updatedJob.job_id) || updatedJob;
      }
    }

    // The model's stopReason only tells us whether it finished talking, not
    // whether real work happened. update_job_state may already have
    // committed a state transition (and the client-facing message) via a
    // tool call before a token/turn limit cut off the model's final
    // wrap-up sentence. The only case that means nothing useful happened is
    // the job never leaving REASONING at all.
    if (updatedJob.state === "REASONING" && result.stopReason !== "endTurn") {
      moveState(updatedJob, "FAILED_RETRY");
      updatedJob.error_message = `Agent stopped before completing: ${result.stopReason}`;

      console.error(
        `[AgentLoop] Job ${updatedJob.job_id} stopped early (${result.stopReason}) ` +
          `while still in REASONING and entered FAILED_RETRY state.`,
      );

      JobStore.appendMessage(updatedJob.job_id, {
        message_id: randomUUID(),
        job_id: updatedJob.job_id,
        sender: "agent",
        message_type: "TEXT",
        text: "I need a moment to finish putting this quote together. Please try sending your message again.",
        required_approval: false,
        created_at: new Date().toISOString(),
      });

      JobStore.updateJobState(updatedJob.job_id, "FAILED_RETRY");
      return JobStore.getJob(updatedJob.job_id) || updatedJob;
    }

    return updatedJob;
  } catch (err) {
    job = JobStore.getJob(jobId) || job;
    moveState(job, "FAILED_RETRY");
    const errorMsg = err instanceof Error ? err.message : String(err);
    job.error_message = errorMsg;

    console.error(
      `[AgentLoop] Job ${job.job_id} encountered an error and entered FAILED_RETRY state:`,
      errorMsg,
    );

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
