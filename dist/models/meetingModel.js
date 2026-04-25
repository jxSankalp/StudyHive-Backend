"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Meeting = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const meetingSchema = new mongoose_1.default.Schema({
    callId: { type: String, required: true },
    name: { type: String, default: "Untitled Room" },
    chatId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "Chat",
        required: true,
    },
    participants: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    createdBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
    },
    status: {
        type: String,
        enum: ["active", "scheduled", "ended"],
        default: "scheduled",
    },
    duration: { type: String, default: "30 mins" },
    scheduled_at: { type: Date, default: Date.now },
}, { timestamps: true });
exports.Meeting = mongoose_1.default.model("Meeting", meetingSchema);
