/// <reference path="../types/index.d.ts" />
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase";

export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { data, error } = await supabase.from("notifications").select("id, chat_id, type, title, body, entity_type, entity_id, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ notifications: (data ?? []).map((item) => ({ id: item.id, chatId: item.chat_id, type: item.type, title: item.title, body: item.body, entityType: item.entity_type, entityId: item.entity_id, readAt: item.read_at, createdAt: item.created_at })) });
  } catch (error) { console.error("[listNotifications]", error); res.status(500).json({ error: "Failed to load notifications" }); }
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { data, error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", req.params.notificationId).eq("user_id", userId).select("id, read_at").maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: "Notification not found" }); return; }
    res.json({ id: data.id, readAt: data.read_at });
  } catch (error) { console.error("[markNotificationRead]", error); res.status(500).json({ error: "Failed to update notification" }); }
};

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (error) throw error;
    res.json({ message: "Notifications marked as read" });
  } catch (error) { console.error("[markAllNotificationsRead]", error); res.status(500).json({ error: "Failed to update notifications" }); }
};
