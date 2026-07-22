"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNote = exports.deleteNote = exports.getNoteById = exports.createNote = exports.allNotes = void 0;
const access_1 = require("../lib/access");
const supabase_1 = require("../lib/supabase");
const NOTE_SELECT = `id, name, content, chat_id, created_at, updated_at, is_pinned, tags,
  created_by:profiles!notes_created_by_id_fkey ( id, username, email )`;
const mapNote = (note) => ({
    _id: note.id,
    name: note.name,
    content: note.content ?? "",
    chat: note.chat_id,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    isPinned: note.is_pinned === true,
    tags: Array.isArray(note.tags) ? note.tags : [],
    createdBy: note.created_by
        ? { _id: note.created_by.id, username: note.created_by.username, email: note.created_by.email }
        : null,
});
const requireNoteAccess = async (noteId, userId) => {
    const chatId = await (0, access_1.getNoteChatId)(noteId);
    return chatId ? { chatId, allowed: await (0, access_1.isChatMember)(chatId, userId) } : null;
};
const normalizeTags = (value) => {
    if (!Array.isArray(value))
        return null;
    const tags = [...new Set(value
            .filter((tag) => typeof tag === "string")
            .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
            .filter(Boolean))];
    return tags.length <= 10 && tags.every((tag) => tag.length <= 24) ? tags : null;
};
const allNotes = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.query.chatId === "string" ? req.query.chatId : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId) {
        res.status(400).json({ error: "Chat ID is required" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .select(NOTE_SELECT)
            .eq("chat_id", chatId)
            .order("is_pinned", { ascending: false })
            .order("updated_at", { ascending: false });
        if (error)
            throw error;
        res.json({ data: data.map(mapNote) });
    }
    catch (error) {
        console.error("[allNotes]", error);
        res.status(500).json({ error: "Failed to load notes" });
    }
};
exports.allNotes = allNotes;
const createNote = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const content = typeof req.body.content === "string" ? req.body.content : "";
    const tags = req.body.tags === undefined ? [] : normalizeTags(req.body.tags);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || !name || name.length > 100 || content.length > 100000 || tags === null) {
        res.status(400).json({ error: "A valid chatId, name, and content are required" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .insert({ name, content, tags, is_pinned: false, chat_id: chatId, created_by_id: userId })
            .select(NOTE_SELECT)
            .single();
        if (error)
            throw error;
        res.status(201).json({ data: mapNote(data) });
    }
    catch (error) {
        console.error("[createNote]", error);
        res.status(500).json({ error: "Failed to create note" });
    }
};
exports.createNote = createNote;
const getNoteById = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const access = await requireNoteAccess(req.params.notesId, userId);
        if (!access) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        if (!access.allowed) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .select(NOTE_SELECT)
            .eq("id", req.params.notesId)
            .single();
        if (error || !data) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        res.json({ data: mapNote(data) });
    }
    catch (error) {
        console.error("[getNoteById]", error);
        res.status(500).json({ error: "Failed to load note" });
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
        const { data: note, error } = await supabase_1.supabase
            .from("notes")
            .select("id, chat_id, created_by_id")
            .eq("id", req.params.notesId)
            .maybeSingle();
        if (error)
            throw error;
        if (!note) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        if (!(await (0, access_1.isChatMember)(note.chat_id, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        if (note.created_by_id !== userId) {
            res.status(403).json({ error: "Only the note creator can delete it" });
            return;
        }
        const { error: deleteError } = await supabase_1.supabase.from("notes").delete().eq("id", note.id);
        if (deleteError)
            throw deleteError;
        res.json({ message: "Note deleted successfully" });
    }
    catch (error) {
        console.error("[deleteNote]", error);
        res.status(500).json({ error: "Failed to delete note" });
    }
};
exports.deleteNote = deleteNote;
const updateNote = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const updates = {
        updated_at: new Date().toISOString(),
    };
    if (req.body.content !== undefined) {
        if (typeof req.body.content !== "string" || req.body.content.length > 100000) {
            res.status(400).json({ error: "Invalid note content" });
            return;
        }
        updates.content = req.body.content;
    }
    if (req.body.name !== undefined) {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!name || name.length > 100) {
            res.status(400).json({ error: "Invalid note name" });
            return;
        }
        updates.name = name;
    }
    if (req.body.tags !== undefined) {
        const tags = normalizeTags(req.body.tags);
        if (tags === null) {
            res.status(400).json({ error: "Tags must contain at most 10 values of 24 characters or fewer" });
            return;
        }
        updates.tags = tags;
    }
    if (req.body.isPinned !== undefined) {
        if (typeof req.body.isPinned !== "boolean") {
            res.status(400).json({ error: "Invalid pinned state" });
            return;
        }
        updates.is_pinned = req.body.isPinned;
    }
    if (updates.content === undefined && updates.name === undefined && updates.tags === undefined && updates.is_pinned === undefined) {
        res.status(400).json({ error: "No changes provided" });
        return;
    }
    try {
        const access = await requireNoteAccess(req.params.notesId, userId);
        if (!access) {
            res.status(404).json({ error: "Note not found" });
            return;
        }
        if (!access.allowed) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from("notes")
            .update(updates)
            .eq("id", req.params.notesId)
            .select(NOTE_SELECT)
            .single();
        if (error)
            throw error;
        res.json({ message: "Note updated successfully", data: mapNote(data) });
    }
    catch (error) {
        console.error("[updateNote]", error);
        res.status(500).json({ error: "Failed to update note" });
    }
};
exports.updateNote = updateNote;
