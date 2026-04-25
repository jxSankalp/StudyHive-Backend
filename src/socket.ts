// socket.ts
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { supabase } from "./lib/supabase";

let io: Server;

// ─────────────────────────────────────────────────────────────
// Online presence tracking: userId → Set of socketIds
// Allows a user to be connected from multiple tabs/devices
// ─────────────────────────────────────────────────────────────
const onlineUsers = new Map<string, Set<string>>();

const addOnlineUser = (userId: string, socketId: string) => {
  const userSockets = onlineUsers.get(userId) ?? new Set<string>();
  userSockets.add(socketId);
  onlineUsers.set(userId, userSockets);
};

const removeOnlineUser = (userId: string, socketId: string) => {
  const userSockets = onlineUsers.get(userId);
  if (!userSockets) return;
  userSockets.delete(socketId);
  if (userSockets.size === 0) {
    onlineUsers.delete(userId);
  }
};

/** Returns how many *unique* users from the given IDs are currently online */
export const getOnlineUserCountByIds = (userIds: string[]): number => {
  const uniqueIds = new Set(userIds);
  let count = 0;
  for (const userId of uniqueIds) {
    if (onlineUsers.has(userId)) count += 1;
  }
  return count;
};

// ─────────────────────────────────────────────────────────────
// Socket.IO initialisation
// ─────────────────────────────────────────────────────────────
export const initSocket = (server: HTTPServer) => {
  io = new Server(server, {
    pingTimeout: 60_000,
    pingInterval: 25_000,
    cors: {
      origin: (origin, callback) => {
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
    },
  });

  io.on("connection", (socket) => {
    // ── Presence ──────────────────────────────────────────────
    socket.on("setup", (userId: string) => {
      if (!userId || typeof userId !== "string") return;
      socket.data.userId = userId;
      addOnlineUser(userId, socket.id);
      socket.join(userId);
      socket.emit("connected");
    });

    // ── Chat rooms ────────────────────────────────────────────
    socket.on("join chat", (room: string) => {
      if (!room || room === "undefined") {
        console.warn(`[socket] invalid room join attempt: "${room}"`);
        return;
      }
      socket.join(room);
    });

    // ── Messaging ─────────────────────────────────────────────
    socket.on("new message", (newMessageReceived: any) => {
      const roomId =
        newMessageReceived?.chat_id ||
        newMessageReceived?.chatId ||
        newMessageReceived?.chat?.id ||
        newMessageReceived?.chat?._id;

      if (!roomId || roomId === "undefined") {
        console.warn("[socket] new message missing chat id");
        return;
      }

      socket.to(roomId).emit("message recieved", newMessageReceived);
    });

    // ── Notes collaboration ───────────────────────────────────
    socket.on("note:join", (noteId: string) => {
      if (!noteId) return;
      socket.join(noteId);
    });

    socket.on("note:update", ({ noteId, content }: { noteId: string; content: string }) => {
      if (!noteId) return;
      socket.to(noteId).emit("note:content-update", { noteId, content });
    });

    socket.on("note:save", async ({ noteId, content }: { noteId: string; content: string }) => {
      if (!noteId) return;
      try {
        const { error } = await supabase
          .from("notes")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", noteId);

        if (error) throw error;
        socket.emit("note:saved", { noteId, success: true });
      } catch (error: any) {
        console.error("[socket] note:save error:", error);
        socket.emit("note:save-error", {
          noteId,
          message: error?.message ?? "Failed to save note",
        });
      }
    });

    // ── Whiteboard collaboration ──────────────────────────────
    socket.on("whiteboard:join", (whiteboardId: string) => {
      if (!whiteboardId) return;
      socket.join(whiteboardId);
    });

    socket.on("whiteboard:draw", (data: { whiteboardId: string; drawingData: any }) => {
      const { whiteboardId, drawingData } = data;
      if (!whiteboardId) return;
      socket.to(whiteboardId).emit("whiteboard:update", drawingData);
    });

    socket.on(
      "whiteboard:save",
      async ({ whiteboardId, whiteboardData }: { whiteboardId: string; whiteboardData: any }) => {
        if (!whiteboardId) return;
        try {
          const { error } = await supabase
            .from("whiteboards")
            .update({ data: whiteboardData, updated_at: new Date().toISOString() })
            .eq("id", whiteboardId);

          if (error) throw error;
          socket.emit("whiteboard:saved", { whiteboardId, success: true });
        } catch (error: any) {
          console.error("[socket] whiteboard:save error:", error);
          socket.emit("whiteboard:save-error", {
            whiteboardId,
            message: error?.message ?? "Failed to save whiteboard",
          });
        }
      }
    );

    // ── Meeting room signaling ────────────────────────────────
    socket.on("meeting:join", (callId: string, userId: string) => {
      if (!callId) return;
      socket.join(`meeting:${callId}`);
      socket.to(`meeting:${callId}`).emit("meeting:user-joined", { userId });
    });

    socket.on("meeting:leave", (callId: string, userId: string) => {
      if (!callId) return;
      socket.leave(`meeting:${callId}`);
      socket.to(`meeting:${callId}`).emit("meeting:user-left", { userId });
    });

    // ── Disconnect cleanup ────────────────────────────────────
    socket.on("disconnect", (reason) => {
      const userId = socket.data.userId as string | undefined;
      if (!userId) return;
      removeOnlineUser(userId, socket.id);
      console.log(`[socket] ${userId} disconnected (${reason})`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
