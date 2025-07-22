import mongoose from "mongoose";

const whiteboardSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    title: { type: String, required: true },
    data: { type: Object, required: true }, // Excalidraw scene format
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export const Whiteboard = mongoose.model("Whiteboard", whiteboardSchema);
