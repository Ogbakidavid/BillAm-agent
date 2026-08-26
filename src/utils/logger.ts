/**
 * logger.ts
 * Structured Logging Utility for BillAm Agent
 */

import { env } from "../config/env";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private currentLevel: LogLevel;

  constructor() {
    this.currentLevel = (env.logLevel as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.currentLevel];
  }

  private format(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>,
  ): string {
    const timestamp = new Date().toISOString();
    const metaString =
      meta && Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  public debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format("debug", message, meta));
    }
  }

  public info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog("info")) {
      console.log(this.format("info", message, meta));
    }
  }

  public warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", message, meta));
    }
  }

  public error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog("error")) {
      console.error(this.format("error", message, meta));
    }
  }
}

export const logger = new Logger();
