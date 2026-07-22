"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleReaction = exports.deleteMessage = exports.updateMessage = exports.sendMessage = exports.allMessages = void 0;
const access_1 = require("../lib/access");
const supabase_1 = require("../lib/supabase");
const socket_1 = require("../socket");
const MESSAGE_SELECT = `id, content, created_at, edited_at, deleted_at, chat_id, reply_to_id,
  sender:profiles!messages_sender_id_fkey ( id, username, email, photo ),
  reply_to:messages!messages_reply_to_id_fkey ( id, content, deleted_at, sender:profiles!messages_sender_id_fkey ( id, username ) ),
  reactions:message_reactions ( emoji, user_id )`;
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
    const replyToId = typeof req.body.replyToId === "string" && req.body.replyToId ? req.body.replyToId : null;
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
        if (replyToId) {
            const { data: repliedMessage, error: replyError } = await supabase_1.supabase.from("messages").select("id").eq("id", replyToId).eq("chat_id", chatId).maybeSingle();
            if (replyError)
                throw replyError;
            if (!repliedMessage) {
                res.status(400).json({ error: "Reply target is not in this workspace" });
                return;
            }
        }
        const { data: message, error } = await supabase_1.supabase
            .from("messages")
            .insert({ sender_id: userId, content, chat_id: chatId, reply_to_id: replyToId })
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
const updateMessage = async (req, res) => {
    const userId = req.user?.userId;
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!content || content.length > 10000) {
        res.status(400).json({ error: "Message must be between 1 and 10,000 characters" });
        return;
    }
    try {
        const { data: existing, error: findError } = await supabase_1.supabase.from("messages").select("id, chat_id, sender_id, deleted_at").eq("id", req.params.messageId).maybeSingle();
        if (findError)
            throw findError;
        if (!existing) {
            res.status(404).json({ error: "Message not found" });
            return;
        }
        if (existing.sender_id !== userId || existing.deleted_at) {
            res.status(403).json({ error: "Only the sender can edit this message" });
            return;
        }
        if (!(await (0, access_1.isChatMember)(existing.chat_id, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", existing.id).select(MESSAGE_SELECT).single();
        if (error)
            throw error;
        (0, socket_1.broadcastToChat)(existing.chat_id, "message updated", data);
        res.json(data);
    }
    catch (error) {
        console.error("[updateMessage]", error);
        res.status(500).json({ error: "Failed to update message" });
    }
};
exports.updateMessage = updateMessage;
const deleteMessage = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: existing, error: findError } = await supabase_1.supabase.from("messages").select("id, chat_id, sender_id, deleted_at").eq("id", req.params.messageId).maybeSingle();
        if (findError)
            throw findError;
        if (!existing) {
            res.status(404).json({ error: "Message not found" });
            return;
        }
        if (existing.sender_id !== userId && !(await (0, access_1.isChatAdmin)(existing.chat_id, userId))) {
            res.status(403).json({ error: "Only the sender or a workspace admin can delete it" });
            return;
        }
        const deletedAt = new Date().toISOString();
        const { error } = await supabase_1.supabase.from("messages").update({ content: "", deleted_at: deletedAt, edited_at: null }).eq("id", existing.id);
        if (error)
            throw error;
        await supabase_1.supabase.from("message_reactions").delete().eq("message_id", existing.id);
        const payload = { _id: existing.id, id: existing.id, chatId: existing.chat_id, chat_id: existing.chat_id, deletedAt, deleted_at: deletedAt };
        (0, socket_1.broadcastToChat)(existing.chat_id, "message deleted", payload);
        res.json(payload);
    }
    catch (error) {
        console.error("[deleteMessage]", error);
        res.status(500).json({ error: "Failed to delete message" });
    }
};
exports.deleteMessage = deleteMessage;
const toggleReaction = async (req, res) => {
    const userId = req.user?.userId;
    const emoji = typeof req.body.emoji === "string" ? req.body.emoji.trim() : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!emoji || emoji.length > 16) {
        res.status(400).json({ error: "Invalid reaction" });
        return;
    }
    try {
        const { data: message, error: findError } = await supabase_1.supabase.from("messages").select("id, chat_id, deleted_at").eq("id", req.params.messageId).maybeSingle();
        if (findError)
            throw findError;
        if (!message || message.deleted_at) {
            res.status(404).json({ error: "Message not found" });
            return;
        }
        if (!(await (0, access_1.isChatMember)(message.chat_id, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data: existing, error: existingError } = await supabase_1.supabase.from("message_reactions").select("message_id").eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
        if (existingError)
            throw existingError;
        if (existing)
            await supabase_1.supabase.from("message_reactions").delete().eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji);
        else
            await supabase_1.supabase.from("message_reactions").insert({ message_id: message.id, user_id: userId, emoji });
        const { data: reactions, error } = await supabase_1.supabase.from("message_reactions").select("emoji, user_id").eq("message_id", message.id);
        if (error)
            throw error;
        const payload = { messageId: message.id, chatId: message.chat_id, reactions: reactions ?? [] };
        (0, socket_1.broadcastToChat)(message.chat_id, "message reactions", payload);
        res.json(payload);
    }
    catch (error) {
        console.error("[toggleReaction]", error);
        res.status(500).json({ error: "Failed to update reaction" });
    }
};
exports.toggleReaction = toggleReaction;
