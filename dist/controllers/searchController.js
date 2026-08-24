"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchWorkspace = void 0;
const access_1 = require("../lib/access");
const searchCursor_1 = require("../lib/searchCursor");
const supabase_1 = require("../lib/supabase");
const RESOURCE_TYPES = ["message", "note", "task", "meeting"];
const searchWorkspace = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = req.params.chatId;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (query.length < 2 || query.length > 200) {
        res.status(400).json({ error: "Search query must contain between 2 and 200 characters" });
        return;
    }
    const requestedTypes = typeof req.query.types === "string"
        ? Array.from(new Set(req.query.types.split(",").map((item) => item.trim()).filter(Boolean)))
        : [];
    if (requestedTypes.some((item) => !RESOURCE_TYPES.includes(item))) {
        res.status(400).json({ error: "Invalid search filter" });
        return;
    }
    const suppliedCursor = req.query.cursor;
    const cursor = (0, searchCursor_1.decodeSearchCursor)(suppliedCursor);
    if (suppliedCursor !== undefined && !cursor) {
        res.status(400).json({ error: "Invalid search cursor" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        const limit = (0, searchCursor_1.parseSearchLimit)(req.query.limit);
        const { data, error } = await supabase_1.supabase.rpc("search_workspace", {
            p_chat_id: chatId,
            p_user_id: userId,
            p_query: query,
            p_types: requestedTypes.length > 0 ? requestedTypes : null,
            p_limit: limit,
            p_cursor_rank: cursor?.rank ?? null,
            p_cursor_at: cursor?.occurredAt ?? null,
            p_cursor_type: cursor?.resourceType ?? null,
            p_cursor_id: cursor?.id ?? null,
        });
        if (error)
            throw error;
        const rows = (data ?? []);
        const hasMore = rows.length > limit;
        const results = rows.slice(0, limit);
        const last = results.at(-1);
        res.json({
            results: results.map((result) => ({
                type: result.resource_type,
                id: result.id,
                title: result.title,
                snippet: result.snippet,
                occurredAt: result.occurred_at,
                rank: result.rank,
            })),
            hasMore,
            nextCursor: hasMore && last ? (0, searchCursor_1.encodeSearchCursor)({
                rank: Number(last.rank),
                occurredAt: last.occurred_at,
                resourceType: last.resource_type,
                id: last.id,
            }) : null,
        });
    }
    catch (error) {
        console.error("[searchWorkspace]", error);
        res.status(500).json({ error: "Workspace search failed" });
    }
};
exports.searchWorkspace = searchWorkspace;
