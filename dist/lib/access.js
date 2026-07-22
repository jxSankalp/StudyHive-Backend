"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhiteboardChatId = exports.getNoteChatId = exports.getChatRole = exports.isChatAdmin = exports.isChatMember = exports.isNonEmptyString = void 0;
const supabase_1 = require("./supabase");
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
exports.isNonEmptyString = isNonEmptyString;
const isChatMember = async (chatId, userId) => {
    const { data, error } = await supabase_1.supabase
        .from("chat_members")
        .select("chat_id")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .maybeSingle();
    if (error)
        throw error;
    return Boolean(data);
};
exports.isChatMember = isChatMember;
const isChatAdmin = async (chatId, userId) => {
    const { data, error } = await supabase_1.supabase
        .from("chat_members")
        .select("role")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .in("role", ["owner", "admin"])
        .maybeSingle();
    if (error)
        throw error;
    return Boolean(data);
};
exports.isChatAdmin = isChatAdmin;
const getChatRole = async (chatId, userId) => {
    const { data, error } = await supabase_1.supabase
        .from("chat_members")
        .select("role")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .maybeSingle();
    if (error)
        throw error;
    return data?.role === "owner" || data?.role === "admin" ? data.role : data ? "member" : null;
};
exports.getChatRole = getChatRole;
const getNoteChatId = async (noteId) => {
    const { data, error } = await supabase_1.supabase
        .from("notes")
        .select("chat_id")
        .eq("id", noteId)
        .maybeSingle();
    if (error)
        throw error;
    return data?.chat_id ?? null;
};
exports.getNoteChatId = getNoteChatId;
const getWhiteboardChatId = async (whiteboardId) => {
    const { data, error } = await supabase_1.supabase
        .from("whiteboards")
        .select("chat_id")
        .eq("id", whiteboardId)
        .maybeSingle();
    if (error)
        throw error;
    return data?.chat_id ?? null;
};
exports.getWhiteboardChatId = getWhiteboardChatId;
