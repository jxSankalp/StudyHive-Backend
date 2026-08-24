import { notifyUsers } from "../socket";
import { supabase } from "./supabase";

export class InvalidMentionError extends Error {}

export const normalizeMentionIds = (value: unknown): string[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ids = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)));
  return ids.length <= 25 ? ids : null;
};

export const validateMentionMembers = async (chatId: string, mentionIds: string[], content?: string) => {
  if (mentionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("chat_members")
    .select("user_id, profile:profiles!chat_members_user_id_fkey ( id, username )")
    .eq("chat_id", chatId)
    .in("user_id", mentionIds);
  if (error) throw error;
  if ((data ?? []).length !== mentionIds.length) {
    throw new InvalidMentionError("Every mentioned user must belong to this workspace");
  }
  if (content !== undefined) {
    const normalizedContent = content.toLocaleLowerCase();
    const hasMissingToken = (data ?? []).some((row) => {
      const profile = row.profile as unknown as { username?: string } | null;
      return !profile?.username || !normalizedContent.includes(`@${profile.username.toLocaleLowerCase()}`);
    });
    if (hasMissingToken) throw new InvalidMentionError("Every mentioned user must appear in the message");
  }
  return data ?? [];
};

export const syncMessageMentions = async ({
  messageId,
  chatId,
  senderId,
  senderName,
  content,
  mentionIds,
}: {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  mentionIds: string[];
}) => {
  const members = await validateMentionMembers(chatId, mentionIds, content);
  const { data: existingRows, error: existingError } = await supabase
    .from("message_mentions")
    .select("user_id")
    .eq("message_id", messageId);
  if (existingError) throw existingError;

  const existingIds = new Set((existingRows ?? []).map((row) => row.user_id));
  if (mentionIds.length > 0) {
    const { error } = await supabase.from("message_mentions").upsert(
      mentionIds.map((userId) => ({ message_id: messageId, user_id: userId })),
      { onConflict: "message_id,user_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  const removedIds = [...existingIds].filter((id) => !mentionIds.includes(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("message_mentions")
      .delete()
      .eq("message_id", messageId)
      .in("user_id", removedIds);
    if (error) throw error;
    const { error: notificationError } = await supabase.from("notifications")
      .delete()
      .eq("entity_type", "message")
      .eq("entity_id", messageId)
      .in("user_id", removedIds);
    if (notificationError) console.error("[syncMessageMentions] stale notification cleanup failed", notificationError);
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
    const { data: notifications, error } = await supabase.from("notifications")
      .insert(notificationRows)
      .select();
    if (error) {
      console.error("[syncMessageMentions] notification insert failed", error);
    } else {
      for (const notification of notifications ?? []) {
        notifyUsers([notification.user_id], {
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
