/**
 * index.ts
 * Server Entrypoint and Graceful Shutdown Handler
 */

import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const port = env.port;

const server = app.listen(port, () => {
  logger.info(`🚀 BillAm Agent server listening at http://localhost:${port}`, {
    environment: env.nodeEnv,
    port: port,
  });
});

// Graceful shutdown helper
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down server gracefully...`);
  server.close(() => {
    logger.info("HTTP server closed. Process exiting.");
    process.exit(0);
  });
  // Force shutdown after 10s if hanging
  setTimeout(() => {
    logger.error("Forced shutdown due to timeout.");
    process.exit(1);
  }, 10000);
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("uncaughtException", (error: Error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
});
process.on("unhandledRejection", (reason: any) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});
