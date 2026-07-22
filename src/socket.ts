import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { getNoteChatId, getWhiteboardChatId, isChatMember } from "./lib/access";
import { supabase } from "./lib/supabase";
import { corsOrigin } from "./lib/cors";
import { withSignedChatFiles } from "./lib/chatFiles";

let io: Server;
const onlineUsers = new Map<string, Set<string>>();

const addOnlineUser = (userId: string, socketId: string) => {
  const sockets = onlineUsers.get(userId) ?? new Set<string>();
  sockets.add(socketId);
  onlineUsers.set(userId, sockets);
};

const removeOnlineUser = (userId: string, socketId: string) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
};

export const getOnlineUserCountByIds = (userIds: string[]): number =>
  Array.from(new Set(userIds)).filter((userId) => onlineUsers.has(userId)).length;

export const notifyUsers = (userIds: string[], payload: Record<string, unknown>) => {
  if (!io) return;
  for (const userId of new Set(userIds)) io.to(`user:${userId}`).emit("notification:new", payload);
};

export const broadcastToChat = (chatId: string, event: string, payload: Record<string, unknown>) => {
  if (io) io.to(`chat:${chatId}`).emit(event, payload);
};

export const revokeChatSocketAccess = async (userId: string, chatId: string) => {
  if (!io) return;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`chat:${chatId}`);
    const noteChats = (socket.data.noteChats ?? {}) as Record<string, string>;
    for (const [noteId, resourceChatId] of Object.entries(noteChats)) {
      if (resourceChatId === chatId) {
        socket.leave(`note:${noteId}`);
        delete noteChats[noteId];
      }
    }
    const whiteboardChats = (socket.data.whiteboardChats ?? {}) as Record<string, string>;
    for (const [whiteboardId, resourceChatId] of Object.entries(whiteboardChats)) {
      if (resourceChatId === chatId) {
        socket.leave(`whiteboard:${whiteboardId}`);
        delete whiteboardChats[whiteboardId];
      }
    }
    socket.emit("realtime:access-revoked", { chatId });
  }
};

const serializedSize = (value: unknown) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

interface MessagePayload {
  id?: string;
  _id?: string;
  chat_id?: string;
  chatId?: string;
  sender?: { id?: string; _id?: string };
}

export const initSocket = (server: HTTPServer) => {
  io = new Server(server, {
    pingTimeout: 60_000,
    pingInterval: 25_000,
    maxHttpBufferSize: 2_000_000,
    cors: {
      origin: corsOrigin,
      credentials: false,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) {
        next(new Error("Authentication required"));
        return;
      }
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        next(new Error("Invalid or expired token"));
        return;
      }
      socket.data.userId = data.user.id;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    addOnlineUser(userId, socket.id);
    socket.join(`user:${userId}`);
    socket.emit("connected");

    // Kept for backwards-compatible clients. Identity comes from the verified token.
    socket.on("setup", () => socket.emit("connected"));

    socket.on("join chat", async (chatId: string) => {
      try {
        if (typeof chatId !== "string" || !(await isChatMember(chatId, userId))) {
          socket.emit("realtime:error", { resource: "chat", message: "Access denied" });
          return;
        }
        socket.join(`chat:${chatId}`);
      } catch (error) {
        console.error("[socket] join chat", error);
        socket.emit("realtime:error", { resource: "chat", message: "Unable to join workspace" });
      }
    });

    socket.on("new message", async (payload: MessagePayload) => {
      const chatId = payload?.chat_id ?? payload?.chatId;
      const messageId = payload?.id ?? payload?._id;
      try {
        if (!chatId || !messageId || !(await isChatMember(chatId, userId))) return;
        // Never relay client-provided message content. Re-read the persisted row
        // so a member cannot spoof a sender, message id, or HTML payload over the socket.
        const { data: message, error } = await supabase
          .from("messages")
          .select(`id, content, created_at, edited_at, deleted_at, chat_id, reply_to_id,
            sender:profiles!messages_sender_id_fkey ( id, username, email, photo ),
            reply_to:messages!messages_reply_to_id_fkey ( id, content, deleted_at, sender:profiles!messages_sender_id_fkey ( id, username ) ),
            reactions:message_reactions ( emoji, user_id )`)
          .eq("id", messageId)
          .eq("chat_id", chatId)
          .eq("sender_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (message) {
          const [hydrated] = await withSignedChatFiles([message as unknown as Record<string, unknown>]);
          socket.to(`chat:${chatId}`).emit("message received", hydrated);
        }
      } catch (error) {
        console.error("[socket] new message", error);
      }
    });

    socket.on("note:join", async (noteId: string) => {
      try {
        const chatId = typeof noteId === "string" ? await getNoteChatId(noteId) : null;
        if (!chatId || !(await isChatMember(chatId, userId))) {
          socket.emit("realtime:error", { resource: "note", message: "Access denied" });
          return;
        }
        socket.join(`note:${noteId}`);
        const noteChats = (socket.data.noteChats ??= {}) as Record<string, string>;
        noteChats[noteId] = chatId;
      } catch (error) {
        console.error("[socket] note:join", error);
      }
    });

    socket.on("note:leave", (noteId: string) => {
      socket.leave(`note:${noteId}`);
      const noteChats = (socket.data.noteChats ?? {}) as Record<string, string>;
      delete noteChats[noteId];
    });

    socket.on("note:update", (payload: { noteId?: string; content?: string }) => {
      if (
        !payload?.noteId ||
        typeof payload.content !== "string" ||
        payload.content.length > 100_000 ||
        !socket.rooms.has(`note:${payload.noteId}`)
      ) return;
      socket.to(`note:${payload.noteId}`).emit("note:content-update", payload);
    });

    socket.on("note:save", async (payload: { noteId?: string; content?: string }) => {
      const { noteId, content } = payload ?? {};
      if (!noteId || typeof content !== "string" || content.length > 100_000) return;
      try {
        if (!socket.rooms.has(`note:${noteId}`)) throw new Error("Access denied");
        const { error } = await supabase
          .from("notes")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", noteId);
        if (error) throw error;
        socket.emit("note:saved", { noteId, success: true });
      } catch (error) {
        console.error("[socket] note:save", error);
        socket.emit("note:save-error", { noteId, message: "Failed to save note" });
      }
    });

    socket.on("whiteboard:join", async (whiteboardId: string) => {
      try {
        const chatId =
          typeof whiteboardId === "string" ? await getWhiteboardChatId(whiteboardId) : null;
        if (!chatId || !(await isChatMember(chatId, userId))) {
          socket.emit("realtime:error", { resource: "whiteboard", message: "Access denied" });
          return;
        }
        socket.join(`whiteboard:${whiteboardId}`);
        const whiteboardChats = (socket.data.whiteboardChats ??= {}) as Record<string, string>;
        whiteboardChats[whiteboardId] = chatId;
      } catch (error) {
        console.error("[socket] whiteboard:join", error);
      }
    });

    socket.on("whiteboard:leave", (whiteboardId: string) => {
      socket.leave(`whiteboard:${whiteboardId}`);
      const whiteboardChats = (socket.data.whiteboardChats ?? {}) as Record<string, string>;
      delete whiteboardChats[whiteboardId];
    });

    socket.on(
      "whiteboard:draw",
      (payload: { whiteboardId?: string; drawingData?: unknown }) => {
        if (
          !payload?.whiteboardId ||
          serializedSize(payload.drawingData) > 1_500_000 ||
          !socket.rooms.has(`whiteboard:${payload.whiteboardId}`)
        ) return;
        socket
          .to(`whiteboard:${payload.whiteboardId}`)
          .emit("whiteboard:update", payload.drawingData);
      }
    );

    socket.on("whiteboard:clear-all", (payload: { whiteboardId?: string }) => {
      if (!payload?.whiteboardId || !socket.rooms.has(`whiteboard:${payload.whiteboardId}`)) return;
      socket.to(`whiteboard:${payload.whiteboardId}`).emit("whiteboard:clear-all");
    });

    socket.on(
      "whiteboard:save",
      async (payload: { whiteboardId?: string; whiteboardData?: unknown }) => {
        const { whiteboardId, whiteboardData } = payload ?? {};
        if (!whiteboardId || serializedSize(whiteboardData) > 1_500_000) return;
        try {
          if (!socket.rooms.has(`whiteboard:${whiteboardId}`)) throw new Error("Access denied");
          const { error } = await supabase
            .from("whiteboards")
            .update({ data: whiteboardData, updated_at: new Date().toISOString() })
            .eq("id", whiteboardId);
          if (error) throw error;
          socket.emit("whiteboard:saved", { whiteboardId, success: true });
        } catch (error) {
          console.error("[socket] whiteboard:save", error);
          socket.emit("whiteboard:save-error", { whiteboardId, message: "Failed to save whiteboard" });
        }
      }
    );

    socket.on("meeting:join", async (callId: string) => {
      try {
        const { data: meeting, error } = await supabase
          .from("meetings")
          .select("id, chat_id")
          .eq("call_id", callId)
          .maybeSingle();
        if (error) throw error;
        if (!meeting || !(await isChatMember(meeting.chat_id, userId))) return;
        const { data: participant, error: participantError } = await supabase
          .from("meeting_participants")
          .select("user_id")
          .eq("meeting_id", meeting.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (participantError) throw participantError;
        if (!participant) return;
        socket.join(`meeting:${callId}`);
        socket.to(`meeting:${callId}`).emit("meeting:user-joined", { userId });
      } catch (error) {
        console.error("[socket] meeting:join", error);
      }
    });

    socket.on("meeting:leave", (callId: string) => {
      socket.leave(`meeting:${callId}`);
      socket.to(`meeting:${callId}`).emit("meeting:user-left", { userId });
    });

    socket.on("disconnect", () => removeOnlineUser(userId, socket.id));
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
