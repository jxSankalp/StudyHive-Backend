// server.ts
import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { initSocket } from "./socket"; 
import userRoutes from "./routes/userRoutes";
import chatRoutes from "./routes/chatRoutes";
import authRoutes from "./routes/authRoutes";
import messageRoutes from "./routes/messageRoutes";
import notesRoutes from "./routes/notesRoutes";
import { connectDB } from "./config/db";
import videoRoutes from "./routes/videoRoutes";
import whiteboardRoutes from "./routes/whiteboardRoutes";
import cors from "cors";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
const server = createServer(app); 

app.use(cors({
  origin:process.env.CLIENT_URL ,
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Connect to DB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/meet", videoRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/whiteboards", whiteboardRoutes);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Initialize socket
initSocket(server); 
