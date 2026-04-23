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
