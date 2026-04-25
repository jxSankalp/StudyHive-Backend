"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = exports.allMessages = void 0;
const supabase_1 = require("../lib/supabase");
const allMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { data, error } = await supabase_1.supabase
            .from("messages")
            .select(`id, content, created_at, chat_id,
         sender:profiles!messages_sender_id_fkey ( id, username, email, photo )`)
            .eq("chat_id", chatId)
            .order("created_at", { ascending: true });
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.allMessages = allMessages;
const sendMessage = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const { content, chatId } = req.body;
        if (!content || !chatId) {
            res.status(400).json({ error: "content and chatId are required" });
            return;
        }
        const { data: message, error: msgError } = await supabase_1.supabase
            .from("messages")
            .insert({ sender_id: userId, content, chat_id: chatId })
            .select(`id, content, created_at, chat_id,
         sender:profiles!messages_sender_id_fkey ( id, username, email, photo )`)
            .single();
        if (msgError)
            throw msgError;
        // Update chat's latest_message_id
        await supabase_1.supabase
            .from("chats")
            .update({ latest_message_id: message.id, updated_at: new Date().toISOString() })
            .eq("id", chatId);
        res.json(message);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.sendMessage = sendMessage;
