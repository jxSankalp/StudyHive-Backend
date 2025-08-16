// src/models/whiteboardModel.ts
import mongoose from "mongoose";

const whiteboardSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    createdBy: {
      // Change this line:
      type: String, // Correctly store the Clerk user ID as a string
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Whiteboard = mongoose.model("Whiteboard", whiteboardSchema);
export { Whiteboard };