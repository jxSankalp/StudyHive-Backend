/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";

export const getAllChats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get all chat_members rows for this user, then fetch the chats
    const { data: memberRows, error: memberError } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", userId);

    if (memberError) throw memberError;

    const chatIds = memberRows?.map((r) => r.chat_id) ?? [];
    if (chatIds.length === 0) {
      res.status(200).json({ chats: [] });
      return;
    }

    const { data: chats, error: chatsError } = await supabase
      .from("chats")
      .select(
        `
        id, chat_name, description, group_admin_id, latest_message_id, created_at, updated_at,
        chat_members ( user_id, profiles ( id, username, email, photo ) ),
        messages!chats_latest_message_id_fkey ( id, content, created_at )
      `
      )
      .in("id", chatIds)
      .order("updated_at", { ascending: false });

    if (chatsError) throw chatsError;

    res.status(200).json({ chats });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const createGroupChat = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.userId;
    if (!adminId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { name, description, users } = req.body; // users = array of user UUIDs
    if (!name || !Array.isArray(users) || users.length === 0) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    // Create the chat row
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .insert({ chat_name: name, description, group_admin_id: adminId })
      .select()
      .single();

    if (chatError) throw chatError;

    // Add all members including the admin
    const allUserIds = Array.from(new Set([...users, adminId]));
    const memberRows = allUserIds.map((uid) => ({
      chat_id: chat.id,
      user_id: uid,
    }));

    const { error: memberError } = await supabase
      .from("chat_members")
      .insert(memberRows);

    if (memberError) throw memberError;

    res.status(201).json({ group: chat });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const renameGroup = async (req: Request, res: Response) => {
  const { chatId, chatName } = req.body;
  try {
    const { data, error } = await supabase
      .from("chats")
      .update({ chat_name: chatName })
      .eq("id", chatId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const removeFromGroup = async (req: Request, res: Response) => {
  const { chatId, userId } = req.body;
  try {
    const { error } = await supabase
      .from("chat_members")
      .delete()
      .eq("chat_id", chatId)
      .eq("user_id", userId);

    if (error) throw error;
    res.json({ message: "User removed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const addToGroup = async (req: Request, res: Response) => {
  const { chatId, userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: "No users provided" });
    return;
  }

  try {
    const rows = userIds.map((uid: string) => ({
      chat_id: chatId,
      user_id: uid,
    }));

    const { error } = await supabase
      .from("chat_members")
      .upsert(rows, { onConflict: "chat_id,user_id" });

    if (error) throw error;

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select(
        `id, chat_name, chat_members ( user_id, profiles ( id, username, email, photo ) )`
      )
      .eq("id", chatId)
      .single();

    if (chatError) throw chatError;
    res.status(200).json({ chat });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
