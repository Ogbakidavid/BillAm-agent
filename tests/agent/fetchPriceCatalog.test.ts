import { fetchPriceCatalogTool } from "../../src/agent/tools/fetchPriceCatalog";

jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

import fs from "fs";
const mockReadFileSync = fs.readFileSync as jest.Mock;

describe("fetchPriceCatalogTool", () => {
  const mockCatalog = {
    tiers: { lean: {}, standard: {}, premium: {} },
    contingencies: { transport: 0.08, rush_fee: 0.15, fuel_buffer: 0.05 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue(JSON.stringify(mockCatalog));
  });

  it("returns parsed price catalog for a valid business type", async () => {
    const result = await fetchPriceCatalogTool.invoke({
      business_type: "event_vendor",
    });
    expect(result).toEqual(mockCatalog);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining("event_vendor.json"),
      "utf-8",
    );
  });

  it("throws an error when the catalog file cannot be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    await expect(
      fetchPriceCatalogTool.invoke({ business_type: "tailor" }),
    ).rejects.toThrow('Failed to load price catalog for "tailor"');
  });
});
