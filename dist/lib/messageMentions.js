"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncMessageMentions = exports.validateMentionMembers = exports.normalizeMentionIds = exports.InvalidMentionError = void 0;
const socket_1 = require("../socket");
const supabase_1 = require("./supabase");
class InvalidMentionError extends Error {
}
exports.InvalidMentionError = InvalidMentionError;
const normalizeMentionIds = (value) => {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        return null;
    const ids = Array.from(new Set(value.filter((item) => typeof item === "string" && item.length > 0)));
    return ids.length <= 25 ? ids : null;
};
exports.normalizeMentionIds = normalizeMentionIds;
const validateMentionMembers = async (chatId, mentionIds, content) => {
    if (mentionIds.length === 0)
        return [];
    const { data, error } = await supabase_1.supabase
        .from("chat_members")
        .select("user_id, profile:profiles!chat_members_user_id_fkey ( id, username )")
        .eq("chat_id", chatId)
        .in("user_id", mentionIds);
    if (error)
        throw error;
    if ((data ?? []).length !== mentionIds.length) {
        throw new InvalidMentionError("Every mentioned user must belong to this workspace");
    }
    if (content !== undefined) {
        const normalizedContent = content.toLocaleLowerCase();
        const hasMissingToken = (data ?? []).some((row) => {
            const profile = row.profile;
            return !profile?.username || !normalizedContent.includes(`@${profile.username.toLocaleLowerCase()}`);
        });
        if (hasMissingToken)
            throw new InvalidMentionError("Every mentioned user must appear in the message");
    }
    return data ?? [];
};
exports.validateMentionMembers = validateMentionMembers;
const syncMessageMentions = async ({ messageId, chatId, senderId, senderName, content, mentionIds, }) => {
    const members = await (0, exports.validateMentionMembers)(chatId, mentionIds, content);
    const { data: existingRows, error: existingError } = await supabase_1.supabase
        .from("message_mentions")
        .select("user_id")
        .eq("message_id", messageId);
    if (existingError)
        throw existingError;
    const existingIds = new Set((existingRows ?? []).map((row) => row.user_id));
    if (mentionIds.length > 0) {
        const { error } = await supabase_1.supabase.from("message_mentions").upsert(mentionIds.map((userId) => ({ message_id: messageId, user_id: userId })), { onConflict: "message_id,user_id", ignoreDuplicates: true });
        if (error)
            throw error;
    }
    const removedIds = [...existingIds].filter((id) => !mentionIds.includes(id));
    if (removedIds.length > 0) {
        const { error } = await supabase_1.supabase.from("message_mentions")
            .delete()
            .eq("message_id", messageId)
            .in("user_id", removedIds);
        if (error)
            throw error;
        const { error: notificationError } = await supabase_1.supabase.from("notifications")
            .delete()
            .eq("entity_type", "message")
            .eq("entity_id", messageId)
            .in("user_id", removedIds);
        if (notificationError)
            console.error("[syncMessageMentions] stale notification cleanup failed", notificationError);
    }
    const recipientIds = mentionIds.filter((id) => id !== senderId && !existingIds.has(id));
    if (recipientIds.length > 0) {
        const notificationRows = recipientIds.map((userId) => ({
            user_id: userId,
            chat_id: chatId,
            type: "message_mention",
            title: `${senderName} mentioned you`,
            body: content.slice(0, 300),
            entity_type: "message",
            entity_id: messageId,
        }));
        const { data: notifications, error } = await supabase_1.supabase.from("notifications")
            .insert(notificationRows)
            .select();
        if (error) {
            console.error("[syncMessageMentions] notification insert failed", error);
        }
        else {
            for (const notification of notifications ?? []) {
                (0, socket_1.notifyUsers)([notification.user_id], {
                    ...notification,
                    chatId,
                    entityType: "message",
                    entityId: messageId,
                });
            }
        }
    }
    return members;
};
exports.syncMessageMentions = syncMessageMentions;
