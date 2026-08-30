/**
 * validator.ts
 * Validates request bodies and route inputsValidates request bodies and route inputs
 */

import { z } from "zod";

export const createJobSchema = z.object({
  business_id: z.string().min(1, "business_id is required"),
  business_type: z.enum(["caterer", "tailor", "event_vendor"]),
});

export const postMessageSchema = z.object({
  message_text: z.string().min(1, "message_text cannot be empty"),
  received_at: z.string().min(1, "received_at is required"),
});

export const editQuoteSchema = z.object({
  line_items: z
  .array(
    z.object({
      name: z.string(),
      quantity: z.number().optional(),
      unit_price: z.number().optional(),
      total: z.number().optional(),
    })
  )
  .optional(),
  notes: z.string().optional(),
});

export const approveQuoteSchema = z.object({
  approved_by: z.string().min(1, "approved_by is required"),
});

export const manualInputSchema = z.object({
  supplied_fields: z.record(z.string(), z.any()),
  source: z.string().optional(),
});
