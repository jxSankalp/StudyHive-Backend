"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initSocket = exports.revokeChatSocketAccess = exports.broadcastToChat = exports.notifyUsers = exports.getOnlineUserCountByIds = void 0;
const socket_io_1 = require("socket.io");
const access_1 = require("./lib/access");
const supabase_1 = require("./lib/supabase");
const cors_1 = require("./lib/cors");
let io;
const onlineUsers = new Map();
const addOnlineUser = (userId, socketId) => {
    const sockets = onlineUsers.get(userId) ?? new Set();
    sockets.add(socketId);
    onlineUsers.set(userId, sockets);
};
const removeOnlineUser = (userId, socketId) => {
    const sockets = onlineUsers.get(userId);
    if (!sockets)
        return;
    sockets.delete(socketId);
    if (sockets.size === 0)
        onlineUsers.delete(userId);
};
const getOnlineUserCountByIds = (userIds) => Array.from(new Set(userIds)).filter((userId) => onlineUsers.has(userId)).length;
exports.getOnlineUserCountByIds = getOnlineUserCountByIds;
const notifyUsers = (userIds, payload) => {
    if (!io)
        return;
    for (const userId of new Set(userIds))
        io.to(`user:${userId}`).emit("notification:new", payload);
};
exports.notifyUsers = notifyUsers;
const broadcastToChat = (chatId, event, payload) => {
    if (io)
        io.to(`chat:${chatId}`).emit(event, payload);
};
exports.broadcastToChat = broadcastToChat;
const revokeChatSocketAccess = async (userId, chatId) => {
    if (!io)
        return;
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
        socket.leave(`chat:${chatId}`);
        const noteChats = (socket.data.noteChats ?? {});
        for (const [noteId, resourceChatId] of Object.entries(noteChats)) {
            if (resourceChatId === chatId) {
                socket.leave(`note:${noteId}`);
                delete noteChats[noteId];
            }
        }
        const whiteboardChats = (socket.data.whiteboardChats ?? {});
        for (const [whiteboardId, resourceChatId] of Object.entries(whiteboardChats)) {
            if (resourceChatId === chatId) {
                socket.leave(`whiteboard:${whiteboardId}`);
                delete whiteboardChats[whiteboardId];
            }
        }
        socket.emit("realtime:access-revoked", { chatId });
    }
};
exports.revokeChatSocketAccess = revokeChatSocketAccess;
const serializedSize = (value) => {
    try {
        return JSON.stringify(value).length;
    }
    catch {
        return Number.POSITIVE_INFINITY;
    }
};
const initSocket = (server) => {
    io = new socket_io_1.Server(server, {
        pingTimeout: 60000,
        pingInterval: 25000,
        maxHttpBufferSize: 2000000,
        cors: {
            origin: cors_1.corsOrigin,
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
            const { data, error } = await supabase_1.supabase.auth.getUser(token);
            if (error || !data.user) {
                next(new Error("Invalid or expired token"));
                return;
            }
            socket.data.userId = data.user.id;
            next();
        }
        catch {
            next(new Error("Authentication failed"));
        }
    });
    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        addOnlineUser(userId, socket.id);
        socket.join(`user:${userId}`);
        socket.emit("connected");
        // Kept for backwards-compatible clients. Identity comes from the verified token.
        socket.on("setup", () => socket.emit("connected"));
        socket.on("join chat", async (chatId) => {
            try {
                if (typeof chatId !== "string" || !(await (0, access_1.isChatMember)(chatId, userId))) {
                    socket.emit("realtime:error", { resource: "chat", message: "Access denied" });
                    return;
                }
                socket.join(`chat:${chatId}`);
            }
            catch (error) {
                console.error("[socket] join chat", error);
                socket.emit("realtime:error", { resource: "chat", message: "Unable to join workspace" });
            }
        });
        socket.on("new message", async (payload) => {
            const chatId = payload?.chat_id ?? payload?.chatId;
            const messageId = payload?.id ?? payload?._id;
            try {
                if (!chatId || !messageId || !(await (0, access_1.isChatMember)(chatId, userId)))
                    return;
                // Never relay client-provided message content. Re-read the persisted row
                // so a member cannot spoof a sender, message id, or HTML payload over the socket.
                const { data: message, error } = await supabase_1.supabase
                    .from("messages")
                    .select(`id, content, created_at, edited_at, deleted_at, chat_id, reply_to_id,
            sender:profiles!messages_sender_id_fkey ( id, username, email, photo ),
            reply_to:messages!messages_reply_to_id_fkey ( id, content, deleted_at, sender:profiles!messages_sender_id_fkey ( id, username ) ),
            reactions:message_reactions ( emoji, user_id )`)
                    .eq("id", messageId)
                    .eq("chat_id", chatId)
                    .eq("sender_id", userId)
                    .maybeSingle();
                if (error)
                    throw error;
                if (message)
                    socket.to(`chat:${chatId}`).emit("message received", message);
            }
            catch (error) {
                console.error("[socket] new message", error);
            }
        });
        socket.on("note:join", async (noteId) => {
            var _a;
            try {
                const chatId = typeof noteId === "string" ? await (0, access_1.getNoteChatId)(noteId) : null;
                if (!chatId || !(await (0, access_1.isChatMember)(chatId, userId))) {
                    socket.emit("realtime:error", { resource: "note", message: "Access denied" });
                    return;
                }
                socket.join(`note:${noteId}`);
                const noteChats = ((_a = socket.data).noteChats ?? (_a.noteChats = {}));
                noteChats[noteId] = chatId;
            }
            catch (error) {
                console.error("[socket] note:join", error);
            }
        });
        socket.on("note:leave", (noteId) => {
            socket.leave(`note:${noteId}`);
            const noteChats = (socket.data.noteChats ?? {});
            delete noteChats[noteId];
        });
        socket.on("note:update", (payload) => {
            if (!payload?.noteId ||
                typeof payload.content !== "string" ||
                payload.content.length > 100000 ||
                !socket.rooms.has(`note:${payload.noteId}`))
                return;
            socket.to(`note:${payload.noteId}`).emit("note:content-update", payload);
        });
        socket.on("note:save", async (payload) => {
            const { noteId, content } = payload ?? {};
            if (!noteId || typeof content !== "string" || content.length > 100000)
                return;
            try {
                if (!socket.rooms.has(`note:${noteId}`))
                    throw new Error("Access denied");
                const { error } = await supabase_1.supabase
                    .from("notes")
                    .update({ content, updated_at: new Date().toISOString() })
                    .eq("id", noteId);
                if (error)
                    throw error;
                socket.emit("note:saved", { noteId, success: true });
            }
            catch (error) {
                console.error("[socket] note:save", error);
                socket.emit("note:save-error", { noteId, message: "Failed to save note" });
            }
        });
        socket.on("whiteboard:join", async (whiteboardId) => {
            var _a;
            try {
                const chatId = typeof whiteboardId === "string" ? await (0, access_1.getWhiteboardChatId)(whiteboardId) : null;
                if (!chatId || !(await (0, access_1.isChatMember)(chatId, userId))) {
                    socket.emit("realtime:error", { resource: "whiteboard", message: "Access denied" });
                    return;
                }
                socket.join(`whiteboard:${whiteboardId}`);
                const whiteboardChats = ((_a = socket.data).whiteboardChats ?? (_a.whiteboardChats = {}));
                whiteboardChats[whiteboardId] = chatId;
            }
            catch (error) {
                console.error("[socket] whiteboard:join", error);
            }
        });
        socket.on("whiteboard:leave", (whiteboardId) => {
            socket.leave(`whiteboard:${whiteboardId}`);
            const whiteboardChats = (socket.data.whiteboardChats ?? {});
            delete whiteboardChats[whiteboardId];
        });
        socket.on("whiteboard:draw", (payload) => {
            if (!payload?.whiteboardId ||
                serializedSize(payload.drawingData) > 1500000 ||
                !socket.rooms.has(`whiteboard:${payload.whiteboardId}`))
                return;
            socket
                .to(`whiteboard:${payload.whiteboardId}`)
                .emit("whiteboard:update", payload.drawingData);
        });
        socket.on("whiteboard:clear-all", (payload) => {
            if (!payload?.whiteboardId || !socket.rooms.has(`whiteboard:${payload.whiteboardId}`))
                return;
            socket.to(`whiteboard:${payload.whiteboardId}`).emit("whiteboard:clear-all");
        });
        socket.on("whiteboard:save", async (payload) => {
            const { whiteboardId, whiteboardData } = payload ?? {};
            if (!whiteboardId || serializedSize(whiteboardData) > 1500000)
                return;
            try {
                if (!socket.rooms.has(`whiteboard:${whiteboardId}`))
                    throw new Error("Access denied");
                const { error } = await supabase_1.supabase
                    .from("whiteboards")
                    .update({ data: whiteboardData, updated_at: new Date().toISOString() })
                    .eq("id", whiteboardId);
                if (error)
                    throw error;
                socket.emit("whiteboard:saved", { whiteboardId, success: true });
            }
            catch (error) {
                console.error("[socket] whiteboard:save", error);
                socket.emit("whiteboard:save-error", { whiteboardId, message: "Failed to save whiteboard" });
            }
        });
        socket.on("meeting:join", async (callId) => {
            try {
                const { data: meeting, error } = await supabase_1.supabase
                    .from("meetings")
                    .select("id, chat_id")
                    .eq("call_id", callId)
                    .maybeSingle();
                if (error)
                    throw error;
                if (!meeting || !(await (0, access_1.isChatMember)(meeting.chat_id, userId)))
                    return;
                const { data: participant, error: participantError } = await supabase_1.supabase
                    .from("meeting_participants")
                    .select("user_id")
                    .eq("meeting_id", meeting.id)
                    .eq("user_id", userId)
                    .maybeSingle();
                if (participantError)
                    throw participantError;
                if (!participant)
                    return;
                socket.join(`meeting:${callId}`);
                socket.to(`meeting:${callId}`).emit("meeting:user-joined", { userId });
            }
            catch (error) {
                console.error("[socket] meeting:join", error);
            }
        });
        socket.on("meeting:leave", (callId) => {
            socket.leave(`meeting:${callId}`);
            socket.to(`meeting:${callId}`).emit("meeting:user-left", { userId });
        });
        socket.on("disconnect", () => removeOnlineUser(userId, socket.id));
    });
    return io;
};
exports.initSocket = initSocket;
const getIO = () => {
    if (!io)
        throw new Error("Socket.io not initialized");
    return io;
};
exports.getIO = getIO;
