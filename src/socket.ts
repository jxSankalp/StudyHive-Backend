import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { getNoteChatId, getWhiteboardChatId, isChatMember } from "./lib/access";
import { supabase } from "./lib/supabase";
import { corsOrigin } from "./lib/cors";
import { hydrateChatMessages, MESSAGE_SELECT } from "./lib/chatMessages";
import { logError } from "./lib/telemetry";

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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const validWhiteboardShape = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value.attrs)) return false;
  const attrs = value.attrs;
  return typeof attrs.shapeId === "string" && attrs.shapeId.length > 0 && attrs.shapeId.length <= 100
    && ["pen", "eraser", "text", "rectangle", "circle"].includes(String(attrs.tool))
    && typeof attrs.x === "number" && Number.isFinite(attrs.x)
    && typeof attrs.y === "number" && Number.isFinite(attrs.y)
    && (!Array.isArray(attrs.points) || (attrs.points.length <= 20_000 && attrs.points.every((point) => typeof point === "number" && Number.isFinite(point))));
};
const validWhiteboardDelta = (value: unknown) => {
  if (!isRecord(value) || typeof value.op !== "string") return false;
  if (value.op === "shape:add") return validWhiteboardShape(value.shape);
  if (value.op === "shape:patch") {
    const allowedAttrs = new Set(["width", "height", "radius"]);
    return typeof value.shapeId === "string" && value.shapeId.length <= 100 && isRecord(value.attrs)
      && Object.entries(value.attrs).every(([key, candidate]) => allowedAttrs.has(key) && typeof candidate === "number" && Number.isFinite(candidate))
      && (!Array.isArray(value.appendPoints) || (value.appendPoints.length <= 128 && value.appendPoints.every((point) => typeof point === "number" && Number.isFinite(point))));
  }
  return value.op === "board:replace" && Array.isArray(value.shapes) && value.shapes.length <= 10_000 && value.shapes.every(validWhiteboardShape);
};

const consumeWhiteboardQuota = (socket: { data: Record<string, unknown> }) => {
  const now = Date.now();
  const current = socket.data.whiteboardDeltaRate as { windowStartedAt: number; count: number } | undefined;
  const rate = !current || now - current.windowStartedAt >= 1000 ? { windowStartedAt: now, count: 0 } : current;
  rate.count += 1;
  socket.data.whiteboardDeltaRate = rate;
  return rate.count <= 30;
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
        logError("socket.chat.join.failed", error, { socketId: socket.id, userId, chatId });
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
          .select(MESSAGE_SELECT)
          .eq("id", messageId)
          .eq("chat_id", chatId)
          .eq("sender_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (message) {
          const [hydrated] = await hydrateChatMessages([message as unknown as Record<string, unknown>]);
          socket.to(`chat:${chatId}`).emit("message received", hydrated);
        }
      } catch (error) {
        logError("socket.message.broadcast.failed", error, { socketId: socket.id, userId, chatId, messageId });
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
        logError("socket.note.join.failed", error, { socketId: socket.id, userId, noteId });
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
        logError("socket.note.save.failed", error, { socketId: socket.id, userId, noteId });
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
        logError("socket.whiteboard.join.failed", error, { socketId: socket.id, userId, whiteboardId });
      }
    });

    socket.on("whiteboard:leave", (whiteboardId: string) => {
      socket.leave(`whiteboard:${whiteboardId}`);
      const whiteboardChats = (socket.data.whiteboardChats ?? {}) as Record<string, string>;
      delete whiteboardChats[whiteboardId];
    });

    socket.on("whiteboard:delta", (payload: { whiteboardId?: string; deltas?: unknown[] }) => {
      if (!payload?.whiteboardId || !Array.isArray(payload.deltas) || payload.deltas.length < 1 || payload.deltas.length > 50) return;
      if (!consumeWhiteboardQuota(socket) || serializedSize(payload.deltas) > 64_000 || !payload.deltas.every(validWhiteboardDelta)) {
        socket.emit("realtime:error", { resource: "whiteboard", message: "Whiteboard update rate or payload exceeded" });
        return;
      }
      if (!socket.rooms.has(`whiteboard:${payload.whiteboardId}`)) return;
      socket.to(`whiteboard:${payload.whiteboardId}`).emit("whiteboard:deltas", payload.deltas);
    });

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
          logError("socket.whiteboard.save.failed", error, { socketId: socket.id, userId, whiteboardId });
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
        logError("socket.meeting.join.failed", error, { socketId: socket.id, userId, callId });
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
