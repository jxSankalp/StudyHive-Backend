/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { User } from "../models/userModel";
import { Chat } from "../models/chatModel";
import { Message } from "../models/messageModel";

export const allMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {

    const chatId = req.params.chatId;
    const messages = await Message.find({ chat: chatId })
      .populate("sender", "username photo email")
      .populate("chat");
    res.json(messages);
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
};

export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findById(userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { content, chatId } = req.body;

    if (!content || !chatId) {
      console.log("Invalid data passed into request");
      res.sendStatus(400);
      return;
    }

    const newMessage = {
      sender: user._id,
      content,
      chat: chatId,
    };

    try {
      const createdMessage = await Message.create(newMessage);

      // Populate sender and nested chat.users using lean()
      const fullMessage = await Message.findById(createdMessage._id)
        .populate("sender", "username photo email")
        .populate({
          path: "chat",
          populate: {
            path: "users",
            select: "username photo email",
          },
        })
        .lean(); // returns plain JS object to bypass TS Mongoose doc type strictness

      await Chat.findByIdAndUpdate(chatId, { latestMessage: createdMessage });

      res.json(fullMessage);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
