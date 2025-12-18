/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { User } from "../models/userModel";
import { Chat } from "../models/chatModel";

export const getAllChats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const chats = await Chat.find({ users: { $elemMatch: { $eq: userId } } })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 });

    res.status(200).json({ chats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const createGroupChat = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { name, description, users } = req.body;

    if (!name || !Array.isArray(users) || users.length === 0) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    // Fetch users from user IDs
    const participants = await User.find({ _id: { $in: users } });

    // Also fetch the creator
    const admin = await User.findById(userId);
    if (!admin) {
      res.status(404).json({ error: "Admin user not found" });
      return;
    }

    // Combine all members
    const allUsers = [...participants, admin];

    const newGroup = await Chat.create({
      chatName: name,
      description,
      users: allUsers.map((u) => u._id),
      groupAdmin: admin._id,
    });

    // Add this chat to each user's chats
    for (const user of allUsers) {
      user.chats.push(newGroup._id);
      await user.save();
    }

    const populatedGroup = await newGroup.populate(
      "users",
      "username photo email"
    );

    res.status(201).json({ group: populatedGroup });
  } catch (err: any) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

export const renameGroup = async (req: Request, res: Response) => {
  const { chatId, chatName } = req.body;
  try {
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        chatName: chatName,
      },
      {
        new: true,
      }
    )
      .populate("users")
      .populate("groupAdmin");

    if (!updatedChat) {
      res.status(404).json({ error: "Chat Not Found" });
    } else {
      res.json(updatedChat);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const removeFromGroup = async (req: Request, res: Response) => {
  const { chatId, userId } = req.body;
  try {
    const removed = await Chat.findByIdAndUpdate(
      chatId,
      {
        $pull: { users: userId },
      },
      {
        new: true,
      }
    )
      .populate("users")
      .populate("groupAdmin");

    if (!removed) {
      res.status(404).json({ error: "Chat Not Found" });
    } else {
      res.json(removed);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const addToGroup = async (req: Request, res: Response) => {
  const { chatId, userIds } = req.body; // userIds = array of MongoDB _ids

  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: "No users provided" });
    return;
  }

  try {
    const users = await User.find({ _id: { $in: userIds } });

    if (users.length === 0) {
      res.status(404).json({ error: "No matching users found" });
      return;
    }

    const userObjectIds = users.map((u) => u._id);

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $addToSet: {
          users: { $each: userObjectIds },
        },
      },
      { new: true }
    )
      .populate("users", "username photo email")
      .populate("groupAdmin", "username photo email");

    if (!updatedChat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    // Add this chat to each user's chats array
    for (const user of users) {
      if (!user.chats.includes(chatId)) {
        user.chats.push(chatId);
        await user.save();
      }
    }

    res.status(200).json({ chat: updatedChat });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
