import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import * as Sentry from "@sentry/node";

type RequestContext = { requestId: string; userId?: string };
const requestContext = new AsyncLocalStorage<RequestContext>();

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "studyhive-api", environment: process.env.NODE_ENV || "development" },
  redact: {
    paths: ["authorization", "cookie", "req.headers.authorization", "req.headers.cookie", "token", "password"],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const initTelemetry = () => {
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

export const installStructuredConsole = () => {
  console.error = (...args: unknown[]) => {
    const error = args.find((item) => item instanceof Error) ?? args.at(-1);
    const event = typeof args[0] === "string" ? args[0] : "console.error";
    logError(event, error, { arguments: args.filter((item) => item !== error) });
  };
  console.warn = (...args: unknown[]) => logger.warn({ event: "console.warn", arguments: args });
  console.log = (...args: unknown[]) => logger.info({ event: "console.log", arguments: args });
};

const serializeError = (error: unknown) => error instanceof Error
  ? { type: error.name, message: error.message, stack: error.stack }
  : { value: error };

export const logError = (event: string, error: unknown, fields: Record<string, unknown> = {}) => {
  const context = requestContext.getStore();
  logger.error({ event, ...context, ...fields, error: serializeError(error) });
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context?.requestId) scope.setTag("request_id", context.requestId);
      if (context?.userId) scope.setUser({ id: context.userId });
      scope.setContext("event", { name: event, ...fields });
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  }
};

export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header("x-request-id");
  const requestId = incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming) ? incoming : randomUUID();
  const startedAt = performance.now();
  res.setHeader("X-Request-ID", requestId);
  requestContext.run({ requestId }, () => {
    res.on("finish", () => logger.info({
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

export const setRequestUser = (userId: string) => {
  const context = requestContext.getStore();
  if (context) context.userId = userId;
};
