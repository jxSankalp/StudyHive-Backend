/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { getChatRole, isChatMember } from "../lib/access";
import { supabase } from "../lib/supabase";
import { broadcastToChat } from "../socket";
import { canDeleteMessage as mayDeleteMessage } from "../lib/permissions";
import { CHAT_FILES_BUCKET, MAX_CHAT_FILES_PER_MESSAGE, withSignedChatFiles } from "../lib/chatFiles";
import { decodeMessageCursor, encodeMessageCursor, parseMessageLimit } from "../lib/messageCursor";

const MESSAGE_SELECT = `id, content, created_at, edited_at, deleted_at, chat_id, reply_to_id,
  sender:profiles!messages_sender_id_fkey ( id, username, email, photo ),
  reply_to:messages!messages_reply_to_id_fkey ( id, content, deleted_at, sender:profiles!messages_sender_id_fkey ( id, username ) ),
  reactions:message_reactions ( emoji, user_id )`;

export const allMessages = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    if (!(await isChatMember(chatId, userId))) {
      res.status(403).json({ error: "You are not a member of this workspace" });
      return;
    }
    const limit = parseMessageLimit(req.query.limit);
    const suppliedCursor = req.query.cursor;
    const cursor = decodeMessageCursor(suppliedCursor);
    if (suppliedCursor !== undefined && !cursor) {
      res.status(400).json({ error: "Invalid message cursor" });
      return;
    }
    let query = supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const pageNewestFirst = rows.slice(0, limit);
    const oldest = pageNewestFirst.at(-1);
    const messages = await withSignedChatFiles(pageNewestFirst.reverse());
    res.json({
      messages,
      hasMore,
      nextCursor: hasMore && oldest
        ? encodeMessageCursor({ createdAt: String(oldest.created_at), id: String(oldest.id) })
        : null,
    });
  } catch (error) {
    console.error("[allMessages]", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  const replyToId = typeof req.body.replyToId === "string" && req.body.replyToId ? req.body.replyToId : null;
  const attachmentIds = Array.isArray(req.body.attachmentIds)
    ? Array.from(new Set(req.body.attachmentIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)))
    : [];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!chatId || (!content && attachmentIds.length === 0)) {
    res.status(400).json({ error: "A message or attachment and chatId are required" });
    return;
  }
  if (attachmentIds.length > MAX_CHAT_FILES_PER_MESSAGE) {
    res.status(400).json({ error: `A message can include at most ${MAX_CHAT_FILES_PER_MESSAGE} attachments` });
    return;
  }
  if (content.length > 10_000) {
    res.status(400).json({ error: "Message is too long" });
    return;
  }

  try {
    if (!(await isChatMember(chatId, userId))) {
      res.status(403).json({ error: "You are not a member of this workspace" });
      return;
    }
    if (replyToId) {
      const { data: repliedMessage, error: replyError } = await supabase.from("messages").select("id").eq("id", replyToId).eq("chat_id", chatId).maybeSingle();
      if (replyError) throw replyError;
      if (!repliedMessage) { res.status(400).json({ error: "Reply target is not in this workspace" }); return; }
    }
    if (attachmentIds.length > 0) {
      const { data: files, error: fileError } = await supabase.from("chat_files")
        .select("id")
        .in("id", attachmentIds)
        .eq("chat_id", chatId)
        .eq("uploader_id", userId)
        .eq("status", "ready")
        .is("message_id", null);
      if (fileError) throw fileError;
      if ((files ?? []).length !== attachmentIds.length) {
        res.status(400).json({ error: "One or more attachments are invalid, incomplete, or already sent" }); return;
      }
    }
    const { data: message, error } = await supabase
      .from("messages")
      .insert({ sender_id: userId, content, chat_id: chatId, reply_to_id: replyToId })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;

    if (attachmentIds.length > 0) {
      const { data: linked, error: linkError } = await supabase.from("chat_files")
        .update({ message_id: message.id, updated_at: new Date().toISOString() })
        .in("id", attachmentIds)
        .eq("uploader_id", userId)
        .is("message_id", null)
        .select("id");
      if (linkError || (linked ?? []).length !== attachmentIds.length) {
        const { data: claimedFiles } = await supabase.from("chat_files").select("storage_path").eq("message_id", message.id);
        const { error: releaseError } = await supabase.from("chat_files").update({ message_id: null, updated_at: new Date().toISOString() }).eq("message_id", message.id);
        if (releaseError) {
          console.error("[sendMessage] attachment rollback failed", releaseError);
          const claimedPaths = (claimedFiles ?? []).map((file) => file.storage_path);
          if (claimedPaths.length > 0) await supabase.storage.from(CHAT_FILES_BUCKET).remove(claimedPaths);
        }
        await supabase.from("messages").delete().eq("id", message.id);
        if (linkError) throw linkError;
        res.status(409).json({ error: "An attachment was already used; please retry" }); return;
      }
    }

    const { error: chatError } = await supabase
      .from("chats")
      .update({ latest_message_id: message.id, updated_at: new Date().toISOString() })
      .eq("id", chatId);
    if (chatError) console.error("[sendMessage] latest message update failed", chatError);

    const [hydrated] = await withSignedChatFiles([message as unknown as Record<string, unknown>]);
    res.status(201).json(hydrated);
  } catch (error) {
    console.error("[sendMessage]", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const updateMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!content || content.length > 10_000) { res.status(400).json({ error: "Message must be between 1 and 10,000 characters" }); return; }
  try {
    const { data: existing, error: findError } = await supabase.from("messages").select("id, chat_id, sender_id, deleted_at").eq("id", req.params.messageId).maybeSingle();
    if (findError) throw findError;
    if (!existing) { res.status(404).json({ error: "Message not found" }); return; }
    if (existing.sender_id !== userId || existing.deleted_at) { res.status(403).json({ error: "Only the sender can edit this message" }); return; }
    if (!(await isChatMember(existing.chat_id, userId))) { res.status(403).json({ error: "Access denied" }); return; }
    const { data, error } = await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", existing.id).select(MESSAGE_SELECT).single();
    if (error) throw error;
    const [hydrated] = await withSignedChatFiles([data as unknown as Record<string, unknown>]);
    broadcastToChat(existing.chat_id, "message updated", hydrated);
    res.json(hydrated);
  } catch (error) { console.error("[updateMessage]", error); res.status(500).json({ error: "Failed to update message" }); }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { data: existing, error: findError } = await supabase.from("messages").select("id, chat_id, sender_id, deleted_at").eq("id", req.params.messageId).maybeSingle();
    if (findError) throw findError;
    if (!existing) { res.status(404).json({ error: "Message not found" }); return; }
    const role = await getChatRole(existing.chat_id, userId);
    if (!mayDeleteMessage(existing.sender_id === userId, role)) { res.status(403).json({ error: "Only the sender or a workspace admin can delete it" }); return; }
    const deletedAt = new Date().toISOString();
    const { error } = await supabase.from("messages").update({ content: "", deleted_at: deletedAt, edited_at: null }).eq("id", existing.id);
    if (error) throw error;
    await supabase.from("message_reactions").delete().eq("message_id", existing.id);
    const { data: files, error: fileError } = await supabase.from("chat_files").select("id, storage_path").eq("message_id", existing.id);
    if (fileError) console.error("[deleteMessage] attachment lookup failed", fileError);
    else if (files && files.length > 0) {
      const { error: storageError } = await supabase.storage.from(CHAT_FILES_BUCKET).remove(files.map((file) => file.storage_path));
      if (storageError) console.error("[deleteMessage] attachment storage cleanup failed", storageError);
      else {
        const { error: metadataError } = await supabase.from("chat_files").delete().eq("message_id", existing.id);
        if (metadataError) console.error("[deleteMessage] attachment metadata cleanup failed", metadataError);
      }
    }
    const payload = { _id: existing.id, id: existing.id, chatId: existing.chat_id, chat_id: existing.chat_id, deletedAt, deleted_at: deletedAt };
    broadcastToChat(existing.chat_id, "message deleted", payload);
    res.json(payload);
  } catch (error) { console.error("[deleteMessage]", error); res.status(500).json({ error: "Failed to delete message" }); }
};

export const toggleReaction = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const emoji = typeof req.body.emoji === "string" ? req.body.emoji.trim() : "";
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!emoji || emoji.length > 16) { res.status(400).json({ error: "Invalid reaction" }); return; }
  try {
    const { data: message, error: findError } = await supabase.from("messages").select("id, chat_id, deleted_at").eq("id", req.params.messageId).maybeSingle();
    if (findError) throw findError;
    if (!message || message.deleted_at) { res.status(404).json({ error: "Message not found" }); return; }
    if (!(await isChatMember(message.chat_id, userId))) { res.status(403).json({ error: "Access denied" }); return; }
    const { data: existing, error: existingError } = await supabase.from("message_reactions").select("message_id").eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
    if (existingError) throw existingError;
    if (existing) await supabase.from("message_reactions").delete().eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji);
    else await supabase.from("message_reactions").insert({ message_id: message.id, user_id: userId, emoji });
    const { data: reactions, error } = await supabase.from("message_reactions").select("emoji, user_id").eq("message_id", message.id);
    if (error) throw error;
    const payload = { messageId: message.id, chatId: message.chat_id, reactions: reactions ?? [] };
    broadcastToChat(message.chat_id, "message reactions", payload);
    res.json(payload);
  } catch (error) { console.error("[toggleReaction]", error); res.status(500).json({ error: "Failed to update reaction" }); }
};
