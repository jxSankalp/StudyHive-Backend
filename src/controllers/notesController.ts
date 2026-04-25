/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";

const mapNote = (note: any) => ({
  _id: note.id,
  name: note.name,
  content: note.content,
  chat: note.chat_id,
  createdAt: note.created_at,
  updatedAt: note.updated_at,
  createdBy: note.created_by ? {
    _id: note.created_by.id,
    username: note.created_by.username,
    email: note.created_by.email
  } : null
});

export const allNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const chatId = req.params.chatId || (req.query.chatId as string);
    if (!chatId) {
      res.status(400).json({ error: "Chat ID is required" });
      return;
    }

    const { data, error } = await supabase
      .from("notes")
      .select(
        `id, name, content, chat_id, created_at, updated_at,
         created_by:profiles!notes_created_by_id_fkey ( id, username, email )`
      )
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ data: data.map(mapNote) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { content, name, chatId } = req.body;
  if (!content || !chatId || !name) {
    res.status(400).json({ error: "content, name and chatId are required" });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("notes")
      .insert({ name, content, chat_id: chatId, created_by_id: userId })
      .select(
        `id, name, content, chat_id, created_at, updated_at,
         created_by:profiles!notes_created_by_id_fkey ( id, username, email )`
      )
      .single();

    if (error) throw error;
    res.json({ data: mapNote(data) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getNoteById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from("notes")
      .select(
        `id, name, content, chat_id, created_at, updated_at,
         created_by:profiles!notes_created_by_id_fkey ( id, username, email )`
      )
      .eq("id", req.params.notesId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    res.json({ data: mapNote(data) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { data: note, error: findErr } = await supabase
      .from("notes")
      .select("id, created_by_id")
      .eq("id", req.params.notesId)
      .single();

    if (findErr || !note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    if (note.created_by_id !== userId) {
      res.status(403).json({ error: "Not allowed to delete this note" });
      return;
    }

    const { error: delErr } = await supabase
      .from("notes")
      .delete()
      .eq("id", note.id);

    if (delErr) throw delErr;
    res.json({ message: "Note deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const updateNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { notesId } = req.params;
  const { content, name } = req.body;

  try {
    const updates: Record<string, any> = {};
    if (content !== undefined) updates.content = content;
    if (name !== undefined) updates.name = name;

    const { data, error } = await supabase
      .from("notes")
      .update(updates)
      .eq("id", notesId)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    res.json({ message: "Note updated successfully", data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
