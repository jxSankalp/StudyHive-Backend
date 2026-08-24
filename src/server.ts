import dotenv from "dotenv";
dotenv.config();

import "./instrumentation";
import { createServer } from "node:http";
import { createApp } from "./app";
import { initSocket } from "./socket";
import { logger, logError } from "./lib/telemetry";

const app = createApp();
const server = createServer(app);
initSocket(server);

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => logger.info({ event: "server.started", port: PORT, host: HOST }));

const shutdown = (signal: string) => {
  logger.info({ event: "server.shutdown.started", signal });
  server.close((error) => {
    if (error) {
      logError("server.shutdown.failed", error, { signal });
      process.exit(1);
    }
    logger.info({ event: "server.shutdown.completed", signal });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
