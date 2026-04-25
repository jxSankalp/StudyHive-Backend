"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserStats = exports.searchUsers = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getCurrentUser = void 0;
const supabase_1 = require("../lib/supabase");
const getCurrentUser = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, email, photo")
            .eq("id", userId)
            .single();
        if (error || !data) {
            res.status(404).json({ error: "User not found in DB" });
            return;
        }
        res.json({ _id: data.id, username: data.username, email: data.email, photo: data.photo });
    }
    catch (err) {
        res.status(500).json({ error: err.message || "Server error" });
    }
};
exports.getCurrentUser = getCurrentUser;
const getUserById = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, email, photo")
            .eq("id", req.params.id)
            .single();
        if (error || !data) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json({ _id: data.id, username: data.username, email: data.email, photo: data.photo });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};
exports.getUserById = getUserById;
const updateUser = async (req, res) => {
    try {
        const { username, photo } = req.body;
        const { data, error } = await supabase_1.supabase
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
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const { error } = await supabase_1.supabase
            .from("profiles")
            .delete()
            .eq("id", req.params.id);
        if (error)
            throw error;
        res.json({ message: "User deleted successfully" });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
};
exports.deleteUser = deleteUser;
const searchUsers = async (req, res) => {
    const { query } = req.query;
    const userId = req.user?.userId;
    if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Query is required" });
        return;
    }
    try {
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, email")
            .ilike("username", `${query}%`)
            .neq("id", userId ?? "");
        if (error)
            throw error;
        res.json({ users: data?.map(u => ({ _id: u.id, username: u.username, email: u.email })) });
    }
    catch (err) {
        res.status(500).json({ error: "Server error" });
    }
};
exports.searchUsers = searchUsers;
const getUserStats = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        // Get active groups count
        const { count: groupsCount } = await supabase_1.supabase
            .from("chat_members")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId);
        // Get notes created count
        const { count: notesCount } = await supabase_1.supabase
            .from("notes")
            .select("*", { count: "exact", head: true })
            .eq("created_by", userId);
        // Get whiteboards created count
        const { count: whiteboardsCount } = await supabase_1.supabase
            .from("whiteboards")
            .select("*", { count: "exact", head: true })
            .eq("created_by", userId);
        // Get messages sent count
        const { count: messagesCount } = await supabase_1.supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("sender_id", userId);
        res.json({
            activeGroups: groupsCount || 0,
            notesCreated: notesCount || 0,
            whiteboardsCreated: whiteboardsCount || 0,
            messagesSent: messagesCount || 0,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message || "Server error" });
    }
};
exports.getUserStats = getUserStats;
