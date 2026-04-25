"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chat = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const chatSchema = new mongoose_1.default.Schema({
    chatName: { type: String, required: true },
    description: { type: String },
    users: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    latestMessage: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "Message",
    },
    groupAdmin: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
    },
}, {
    timestamps: true,
});
exports.Chat = mongoose_1.default.model("Chat", chatSchema);
