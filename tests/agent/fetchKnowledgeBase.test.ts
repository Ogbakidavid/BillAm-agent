import path from "path";
import { fetchKnowledgeBaseTool } from "../../src/agent/tools/fetchKnowledgeBase";

jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

import fs from "fs";
const mockReadFileSync = fs.readFileSync as jest.Mock;

describe("fetchKnowledgeBaseTool", () => {
  const mockKnowledgeBase = {
    field_completeness_rules: {
      required_for_quote: [
        "event_type",
        "guest_count",
        "event_date",
        "venue_location",
      ],
    },
    fields: { event_type: { type: "string" } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue(JSON.stringify(mockKnowledgeBase));
  });

  it("returns parsed knowledge base for a valid business type", async () => {
    const result = await fetchKnowledgeBaseTool.invoke({
      business_type: "event_vendor",
    });
    expect(result).toEqual(mockKnowledgeBase);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining("event_vendor.json"),
      "utf-8",
    );
  });

  it("throws an error when the file cannot be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    await expect(
      fetchKnowledgeBaseTool.invoke({ business_type: "caterer" }),
    ).rejects.toThrow('Failed to load knowledge base for "caterer"');
  });
});
