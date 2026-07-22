"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hydrateChatMessages = exports.MESSAGE_SELECT = void 0;
const chatFiles_1 = require("./chatFiles");
const supabase_1 = require("./supabase");
exports.MESSAGE_SELECT = `id, content, created_at, edited_at, deleted_at, chat_id, reply_to_id,
  sender:profiles!messages_sender_id_fkey ( id, username, email, photo ),
  reactions:message_reactions ( emoji, user_id )`;
/**
 * Loads self-referencing replies separately instead of relying on PostgREST's
 * schema-cache relationship discovery. This keeps chat readable on databases
 * where reply_to_id was created before its FK was repaired.
 */
const hydrateChatMessages = async (messages) => {
    if (messages.length === 0)
        return [];
    const replyIds = Array.from(new Set(messages
        .map((message) => message.reply_to_id)
        .filter((id) => typeof id === "string" && id.length > 0)));
    const replies = new Map();
    if (replyIds.length > 0) {
        const { data, error } = await supabase_1.supabase.from("messages")
            .select("id, content, deleted_at, sender:profiles!messages_sender_id_fkey ( id, username )")
            .in("id", replyIds);
        if (error)
            throw error;
        for (const reply of (data ?? []))
            replies.set(reply.id, reply);
    }
    const withReplies = messages.map((message) => ({
        ...message,
        reply_to: typeof message.reply_to_id === "string" ? replies.get(message.reply_to_id) ?? null : null,
    }));
    return (0, chatFiles_1.withSignedChatFiles)(withReplies);
};
exports.hydrateChatMessages = hydrateChatMessages;
