/**
 * knowledge.routes.ts
 * Declares the Knowledge Base REST routes
 */

import { Router } from "express";
import {
  listKnowledgeHandler,
  createKnowledgeHandler,
  getKnowledgeHandler,
  updateKnowledgeHandler,
  deleteKnowledgeHandler,
} from "./knowledge.handlers";

export const knowledgeRouter = Router();

// GET/knowledge — List all entries (optional ?business_id=)
knowledgeRouter.get("/", listKnowledgeHandler);
// POST/knowledge — Create new entry
knowledgeRouter.post("/", createKnowledgeHandler);
// GET/knowledge/:id — Get single entry
knowledgeRouter.get("/:id", getKnowledgeHandler);
// PATCH/knowledge/:id — Update entry
knowledgeRouter.patch("/:id", updateKnowledgeHandler);
// DELETE/knowledge/:id — Delete entry
knowledgeRouter.delete("/:id", deleteKnowledgeHandler);
