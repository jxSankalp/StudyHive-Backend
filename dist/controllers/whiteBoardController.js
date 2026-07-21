"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveWhiteboardState = exports.getWhiteboardById = exports.getWhiteboardsByGroup = exports.createWhiteboard = void 0;
const access_1 = require("../lib/access");
const supabase_1 = require("../lib/supabase");
const mapWhiteboard = (whiteboard) => ({
    _id: whiteboard.id,
    title: whiteboard.title,
    groupId: whiteboard.chat_id,
    data: whiteboard.data,
    createdAt: whiteboard.created_at,
    updatedAt: whiteboard.updated_at,
    createdBy: whiteboard.created_by_id ? { _id: whiteboard.created_by_id } : null,
});
const createWhiteboard = async (req, res) => {
    const userId = req.user?.userId;
    const groupId = typeof req.body.groupId === "string" ? req.body.groupId : "";
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!groupId || !name || name.length > 100) {
        res.status(400).json({ error: "A valid name and groupId are required" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(groupId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("whiteboards")
            .insert({ title: name, chat_id: groupId, created_by_id: userId, data: {} })
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json({ success: true, data: mapWhiteboard(data) });
    }
    catch (error) {
        console.error("[createWhiteboard]", error);
        res.status(500).json({ error: "Failed to create whiteboard" });
    }
};
exports.createWhiteboard = createWhiteboard;
const getWhiteboardsByGroup = async (req, res) => {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(groupId, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("whiteboards")
            .select("id, title, chat_id, created_by_id, data, created_at, updated_at")
            .eq("chat_id", groupId)
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        res.json({ success: true, data: data.map(mapWhiteboard) });
    }
    catch (error) {
        console.error("[getWhiteboardsByGroup]", error);
        res.status(500).json({ error: "Failed to load whiteboards" });
    }
};
exports.getWhiteboardsByGroup = getWhiteboardsByGroup;
const getWhiteboardById = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const chatId = await (0, access_1.getWhiteboardChatId)(req.params.id);
        if (!chatId) {
            res.status(404).json({ error: "Whiteboard not found" });
            return;
        }
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase.from("whiteboards").select("*").eq("id", req.params.id).single();
        if (error || !data) {
            res.status(404).json({ error: "Whiteboard not found" });
            return;
        }
        res.json({ success: true, data: mapWhiteboard(data) });
    }
    catch (error) {
        console.error("[getWhiteboardById]", error);
        res.status(500).json({ error: "Failed to load whiteboard" });
    }
};
exports.getWhiteboardById = getWhiteboardById;
const saveWhiteboardState = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (req.body.data === undefined) {
        res.status(400).json({ error: "Whiteboard data is required" });
        return;
    }
    try {
        const chatId = await (0, access_1.getWhiteboardChatId)(req.params.id);
        if (!chatId) {
            res.status(404).json({ error: "Whiteboard not found" });
            return;
        }
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("whiteboards")
            .update({ data: req.body.data, updated_at: new Date().toISOString() })
            .eq("id", req.params.id)
            .select()
            .single();
        if (error)
            throw error;
        res.json({ success: true, data: mapWhiteboard(data) });
    }
    catch (error) {
        console.error("[saveWhiteboardState]", error);
        res.status(500).json({ error: "Failed to save whiteboard" });
    }
};
exports.saveWhiteboardState = saveWhiteboardState;
