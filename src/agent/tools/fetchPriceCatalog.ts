/**
 * fetchPriceCatalog.ts
 * Capability tool that reads the price catalog JSON for a given business type
 * and returns it to the Agent for quote calculation.
 *
 * ARCHITECTURAL NOTE:
 * This tool is purely a data accessor. The Agent reasons over the returned
 * pricing data to compute line items, contingencies, and totals.
 * No LLM call happens inside this tool.
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const fetchPriceCatalogInputSchema = z.object({
  business_type: z.enum([
    "event_vendor",
    "caterer",
    "tailor",
    "photographer",
    "event_planner",
    "equipment_rental",
  ]),
});

export const fetchPriceCatalogTool = tool({
  name: "fetch_price_catalog",
  description:
    "Loads the price catalog for the given business type. " +
    "Use this when you are ready to compute a quote after all required brief fields " +
    "have been collected. Returns a JSON object containing line item unit prices " +
    "across lean, standard, and premium tiers, plus contingency rate definitions.",
  inputSchema: fetchPriceCatalogInputSchema,
  callback: async (input: { business_type: string }) => {
    try {
      const catalogPath = path.join(
        __dirname,
        "../../data/price_catalog",
        `${input.business_type}.json`,
      );
      const raw = fs.readFileSync(catalogPath, "utf-8");
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to load price catalog for "${input.business_type}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
});
