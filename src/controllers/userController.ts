import { Request, Response } from "express";
import {
  createUserInDB,
  getUserByIdFromDB,
  updateUserInDB,
  deleteUserFromDB,
} from "../services/user.service";
import { User } from "../models/userModel";
import { UpdateUserParams } from "../types/user";
import { getAuth } from "@clerk/express";

export const getCurrentUser = async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  console.log("Authenticated Clerk userId:", userId);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await User.findOne({ clerkId: userId }).select("clerkId username photo");
    if (!user) {
      res.status(404).json({ error: "User not found in DB" });
    }

    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Server error" });
  }
};

export const createUser = async (
  req: Request,
  res: Response
) => {
  try {
    const newUser = await createUserInDB(req.body);
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const getUserById = async (
  req: Request,
  res: Response
) => {
  try {
    const user = await getUserByIdFromDB(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const updateUser = async (
  req: Request,
  res: Response
) => {
  try {
    const updatedUser = await updateUserInDB(
      req.params.id,
      req.body as UpdateUserParams
    );
    if (!updatedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(updatedUser);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteUser = async (
  req: Request,
  res: Response
) => {
  try {
    const deletedUser = await deleteUserFromDB(req.params.id);
    if (!deletedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ message: "User deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const searchUsers = async (req: Request, res: Response) => {
  const { query } = req.query;

  const { userId } = getAuth(req);

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query is required" });
    return
  }

  try {
    const users = await User.find({
      username: { $regex: new RegExp("^" + query, "i") },
      clerkId: { $ne: userId }, // starts with query, case-insensitive
    }).select("clerkId username");

    res.json({ users });  
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
