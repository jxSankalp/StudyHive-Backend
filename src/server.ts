// server.ts
// ⚠️  dotenv MUST be called before any other import that reads process.env
import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import { createServer } from "http";
import { initSocket } from "./socket";
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
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOrigin, validateCorsConfiguration } from "./lib/cors";
import { createRateLimiter } from "./middleware/rateLimiter";

const app = express();
const server = createServer(app);

app.set("trust proxy", 1);

validateCorsConfiguration();

// CORS: allow any localhost port in development (handles Vite port changes)
app.use(
  cors({
    origin: corsOrigin,
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

const apiLimiter = createRateLimiter({ name: "api", windowMs: 15 * 60_000, limit: 500 });
const authLimiter = createRateLimiter({ name: "auth", windowMs: 15 * 60_000, limit: 30 });
const messageLimiter = createRateLimiter({ name: "messages", windowMs: 60_000, limit: 90 });
const mutationLimiter = createRateLimiter({ name: "mutations", windowMs: 60_000, limit: 180 });

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/messages", messageLimiter);
app.use("/api", (req, res, next) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? mutationLimiter(req, res, next) : next()
);

// Routes
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

// Health check
app.get("/health", (_req: Request, res: Response): void => {
  res.json({ ok: true });
});

app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: "Route not found" });
});

app.use(
  (error: Error, _req: Request, res: Response, _next: express.NextFunction): void => {
    console.error("[Server] Unhandled request error:", error);
    const candidateStatus = (error as Error & { status?: unknown }).status;
    const status =
      error.message.startsWith("CORS:")
        ? 403
        : typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus < 500
          ? candidateStatus
          : 500;
    const message =
      status === 400
        ? "Invalid request body"
        : status === 413
          ? "Request body is too large"
          : status === 403
            ? "Origin not allowed"
            : "Internal server error";
    res.status(status).json({ error: message });
  }
);

// Start server
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () =>
  console.log(`[Server] Running on port ${PORT} — Supabase backend`)
);

// Initialize socket
initSocket(server);

const shutdown = (signal: string) => {
  console.log(`[Server] ${signal} received; closing connections`);
  server.close((error) => {
    if (error) {
      console.error("[Server] Graceful shutdown failed:", error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
