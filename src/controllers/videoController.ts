/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { streamClient } from "../lib/StreamClient";

export const createVideoCall = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { chatId, meetName } = req.body;
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Fetch the caller's profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, username, photo")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      res.status(401).json({ error: "User not found in DB" });
      return;
    }

    // Fetch the chat with its members
    const { data: chat, error: chatErr } = await supabase
      .from("chats")
      .select(
        `id, chat_name,
         chat_members ( user_id, profiles ( id, username, photo ) )`
      )
      .eq("id", chatId)
      .single();

    if (chatErr || !chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const callId = `call-${chatId}-${Date.now()}`;
    const callType = "default";

    const streamUsers = (chat.chat_members as any[]).map((m) => ({
      id: m.profiles.id,
      name: m.profiles.username,
      image: m.profiles.photo ?? "",
      role: "user",
    }));

    await streamClient.upsertUsers(streamUsers);

    const call = streamClient.video.call(callType, callId);
    await call.create({
      data: {
        created_by_id: userId,
        members: streamUsers.map((u) => ({ user_id: u.id })),
      },
    });

    // Persist meeting in Supabase
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .insert({
        call_id: callId,
        name: meetName || `Meeting for ${chat.chat_name}`,
        chat_id: chatId,
        created_by_id: userId,
        status: "scheduled",
        duration: "30 mins",
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (meetErr) throw meetErr;

    // Insert participants
    const participantRows = streamUsers.map((u) => ({
      meeting_id: meeting.id,
      user_id: u.id,
    }));
    await supabase.from("meeting_participants").insert(participantRows);

    res.status(200).json({
      id: meeting.call_id,
      name: meeting.name,
      status: meeting.status,
      participants: streamUsers.length,
      duration: meeting.duration,
      scheduled_at: meeting.scheduled_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Call creation failed", details: err });
  }
};

export const generateUserToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userId } = req.body;
  try {
    const token = streamClient.generateUserToken({
      user_id: userId,
      validity_in_seconds: 3600,
    });
    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ error: "Token generation failed", details: err });
  }
};

export const getMeetingsForChat = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { chatId } = req.params;
  try {
    const { data: meetings, error } = await supabase
      .from("meetings")
      .select(
        `id, call_id, name, status, duration, scheduled_at,
         meeting_participants ( user_id )`
      )
      .eq("chat_id", chatId);

    if (error) throw error;

    const formatted = (meetings ?? []).map((m) => ({
      id: m.call_id,
      name: m.name || "Untitled Room",
      status: m.status || "scheduled",
      participants: m.meeting_participants?.length || 0,
      duration: m.duration || "30 mins",
      scheduledTime: new Date(m.scheduled_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch meetings", details: err });
  }
};