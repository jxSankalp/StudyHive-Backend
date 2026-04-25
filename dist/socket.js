"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initSocket = exports.getOnlineUserCountByIds = void 0;
// socket.ts
const socket_io_1 = require("socket.io");
const supabase_1 = require("./lib/supabase");
let io;
const onlineUsers = new Map();
const addOnlineUser = (userId, socketId) => {
    const userSockets = onlineUsers.get(userId) ?? new Set();
    userSockets.add(socketId);
    onlineUsers.set(userId, userSockets);
};
const removeOnlineUser = (userId, socketId) => {
    const userSockets = onlineUsers.get(userId);
    if (!userSockets)
        return;
    userSockets.delete(socketId);
    if (userSockets.size === 0) {
        onlineUsers.delete(userId);
    }
};
const getOnlineUserCountByIds = (userIds) => {
    const uniqueIds = new Set(userIds);
    let count = 0;
    for (const userId of uniqueIds) {
        if (onlineUsers.has(userId)) {
            count += 1;
        }
    }
    return count;
};
exports.getOnlineUserCountByIds = getOnlineUserCountByIds;
const initSocket = (server) => {
    io = new socket_io_1.Server(server, {
        pingTimeout: 60000,
        cors: {
            origin: process.env.CLIENT_URL,
        },
    });
    io.on("connection", (socket) => {
        socket.on("setup", (userId) => {
            socket.data.userId = userId;
            addOnlineUser(userId, socket.id);
            socket.join(userId);
            socket.emit("connected");
        });
        socket.on("join chat", (room, userId) => {
            if (!room || room === "undefined") {
                console.warn(`${userId} attempted to join invalid room: ${room}`);
                return;
            }
            socket.join(room);
            console.log(userId + " Joined Chat room: " + room);
        });
        socket.on("new message", (newMessageRecieved) => {
            const roomId = newMessageRecieved?.chat_id ||
                newMessageRecieved?.chatId ||
                newMessageRecieved?.chat?.id ||
                newMessageRecieved?.chat?._id;
            if (!roomId || roomId === "undefined") {
                return console.log("new message missing room/chat id");
            }
            socket.to(roomId).emit("message recieved", newMessageRecieved);
        });
        socket.on("note:join", (noteId, userId) => {
            socket.join(noteId);
            console.log(`${userId} joined notes room: ${noteId}`);
        });
        socket.on("note:update", ({ noteId, content }) => {
            socket.to(noteId).emit("note:content-update", { noteId, content });
        });
        socket.on("note:save", async ({ noteId, content }) => {
            try {
                await supabase_1.supabase.from("notes").update({ content }).eq("id", noteId);
                console.log(`Note ${noteId} saved to DB`);
            }
            catch (error) {
                console.error("Error saving note:", error);
            }
        });
        socket.on("whiteboard:join", (whiteboardId, userId) => {
            socket.join(whiteboardId);
            console.log(`${userId} joined whiteboard room: ${whiteboardId}`);
        });
        socket.on("whiteboard:draw", (data) => {
            const { whiteboardId, drawingData } = data;
            socket.to(whiteboardId).emit("whiteboard:update", drawingData);
        });
        socket.on("whiteboard:save", async ({ whiteboardId, whiteboardData }) => {
            try {
                await supabase_1.supabase
                    .from("whiteboards")
                    .update({ data: whiteboardData })
                    .eq("id", whiteboardId);
                console.log(`Whiteboard ${whiteboardId} saved to DB`);
            }
            catch (error) {
                console.error("Error saving whiteboard:", error);
            }
        });
        socket.on("disconnect", () => {
            const userId = socket.data.userId;
            if (!userId)
                return;
            removeOnlineUser(userId, socket.id);
        });
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
