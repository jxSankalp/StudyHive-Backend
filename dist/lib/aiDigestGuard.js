"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetAiDigestStateForTests = exports.consumeDigestQuota = exports.writeDigestCache = exports.readDigestCache = exports.digestFingerprint = void 0;
const node_crypto_1 = require("node:crypto");
const cache = new Map();
const quotas = new Map();
const boundedInteger = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
const digestFingerprint = (userId, chatId, messages) => (0, node_crypto_1.createHash)("sha256")
    .update(JSON.stringify([userId, chatId, messages]))
    .digest("hex");
exports.digestFingerprint = digestFingerprint;
const readDigestCache = (key) => {
    const cached = cache.get(key);
    if (!cached)
        return null;
    if (cached.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return cached;
};
exports.readDigestCache = readDigestCache;
const writeDigestCache = (key, digest, model, generatedAt) => {
    const ttlMs = boundedInteger(process.env.AI_DIGEST_CACHE_TTL_MS, 5 * 60000, 10000, 60 * 60000);
    if (cache.size >= 200) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey)
            cache.delete(oldestKey);
    }
    cache.set(key, { digest, model, generatedAt, expiresAt: Date.now() + ttlMs });
};
exports.writeDigestCache = writeDigestCache;
const consumeDigestQuota = (userId, chatId) => {
    const now = Date.now();
    const limit = boundedInteger(process.env.AI_DIGEST_RATE_LIMIT, 5, 1, 50);
    const windowMs = boundedInteger(process.env.AI_DIGEST_RATE_WINDOW_MS, 10 * 60000, 10000, 60 * 60000);
    const key = `${userId}:${chatId}`;
    let entry = quotas.get(key);
    if (!entry || entry.resetAt <= now)
        entry = { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    quotas.set(key, entry);
    return entry.count <= limit ? { allowed: true } : { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
};
exports.consumeDigestQuota = consumeDigestQuota;
const resetAiDigestStateForTests = () => { cache.clear(); quotas.clear(); };
exports.resetAiDigestStateForTests = resetAiDigestStateForTests;
