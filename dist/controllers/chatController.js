"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatStats = exports.addToGroup = exports.removeFromGroup = exports.renameGroup = exports.createGroupChat = exports.getAllChats = void 0;
const supabase_1 = require("../lib/supabase");
const access_1 = require("../lib/access");
const socket_1 = require("../socket");
const normalizeIds = (values) => {
    if (!Array.isArray(values))
        return [];
    return Array.from(new Set(values.filter(access_1.isNonEmptyString).map((value) => value.trim())));
};
const getAllChats = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: memberRows, error: memberError } = await supabase_1.supabase
            .from("chat_members")
            .select("chat_id")
            .eq("user_id", userId);
        if (memberError)
            throw memberError;
        const chatIds = memberRows?.map((row) => row.chat_id) ?? [];
        if (chatIds.length === 0) {
            res.json({ chats: [] });
            return;
        }
        const { data: chats, error } = await supabase_1.supabase
            .from("chats")
            .select(`
        id, chat_name, description, group_admin_id, latest_message_id, created_at, updated_at,
        chat_members ( user_id, profiles ( id, username, email, photo ) ),
        messages!chats_latest_message_id_fkey ( id, content, created_at )
      `)
            .in("id", chatIds)
            .order("updated_at", { ascending: false });
        if (error)
            throw error;
        res.json({ chats: chats ?? [] });
    }
    catch (error) {
        console.error("[getAllChats]", error);
        res.status(500).json({ error: "Failed to load workspaces" });
    }
};
exports.getAllChats = getAllChats;
const createGroupChat = async (req, res) => {
    const adminId = req.user?.userId;
    if (!adminId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : null;
    const requestedIds = normalizeIds(req.body.users).filter((id) => id !== adminId);
    if (!name || name.length > 100) {
        res.status(400).json({ error: "Workspace name must be between 1 and 100 characters" });
        return;
    }
    if (description && description.length > 500) {
        res.status(400).json({ error: "Description must be 500 characters or fewer" });
        return;
    }
    if (requestedIds.length === 0) {
        res.status(400).json({ error: "Select at least one other member" });
        return;
    }
    let createdChatId = null;
    try {
        const { data: profiles, error: profileError } = await supabase_1.supabase
            .from("profiles")
            .select("id")
            .in("id", requestedIds);
        if (profileError)
            throw profileError;
        const validIds = new Set((profiles ?? []).map((profile) => profile.id));
        if (requestedIds.some((id) => !validIds.has(id))) {
            res.status(400).json({ error: "One or more selected users do not exist" });
            return;
        }
        const { data: chat, error: chatError } = await supabase_1.supabase
            .from("chats")
            .insert({ chat_name: name, description, group_admin_id: adminId })
            .select()
            .single();
        if (chatError)
            throw chatError;
        createdChatId = chat.id;
        const memberRows = [...requestedIds, adminId].map((userId) => ({
            chat_id: chat.id,
            user_id: userId,
        }));
        const { error: memberError } = await supabase_1.supabase.from("chat_members").insert(memberRows);
        if (memberError)
            throw memberError;
        res.status(201).json({ group: chat });
    }
    catch (error) {
        if (createdChatId) {
            await supabase_1.supabase.from("chats").delete().eq("id", createdChatId);
        }
        console.error("[createGroupChat]", error);
        res.status(500).json({ error: "Failed to create workspace" });
    }
};
exports.createGroupChat = createGroupChat;
const renameGroup = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const chatName = typeof req.body.chatName === "string" ? req.body.chatName.trim() : "";
    if (!userId || !chatId) {
        res.status(userId ? 400 : 401).json({ error: userId ? "chatId is required" : "Unauthorized" });
        return;
    }
    if (!chatName || chatName.length > 100) {
        res.status(400).json({ error: "Workspace name must be between 1 and 100 characters" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatAdmin)(chatId, userId))) {
            res.status(403).json({ error: "Only the workspace admin can rename it" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("chats")
            .update({ chat_name: chatName, updated_at: new Date().toISOString() })
            .eq("id", chatId)
            .select()
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        console.error("[renameGroup]", error);
        res.status(500).json({ error: "Failed to rename workspace" });
    }
};
exports.renameGroup = renameGroup;
const removeFromGroup = async (req, res) => {
    const actorId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const targetId = typeof req.body.userId === "string" ? req.body.userId : "";
    if (!actorId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || !targetId) {
        res.status(400).json({ error: "chatId and userId are required" });
        return;
    }
    let membershipRemoved = false;
    try {
        if (!(await (0, access_1.isChatAdmin)(chatId, actorId))) {
            res.status(403).json({ error: "Only the workspace admin can remove members" });
            return;
        }
        if (targetId === actorId) {
            res.status(400).json({ error: "The workspace admin cannot remove themselves" });
            return;
        }
        const { error } = await supabase_1.supabase
            .from("chat_members")
            .delete()
            .eq("chat_id", chatId)
            .eq("user_id", targetId);
        if (error)
            throw error;
        membershipRemoved = true;
        const { data: meetings, error: meetingsError } = await supabase_1.supabase
            .from("meetings")
            .select("id")
            .eq("chat_id", chatId);
        if (meetingsError)
            throw meetingsError;
        const meetingIds = (meetings ?? []).map((meeting) => meeting.id);
        if (meetingIds.length > 0) {
            const { error: participantError } = await supabase_1.supabase
                .from("meeting_participants")
                .delete()
                .eq("user_id", targetId)
                .in("meeting_id", meetingIds);
            if (participantError)
                throw participantError;
        }
        membershipRemoved = false;
        await (0, socket_1.revokeChatSocketAccess)(targetId, chatId).catch((socketError) => console.error("[removeFromGroup] realtime revocation failed", socketError));
        res.json({ message: "User removed" });
    }
    catch (error) {
        if (membershipRemoved) {
            const { error: restoreError } = await supabase_1.supabase
                .from("chat_members")
                .upsert({ chat_id: chatId, user_id: targetId }, { onConflict: "chat_id,user_id" });
            if (restoreError)
                console.error("[removeFromGroup] rollback failed", restoreError);
        }
        console.error("[removeFromGroup]", error);
        res.status(500).json({ error: "Failed to remove member" });
    }
};
exports.removeFromGroup = removeFromGroup;
const addToGroup = async (req, res) => {
    const actorId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const userIds = normalizeIds(req.body.userIds);
    if (!actorId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || userIds.length === 0) {
        res.status(400).json({ error: "chatId and at least one user are required" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatAdmin)(chatId, actorId))) {
            res.status(403).json({ error: "Only the workspace admin can add members" });
            return;
        }
        const { data: profiles, error: profileError } = await supabase_1.supabase
            .from("profiles")
            .select("id")
            .in("id", userIds);
        if (profileError)
            throw profileError;
        if ((profiles ?? []).length !== userIds.length) {
            res.status(400).json({ error: "One or more selected users do not exist" });
            return;
        }
        const rows = userIds.map((userId) => ({ chat_id: chatId, user_id: userId }));
        const { error } = await supabase_1.supabase
            .from("chat_members")
            .upsert(rows, { onConflict: "chat_id,user_id", ignoreDuplicates: true });
        if (error)
            throw error;
        const { data: chat, error: chatError } = await supabase_1.supabase
            .from("chats")
            .select("id, chat_name, chat_members ( user_id, profiles ( id, username, email, photo ) )")
            .eq("id", chatId)
            .single();
        if (chatError)
            throw chatError;
        res.json({ chat });
    }
    catch (error) {
        console.error("[addToGroup]", error);
        res.status(500).json({ error: "Failed to add members" });
    }
};
exports.addToGroup = addToGroup;
const getChatStats = async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId) {
        res.status(400).json({ error: "chatId is required" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        const { data: chat, error } = await supabase_1.supabase
            .from("chats")
            .select("id, chat_name, group_admin_id, chat_members ( user_id )")
            .eq("id", chatId)
            .single();
        if (error)
            throw error;
        const memberIds = chat.chat_members
            ?.map((member) => member.user_id)
            .filter(Boolean) ?? [];
        res.json({
            chatId: chat.id,
            chatName: chat.chat_name,
            totalMembers: memberIds.length,
            totalOnline: (0, socket_1.getOnlineUserCountByIds)(memberIds),
            canManage: chat.group_admin_id === userId,
        });
    }
    catch (error) {
        console.error("[getChatStats]", error);
        res.status(500).json({ error: "Failed to load workspace statistics" });
    }
};
exports.getChatStats = getChatStats;
