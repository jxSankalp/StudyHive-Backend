/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { streamClient } from "../lib/StreamClient";

// ─────────────────────────────────────────────────────────────
// Helper: deduplicate an array by a key
// ─────────────────────────────────────────────────────────────
function dedupeBy<T>(arr: T[], key: keyof T): T[] {
  const seen = new Set<unknown>();
  return arr.filter((item) => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
// POST /api/meet/create-call
// ─────────────────────────────────────────────────────────────
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

  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }

  try {
    // 1. Verify the calling user exists
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, username, photo")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      res.status(401).json({ error: "User not found in DB" });
      return;
    }

    // 2. Verify the user is actually a member of this chat
    const { data: membership, error: memberErr } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberErr || !membership) {
      res.status(403).json({ error: "You are not a member of this chat" });
      return;
    }

    // 3. Fetch the chat with its members (profiles joined)
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

    // 4. Build unique stream users — deduplicate by user id to prevent
    //    duplicate participants in both Stream and meeting_participants
    const rawMembers = (chat.chat_members as any[]).filter(
      (m) => m.profiles != null
    );
    const uniqueMembers = dedupeBy(rawMembers, "user_id");

    const streamUsers = uniqueMembers.map((m) => ({
      id: m.profiles.id as string,
      name: m.profiles.username as string,
      image: (m.profiles.photo ?? "") as string,
      role: "user",
    }));

    if (streamUsers.length === 0) {
      res.status(400).json({ error: "No valid members found in this chat" });
      return;
    }

    // 5. Upsert all users into Stream
    await streamClient.upsertUsers(streamUsers);

    // 6. Create the Stream call
    const callId = `call-${chatId}-${Date.now()}`;
    const callType = "default";
    const call = streamClient.video.call(callType, callId);
    await call.create({
      data: {
        created_by_id: userId,
        members: streamUsers.map((u) => ({ user_id: u.id })),
      },
    });

    // 7. Persist meeting row
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .insert({
        call_id: callId,
        name: meetName?.trim() || `Meeting for ${chat.chat_name}`,
        chat_id: chatId,
        created_by_id: userId,
        status: "scheduled",
        duration: "30 mins",
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (meetErr) throw meetErr;

    // 8. Insert participants — use upsert with onConflict ignore to be safe
    const participantRows = uniqueMembers.map((m) => ({
      meeting_id: meeting.id,
      user_id: m.profiles.id as string,
    }));

    const { error: partErr } = await supabase
      .from("meeting_participants")
      .upsert(participantRows, { onConflict: "meeting_id,user_id" });

    if (partErr) {
      console.error("[createVideoCall] participant insert error:", partErr);
      // Non-fatal — meeting is created; log and continue
    }

    res.status(200).json({
      id: meeting.call_id,
      name: meeting.name,
      status: meeting.status,
      participants: streamUsers.length,
      duration: meeting.duration,
      scheduledTime: new Date(meeting.scheduled_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  } catch (err: any) {
    console.error("[createVideoCall] error:", err);
    res
      .status(500)
      .json({ error: "Call creation failed", details: err?.message ?? err });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/meet/get-token
// Always issues a token for the *authenticated* user — never
// trusts a client-supplied userId to prevent token spoofing.
// ─────────────────────────────────────────────────────────────
export const generateUserToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const authenticatedUserId = req.user?.userId;

  if (!authenticatedUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Ensure the user exists in Stream (upsert idempotent)
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, photo")
      .eq("id", authenticatedUserId)
      .single();

    if (profile) {
      await streamClient.upsertUsers([
        {
          id: profile.id,
          name: profile.username,
          image: profile.photo ?? "",
          role: "user",
        },
      ]);
    }

    const token = streamClient.generateUserToken({
      user_id: authenticatedUserId,
      validity_in_seconds: 3600,
    });

    res.status(200).json({ token });
  } catch (err: any) {
    console.error("[generateUserToken] error:", err);
    res
      .status(500)
      .json({ error: "Token generation failed", details: err?.message ?? err });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/meet/:chatId
// ─────────────────────────────────────────────────────────────
export const getMeetingsForChat = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { chatId } = req.params;
  const userId = req.user?.userId;

  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }

  try {
    // Guard: only members of the chat can list its meetings
    const { data: membership } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Fetch meetings + participant count via a separate count query to avoid
    // duplicates that can arise from nested PostgREST joins
    const { data: meetings, error } = await supabase
      .from("meetings")
      .select("id, call_id, name, status, duration, scheduled_at")
      .eq("chat_id", chatId)
      .order("scheduled_at", { ascending: false });

    if (error) throw error;

    // Fetch participant counts separately to avoid PostgREST join inflation
    const meetingIds = (meetings ?? []).map((m) => m.id);

    let participantCounts: Record<string, number> = {};
    if (meetingIds.length > 0) {
      const { data: parts } = await supabase
        .from("meeting_participants")
        .select("meeting_id, user_id")
        .in("meeting_id", meetingIds);

      // Count unique (meeting_id, user_id) pairs
      if (parts) {
        const seen = new Set<string>();
        for (const p of parts) {
          const key = `${p.meeting_id}:${p.user_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            participantCounts[p.meeting_id] =
              (participantCounts[p.meeting_id] ?? 0) + 1;
          }
        }
      }
    }

    const formatted = (meetings ?? []).map((m) => ({
      id: m.call_id,
      meetingDbId: m.id,
      name: m.name || "Untitled Room",
      status: m.status || "scheduled",
      participants: participantCounts[m.id] ?? 0,
      duration: m.duration || "30 mins",
      scheduledTime: new Date(m.scheduled_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

    res.status(200).json(formatted);
  } catch (err: any) {
    console.error("[getMeetingsForChat] error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch meetings", details: err?.message ?? err });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/meet/:meetingId/status
// Update a meeting's status (active | ended)
// ─────────────────────────────────────────────────────────────
export const updateMeetingStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { meetingId } = req.params;
  const { status } = req.body as { status: "active" | "ended" | "scheduled" };
  const userId = req.user?.userId;

  const VALID_STATUSES = ["active", "scheduled", "ended"] as const;
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  try {
    // Only the creator can update the status
    const { data: meeting, error: fetchErr } = await supabase
      .from("meetings")
      .select("id, created_by_id, call_id")
      .eq("id", meetingId)
      .single();

    if (fetchErr || !meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }

    if (meeting.created_by_id !== userId) {
      res.status(403).json({ error: "Only the meeting creator can update its status" });
      return;
    }

    const { error: updateErr } = await supabase
      .from("meetings")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", meetingId);

    if (updateErr) throw updateErr;

    res.status(200).json({ success: true, meetingId, status });
  } catch (err: any) {
    console.error("[updateMeetingStatus] error:", err);
    res.status(500).json({ error: "Failed to update meeting status", details: err?.message ?? err });
  }
};