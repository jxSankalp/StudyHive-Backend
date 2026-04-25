/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";

export const getCurrentUser = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, photo")
      .eq("id", userId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found in DB" });
      return;
    }

    res.json({ _id: data.id, username: data.username, email: data.email, photo: data.photo });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Server error" });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, photo")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ _id: data.id, username: data.username, email: data.email, photo: data.photo });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { username, photo } = req.body;
    const { data, error } = await supabase
      .from("profiles")
      .update({ username, photo })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "User deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const searchUsers = async (req: Request, res: Response) => {
  const { query } = req.query;
  const userId = req.user?.userId;

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query is required" });
    return;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email")
      .ilike("username", `${query}%`)
      .neq("id", userId ?? "");

    if (error) throw error;

    res.json({ users: data?.map(u => ({ _id: u.id, username: u.username, email: u.email })) });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

export const getUserStats = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Get active groups count
    const { count: groupsCount } = await supabase
      .from("chat_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Get notes created count
    const { count: notesCount } = await supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("created_by", userId);

    // Get whiteboards created count
    const { count: whiteboardsCount } = await supabase
      .from("whiteboards")
      .select("*", { count: "exact", head: true })
      .eq("created_by", userId);

    // Get messages sent count
    const { count: messagesCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("sender_id", userId);

    res.json({
      activeGroups: groupsCount || 0,
      notesCreated: notesCount || 0,
      whiteboardsCreated: whiteboardsCount || 0,
      messagesSent: messagesCount || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Server error" });
  }
};
