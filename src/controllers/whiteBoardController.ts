/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { getWhiteboardChatId, isChatMember } from "../lib/access";
import { supabase } from "../lib/supabase";

interface WhiteboardRow {
  id: string;
  title: string;
  chat_id: string;
  created_by_id: string | null;
  data: unknown;
  created_at: string;
  updated_at: string;
}

const mapWhiteboard = (whiteboard: WhiteboardRow) => ({
  _id: whiteboard.id,
  title: whiteboard.title,
  groupId: whiteboard.chat_id,
  data: whiteboard.data,
  createdAt: whiteboard.created_at,
  updatedAt: whiteboard.updated_at,
  createdBy: whiteboard.created_by_id ? { _id: whiteboard.created_by_id } : null,
});

export const createWhiteboard = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const groupId = typeof req.body.groupId === "string" ? req.body.groupId : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!groupId || !name || name.length > 100) {
    res.status(400).json({ error: "A valid name and groupId are required" });
    return;
  }
  try {
    if (!(await isChatMember(groupId, userId))) {
      res.status(403).json({ error: "You are not a member of this workspace" });
      return;
    }
    const { data, error } = await supabase
      .from("whiteboards")
      .insert({ title: name, chat_id: groupId, created_by_id: userId, data: {} })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: mapWhiteboard(data as WhiteboardRow) });
  } catch (error) {
    console.error("[createWhiteboard]", error);
    res.status(500).json({ error: "Failed to create whiteboard" });
  }
};

export const getWhiteboardsByGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { groupId } = req.params;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    if (!(await isChatMember(groupId, userId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const { data, error } = await supabase
      .from("whiteboards")
      .select("id, title, chat_id, created_by_id, data, created_at, updated_at")
      .eq("chat_id", groupId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: (data as WhiteboardRow[]).map(mapWhiteboard) });
  } catch (error) {
    console.error("[getWhiteboardsByGroup]", error);
    res.status(500).json({ error: "Failed to load whiteboards" });
  }
};

export const getWhiteboardById = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const chatId = await getWhiteboardChatId(req.params.id);
    if (!chatId) {
      res.status(404).json({ error: "Whiteboard not found" });
      return;
    }
    if (!(await isChatMember(chatId, userId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const { data, error } = await supabase.from("whiteboards").select("*").eq("id", req.params.id).single();
    if (error || !data) {
      res.status(404).json({ error: "Whiteboard not found" });
      return;
    }
    res.json({ success: true, data: mapWhiteboard(data as WhiteboardRow) });
  } catch (error) {
    console.error("[getWhiteboardById]", error);
    res.status(500).json({ error: "Failed to load whiteboard" });
  }
};

export const saveWhiteboardState = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.body.data === undefined) {
    res.status(400).json({ error: "Whiteboard data is required" });
    return;
  }
  try {
    const chatId = await getWhiteboardChatId(req.params.id);
    if (!chatId) {
      res.status(404).json({ error: "Whiteboard not found" });
      return;
    }
    if (!(await isChatMember(chatId, userId))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const { data, error } = await supabase
      .from("whiteboards")
      .update({ data: req.body.data, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data: mapWhiteboard(data as WhiteboardRow) });
  } catch (error) {
    console.error("[saveWhiteboardState]", error);
    res.status(500).json({ error: "Failed to save whiteboard" });
  }
};
