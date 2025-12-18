// src/controllers/whiteboardController.ts
/// <reference path="../types/index.d.ts" />
import { Request, Response } from "express";
import { Whiteboard } from "../models/whiteboardModel";
import mongoose from "mongoose";

// @desc    Create a new whiteboard
// @route   POST /api/whiteboards
// @access  Protected
export const createWhiteboard = async (req: Request, res: Response) => {
  const { name, groupId } = req.body;
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  // Check if groupId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    res.status(400).json({ message: "Invalid group ID" });
    return 
  }

  try {
    const whiteboard = await Whiteboard.create({
      title: name, // Use 'title' to match the schema
      chat: groupId, // Use 'chat' to match the schema
      createdBy: userId, // Use authenticated user ID
      data: {}, // Provide a default empty object for the initial state
    });

    res.status(201).json({
      success: true,
      data: whiteboard,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};



export const getWhiteboardsByGroup = async (req: Request, res: Response) => {
  const { groupId } = req.params; // This correctly gets the ID from the URL

  try {
    const whiteboards = await Whiteboard.find({ chat: groupId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: whiteboards,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get a single whiteboard by ID
// @route   GET /api/whiteboards/:id
// @access  Protected
export const getWhiteboardById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const whiteboard = await Whiteboard.findById(id);

    if (!whiteboard) {
      res.status(404).json({ message: "Whiteboard not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: whiteboard,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Save the whiteboard's state
// @route   PUT /api/whiteboards/:id/save
// @access  Protected
export const saveWhiteboardState = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data } = req.body;

  try {
    const whiteboard = await Whiteboard.findByIdAndUpdate(
      id,
      { data, updatedAt: new Date() },
      { new: true }
    );

    if (!whiteboard) {
      res.status(404).json({ message: "Whiteboard not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: whiteboard,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};