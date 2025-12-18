/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { User } from "../models/userModel";
import { Notes } from "../models/notesModel";

export const allNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const chatId = req.params.chatId || req.query.chatId;

    if (!chatId) {
      res.status(400).json({ error: "Chat ID is required" });
      return;
    }

    const notes = await Notes.find({ chat: chatId })
      .select("-content")
      .populate("createdBy", "username email");

    res.json({
      data: [...notes],
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
};

export const createNote = async (
  req: Request,
  res: Response
): Promise<void> => {
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

  const { content, name, chatId } = req.body;

  if (!content || !chatId || !name) {
    console.log("Invalid data passed into request");
    res.sendStatus(400);
    return;
  }

  const newNote = {
    name,
    createdBy: user._id,
    content,
    chat: chatId,
  };

  try {
    const note = await Notes.create(newNote);

    const fullNote = await Notes.findById(note._id).populate(
      "createdBy",
      "username email"
    );

    res.json(fullNote);
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
};

export const getNoteById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id  = req.params.notesId;
    const note = await Notes.findById(id).populate(
      "createdBy",
      "username email"
    );

    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    res.json({
      data: note,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const id = req.params.notesId;

    const note = await Notes.findById(id);

    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    if(!note.createdBy){
      res.status(400).json({ error: "Note does not have a creator" });
      return;
    }

    // Get user from DB to get their _id
    const user = await User.findById(userId);

    if (!user || note.createdBy.toString() !== user._id.toString()) {
      res
        .status(403)
        .json({ error: "You are not allowed to delete this note" });
      return;
    }

    await note.deleteOne();

    res.json({
      message: "Note deleted successfully",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const updateNote = async (req: Request, res: Response): Promise<void> => {
  const { notesId } = req.params;
  const { content, name } = req.body;
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const note = await Notes.findById(notesId);

    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    // Check ownership or permissions if needed
    // if (note.createdBy.toString() !== userId) { ... }

    if (content !== undefined) note.content = content;
    if (name !== undefined) note.name = name;

    await note.save();

    res.json({
      message: "Note updated successfully",
      data: note,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

