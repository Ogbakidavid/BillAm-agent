import { getSessionManager } from "../../src/agent/session/sessionManager";
import { SessionManager } from "@strands-agents/sdk";
import { LocalFileStorage } from "@strands-agents/sdk/storage";

describe("Session Manager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create a new SessionManager with correct storage and sessionId", () => {
    const sessionId = "test-job-123";
    const manager = getSessionManager(sessionId);

    // Verify LocalFileStorage was instantiated (storage backend)
    expect(LocalFileStorage).toHaveBeenCalled();

    // Verify SessionManager was instantiated with the correct ID and storage
    expect(SessionManager).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: sessionId,
        storage: expect.any(Object),
      }),
    );

    expect(manager).toBeDefined();
  });
});
