"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
require("./instrumentation");
const node_http_1 = require("node:http");
const app_1 = require("./app");
const socket_1 = require("./socket");
const telemetry_1 = require("./lib/telemetry");
const app = (0, app_1.createApp)();
const server = (0, node_http_1.createServer)(app);
(0, socket_1.initSocket)(server);
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => telemetry_1.logger.info({ event: "server.started", port: PORT, host: HOST }));
const shutdown = (signal) => {
    telemetry_1.logger.info({ event: "server.shutdown.started", signal });
    server.close((error) => {
        if (error) {
            (0, telemetry_1.logError)("server.shutdown.failed", error, { signal });
            process.exit(1);
        }
        telemetry_1.logger.info({ event: "server.shutdown.completed", signal });
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
