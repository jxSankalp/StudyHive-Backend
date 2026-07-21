"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertProfile = exports.getMe = void 0;
const supabase_1 = require("../lib/supabase");
/**
 * GET /api/auth/me
 * Returns the profile for the authenticated user.
 * Auto-creates the profile row if it doesn't exist yet
 * (e.g. for users who signed up before the DB trigger was added).
 */
const getMe = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        // 1. Try fetching existing profile
        let { data: profile, error } = await supabase_1.supabase
            .from("profiles")
            .select("id, email, username, photo")
            .eq("id", userId)
            .maybeSingle(); // maybeSingle() returns null instead of error when row not found
        if (error) {
            console.error("Profile lookup error:", error);
            res.status(500).json({ message: "Failed to load profile" });
            return;
        }
        // 2. If not found, auto-create from Supabase Auth user
        if (!profile) {
            const { data: authData, error: authErr } = await supabase_1.supabase.auth.admin.getUserById(userId);
            if (authErr || !authData?.user) {
                res.status(404).json({ message: "User not found in auth" });
                return;
            }
            const email = authData.user.email ?? "";
            const username = authData.user.user_metadata?.username ?? email.split("@")[0] ?? "User";
            const { data: created, error: createErr } = await supabase_1.supabase
                .from("profiles")
                .upsert({ id: userId, email, username }, { onConflict: "id" })
                .select("id, email, username, photo")
                .single();
            if (createErr) {
                console.error("Auto-create profile error:", createErr);
                res.status(500).json({ message: "Failed to create user profile" });
                return;
            }
            profile = created;
        }
        res.status(200).json({
            _id: profile.id,
            email: profile.email,
            username: profile.username,
            photo: profile.photo,
        });
    }
    catch (error) {
        console.error("getMe error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
exports.getMe = getMe;
/**
 * POST /api/auth/profile
 * Upsert profile row after Supabase sign-up.
 */
const upsertProfile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
        if (username.length < 2 || username.length > 50) {
            res.status(400).json({ message: "username must be between 2 and 50 characters" });
            return;
        }
        const { data: authData, error: authError } = await supabase_1.supabase.auth.admin.getUserById(userId);
        const email = authData.user?.email;
        if (authError || !email) {
            res.status(404).json({ message: "User not found in auth" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("profiles")
            .upsert({ id: userId, username, email }, { onConflict: "id" })
            .select()
            .single();
        if (error) {
            console.error("upsertProfile error:", error);
            res.status(500).json({ message: "Failed to save profile" });
            return;
        }
        res.status(200).json({
            _id: data.id,
            email: data.email,
            username: data.username,
            photo: data.photo,
        });
    }
    catch (error) {
        console.error("upsertProfile error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
exports.upsertProfile = upsertProfile;
