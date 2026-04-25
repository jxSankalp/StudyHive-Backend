"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notes = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const notesSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    content: { type: String },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User" },
    chat: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Chat" },
}, { timestamps: true });
exports.Notes = mongoose_1.default.model("Notes", notesSchema);
