// Declares the job-oriented REST routes

import { Router } from "express";

export const jobsRouter = Router();

// BE/CI: POST /, POST /:id/messages, GET /:id, GET /:id/quote,
// PATCH /:id/quote, POST /:id/approve_quote, GET /:id/missing_fields,
// POST /:id/manual_input, POST /:id/retry