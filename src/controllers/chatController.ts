/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { getChatRole, isChatAdmin, isChatMember, isNonEmptyString } from "../lib/access";
import { broadcastToChat, getOnlineUserCountByIds, revokeChatSocketAccess } from "../socket";
import { canChangeMemberRole, canManageWorkspace, canRemoveWorkspaceMember } from "../lib/permissions";

const normalizeIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(values.filter(isNonEmptyString).map((value) => value.trim()))
  );
};

export const getAllChats = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { data: memberRows, error: memberError } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", userId);
    if (memberError) throw memberError;

    const chatIds = memberRows?.map((row) => row.chat_id) ?? [];
    if (chatIds.length === 0) {
      res.json({ chats: [] });
      return;
    }

    const { data: chats, error } = await supabase
      .from("chats")
      .select(`
        id, chat_name, description, group_admin_id, latest_message_id, created_at, updated_at,
        chat_members ( user_id, role, joined_at, profiles ( id, username, email, photo ) ),
        messages!chats_latest_message_id_fkey ( id, content, created_at )
      `)
      .in("id", chatIds)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const { data: unreadRows, error: unreadError } = await supabase.rpc("get_user_chat_unread_counts", { p_user_id: userId });
    if (unreadError) throw unreadError;
    type UnreadRow = { chat_id: string; unread_count: number | string; last_read_at: string | null };
    const unreadByChat = new Map<string, UnreadRow>((unreadRows ?? []).map((row: UnreadRow) => [row.chat_id, row]));
    const enriched = (chats ?? []).map((chat) => {
      const unread = unreadByChat.get(chat.id);
      return { ...chat, unread_count: Number(unread?.unread_count ?? 0), last_read_at: unread?.last_read_at ?? null };
    });
    res.json({ chats: enriched });
  } catch (error) {
    console.error("[getAllChats]", error);
    res.status(500).json({ error: "Failed to load workspaces" });
  }
};

export const createGroupChat = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.user?.userId;
  if (!adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body.description === "string" ? req.body.description.trim() : null;
  const requestedIds = normalizeIds(req.body.users).filter((id) => id !== adminId);

  if (!name || name.length > 100) {
    res.status(400).json({ error: "Workspace name must be between 1 and 100 characters" });
    return;
  }
  if (description && description.length > 500) {
    res.status(400).json({ error: "Description must be 500 characters or fewer" });
    return;
  }
  if (requestedIds.length === 0) {
    res.status(400).json({ error: "Select at least one other member" });
    return;
  }

  let createdChatId: string | null = null;
  try {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .in("id", requestedIds);
    if (profileError) throw profileError;

    const validIds = new Set((profiles ?? []).map((profile) => profile.id));
    if (requestedIds.some((id) => !validIds.has(id))) {
      res.status(400).json({ error: "One or more selected users do not exist" });
      return;
    }

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .insert({ chat_name: name, description, group_admin_id: adminId })
      .select()
      .single();
    if (chatError) throw chatError;
    createdChatId = chat.id;

    const memberRows = [...requestedIds, adminId].map((userId) => ({
      chat_id: chat.id,
      user_id: userId,
      role: userId === adminId ? "owner" : "member",
    }));
    const { error: memberError } = await supabase.from("chat_members").insert(memberRows);
    if (memberError) throw memberError;
    const readAt = new Date().toISOString();
    const { error: readStateError } = await supabase.from("chat_read_state").insert(memberRows.map((member) => ({ chat_id: chat.id, user_id: member.user_id, last_read_at: readAt })));
    if (readStateError) console.error("[createGroupChat] initial read state failed", readStateError);

    res.status(201).json({ group: chat });
  } catch (error) {
    if (createdChatId) {
      await supabase.from("chats").delete().eq("id", createdChatId);
    }
    console.error("[createGroupChat]", error);
    res.status(500).json({ error: "Failed to create workspace" });
  }
};

export const renameGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
  const chatName = typeof req.body.chatName === "string" ? req.body.chatName.trim() : "";
  if (!userId || !chatId) {
    res.status(userId ? 400 : 401).json({ error: userId ? "chatId is required" : "Unauthorized" });
    return;
  }
  if (!chatName || chatName.length > 100) {
    res.status(400).json({ error: "Workspace name must be between 1 and 100 characters" });
    return;
  }

  try {
    if (!(await isChatAdmin(chatId, userId))) {
      res.status(403).json({ error: "Only the workspace admin can rename it" });
      return;
    }
    const { data, error } = await supabase
      .from("chats")
      .update({ chat_name: chatName, updated_at: new Date().toISOString() })
      .eq("id", chatId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("[renameGroup]", error);
    res.status(500).json({ error: "Failed to rename workspace" });
  }
};

export const removeFromGroup = async (req: Request, res: Response): Promise<void> => {
  const actorId = req.user?.userId;
  const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
  const targetId = typeof req.body.userId === "string" ? req.body.userId : "";
  if (!actorId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!chatId || !targetId) {
    res.status(400).json({ error: "chatId and userId are required" });
    return;
  }

  let membershipRemoved = false;
  let removedRole: "owner" | "admin" | "member" = "member";
  try {
    const actorRole = await getChatRole(chatId, actorId);
    if (!canManageWorkspace(actorRole)) {
      res.status(403).json({ error: "Only the workspace admin can remove members" });
      return;
    }
    const targetRole = await getChatRole(chatId, targetId);
    if (!targetRole) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (!canRemoveWorkspaceMember(actorRole, targetRole, targetId === actorId)) {
      res.status(403).json({ error: "You cannot remove this workspace member" });
      return;
    }
    removedRole = targetRole;
    const { error } = await supabase
      .from("chat_members")
      .delete()
      .eq("chat_id", chatId)
      .eq("user_id", targetId);
    if (error) throw error;
    membershipRemoved = true;
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id")
      .eq("chat_id", chatId);
    if (meetingsError) throw meetingsError;
    const meetingIds = (meetings ?? []).map((meeting) => meeting.id);
    if (meetingIds.length > 0) {
      const { error: participantError } = await supabase
        .from("meeting_participants")
        .delete()
        .eq("user_id", targetId)
        .in("meeting_id", meetingIds);
      if (participantError) throw participantError;
    }
    membershipRemoved = false;
    await revokeChatSocketAccess(targetId, chatId).catch((socketError) =>
      console.error("[removeFromGroup] realtime revocation failed", socketError)
    );
    res.json({ message: "User removed" });
  } catch (error) {
    if (membershipRemoved) {
      const { error: restoreError } = await supabase
        .from("chat_members")
        .upsert({ chat_id: chatId, user_id: targetId, role: removedRole }, { onConflict: "chat_id,user_id" });
      if (restoreError) console.error("[removeFromGroup] rollback failed", restoreError);
    }
    console.error("[removeFromGroup]", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
};

export const addToGroup = async (req: Request, res: Response): Promise<void> => {
  const actorId = req.user?.userId;
  const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
  const userIds = normalizeIds(req.body.userIds);
  if (!actorId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!chatId || userIds.length === 0) {
    res.status(400).json({ error: "chatId and at least one user are required" });
    return;
  }

  try {
    if (!(await isChatAdmin(chatId, actorId))) {
      res.status(403).json({ error: "Only the workspace admin can add members" });
      return;
    }
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .in("id", userIds);
    if (profileError) throw profileError;
    if ((profiles ?? []).length !== userIds.length) {
      res.status(400).json({ error: "One or more selected users do not exist" });
      return;
    }

    const { data: existingMembers, error: existingError } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId).in("user_id", userIds);
    if (existingError) throw existingError;
    const existingIds = new Set((existingMembers ?? []).map((member) => member.user_id));
    const newUserIds = userIds.filter((userId) => !existingIds.has(userId));
    const rows = userIds.map((userId) => ({ chat_id: chatId, user_id: userId, role: "member" }));
    const { error } = await supabase
      .from("chat_members")
      .upsert(rows, { onConflict: "chat_id,user_id", ignoreDuplicates: true });
    if (error) throw error;
    if (newUserIds.length > 0) {
      const readAt = new Date().toISOString();
      const { error: readStateError } = await supabase.from("chat_read_state").upsert(newUserIds.map((userId) => ({ chat_id: chatId, user_id: userId, last_read_at: readAt, updated_at: readAt })), { onConflict: "chat_id,user_id" });
      if (readStateError) console.error("[addToGroup] initial read state failed", readStateError);
    }

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, chat_name, chat_members ( user_id, role, joined_at, profiles ( id, username, email, photo ) )")
      .eq("id", chatId)
      .single();
    if (chatError) throw chatError;
    res.json({ chat });
  } catch (error) {
    console.error("[addToGroup]", error);
    res.status(500).json({ error: "Failed to add members" });
  }
};

export const getChatStats = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }

  try {
    if (!(await isChatMember(chatId, userId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { data: chat, error } = await supabase
      .from("chats")
      .select("id, chat_name, group_admin_id, chat_members ( user_id, role )")
      .eq("id", chatId)
      .single();
    if (error) throw error;

    const typedMembers = (chat.chat_members as Array<{ user_id: string; role?: string }> | null) ?? [];
    const memberIds = typedMembers
      ?.map((member) => member.user_id)
      .filter(Boolean) ?? [];
    const currentRole = typedMembers.find((member) => member.user_id === userId)?.role ?? "member";
    res.json({
      chatId: chat.id,
      chatName: chat.chat_name,
      totalMembers: memberIds.length,
      totalOnline: getOnlineUserCountByIds(memberIds),
      canManage: currentRole === "owner" || currentRole === "admin",
      role: currentRole,
    });
  } catch (error) {
    console.error("[getChatStats]", error);
    res.status(500).json({ error: "Failed to load workspace statistics" });
  }
};

export const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  const actorId = req.user?.userId;
  const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
  const targetId = typeof req.body.userId === "string" ? req.body.userId : "";
  const role = req.body.role === "admin" ? "admin" : req.body.role === "member" ? "member" : "";
  if (!actorId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!chatId || !targetId || !role) { res.status(400).json({ error: "chatId, userId, and a valid role are required" }); return; }
  try {
    const actorRole = await getChatRole(chatId, actorId);
    const targetRole = await getChatRole(chatId, targetId);
    if (!targetRole) { res.status(404).json({ error: "Member not found" }); return; }
    if (!canChangeMemberRole(actorRole, targetRole)) { res.status(403).json({ error: "Only the owner can change a non-owner member role" }); return; }
    const { data, error } = await supabase.from("chat_members").update({ role }).eq("chat_id", chatId).eq("user_id", targetId).select("user_id, role").single();
    if (error) throw error;
    res.json({ member: data });
  } catch (error) {
    console.error("[updateMemberRole]", error);
    res.status(500).json({ error: "Failed to update member role" });
  }
};

export const getChatReadReceipts = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    if (!(await isChatMember(chatId, userId))) { res.status(403).json({ error: "Access denied" }); return; }
    const { data, error } = await supabase.from("chat_read_state")
      .select("user_id, last_read_at, last_read_message_id, updated_at, profile:profiles!chat_read_state_user_id_fkey ( id, username, photo )")
      .eq("chat_id", chatId);
    if (error) throw error;
    res.json({ receipts: data ?? [] });
  } catch (error) {
    console.error("[getChatReadReceipts]", error);
    res.status(500).json({ error: "Failed to load read receipts" });
  }
};

export const markChatRead = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  const messageId = typeof req.body.messageId === "string" && req.body.messageId ? req.body.messageId : null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    if (!(await isChatMember(chatId, userId))) { res.status(403).json({ error: "Access denied" }); return; }
    const { data, error } = await supabase.rpc("mark_chat_read", {
      p_chat_id: chatId,
      p_user_id: userId,
      p_message_id: messageId,
    });
    if (error) {
      if (error.code === "22023") { res.status(400).json({ error: "Message is not in this workspace" }); return; }
      throw error;
    }
    const state = Array.isArray(data) ? data[0] : data;
    if (!state) throw new Error("Read state was not returned");
    const payload = {
      chatId,
      userId,
      lastReadAt: state.last_read_at,
      lastReadMessageId: state.last_read_message_id,
      updatedAt: state.updated_at,
    };
    broadcastToChat(chatId, "chat read", payload);
    res.json({ receipt: payload });
  } catch (error) {
    console.error("[markChatRead]", error);
    res.status(500).json({ error: "Failed to update read receipt" });
  }
};
