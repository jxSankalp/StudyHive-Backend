"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Whiteboard = void 0;
// src/models/whiteboardModel.ts
const mongoose_1 = __importDefault(require("mongoose"));
const whiteboardSchema = new mongoose_1.default.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    chat: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "Chat",
        required: true,
    },
    createdBy: {
        // Change this line:
        type: String, // Correctly store the Clerk user ID as a string
        required: true,
    },
    data: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
});
const Whiteboard = mongoose_1.default.model("Whiteboard", whiteboardSchema);
exports.Whiteboard = Whiteboard;
