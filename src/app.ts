// Express application setup, middleware and route registration

import express from "express";
import { jobsRouter } from "./api/jobs.routes";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/jobs", jobsRouter);
