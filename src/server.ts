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
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
const server = createServer(app);

// CORS: allow any localhost port in development (handles Vite port changes)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-machine requests (localhost on any port) and configured CLIENT_URL
      if (
        !origin ||
        origin.startsWith("http://localhost:") ||
        origin === process.env.CLIENT_URL
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/meet", videoRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/whiteboards", whiteboardRoutes);

// Health check
app.get("/health", (_req: Request, res: Response): void => {
  res.json({ ok: true });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`[Server] Running on port ${PORT} — Supabase backend`)
);

// Initialize socket
initSocket(server);
