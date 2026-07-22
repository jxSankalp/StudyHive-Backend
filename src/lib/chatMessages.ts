import { withSignedChatFiles } from "./chatFiles";
import { supabase } from "./supabase";

export const MESSAGE_SELECT = `id, content, created_at, edited_at, deleted_at, chat_id, reply_to_id,
  sender:profiles!messages_sender_id_fkey ( id, username, email, photo ),
  reactions:message_reactions ( emoji, user_id )`;

interface ReplyRow {
  id: string;
  content: string | null;
  deleted_at: string | null;
  sender: unknown;
}

/**
 * Loads self-referencing replies separately instead of relying on PostgREST's
 * schema-cache relationship discovery. This keeps chat readable on databases
 * where reply_to_id was created before its FK was repaired.
 */
export const hydrateChatMessages = async <T extends Record<string, unknown>>(messages: T[]) => {
  if (messages.length === 0) return [];
  const replyIds = Array.from(new Set(messages
    .map((message) => message.reply_to_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)));

  const replies = new Map<string, ReplyRow>();
  if (replyIds.length > 0) {
    const { data, error } = await supabase.from("messages")
      .select("id, content, deleted_at, sender:profiles!messages_sender_id_fkey ( id, username )")
      .in("id", replyIds);
    if (error) throw error;
    for (const reply of (data ?? []) as unknown as ReplyRow[]) replies.set(reply.id, reply);
  }

  const withReplies = messages.map((message) => ({
    ...message,
    reply_to: typeof message.reply_to_id === "string" ? replies.get(message.reply_to_id) ?? null : null,
  }));
  return withSignedChatFiles(withReplies);
};
