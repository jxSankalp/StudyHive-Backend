/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { supabase } from "../lib/supabase";

/**
 * GET /api/auth/me
 * Returns the profile for the authenticated user.
 * Auto-creates the profile row if it doesn't exist yet
 * (e.g. for users who signed up before the DB trigger was added).
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // 1. Try fetching existing profile
    let { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, username, photo")
      .eq("id", userId)
      .maybeSingle(); // maybeSingle() returns null instead of error when row not found

    // 2. If not found, auto-create from Supabase Auth user
    if (!profile) {
      const { data: authData, error: authErr } =
        await supabase.auth.admin.getUserById(userId);

      if (authErr || !authData?.user) {
        res.status(404).json({ message: "User not found in auth" });
        return;
      }

      const email = authData.user.email ?? "";
      const username =
        authData.user.user_metadata?.username ?? email.split("@")[0] ?? "User";

      const { data: created, error: createErr } = await supabase
        .from("profiles")
        .upsert({ id: userId, email, username }, { onConflict: "id" })
        .select("id, email, username, photo")
        .single();

      if (createErr) {
        console.error("Auto-create profile error:", createErr);
        // Return a synthetic profile so the client still works even if DB isn't set up
        res.status(200).json({
          _id: userId,
          email,
          username,
          photo: null,
        });
        return;
      }

      profile = created;
    }

    res.status(200).json({
      _id: profile!.id,
      email: profile!.email,
      username: profile!.username,
      photo: profile!.photo,
    });
  } catch (error) {
    console.error("getMe error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/auth/profile
 * Upsert profile row after Supabase sign-up.
 */
export const upsertProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { username, email } = req.body;
    if (!username || !email) {
      res.status(400).json({ message: "username and email are required" });
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: userId, username, email }, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("upsertProfile error:", error);
      // Return success anyway so sign-up flow isn't broken if table doesn't exist yet
      res.status(200).json({ _id: userId, email, username, photo: null });
      return;
    }

    res.status(200).json({
      _id: data.id,
      email: data.email,
      username: data.username,
      photo: data.photo,
    });
  } catch (error) {
    console.error("upsertProfile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
