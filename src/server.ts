// server.ts
import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { initSocket } from "./socket"; 
import userRoutes from "./routes/userRoutes";
import chatRoutes from "./routes/chatRoutes";
import webhookRouter from "./routes/webhooks";
import messageRoutes from "./routes/messageRoutes";
import notesRoutes from "./routes/notesRoutes";
import { clerkMiddleware } from "@clerk/express";
import { connectDB } from "./config/db";
import videoRoutes from "./routes/video.Routes";
import whiteboardRoutes from "./routes/whiteboardRoutes";

dotenv.config();

const app = express();
const server = createServer(app); 

// Need to be before express.json() for svix webhook raw body
app.use("/api/webhooks", webhookRouter);
app.use(clerkMiddleware());
app.use(express.json());

// Connect to DB
connectDB();

// Routes
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
