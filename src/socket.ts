// socket.ts
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { supabase } from "./lib/supabase";

let io: Server;

export const initSocket = (server: HTTPServer) => {
  io = new Server(server, {
    pingTimeout: 60000,
    cors: {
      origin: process.env.CLIENT_URL,
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

    socket.on("new message", (newMessageRecieved: any) => {
      const chat = newMessageRecieved.chat;
      if (!chat?.users) return console.log("chat.users not defined");
      socket.in(chat.id || chat._id).emit("message recieved", newMessageRecieved);
    });

    socket.on("note:join", (noteId: string, userId: string) => {
      socket.join(noteId);
      console.log(`${userId} joined notes room: ${noteId}`);
    });

    socket.on("note:update", ({ noteId, content }) => {
      socket.to(noteId).emit("note:content-update", { noteId, content });
    });

    socket.on("note:save", async ({ noteId, content }) => {
      try {
        await supabase.from("notes").update({ content }).eq("id", noteId);
        console.log(`Note ${noteId} saved to DB`);
      } catch (error) {
        console.error("Error saving note:", error);
      }
    });

    socket.on("whiteboard:join", (whiteboardId: string, userId: string) => {
      socket.join(whiteboardId);
      console.log(`${userId} joined whiteboard room: ${whiteboardId}`);
    });

    socket.on("whiteboard:draw", (data) => {
      const { whiteboardId, drawingData } = data;
      socket.to(whiteboardId).emit("whiteboard:update", drawingData);
    });

    socket.on("whiteboard:save", async ({ whiteboardId, whiteboardData }) => {
      try {
        await supabase
          .from("whiteboards")
          .update({ data: whiteboardData })
          .eq("id", whiteboardId);
        console.log(`Whiteboard ${whiteboardId} saved to DB`);
      } catch (error) {
        console.error("Error saving whiteboard:", error);
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
