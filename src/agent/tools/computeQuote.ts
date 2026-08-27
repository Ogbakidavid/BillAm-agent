/**
 * computeQuote.ts
 * Uses the price catalog to generate line items, contingencies, totals and quote terms
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  ComputeQuoteInput,
  ComputeQuoteOutput,
} from "../../types/ToolContracts";
import type { LLMClient } from "../../llm/LLMClient"; // Type hint only

const computeQuoteInputSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
  structured_brief: z.record(z.string(), z.any()),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
});

/**
 * compute_quote
 * Strands Tool definition for calculating line items, contingencies, delivery fees, and quote totals.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * This tool NEVER calls simulateSendMessage directly.
 * All computed quotes MUST be placed in state AWAITING_HUMAN_APPROVAL for mandatory SME owner review.
 */
export const computeQuoteTool = tool({
  name: "compute_quote",
  description: "Uses the price catalog and extracted brief to compute line items, contingencies, totals, and quote terms.",
  inputSchema: computeQuoteInputSchema,
  callback: async (input: ComputeQuoteInput): Promise<ComputeQuoteOutput> => {
    // Orchestration layer (agentLoop.ts) will:
    // 1. Load price catalog for business_type (e.g. price_catalog/event_vendor.json)
    // 2. Call LLM using quoteDraftPrompt.ts to match extracted items to catalog tiers
    // 3. Calculate line items subtotal, 8% delivery fee, 15% rush fee (if event < 5 days away), and 5% fuel buffer
    // 4. Return structured quote object with total_amount, validity_period_days, line_items, and contingencies
    return {
      job_id: input.job_id,
      line_items: [],
      contingencies: [],
      total_amount: 0,
      validity_period_days: 7,
      status: "SUCCESS",
      error: null,
    };
  },
});
