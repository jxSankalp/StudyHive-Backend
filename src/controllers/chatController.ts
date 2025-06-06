import { Request, Response } from "express";
import {chats} from "../data/chats";


export const getAllChats = async (
  req: Request,
    res: Response
): Promise<void> => {
  try {
    // Simulate fetching chats from a database
  
    res.send(chats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export const getChatById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const chatId = req.params.id;
    // Simulate fetching a specific chat by ID
    const chat = { id: chatId, name: "Sample Chat", lastMessage: "Sample message" };
    res.json(chat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
