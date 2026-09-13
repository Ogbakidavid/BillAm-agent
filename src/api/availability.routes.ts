/**
 * availability.routes.ts
 * Declares the Availability REST routes
 */

import { Router } from "express";
import {
  listAvailabilityHandler,
  createAvailabilityHandler,
  getAvailabilityHandler,
  updateAvailabilityHandler,
  deleteAvailabilityHandler,
  checkAvailabilityHandler,
} from "./availability.handlers";

export const availabilityRouter = Router();

// GET/availability/check — Check if a date is available (?business_id=&date=)
// NOTE: /check must be registered BEFORE /:id to avoid Express matching "check" as an id
availabilityRouter.get("/check", checkAvailabilityHandler);

// GET/availability — List all blocked dates (?business_id=)
availabilityRouter.get("/", listAvailabilityHandler);
// POST/availability — Block a new date
availabilityRouter.post("/", createAvailabilityHandler);
// GET/availability/:id — Get single blocked date
availabilityRouter.get("/:id", getAvailabilityHandler);
// PATCH/availability/:id — Update status or reason
availabilityRouter.patch("/:id", updateAvailabilityHandler);
// DELETE/availability/:id — Unblock a date
availabilityRouter.delete("/:id", deleteAvailabilityHandler);
