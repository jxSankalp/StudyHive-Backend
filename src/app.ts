import express, { type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/userRoutes";
import chatRoutes from "./routes/chatRoutes";
import authRoutes from "./routes/authRoutes";
import messageRoutes from "./routes/messageRoutes";
import notesRoutes from "./routes/notesRoutes";
import videoRoutes from "./routes/videoRoutes";
import whiteboardRoutes from "./routes/whiteboardRoutes";
import calendarRoutes from "./routes/calendarRoutes";
import taskRoutes from "./routes/taskRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import fileRoutes from "./routes/fileRoutes";
import searchRoutes from "./routes/searchRoutes";
import { corsOrigin, validateCorsConfiguration } from "./lib/cors";
import { createRateLimiter } from "./middleware/rateLimiter";
import { logError, requestContextMiddleware } from "./lib/telemetry";

export const createApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  validateCorsConfiguration();
  app.use(requestContextMiddleware);
  app.use(cors({
    origin: corsOrigin,
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
    maxAge: 86400,
  }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  const apiLimiter = createRateLimiter({ name: "api", windowMs: 15 * 60_000, limit: 500 });
  const authLimiter = createRateLimiter({ name: "auth", windowMs: 15 * 60_000, limit: 30 });
  const messageLimiter = createRateLimiter({ name: "messages", windowMs: 60_000, limit: 90 });
  const mutationLimiter = createRateLimiter({ name: "mutations", windowMs: 60_000, limit: 180 });
  app.use("/api", apiLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api/messages", messageLimiter);
  app.use("/api", (req, res, next) => ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? mutationLimiter(req, res, next) : next());

  app.use("/api/auth", authRoutes);
  app.use("/api/meet", videoRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/whiteboards", whiteboardRoutes);
  app.use("/api/calendar", calendarRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/search", searchRoutes);
  app.get("/health", (_req: Request, res: Response): void => { res.json({ ok: true }); });
  app.use((_req: Request, res: Response) => { res.status(404).json({ error: "Route not found" }); });
  app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    logError("http.request.unhandled", error);
    const candidateStatus = (error as Error & { status?: unknown }).status;
    const status = error.message.startsWith("CORS:") ? 403
      : typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus < 500 ? candidateStatus : 500;
    const message = status === 400 ? "Invalid request body" : status === 413 ? "Request body is too large" : status === 403 ? "Origin not allowed" : "Internal server error";
    res.status(status).json({ error: message });
  });
  return app;
};
