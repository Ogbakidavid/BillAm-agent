/**
 * availability.handlers.ts
 * Handles Availability CRUD API requests
 */

import { Request, Response } from "express";
import {
  listDates,
  getDate,
  checkDate,
  createDate,
  updateDate,
  deleteDate,
} from "../state/AvailabilityStore";
import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const createAvailabilitySchema = z.object({
  business_id: z.string().min(1, "business_id is required"),
  date: z.string().regex(DATE_REGEX, "date must be in YYYY-MM-DD format"),
  status: z.enum(["UNAVAILABLE", "BOOKED"]),
  reason: z.string().optional(),
});

const updateAvailabilitySchema = z.object({
  status: z.enum(["UNAVAILABLE", "BOOKED"]).optional(),
  reason: z.string().optional(),
});

/**
 * GET /availability
 * Optional query param: ?business_id=
 */
export function listAvailabilityHandler(req: Request, res: Response): void {
  const business_id = req.query.business_id as string | undefined;
  const entries = listDates(business_id);
  res.status(200).json({ success: true, data: entries });
}

/**
 * POST /availability
 * Block a date for a business.
 */
export function createAvailabilityHandler(req: Request, res: Response): void {
  const parsed = createAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const entry = createDate(parsed.data);
  res.status(201).json({ success: true, data: entry });
}

/**
 * GET /availability/:id
 * Retrieve a single blocked date entry.
 */
export function getAvailabilityHandler(req: Request, res: Response): void {
  const entry = getDate(req.params.id as string);
  if (!entry) {
    res.status(404).json({
      success: false,
      error: {
        code: "AVAILABILITY_NOT_FOUND",
        message: "Availability date not found",
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: entry });
}

/**
 * PATCH /availability/:id
 * Update status or reason on a blocked date.
 */
export function updateAvailabilityHandler(req: Request, res: Response): void {
  const parsed = updateAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
    return;
  }
  const updated = updateDate(req.params.id as string, parsed.data);
  if (!updated) {
    res.status(404).json({
      success: false,
      error: {
        code: "AVAILABILITY_NOT_FOUND",
        message: "Availability date not found",
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: updated });
}

/**
 * DELETE /availability/:id
 * Unblock a date.
 */
export function deleteAvailabilityHandler(req: Request, res: Response): void {
  const deleted = deleteDate(req.params.id as string);
  if (!deleted) {
    res.status(404).json({
      success: false,
      error: {
        code: "AVAILABILITY_NOT_FOUND",
        message: "Availability date not found",
      },
    });
    return;
  }
  res.status(200).json({ success: true, data: { deleted: true } });
}

/**
 * GET /availability/check
 * Required query params: ?business_id=&date=YYYY-MM-DD
 * Returns whether the date is available or blocked.
 */
export function checkAvailabilityHandler(req: Request, res: Response): void {
  const business_id = req.query.business_id as string | undefined;
  const date = req.query.date as string | undefined;

  if (!business_id || !date) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Both business_id and date query params are required",
      },
    });
    return;
  }

  if (!DATE_REGEX.test(date)) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "date must be in YYYY-MM-DD format",
      },
    });
    return;
  }

  const result = checkDate(business_id, date);
  res.status(200).json({
    success: true,
    data: {
      date,
      business_id,
      available: result.available,
      blocked_entry: result.entry ?? null,
    },
  });
}
