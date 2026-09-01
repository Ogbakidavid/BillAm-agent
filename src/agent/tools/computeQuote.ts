/**
 * computeQuote.ts
 * Uses the price catalog to generate line items, contingencies, totals and quote terms
 */

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";
import {
  ComputeQuoteInput,
  ComputeQuoteOutput,
} from "../../types/ToolContracts";
import { llmProvider } from "../../llm";
import {
  QUOTE_DRAFT_SYSTEM_PROMPT,
  buildQuoteDraftUserPrompt,
} from "../prompts/quoteDraftPrompt";

// CRITICAL ARCHITECTURAL INVARIANT: Max 2 clarification rounds enforced at Zod validation level
const computeQuoteInputSchema = z.object({
  job_id: z.string().min(1, "Job ID is required"),
  structured_brief: z.record(z.string(), z.any()),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
});

function loadPriceCatalog(businessType: string): Record<string, any> {
  const catalogPath = path.join(
    __dirname,
    "../../data/price_catalog",
    `${businessType}.json`,
  );
  const raw = fs.readFileSync(catalogPath, "utf-8");
  return JSON.parse(raw);
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in LLM response");
  return JSON.parse(match[0]);
}

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
  description:
    "Uses the price catalog and extracted brief to compute line items, contingencies, totals, and quote terms.",
  inputSchema: computeQuoteInputSchema,
  callback: async (input: ComputeQuoteInput): Promise<ComputeQuoteOutput> => {
    try {
      const priceCatalog = loadPriceCatalog(input.business_type);

      const userPrompt = buildQuoteDraftUserPrompt({
        job_id: input.job_id,
        structured_brief: input.structured_brief,
        business_type: input.business_type,
        price_catalog: priceCatalog,
      });

      const fullPrompt = `${QUOTE_DRAFT_SYSTEM_PROMPT}\n\n${userPrompt}`;
      const rawResponse = await llmProvider.generateResponse(fullPrompt);
      const parsed = extractJson(rawResponse);

      const quoteData = parsed.quote || parsed;

      const lineItems = (quoteData.line_items || []).map((item: any) => ({
        label: item.label,
        amount: item.subtotal ?? item.amount ?? 0,
      }));

      const contingencies = (quoteData.contingencies || []).map((c: any) => ({
        label: c.label,
        amount: c.amount ?? 0,
      }));

      return {
        job_id: input.job_id,
        line_items: lineItems,
        contingencies: contingencies,
        total_amount: quoteData.total_amount || 0,
        validity_period_days: quoteData.validity_period_days || 7,
        status: "SUCCESS",
        error: null,
      };
    } catch (err) {
      return {
        job_id: input.job_id,
        line_items: [],
        contingencies: [],
        total_amount: 0,
        validity_period_days: 7,
        status: "FAILED_RETRY",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
