/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import {
  createUserInDB,
  getUserByIdFromDB,
  updateUserInDB,
  deleteUserFromDB,
} from "../services/user.service";
import { User } from "../models/userModel";
import { UpdateUserParams } from "../types/user";

export const getCurrentUser = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  console.log("Authenticated userId:", userId);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await User.findById(userId).select("_id username email photo");
    if (!user) {
      res.status(404).json({ error: "User not found in DB" });
      return;
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

  const userId = req.user?.userId;

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query is required" });
    return
  }

  try {
    const users = await User.find({
      username: { $regex: new RegExp("^" + query, "i") },
      _id: { $ne: userId }, // starts with query, case-insensitive
    }).select("_id username email");

    res.json({ users });  
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
