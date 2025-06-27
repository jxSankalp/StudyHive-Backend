import mongoose from "mongoose";

const notesSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    content: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
  },
  { timestamps: true }
);

export const Notes = mongoose.model("Notes", notesSchema);
