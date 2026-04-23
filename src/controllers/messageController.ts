/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";

export const allMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { data, error } = await supabase
      .from("messages")
      .select(
        `id, content, created_at, chat_id,
         sender:profiles!messages_sender_id_fkey ( id, username, email, photo )`
      )
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
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

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({ sender_id: userId, content, chat_id: chatId })
      .select(
        `id, content, created_at, chat_id,
         sender:profiles!messages_sender_id_fkey ( id, username, email, photo )`
      )
      .single();

    if (msgError) throw msgError;

    // Update chat's latest_message_id
    await supabase
      .from("chats")
      .update({ latest_message_id: message.id, updated_at: new Date().toISOString() })
      .eq("id", chatId);

    res.json(message);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
