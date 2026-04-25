"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveWhiteboardState = exports.getWhiteboardById = exports.getWhiteboardsByGroup = exports.createWhiteboard = void 0;
const supabase_1 = require("../lib/supabase");
const mapWhiteboard = (wb) => ({
    _id: wb.id,
    title: wb.title,
    groupId: wb.chat_id,
    data: wb.data,
    createdAt: wb.created_at,
    updatedAt: wb.updated_at,
    createdBy: wb.created_by_id // Frontend currently expects createdBy as object with _id, but controller returns only created_by_id in some queries, we'll map what we have
});
const createWhiteboard = async (req, res) => {
    const { name, groupId } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }
    if (!groupId || !name) {
        res.status(400).json({ message: "name and groupId are required" });
        return;
    }
    try {
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
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.createWhiteboard = createWhiteboard;
const getWhiteboardsByGroup = async (req, res) => {
    const { groupId } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from("whiteboards")
            .select("id, title, chat_id, created_by_id, data, created_at, updated_at")
            .eq("chat_id", groupId)
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        res.status(200).json({ success: true, data: data.map(mapWhiteboard) });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.getWhiteboardsByGroup = getWhiteboardsByGroup;
const getWhiteboardById = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase_1.supabase
            .from("whiteboards")
            .select("*")
            .eq("id", id)
            .single();
        if (error || !data) {
            res.status(404).json({ message: "Whiteboard not found" });
            return;
        }
        res.status(200).json({ success: true, data: mapWhiteboard(data) });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.getWhiteboardById = getWhiteboardById;
const saveWhiteboardState = async (req, res) => {
    const { id } = req.params;
    const { data: whiteboardData } = req.body;
    try {
        const { data, error } = await supabase_1.supabase
            .from("whiteboards")
            .update({ data: whiteboardData, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single();
        if (error || !data) {
            res.status(404).json({ message: "Whiteboard not found" });
            return;
        }
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.saveWhiteboardState = saveWhiteboardState;
