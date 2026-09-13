import { SessionManager } from "@strands-agents/sdk";
import { LocalFileStorage } from "@strands-agents/sdk/storage";

/** Creates the per-job session used by the agent orchestration layer. */
export function getSessionManager(sessionId: string): SessionManager {
  const storage = new LocalFileStorage(".billam-agent-storage");
  return new SessionManager({ sessionId, storage });
}
