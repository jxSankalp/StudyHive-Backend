"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = exports.allMessages = void 0;
const access_1 = require("../lib/access");
const supabase_1 = require("../lib/supabase");
const MESSAGE_SELECT = `id, content, created_at, chat_id,
  sender:profiles!messages_sender_id_fkey ( id, username, email, photo )`;
const allMessages = async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("chat_id", chatId)
            .order("created_at", { ascending: true });
        if (error)
            throw error;
        res.json(data ?? []);
    }
    catch (error) {
        console.error("[allMessages]", error);
        res.status(500).json({ error: "Failed to load messages" });
    }
};
exports.allMessages = allMessages;
const sendMessage = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || !content) {
        res.status(400).json({ error: "content and chatId are required" });
        return;
    }
    if (content.length > 10000) {
        res.status(400).json({ error: "Message is too long" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const { data: message, error } = await supabase_1.supabase
            .from("messages")
            .insert({ sender_id: userId, content, chat_id: chatId })
            .select(MESSAGE_SELECT)
            .single();
        if (error)
            throw error;
        const { error: chatError } = await supabase_1.supabase
            .from("chats")
            .update({ latest_message_id: message.id, updated_at: new Date().toISOString() })
            .eq("id", chatId);
        if (chatError)
            console.error("[sendMessage] latest message update failed", chatError);
        res.status(201).json(message);
    }
    catch (error) {
        console.error("[sendMessage]", error);
        res.status(500).json({ error: "Failed to send message" });
    }
};
exports.sendMessage = sendMessage;
