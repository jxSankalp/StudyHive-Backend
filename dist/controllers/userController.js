"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserStats = exports.searchUsers = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getCurrentUser = void 0;
const supabase_1 = require("../lib/supabase");
const publicProfile = (data) => ({
    _id: data.id,
    username: data.username,
    email: data.email,
    photo: data.photo,
});
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
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json(publicProfile(data));
    }
    catch (error) {
        console.error("[getCurrentUser]", error);
        res.status(500).json({ error: "Failed to load user" });
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
        res.json(publicProfile(data));
    }
    catch (error) {
        console.error("[getUserById]", error);
        res.status(500).json({ error: "Failed to load user" });
    }
};
exports.getUserById = getUserById;
const updateUser = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId || req.params.id !== userId) {
        res.status(userId ? 403 : 401).json({ error: userId ? "You can only update your own profile" : "Unauthorized" });
        return;
    }
    const updates = {
        updated_at: new Date().toISOString(),
    };
    if (req.body.username !== undefined) {
        const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
        if (username.length < 2 || username.length > 50) {
            res.status(400).json({ error: "Username must be between 2 and 50 characters" });
            return;
        }
        updates.username = username;
    }
    if (req.body.photo !== undefined) {
        if (req.body.photo !== null && typeof req.body.photo !== "string") {
            res.status(400).json({ error: "Invalid photo URL" });
            return;
        }
        if (typeof req.body.photo === "string") {
            try {
                const photoUrl = new URL(req.body.photo);
                if (photoUrl.protocol !== "https:" || req.body.photo.length > 2048)
                    throw new Error();
            }
            catch {
                res.status(400).json({ error: "Photo must be a valid HTTPS URL" });
                return;
            }
        }
        updates.photo = req.body.photo;
    }
    if (updates.username === undefined && updates.photo === undefined) {
        res.status(400).json({ error: "No profile changes provided" });
        return;
    }
    try {
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .update(updates)
            .eq("id", userId)
            .select("id, username, email, photo")
            .single();
        if (error)
            throw error;
        if (updates.username) {
            const { error: metadataError } = await supabase_1.supabase.auth.admin.updateUserById(userId, {
                user_metadata: { username: updates.username },
            });
            if (metadataError)
                console.error("[updateUser] auth metadata update failed", metadataError);
        }
        res.json(publicProfile(data));
    }
    catch (error) {
        console.error("[updateUser]", error);
        res.status(500).json({ error: "Failed to update profile" });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId || req.params.id !== userId) {
        res.status(userId ? 403 : 401).json({ error: userId ? "You can only delete your own account" : "Unauthorized" });
        return;
    }
    try {
        const { error } = await supabase_1.supabase.auth.admin.deleteUser(userId);
        if (error)
            throw error;
        res.json({ message: "User deleted successfully" });
    }
    catch (error) {
        console.error("[deleteUser]", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
};
exports.deleteUser = deleteUser;
const searchUsers = async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const userId = req.user?.userId;
    if (!query) {
        res.status(400).json({ error: "Query is required" });
        return;
    }
    try {
        const escaped = query.replace(/[^a-zA-Z0-9 .@-]/g, "").trim();
        if (!escaped) {
            res.status(400).json({ error: "Query contains no searchable characters" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .select("id, username, email")
            .or(`username.ilike.${escaped}%,email.ilike.${escaped}%`)
            .neq("id", userId ?? "")
            .limit(20);
        if (error)
            throw error;
        res.json({ users: (data ?? []).map((user) => ({ _id: user.id, username: user.username, email: user.email })) });
    }
    catch (error) {
        console.error("[searchUsers]", error);
        res.status(500).json({ error: "Failed to search users" });
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
        const [groups, notes, whiteboards, messages] = await Promise.all([
            supabase_1.supabase.from("chat_members").select("*", { count: "exact", head: true }).eq("user_id", userId),
            supabase_1.supabase.from("notes").select("*", { count: "exact", head: true }).eq("created_by_id", userId),
            supabase_1.supabase.from("whiteboards").select("*", { count: "exact", head: true }).eq("created_by_id", userId),
            supabase_1.supabase.from("messages").select("*", { count: "exact", head: true }).eq("sender_id", userId),
        ]);
        const firstError = [groups.error, notes.error, whiteboards.error, messages.error].find(Boolean);
        if (firstError)
            throw firstError;
        res.json({
            activeGroups: groups.count ?? 0,
            notesCreated: notes.count ?? 0,
            whiteboardsCreated: whiteboards.count ?? 0,
            messagesSent: messages.count ?? 0,
        });
    }
    catch (error) {
        console.error("[getUserStats]", error);
        res.status(500).json({ error: "Failed to load user statistics" });
    }
};
exports.getUserStats = getUserStats;
