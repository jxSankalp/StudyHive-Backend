"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMeetingsForChat = exports.generateUserToken = exports.createVideoCall = void 0;
const supabase_1 = require("../lib/supabase");
const StreamClient_1 = require("../lib/StreamClient");
const createVideoCall = async (req, res) => {
    const { chatId, meetName } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        // Fetch the caller's profile
        const { data: profile, error: profileErr } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, photo")
            .eq("id", userId)
            .single();
        if (profileErr || !profile) {
            res.status(401).json({ error: "User not found in DB" });
            return;
        }
        // Fetch the chat with its members
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
        const callId = `call-${chatId}-${Date.now()}`;
        const callType = "default";
        const streamUsers = chat.chat_members.map((m) => ({
            id: m.profiles.id,
            name: m.profiles.username,
            image: m.profiles.photo ?? "",
            role: "user",
        }));
        await StreamClient_1.streamClient.upsertUsers(streamUsers);
        const call = StreamClient_1.streamClient.video.call(callType, callId);
        await call.create({
            data: {
                created_by_id: userId,
                members: streamUsers.map((u) => ({ user_id: u.id })),
            },
        });
        // Persist meeting in Supabase
        const { data: meeting, error: meetErr } = await supabase_1.supabase
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
        if (meetErr)
            throw meetErr;
        // Insert participants
        const participantRows = streamUsers.map((u) => ({
            meeting_id: meeting.id,
            user_id: u.id,
        }));
        await supabase_1.supabase.from("meeting_participants").insert(participantRows);
        res.status(200).json({
            id: meeting.call_id,
            name: meeting.name,
            status: meeting.status,
            participants: streamUsers.length,
            duration: meeting.duration,
            scheduled_at: meeting.scheduled_at,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Call creation failed", details: err });
    }
};
exports.createVideoCall = createVideoCall;
const generateUserToken = async (req, res) => {
    const { userId } = req.body;
    try {
        const token = StreamClient_1.streamClient.generateUserToken({
            user_id: userId,
            validity_in_seconds: 3600,
        });
        res.status(200).json({ token });
    }
    catch (err) {
        res.status(500).json({ error: "Token generation failed", details: err });
    }
};
exports.generateUserToken = generateUserToken;
const getMeetingsForChat = async (req, res) => {
    const { chatId } = req.params;
    try {
        const { data: meetings, error } = await supabase_1.supabase
            .from("meetings")
            .select(`id, call_id, name, status, duration, scheduled_at,
         meeting_participants ( user_id )`)
            .eq("chat_id", chatId);
        if (error)
            throw error;
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
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch meetings", details: err });
    }
};
exports.getMeetingsForChat = getMeetingsForChat;
