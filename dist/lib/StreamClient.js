"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamClient = void 0;
const node_sdk_1 = require("@stream-io/node-sdk");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.streamClient = new node_sdk_1.StreamClient(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET, {
    timeout: 3000,
});
