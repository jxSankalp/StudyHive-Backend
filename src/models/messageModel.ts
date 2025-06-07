import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, ref: "User" },
    content: { type: String, trim: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
    readBy: [{ type: String, ref: "User" }],
  },
  { timestamps: true }
);

export const Message = mongoose.model("Message", messageSchema);
