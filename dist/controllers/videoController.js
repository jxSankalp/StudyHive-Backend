"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMeetingStatus = exports.getMeetingsForChat = exports.generateUserToken = exports.createVideoCall = void 0;
const supabase_1 = require("../lib/supabase");
const StreamClient_1 = require("../lib/StreamClient");
const socket_1 = require("../socket");
// ─────────────────────────────────────────────────────────────
// Helper: deduplicate an array by a key
// ─────────────────────────────────────────────────────────────
function dedupeBy(arr, key) {
    const seen = new Set();
    return arr.filter((item) => {
        const val = item[key];
        if (seen.has(val))
            return false;
        seen.add(val);
        return true;
    });
}
// ─────────────────────────────────────────────────────────────
// POST /api/meet/create-call
// ─────────────────────────────────────────────────────────────
const createVideoCall = async (req, res) => {
    const { chatId, meetName } = req.body;
    const userId = req.user?.userId;
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const durationMinutes = Number(req.body.durationMinutes ?? 30);
    const requestedDate = typeof req.body.scheduledAt === "string" && req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date();
    const requestedParticipantIds = Array.isArray(req.body.participantIds)
        ? Array.from(new Set(req.body.participantIds.filter((id) => typeof id === "string" && id.length > 0)))
        : [];
    const shouldNotify = req.body.notify !== false;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId) {
        res.status(400).json({ error: "chatId is required" });
        return;
    }
    if (typeof meetName === "string" && meetName.trim().length > 100) {
        res.status(400).json({ error: "Meeting name must be 100 characters or fewer" });
        return;
    }
    if (description.length > 2000 || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || Number.isNaN(requestedDate.getTime())) {
        res.status(400).json({ error: "Invalid description, duration, or scheduled time" });
        return;
    }
    if (requestedDate.getTime() < Date.now() - 60000 || requestedDate.getTime() > Date.now() + 366 * 24 * 60 * 60000) {
        res.status(400).json({ error: "Scheduled time must be between now and one year from now" });
        return;
    }
    try {
        // 1. Verify the calling user exists
        const { data: profile, error: profileErr } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, photo")
            .eq("id", userId)
            .single();
        if (profileErr || !profile) {
            res.status(401).json({ error: "User not found in DB" });
            return;
        }
        // 2. Verify the user is actually a member of this chat
        const { data: membership, error: memberErr } = await supabase_1.supabase
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
        const { data: chat, error: chatErr } = await supabase_1.supabase
            .from("chats")
            .select(`id, chat_name,
         chat_members ( user_id, profiles ( id, username, photo ) )`)
            .eq("id", chatId)
            .single();
        if (chatErr || !chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        // 4. Build unique stream users — deduplicate by user id to prevent
        //    duplicate participants in both Stream and meeting_participants
        const rawMembers = chat.chat_members.filter((member) => member.profiles != null);
        const allMembers = dedupeBy(rawMembers, "user_id");
        const allowedIds = new Set(allMembers.map((member) => member.user_id));
        if (requestedParticipantIds.some((id) => !allowedIds.has(id))) {
            res.status(400).json({ error: "Every invitee must be a workspace member" });
            return;
        }
        const invitedIds = new Set(requestedParticipantIds.length ? requestedParticipantIds : allMembers.map((member) => member.user_id));
        invitedIds.add(userId);
        const uniqueMembers = allMembers.filter((member) => invitedIds.has(member.user_id));
        const streamUsers = uniqueMembers.map((m) => ({
            id: m.profiles.id,
            name: m.profiles.username,
            image: (m.profiles.photo ?? ""),
            role: "user",
        }));
        if (streamUsers.length === 0) {
            res.status(400).json({ error: "No valid members found in this chat" });
            return;
        }
        // 5. Upsert all users into Stream
        await StreamClient_1.streamClient.upsertUsers(streamUsers);
        // 6. Create the Stream call
        const callId = `call-${chatId}-${Date.now()}`;
        const callType = "default";
        const call = StreamClient_1.streamClient.video.call(callType, callId);
        await call.create({
            data: {
                created_by_id: userId,
                members: streamUsers.map((u) => ({ user_id: u.id })),
            },
        });
        // 7. Persist meeting row
        const scheduledAt = requestedDate;
        const { data: meeting, error: meetErr } = await supabase_1.supabase
            .from("meetings")
            .insert({
            call_id: callId,
            name: meetName?.trim() || `Meeting for ${chat.chat_name}`,
            chat_id: chatId,
            created_by_id: userId,
            status: "scheduled",
            duration: `${durationMinutes} mins`,
            duration_minutes: durationMinutes,
            description: description || null,
            scheduled_at: scheduledAt.toISOString(),
        })
            .select()
            .single();
        if (meetErr) {
            await call.delete().catch((cleanupError) => console.error("[createVideoCall] Stream cleanup failed:", cleanupError));
            throw meetErr;
        }
        // 8. Insert participants — use upsert with onConflict ignore to be safe
        const participantRows = uniqueMembers.map((m) => ({
            meeting_id: meeting.id,
            user_id: m.profiles.id,
        }));
        const { error: partErr } = await supabase_1.supabase
            .from("meeting_participants")
            .upsert(participantRows, { onConflict: "meeting_id,user_id" });
        if (partErr) {
            console.error("[createVideoCall] participant insert error:", partErr);
            await supabase_1.supabase.from("meetings").delete().eq("id", meeting.id);
            await call.delete().catch((cleanupError) => console.error("[createVideoCall] Stream cleanup failed:", cleanupError));
            throw partErr;
        }
        // Keep scheduled meetings and the calendar consistent. If the calendar row
        // cannot be created, roll back the meeting instead of leaving split state.
        const { error: calendarError } = await supabase_1.supabase.from("calendar_events").insert({
            chat_id: chatId,
            created_by_id: userId,
            meeting_id: meeting.id,
            title: meeting.name,
            description: description || "StudyHive video meeting",
            starts_at: scheduledAt.toISOString(),
            ends_at: new Date(scheduledAt.getTime() + durationMinutes * 60000).toISOString(),
            all_day: false,
            color: "emerald",
        });
        if (calendarError) {
            console.error("[createVideoCall] calendar insert error:", calendarError);
            await supabase_1.supabase.from("meetings").delete().eq("id", meeting.id);
            await call.delete().catch((cleanupError) => console.error("[createVideoCall] Stream cleanup failed:", cleanupError));
            throw calendarError;
        }
        if (shouldNotify) {
            const recipientIds = uniqueMembers.map((member) => member.user_id).filter((id) => id !== userId);
            if (recipientIds.length) {
                const notificationRows = recipientIds.map((recipientId) => ({ user_id: recipientId, chat_id: chatId, type: "meeting_scheduled", title: `Meeting scheduled: ${meeting.name}`, body: description || `${chat.chat_name} · ${scheduledAt.toLocaleString()}`, entity_type: "meeting", entity_id: meeting.id }));
                const { data: createdNotifications, error: notificationError } = await supabase_1.supabase.from("notifications").insert(notificationRows).select();
                if (notificationError)
                    console.error("[createVideoCall] notification insert error", notificationError);
                else
                    for (const notification of createdNotifications ?? [])
                        (0, socket_1.notifyUsers)([notification.user_id], { ...notification, chatId, entityType: "meeting", entityId: meeting.id });
            }
        }
        res.status(201).json({
            id: meeting.call_id,
            name: meeting.name,
            status: meeting.status,
            participants: streamUsers.length,
            duration: meeting.duration,
            durationMinutes,
            description: meeting.description ?? "",
            scheduledAt: meeting.scheduled_at,
            scheduledTime: new Date(meeting.scheduled_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            }),
        });
    }
    catch (err) {
        console.error("[createVideoCall] error:", err);
        res.status(500).json({ error: "Call creation failed" });
    }
};
exports.createVideoCall = createVideoCall;
// ─────────────────────────────────────────────────────────────
// POST /api/meet/get-token
// Always issues a token for the *authenticated* user — never
// trusts a client-supplied userId to prevent token spoofing.
// ─────────────────────────────────────────────────────────────
const generateUserToken = async (req, res) => {
    const authenticatedUserId = req.user?.userId;
    const callId = typeof req.body.callId === "string" ? req.body.callId : "";
    if (!authenticatedUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!callId) {
        res.status(400).json({ error: "callId is required" });
        return;
    }
    try {
        const { data: meeting, error: meetingError } = await supabase_1.supabase
            .from("meetings")
            .select("id, status, chat_id, created_by_id, scheduled_at")
            .eq("call_id", callId)
            .maybeSingle();
        if (meetingError)
            throw meetingError;
        if (!meeting) {
            res.status(404).json({ error: "Meeting not found" });
            return;
        }
        if (meeting.status === "ended") {
            res.status(410).json({ error: "This meeting has ended" });
            return;
        }
        const scheduledAt = new Date(meeting.scheduled_at).getTime();
        if (meeting.status === "scheduled" &&
            Number.isFinite(scheduledAt) &&
            scheduledAt > Date.now() + 15 * 60000) {
            res.status(409).json({ error: "This meeting opens 15 minutes before its scheduled time" });
            return;
        }
        const { data: currentMembership, error: membershipError } = await supabase_1.supabase
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", meeting.chat_id)
            .eq("user_id", authenticatedUserId)
            .maybeSingle();
        if (membershipError)
            throw membershipError;
        if (!currentMembership) {
            res.status(403).json({ error: "You are no longer a member of this workspace" });
            return;
        }
        const { data: participant, error: participantError } = await supabase_1.supabase
            .from("meeting_participants")
            .select("user_id")
            .eq("meeting_id", meeting.id)
            .eq("user_id", authenticatedUserId)
            .maybeSingle();
        if (participantError)
            throw participantError;
        if (!participant) {
            res.status(403).json({ error: "You are not a participant in this meeting" });
            return;
        }
        // Ensure the user exists in Stream (upsert idempotent)
        const { data: profile } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, photo")
            .eq("id", authenticatedUserId)
            .single();
        if (profile) {
            await StreamClient_1.streamClient.upsertUsers([
                {
                    id: profile.id,
                    name: profile.username,
                    image: profile.photo ?? "",
                    role: "user",
                },
            ]);
        }
        const token = StreamClient_1.streamClient.generateUserToken({
            user_id: authenticatedUserId,
            validity_in_seconds: 3600,
        });
        res.status(200).json({
            token,
            meetingDbId: meeting.id,
            canManage: meeting.created_by_id === authenticatedUserId,
        });
    }
    catch (err) {
        console.error("[generateUserToken] error:", err);
        res.status(500).json({ error: "Token generation failed" });
    }
};
exports.generateUserToken = generateUserToken;
// ─────────────────────────────────────────────────────────────
// GET /api/meet/:chatId
// ─────────────────────────────────────────────────────────────
const getMeetingsForChat = async (req, res) => {
    const { chatId } = req.params;
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
        // Guard: only members of the chat can list its meetings
        const { data: membership } = await supabase_1.supabase
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
        const { data: meetings, error } = await supabase_1.supabase
            .from("meetings")
            .select("id, call_id, name, description, status, duration, duration_minutes, scheduled_at, created_by_id")
            .eq("chat_id", chatId)
            .order("scheduled_at", { ascending: false });
        if (error)
            throw error;
        // Fetch participant counts separately to avoid PostgREST join inflation
        const meetingIds = (meetings ?? []).map((m) => m.id);
        let participantCounts = {};
        if (meetingIds.length > 0) {
            const { data: parts } = await supabase_1.supabase
                .from("meeting_participants")
                .select("meeting_id, user_id")
                .in("meeting_id", meetingIds);
            // Count unique (meeting_id, user_id) pairs
            if (parts) {
                const seen = new Set();
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
            durationMinutes: m.duration_minutes || 30,
            description: m.description || "",
            scheduledAt: m.scheduled_at,
            scheduledTime: new Date(m.scheduled_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            }),
            canManage: m.created_by_id === userId,
        }));
        res.status(200).json(formatted);
    }
    catch (err) {
        console.error("[getMeetingsForChat] error:", err);
        res.status(500).json({ error: "Failed to fetch meetings" });
    }
};
exports.getMeetingsForChat = getMeetingsForChat;
// ─────────────────────────────────────────────────────────────
// PATCH /api/meet/:meetingId/status
// Update a meeting's status (active | ended)
// ─────────────────────────────────────────────────────────────
const updateMeetingStatus = async (req, res) => {
    const { meetingId } = req.params;
    const status = req.body.status;
    const userId = req.user?.userId;
    const VALID_STATUSES = ["active", "scheduled", "ended"];
    if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
        return;
    }
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        // Only the creator can update the status
        const { data: meeting, error: fetchErr } = await supabase_1.supabase
            .from("meetings")
            .select("id, created_by_id, call_id, status")
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
        // Updating our database alone leaves the active Stream session running.
        // End it through Stream first so every connected participant receives the
        // call.ended event and is removed from the room.
        if (status === "ended") {
            try {
                await StreamClient_1.streamClient.video.call("default", meeting.call_id).end();
            }
            catch (streamError) {
                console.error("[updateMeetingStatus] Stream end failed:", streamError);
                res.status(502).json({ error: "The video provider could not end the meeting. Please retry." });
                return;
            }
        }
        const { error: updateErr } = await supabase_1.supabase
            .from("meetings")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", meetingId);
        if (updateErr)
            throw updateErr;
        res.status(200).json({ success: true, meetingId, status });
    }
    catch (err) {
        console.error("[updateMeetingStatus] error:", err);
        res.status(500).json({ error: "Failed to update meeting status" });
    }
};
exports.updateMeetingStatus = updateMeetingStatus;
