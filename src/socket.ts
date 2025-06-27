// socket.ts
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import type { Chat, Message } from "./types/user";
import { Notes } from "./models/notesModel";

let io: Server;

export const initSocket = (server: HTTPServer) => {
  io = new Server(server, {
    pingTimeout: 60000,
    cors: {
      origin: "http://localhost:5173",
    },
  });

  io.on("connection", (socket) => {
    socket.on("setup", (userId: string) => {
      socket.join(userId);
      socket.emit("connected");
    });

    socket.on("join chat", (room: string, userId: string) => {
      socket.join(room);
      console.log(userId + " Joined Chat room: " + room);
    });

    socket.on("new message", (newMessageRecieved: Message) => {
      const chat = newMessageRecieved.chat as Chat;

      if (!chat.users) return console.log("chat.users not defined");
      socket.in(chat._id).emit("message recieved", newMessageRecieved);
    });

    socket.on("note:join", (noteId: string , userId: string) => {
      socket.join(noteId);
      console.log(`${userId} joined notes room: ${noteId}`);
    });

    socket.on("note:update", ({ noteId, content }) => {
      socket.to(noteId).emit("note:content-update", { noteId, content });
    });

    socket.on("note:save", async ({ noteId, content }) => {
      try {
        await Notes.findByIdAndUpdate(noteId, { content });
        console.log(`Note ${noteId} saved to DB`);
      } catch (error) {
        console.error("Error saving note:", error);
      }
    });
      
  
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
