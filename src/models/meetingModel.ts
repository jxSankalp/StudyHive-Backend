import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true },
    name: { type: String, default: "Untitled Room" },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["active", "scheduled", "ended"],
      default: "scheduled",
    },
    duration: { type: String, default: "30 mins" },
    scheduled_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Meeting = mongoose.model("Meeting", meetingSchema);
