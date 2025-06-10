import express from "express";
import dotenv from "dotenv";
import userRoutes from "./routes/userRoutes";
import chatRoutes from "./routes/chatRoutes";
import webhookRouter from "./routes/webhooks";
import messageRoutes from "./routes/messageRoutes";
import { clerkMiddleware } from "@clerk/express";
import { connectDB } from "./config/db";
import type { User, Message, Chat } from "./types/user";

dotenv.config();

const app = express();

//Need to be before express.json() to ensure raw body is available for svix
app.use("/api/webhooks", webhookRouter);
app.use(clerkMiddleware());
app.use(express.json());

// Connect to DB
connectDB();

// Routes
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: {
    origin: "http://localhost:5173",
  },
});

io.on("connection", (socket: any) => {
  socket.on("setup", (userId: string) => {
    socket.join(userId);
    socket.emit("connected");
  });

  socket.on("join chat", (room: string, userId: string) => {
    socket.join(room);
    console.log(userId + " Joined Room: " + room);
  });

  socket.on("new message", (newMessageRecieved: Message) => {
    var chat = newMessageRecieved.chat as Chat;

    console.log(newMessageRecieved.content);

    if (!chat.users) return console.log("chat.users not defined");
    socket.in(chat._id).emit("message recieved", newMessageRecieved);
  });
});
