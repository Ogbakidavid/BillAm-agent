/**
 * jobs.routes.ts
 * Declares the job-oriented REST routes
 */

import { Router } from "express";
import {
  createJobHandler,
  postMessageHandler,
  getJobHandler,
  getQuoteHandler,
  editQuoteHandler,
  approveQuoteHandler,
  getMissingFieldsHandler,
  manualInputHandler,
  retryJobHandler,
} from "./jobs.handlers";

export const jobsRouter = Router();

// POST   /jobs — Create a new job
jobsRouter.post("/", createJobHandler);
// POST   /jobs/:id/messages — Send client message and trigger agent
jobsRouter.post("/:id/messages", postMessageHandler);
// GET    /jobs/:id — Get current job state
jobsRouter.get("/:id", getJobHandler);
// GET    /jobs/:id/quote — Get draft quote
jobsRouter.get("/:id/quote", getQuoteHandler);
// PATCH  /jobs/:id/quote — SME edits draft quote
jobsRouter.patch("/:id/quote", editQuoteHandler);
// POST   /jobs/:id/approve_quote — SME approves and sends quote
jobsRouter.post("/:id/approve_quote", approveQuoteHandler);
// GET    /jobs/:id/missing_fields — Get unresolved fields (NEEDS_SME_INPUT)
jobsRouter.get("/:id/missing_fields", getMissingFieldsHandler);
// POST   /jobs/:id/manual_input — SME supplies missing values
jobsRouter.post("/:id/manual_input", manualInputHandler);
// POST   /jobs/:id/retry — Retry a FAILED_RETRY job
jobsRouter.post("/:id/retry", retryJobHandler);
