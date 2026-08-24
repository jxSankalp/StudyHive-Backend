"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRequestUser = exports.requestContextMiddleware = exports.logError = exports.installStructuredConsole = exports.initTelemetry = exports.logger = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const node_crypto_1 = require("node:crypto");
const pino_1 = __importDefault(require("pino"));
const Sentry = __importStar(require("@sentry/node"));
const requestContext = new node_async_hooks_1.AsyncLocalStorage();
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || "info",
    base: { service: "studyhive-api", environment: process.env.NODE_ENV || "development" },
    redact: {
        paths: ["authorization", "cookie", "req.headers.authorization", "req.headers.cookie", "token", "password"],
        censor: "[REDACTED]",
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
});
const initTelemetry = () => {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || "development",
            release: process.env.RENDER_GIT_COMMIT,
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
            sendDefaultPii: false,
        });
    }
};
exports.initTelemetry = initTelemetry;
const installStructuredConsole = () => {
    console.error = (...args) => {
        const error = args.find((item) => item instanceof Error) ?? args.at(-1);
        const event = typeof args[0] === "string" ? args[0] : "console.error";
        (0, exports.logError)(event, error, { arguments: args.filter((item) => item !== error) });
    };
    console.warn = (...args) => exports.logger.warn({ event: "console.warn", arguments: args });
    console.log = (...args) => exports.logger.info({ event: "console.log", arguments: args });
};
exports.installStructuredConsole = installStructuredConsole;
const serializeError = (error) => error instanceof Error
    ? { type: error.name, message: error.message, stack: error.stack }
    : { value: error };
const logError = (event, error, fields = {}) => {
    const context = requestContext.getStore();
    exports.logger.error({ event, ...context, ...fields, error: serializeError(error) });
    if (process.env.SENTRY_DSN) {
        Sentry.withScope((scope) => {
            if (context?.requestId)
                scope.setTag("request_id", context.requestId);
            if (context?.userId)
                scope.setUser({ id: context.userId });
            scope.setContext("event", { name: event, ...fields });
            Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
        });
    }
};
exports.logError = logError;
const requestContextMiddleware = (req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming) ? incoming : (0, node_crypto_1.randomUUID)();
    const startedAt = performance.now();
    res.setHeader("X-Request-ID", requestId);
    requestContext.run({ requestId }, () => {
        res.on("finish", () => exports.logger.info({
            event: "http.request.completed",
            requestId,
            userId: req.user?.userId,
            method: req.method,
            path: req.originalUrl.split("?")[0],
            statusCode: res.statusCode,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        }));
        next();
    });
};
exports.requestContextMiddleware = requestContextMiddleware;
const setRequestUser = (userId) => {
    const context = requestContext.getStore();
    if (context)
        context.userId = userId;
};
exports.setRequestUser = setRequestUser;
