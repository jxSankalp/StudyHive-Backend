"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimiter = void 0;
const stores = new Map();
const clientKey = (req) => {
    const authorization = req.get("authorization") ?? "";
    const tokenHint = authorization.length > 16 ? authorization.slice(-16) : "anonymous";
    return `${req.ip || req.socket.remoteAddress || "unknown"}:${tokenHint}`;
};
const createRateLimiter = ({ windowMs, limit, name }) => {
    const store = stores.get(name) ?? new Map();
    stores.set(name, store);
    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store)
            if (entry.resetAt <= now)
                store.delete(key);
    }, Math.max(windowMs, 60000));
    cleanup.unref();
    return (req, res, next) => {
        if (req.method === "OPTIONS" || req.path === "/health") {
            next();
            return;
        }
        const now = Date.now();
        const key = clientKey(req);
        let entry = store.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            store.set(key, entry);
        }
        entry.count += 1;
        const remaining = Math.max(0, limit - entry.count);
        res.setHeader("RateLimit-Limit", String(limit));
        res.setHeader("RateLimit-Remaining", String(remaining));
        res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
        if (entry.count > limit) {
            const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            res.setHeader("Retry-After", String(retryAfter));
            res.status(429).json({ error: "Too many requests. Please slow down and try again.", retryAfter });
            return;
        }
        next();
    };
};
exports.createRateLimiter = createRateLimiter;
