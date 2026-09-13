/**
 * knowledge.handlers.ts
 * Handles Knowledge Base CRUD API requests
 */

import { Request, Response } from "express";
import {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
} from "../state/KnowledgeStore";
import { z } from "zod";

const createKnowledgeSchema = z.object({
  business_id: z.string().min(1, "business_id is required"),
  name: z.string().min(1, "name is required"),
  source_type: z.enum([
    "Pricing",
    "Business information",
    "Services",
    "Policies",
    "Other",
  ]),
  input_method: z.enum(["file", "manual"]),
  file_name: z.string().optional(),
});

const updateKnowledgeSchema = z.object({
  name: z.string().min(1).optional(),
  source_type: z
    .enum(["Pricing", "Business information", "Services", "Policies", "Other"])
    .optional(),
  status: z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED"]).optional(),
  input_method: z.enum(["file", "manual"]).optional(),
  file_name: z.string().optional(),
  error_message: z.string().optional(),
});

/**
 * GET /knowledge
 * Optional query param: ?business_id=
 */
export function listKnowledgeHandler(req: Request, res: Response): void {
  const business_id = req.query.business_id as string | undefined;
  const entries = listEntries(business_id);
  res.status(200).json({ success: true, data: entries });
}

/**
 * POST /knowledge
 */
export function createKnowledgeHandler(req: Request, res: Response): void {
  const parsed = createKnowledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const entry = createEntry(parsed.data as any);
  res.status(201).json({ success: true, data: entry });
}

/**
 * GET /knowledge/:id
 */
export function getKnowledgeHandler(req: Request, res: Response): void {
  const entry = getEntry(req.params.id as string);
  if (!entry) {
    res.status(404).json({
      success: false,
      error: {
        code: "KNOWLEDGE_NOT_FOUND",
        message: "Knowledge entry not found",
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: entry });
}

/**
 * PATCH /knowledge/:id
 */
export function updateKnowledgeHandler(req: Request, res: Response): void {
  const parsed = updateKnowledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const updated = updateEntry(req.params.id as string, parsed.data as any);
  if (!updated) {
    res.status(404).json({
      success: false,
      error: {
        code: "KNOWLEDGE_NOT_FOUND",
        message: "Knowledge entry not found",
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: updated });
}

/**
 * DELETE /knowledge/:id
 */
export function deleteKnowledgeHandler(req: Request, res: Response): void {
  const deleted = deleteEntry(req.params.id as string);
  if (!deleted) {
    res.status(404).json({
      success: false,
      error: {
        code: "KNOWLEDGE_NOT_FOUND",
        message: "Knowledge entry not found",
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: { deleted: true } });
}
