"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSearchLimit = exports.decodeSearchCursor = exports.encodeSearchCursor = void 0;
const encodeSearchCursor = (cursor) => Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
exports.encodeSearchCursor = encodeSearchCursor;
const decodeSearchCursor = (value) => {
    if (typeof value !== "string" || value.length === 0 || value.length > 1000)
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        if (typeof parsed.rank !== "number" || !Number.isFinite(parsed.rank)
            || typeof parsed.occurredAt !== "string" || Number.isNaN(Date.parse(parsed.occurredAt))
            || typeof parsed.resourceType !== "string" || !["message", "note", "task", "meeting"].includes(parsed.resourceType)
            || typeof parsed.id !== "string" || parsed.id.length === 0 || parsed.id.length > 300)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
};
exports.decodeSearchCursor = decodeSearchCursor;
const parseSearchLimit = (value) => {
    if (value === undefined)
        return 20;
    const parsed = typeof value === "string" ? Number(value) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 20;
};
exports.parseSearchLimit = parseSearchLimit;
