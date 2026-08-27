// Records state changes, tool calls, sends, edits, approvals, errors and retries
import { AuditEvent, JobState } from "../types/Job";
import { randomUUID } from "crypto";

const events: AuditEvent[] = [];


function logEvent(
  jobId: string,
  eventType: AuditEvent["event_type"],
  actor: string,
  details?: Record<string, any>,
  fromState?: JobState,
  toState?: JobState
): AuditEvent {
  const event: AuditEvent = {
    event_id: randomUUID(),
    job_id: jobId,
    event_type: eventType,
    from_state: fromState,
    to_state: toState,
    actor,
    details,
    created_at: new Date(),
  };

  events.push(event);
  return event;
}

/**
 * Logs a state transition. Actor is "system" since transitions
 * are driven by the agent loop, not a human directly.
 */
export function logStateTransition(
  jobId: string,
  fromState: JobState,
  toState: JobState
): AuditEvent {
  return logEvent(jobId, "STATE_TRANSITION", "system", undefined, fromState, toState);
}


export function logClarificationSent(
  jobId: string,
  questions: string[],
  round: number
): AuditEvent {
  return logEvent(jobId, "CLARIFICATION_SENT", "system", {
    questions,
    round,
    required_approval: false,
  });
}

/**
 * Logs an SME approving and sending a quote.
 * required_approval is always true — this is the system's one
 * mandatory human checkpoint per the PRD.
 */
export function logQuoteApproved(jobId: string, quoteTotal: number): AuditEvent {
  return logEvent(jobId, "QUOTE_APPROVED", "sme", {
    quote_total: quoteTotal,
    required_approval: true,
  });
}

// Logs an SME editing a draft quote before approving it.
export function logQuoteEdited(jobId: string, changes: Record<string, any>): AuditEvent {
  return logEvent(jobId, "QUOTE_EDITED", "sme", { changes, required_approval: true });
}

// Returns the full audit trail for a job, oldest first.
export function getAuditTrail(jobId: string): AuditEvent[] {
  return events.filter((e) => e.job_id === jobId);
}

/**
 * Test-only helper — clears all events between test runs.
 */
export function _clearAuditLog(): void {
  events.length = 0;
}