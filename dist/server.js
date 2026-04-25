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
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// CORS: allow any localhost port in development (handles Vite port changes)
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow same-machine requests (localhost on any port) and configured CLIENT_URL
        if (!origin ||
            origin.startsWith("http://localhost:") ||
            origin === process.env.CLIENT_URL) {
            callback(null, true);
        }
        else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Routes
app.use("/api/auth", authRoutes_1.default);
app.use("/api/meet", videoRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/chat", chatRoutes_1.default);
app.use("/api/messages", messageRoutes_1.default);
app.use("/api/notes", notesRoutes_1.default);
app.use("/api/whiteboards", whiteboardRoutes_1.default);
// Health check
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[Server] Running on port ${PORT} — Supabase backend`));
// Initialize socket
(0, socket_1.initSocket)(server);
