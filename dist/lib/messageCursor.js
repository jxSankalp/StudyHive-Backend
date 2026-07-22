"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeMessageCursor = exports.encodeMessageCursor = exports.parseMessageLimit = exports.MAX_MESSAGE_PAGE_SIZE = exports.DEFAULT_MESSAGE_PAGE_SIZE = void 0;
exports.DEFAULT_MESSAGE_PAGE_SIZE = 50;
exports.MAX_MESSAGE_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const parseMessageLimit = (value) => {
    if (typeof value !== "string" || !/^\d+$/.test(value))
        return exports.DEFAULT_MESSAGE_PAGE_SIZE;
    const parsed = Number(value);
    return Math.min(Math.max(parsed, 1), exports.MAX_MESSAGE_PAGE_SIZE);
};
exports.parseMessageLimit = parseMessageLimit;
const encodeMessageCursor = (cursor) => Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
exports.encodeMessageCursor = encodeMessageCursor;
const decodeMessageCursor = (value) => {
    if (typeof value !== "string" || !value || value.length > 512)
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        if (typeof parsed.createdAt !== "string" ||
            Number.isNaN(Date.parse(parsed.createdAt)) ||
            typeof parsed.id !== "string" ||
            !UUID_PATTERN.test(parsed.id))
            return null;
        return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
    }
    catch {
        return null;
    }
};
exports.decodeMessageCursor = decodeMessageCursor;
