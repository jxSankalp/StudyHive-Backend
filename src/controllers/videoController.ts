import { Request, Response } from "express";
import { streamClient } from "../lib/StreamClient";
import { Chat } from "../models/chatModel";
import { User } from "../models/userModel";
import { Meeting } from "../models/meetingModel";
import { getAuth } from "@clerk/express";
// import { getAuth } from "@clerk/nextjs/server";

export const createVideoCall = async (req: Request, res: Response): Promise<void> => {
  const { chatId, meetName } = req.body;

  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await User.findOne({ clerkId: userId });

  if (!user) {
    res.status(401).json({ error: "User not found in DB" });
    return;
  }

  try {
    const chat = await Chat.findById(chatId).populate("users");
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const callId = `call-${chatId}-${Date.now()}`;
    const callType = "default";

    const streamUsers = chat.users.map((user: any) => ({
      id: user.clerkId,
      name: user.username,
      image: user.photo,
      role: "user",
    }));

    await streamClient.upsertUsers(streamUsers);

    const call = streamClient.video.call(callType, callId);
    await call.create({
      data: {
        created_by_id: userId,
        members: streamUsers.map((u) => ({ user_id: u.id })),
      },
    });

    const dbParticipants = await User.find({
      clerkId: { $in: streamUsers.map((u) => u.id) },
    });

    const meeting = await Meeting.create({
      callId,
      name: meetName || `Meeting for ${chat.chatName}`,
      chatId: chat._id,
      participants: dbParticipants.map((u) => u._id),
      createdBy: user._id,
      scheduled_at: new Date(),
      status: "scheduled",
      duration: "30 mins",
    });

    res.status(200).json({
      id: meeting.callId,
      name: meeting.name,
      status: meeting.status,
      participants: meeting.participants.length,
      duration: meeting.duration,
      scheduled_at: meeting.scheduled_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Call creation failed", details: err });
  }
};


export const generateUserToken = async (req: Request, res: Response):Promise<void>  => {
  const { clerkId } = req.body;

  try {
    const token = streamClient.generateUserToken({
      user_id: clerkId,
      validity_in_seconds: 3600,
    });

    res.status(200).json({ token });
    return ;
  } catch (err) {
    res.status(500).json({ error: "Token generation failed", details: err });
    return;
  }
};

export const getMeetingsForChat = async (req: Request, res: Response): Promise<void> => {
  const { chatId } = req.params;

  try {
    const meetings = await Meeting.find({ chatId }).populate("participants");

    const formatted = meetings.map((m) => ({
      id: m.callId,
      name: m.name || "Untitled Room",
      status: m.status || "scheduled",
      participants: m.participants?.length || 0,
      duration: m.duration || "30 mins",
      scheduledTime: new Date(m.scheduled_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch meetings", details: err });
  }
};