"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNote = exports.deleteNote = exports.getNoteById = exports.createNote = exports.allNotes = void 0;
const supabase_1 = require("../lib/supabase");
const mapNote = (note) => ({
    _id: note.id,
    name: note.name,
    content: note.content,
    chat: note.chat_id,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    createdBy: note.created_by ? {
        _id: note.created_by.id,
        username: note.created_by.username,
        email: note.created_by.email
    } : null
});
const allNotes = async (req, res) => {
    try {
        const chatId = req.params.chatId || req.query.chatId;
        if (!chatId) {
            res.status(400).json({ error: "Chat ID is required" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .select(`id, name, content, chat_id, created_at, updated_at,
         created_by:profiles!notes_created_by_id_fkey ( id, username, email )`)
            .eq("chat_id", chatId)
            .order("created_at", { ascending: false });
        if (error)
            throw error;
        res.json({ data: data.map(mapNote) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.allNotes = allNotes;
const createNote = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const { content, name, chatId } = req.body;
    if (!content || !chatId || !name) {
        res.status(400).json({ error: "content, name and chatId are required" });
        return;
    }
    try {
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .insert({ name, content, chat_id: chatId, created_by_id: userId })
            .select(`id, name, content, chat_id, created_at, updated_at,
         created_by:profiles!notes_created_by_id_fkey ( id, username, email )`)
            .single();
        if (error)
            throw error;
        res.json({ data: mapNote(data) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createNote = createNote;
const getNoteById = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .select(`id, name, content, chat_id, created_at, updated_at,
         created_by:profiles!notes_created_by_id_fkey ( id, username, email )`)
            .eq("id", req.params.notesId)
            .single();
        if (error || !data) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        res.json({ data: mapNote(data) });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getNoteById = getNoteById;
const deleteNote = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: note, error: findErr } = await supabase_1.supabase
            .from("notes")
            .select("id, created_by_id")
            .eq("id", req.params.notesId)
            .single();
        if (findErr || !note) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        if (note.created_by_id !== userId) {
            res.status(403).json({ error: "Not allowed to delete this note" });
            return;
        }
        const { error: delErr } = await supabase_1.supabase
            .from("notes")
            .delete()
            .eq("id", note.id);
        if (delErr)
            throw delErr;
        res.json({ message: "Note deleted successfully" });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteNote = deleteNote;
const updateNote = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const { notesId } = req.params;
    const { content, name } = req.body;
    try {
        const updates = {};
        if (content !== undefined)
            updates.content = content;
        if (name !== undefined)
            updates.name = name;
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .update(updates)
            .eq("id", notesId)
            .select()
            .single();
        if (error || !data) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        res.json({ message: "Note updated successfully", data });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.updateNote = updateNote;
