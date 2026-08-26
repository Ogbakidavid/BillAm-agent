/**
 * app.ts
 * Express Application Setup, Middleware, and Central Error Handling
 */

import express, { Request, Response, NextFunction } from "express";
import { jobsRouter } from "./api/jobs.routes";
import { AppError } from "./utils/errors";
import { logger } from "./utils/logger";

export const app = express();

app.use(express.json());

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`HTTP ${req.method} ${req.url}`);
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "SUCCESS",
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "billam-agent",
    },
  });
});

app.use("/jobs", jobsRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "FAILED_RETRY",
    error: "ENDPOINT not found",
  });
});

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(`Operational error: ${err.message}`, {
      statusCode: err.statusCode,
      errorCode: err.errorCode,
    });
    return res.status(err.statusCode).json({
      status: "FAILED_RETRY",
      errorCode: err.errorCode,
      error: err.message,
    });
  }

  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack});
  return res.status(500).json({
    status: "FAILED_RETRY",
    errorCode: "INTERNAL_SERVER_ERROR",
    error: "An unexpected internal error occurred",
  });
});
