"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCalendarEvent = exports.updateCalendarEvent = exports.createCalendarEvent = exports.listCalendarEvents = void 0;
const access_1 = require("../lib/access");
const supabase_1 = require("../lib/supabase");
const COLORS = ["indigo", "emerald", "amber", "rose", "sky", "violet"];
const EVENT_SELECT = `id, chat_id, created_by_id, title, description, location,
  starts_at, ends_at, all_day, color, meeting_id, created_at, updated_at,
  workspace:chats!calendar_events_chat_id_fkey ( id, chat_name ),
  meeting:meetings!calendar_events_meeting_id_fkey ( id, call_id, name, status )`;
const mapEvent = (event, userId, canAdmin) => ({
    id: event.id,
    chatId: event.chat_id,
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    allDay: event.all_day,
    color: event.color,
    meetingId: event.meeting_id,
    workspace: event.workspace
        ? { id: event.workspace.id, name: event.workspace.chat_name }
        : { id: event.chat_id, name: "Workspace" },
    meeting: event.meeting
        ? {
            id: event.meeting.id,
            callId: event.meeting.call_id,
            name: event.meeting.name,
            status: event.meeting.status,
        }
        : null,
    createdById: event.created_by_id,
    canManage: event.created_by_id === userId || canAdmin,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
});
const parseDate = (value) => {
    if (typeof value !== "string" || !value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const getAuthorizedEvent = async (eventId, userId) => {
    const { data, error } = await supabase_1.supabase
        .from("calendar_events")
        .select(EVENT_SELECT)
        .eq("id", eventId)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        return null;
    const row = data;
    if (!(await (0, access_1.isChatMember)(row.chat_id, userId)))
        return { row, member: false, admin: false };
    return { row, member: true, admin: await (0, access_1.isChatAdmin)(row.chat_id, userId) };
};
const validateMeeting = async (meetingId, chatId) => {
    if (meetingId === null || meetingId === undefined || meetingId === "")
        return null;
    if (typeof meetingId !== "string")
        throw new Error("INVALID_MEETING");
    const { data, error } = await supabase_1.supabase
        .from("meetings")
        .select("id")
        .eq("id", meetingId)
        .eq("chat_id", chatId)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new Error("INVALID_MEETING");
    return data.id;
};
const listCalendarEvents = async (req, res) => {
    const userId = req.user?.userId;
    const start = parseDate(req.query.start);
    const end = parseDate(req.query.end);
    const chatId = typeof req.query.chatId === "string" ? req.query.chatId : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!start || !end || start >= end || end.getTime() - start.getTime() > 370 * 86400000) {
        res.status(400).json({ error: "A valid date range of 370 days or fewer is required" });
        return;
    }
    try {
        let chatIds;
        if (chatId) {
            if (!(await (0, access_1.isChatMember)(chatId, userId))) {
                res.status(403).json({ error: "You are not a member of this workspace" });
                return;
            }
            chatIds = [chatId];
        }
        else {
            const { data: memberships, error: membershipError } = await supabase_1.supabase
                .from("chat_members")
                .select("chat_id")
                .eq("user_id", userId);
            if (membershipError)
                throw membershipError;
            chatIds = (memberships ?? []).map((membership) => membership.chat_id);
        }
        if (chatIds.length === 0) {
            res.json({ events: [] });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("calendar_events")
            .select(EVENT_SELECT)
            .in("chat_id", chatIds)
            .lt("starts_at", end.toISOString())
            .gt("ends_at", start.toISOString())
            .order("starts_at", { ascending: true })
            .limit(1000);
        if (error)
            throw error;
        const { data: administeredChats, error: adminError } = await supabase_1.supabase
            .from("chats")
            .select("id")
            .eq("group_admin_id", userId)
            .in("id", chatIds);
        if (adminError)
            throw adminError;
        const administeredChatIds = new Set((administeredChats ?? []).map((chat) => chat.id));
        res.json({
            events: data.map((event) => mapEvent(event, userId, administeredChatIds.has(event.chat_id))),
        });
    }
    catch (error) {
        console.error("[listCalendarEvents]", error);
        res.status(500).json({ error: "Failed to load calendar events" });
    }
};
exports.listCalendarEvents = listCalendarEvents;
const createCalendarEvent = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const location = typeof req.body.location === "string" ? req.body.location.trim() : "";
    const startsAt = parseDate(req.body.startsAt);
    const endsAt = parseDate(req.body.endsAt);
    const allDay = req.body.allDay === true;
    const color = COLORS.includes(req.body.color) ? req.body.color : "indigo";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || !title || title.length > 120 || description.length > 2000 ||
        location.length > 200 || !startsAt || !endsAt || startsAt >= endsAt ||
        endsAt.getTime() - startsAt.getTime() > 366 * 86400000) {
        res.status(400).json({ error: "Invalid calendar event details" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const meetingId = await validateMeeting(req.body.meetingId, chatId);
        const { data, error } = await supabase_1.supabase
            .from("calendar_events")
            .insert({
            chat_id: chatId,
            created_by_id: userId,
            title,
            description: description || null,
            location: location || null,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            all_day: allDay,
            color,
            meeting_id: meetingId,
        })
            .select(EVENT_SELECT)
            .single();
        if (error)
            throw error;
        res.status(201).json({ event: mapEvent(data, userId, false) });
    }
    catch (error) {
        if (error instanceof Error && error.message === "INVALID_MEETING") {
            res.status(400).json({ error: "The selected meeting does not belong to this workspace" });
            return;
        }
        console.error("[createCalendarEvent]", error);
        res.status(500).json({ error: "Failed to create calendar event" });
    }
};
exports.createCalendarEvent = createCalendarEvent;
const updateCalendarEvent = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const access = await getAuthorizedEvent(req.params.eventId, userId);
        if (!access) {
            res.status(404).json({ error: "Calendar event not found" });
            return;
        }
        if (!access.member) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        if (access.row.created_by_id !== userId && !access.admin) {
            res.status(403).json({ error: "Only the event creator or workspace admin can edit it" });
            return;
        }
        const title = req.body.title === undefined
            ? access.row.title
            : typeof req.body.title === "string" ? req.body.title.trim() : "";
        const description = req.body.description === undefined
            ? access.row.description ?? ""
            : typeof req.body.description === "string" ? req.body.description.trim() : null;
        const location = req.body.location === undefined
            ? access.row.location ?? ""
            : typeof req.body.location === "string" ? req.body.location.trim() : null;
        const startsAt = req.body.startsAt === undefined ? new Date(access.row.starts_at) : parseDate(req.body.startsAt);
        const endsAt = req.body.endsAt === undefined ? new Date(access.row.ends_at) : parseDate(req.body.endsAt);
        const allDay = req.body.allDay === undefined ? access.row.all_day : req.body.allDay === true;
        const color = req.body.color === undefined
            ? access.row.color
            : COLORS.includes(req.body.color) ? req.body.color : null;
        if (!title || title.length > 120 || description === null || location === null ||
            description.length > 2000 || location.length > 200 ||
            !startsAt || !endsAt || startsAt >= endsAt || !color ||
            endsAt.getTime() - startsAt.getTime() > 366 * 86400000) {
            res.status(400).json({ error: "Invalid calendar event details" });
            return;
        }
        const meetingId = req.body.meetingId === undefined
            ? access.row.meeting_id
            : await validateMeeting(req.body.meetingId, access.row.chat_id);
        const { data, error } = await supabase_1.supabase
            .from("calendar_events")
            .update({
            title,
            description: description || null,
            location: location || null,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            all_day: allDay,
            color,
            meeting_id: meetingId,
            updated_at: new Date().toISOString(),
        })
            .eq("id", access.row.id)
            .select(EVENT_SELECT)
            .single();
        if (error)
            throw error;
        res.json({ event: mapEvent(data, userId, access.admin) });
    }
    catch (error) {
        if (error instanceof Error && error.message === "INVALID_MEETING") {
            res.status(400).json({ error: "The selected meeting does not belong to this workspace" });
            return;
        }
        console.error("[updateCalendarEvent]", error);
        res.status(500).json({ error: "Failed to update calendar event" });
    }
};
exports.updateCalendarEvent = updateCalendarEvent;
const deleteCalendarEvent = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const access = await getAuthorizedEvent(req.params.eventId, userId);
        if (!access) {
            res.status(404).json({ error: "Calendar event not found" });
            return;
        }
        if (!access.member || (access.row.created_by_id !== userId && !access.admin)) {
            res.status(403).json({ error: "Only the event creator or workspace admin can delete it" });
            return;
        }
        const { error } = await supabase_1.supabase.from("calendar_events").delete().eq("id", access.row.id);
        if (error)
            throw error;
        res.status(204).send();
    }
    catch (error) {
        console.error("[deleteCalendarEvent]", error);
        res.status(500).json({ error: "Failed to delete calendar event" });
    }
};
exports.deleteCalendarEvent = deleteCalendarEvent;
