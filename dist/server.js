"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server.ts
// ⚠️  dotenv MUST be called before any other import that reads process.env
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_1 = require("./socket");
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const messageRoutes_1 = __importDefault(require("./routes/messageRoutes"));
const notesRoutes_1 = __importDefault(require("./routes/notesRoutes"));
const videoRoutes_1 = __importDefault(require("./routes/videoRoutes"));
const whiteboardRoutes_1 = __importDefault(require("./routes/whiteboardRoutes"));
const calendarRoutes_1 = __importDefault(require("./routes/calendarRoutes"));
const taskRoutes_1 = __importDefault(require("./routes/taskRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_2 = require("./lib/cors");
const rateLimiter_1 = require("./middleware/rateLimiter");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
app.set("trust proxy", 1);
(0, cors_2.validateCorsConfiguration)();
// CORS: allow any localhost port in development (handles Vite port changes)
app.use((0, cors_1.default)({
    origin: cors_2.corsOrigin,
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
}));
app.use(express_1.default.json({ limit: "2mb" }));
app.use((0, cookie_parser_1.default)());
const apiLimiter = (0, rateLimiter_1.createRateLimiter)({ name: "api", windowMs: 15 * 60000, limit: 500 });
const authLimiter = (0, rateLimiter_1.createRateLimiter)({ name: "auth", windowMs: 15 * 60000, limit: 30 });
const messageLimiter = (0, rateLimiter_1.createRateLimiter)({ name: "messages", windowMs: 60000, limit: 90 });
const mutationLimiter = (0, rateLimiter_1.createRateLimiter)({ name: "mutations", windowMs: 60000, limit: 180 });
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/messages", messageLimiter);
app.use("/api", (req, res, next) => ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? mutationLimiter(req, res, next) : next());
// Routes
app.use("/api/auth", authRoutes_1.default);
app.use("/api/meet", videoRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/chat", chatRoutes_1.default);
app.use("/api/messages", messageRoutes_1.default);
app.use("/api/notes", notesRoutes_1.default);
app.use("/api/whiteboards", whiteboardRoutes_1.default);
app.use("/api/calendar", calendarRoutes_1.default);
app.use("/api/tasks", taskRoutes_1.default);
app.use("/api/notifications", notificationRoutes_1.default);
app.use("/api/files", fileRoutes_1.default);
// Health check
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
});
app.use((error, _req, res, _next) => {
    console.error("[Server] Unhandled request error:", error);
    const candidateStatus = error.status;
    const status = error.message.startsWith("CORS:")
        ? 403
        : typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus < 500
            ? candidateStatus
            : 500;
    const message = status === 400
        ? "Invalid request body"
        : status === 413
            ? "Request body is too large"
            : status === 403
                ? "Origin not allowed"
                : "Internal server error";
    res.status(status).json({ error: message });
});
// Start server
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
server.listen(PORT, HOST, () => console.log(`[Server] Running on port ${PORT} — Supabase backend`));
// Initialize socket
(0, socket_1.initSocket)(server);
const shutdown = (signal) => {
    console.log(`[Server] ${signal} received; closing connections`);
    server.close((error) => {
        if (error) {
            console.error("[Server] Graceful shutdown failed:", error);
            process.exit(1);
        }
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
