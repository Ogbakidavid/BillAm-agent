// Stores and retrieves active jobs
import { Job, JobState, ExtractedFields, ChatMessage } from "../types/Job";
import { randomUUID } from "crypto";

const jobs = new Map<string, Job>();

export function createJob(
  businessId: string,
  businessType: "caterer" | "tailor" | "event_vendor",
  message: ChatMessage
): Job {
  const now = new Date();

  const job: Job = {
    job_id: randomUUID(),
    business_id: businessId,
    business_type: businessType,
    state: "IDLE",
    clarification_round: 0,
    messages: [message],
    extracted_fields: {},
    missing_required_fields: [],
    quote: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };

  jobs.set(job.job_id, job);
  return job;
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function appendMessage(jobId: string, message: ChatMessage): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.messages.push(message);
  job.updated_at = new Date();
  return job;
}

export function mergeExtractedFields(
  jobId: string,
  newFields: ExtractedFields
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.extracted_fields = { ...job.extracted_fields, ...newFields };
  job.updated_at = new Date();
  return job;
}

export function updateJobState(jobId: string, newState: JobState): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.state = newState;
  job.updated_at = new Date();
  return job;
}

export function updateMissingFields(jobId: string, missing: string[]): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  job.missing_required_fields = missing;
  job.updated_at = new Date();
  return job;
}

export function _clearAllJobs(): void {
  jobs.clear();
}