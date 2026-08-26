import { JobState } from "../types/Job";

// Legal transition map
const TRANSITIONS: Record<JobState, JobState[]> = {
  IDLE: ["INGESTING"],
  INGESTING: ["REASONING", "FAILED_RETRY"],
  REASONING: [
    "CLARIFYING",
    "AWAITING_HUMAN_APPROVAL",
    "NEEDS_SME_INPUT",
    "FAILED_RETRY",
  ],
  CLARIFYING: ["INGESTING"],
  NEEDS_SME_INPUT: ["REASONING"],
  AWAITING_HUMAN_APPROVAL: ["EXECUTED", "IDLE"],
  EXECUTED: ["IDLE"],
  FAILED_RETRY: ["INGESTING", "REASONING", "IDLE"],
};

export interface TransitionResult {
  success: boolean;
  error: string | null;
}

export function transitionJob(
  currentState: JobState,
  newState: JobState
): TransitionResult {
  const allowed = TRANSITIONS[currentState];

  if (!allowed) {
    return { success: false, error: `Unknown current state: ${currentState}` };
  }

  if (!allowed.includes(newState)) {
    return {
      success: false,
      error: `Illegal transition: ${currentState} -> ${newState}`,
    };
  }

  return { success: true, error: null };
}

export function isValidTransition(
  currentState: JobState,
  newState: JobState
): boolean {
  return transitionJob(currentState, newState).success;
}