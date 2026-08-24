"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCatchUpDigest = void 0;
const access_1 = require("../lib/access");
const aiDigestGuard_1 = require("../lib/aiDigestGuard");
const geminiDigest_1 = require("../lib/geminiDigest");
const supabase_1 = require("../lib/supabase");
const telemetry_1 = require("../lib/telemetry");
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 40000;
const sourceMessages = (rows) => {
    const sorted = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    const selected = [];
    let characterCount = 0;
    for (const row of sorted.slice(-MAX_MESSAGES).reverse()) {
        const content = typeof row.content === "string" ? row.content.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_CHARS) : "";
        if (!content)
            continue;
        if (selected.length > 0 && characterCount + content.length > MAX_CONTEXT_CHARS)
            break;
        const senderValue = row.sender;
        const sender = Array.isArray(senderValue) ? senderValue[0] : senderValue;
        const username = sender && typeof sender === "object" && typeof sender.username === "string"
            ? sender.username : "Workspace member";
        selected.push({ id: String(row.id), sender: username.slice(0, 80), createdAt: String(row.created_at), content });
        characterCount += content.length;
    }
    return selected.reverse();
};
const errorStatus = (code) => code === "AI_NOT_CONFIGURED" ? 503
    : code === "AI_RATE_LIMITED" ? 429
        : code === "AI_TIMEOUT" ? 504
            : code === "AI_INVALID_RESPONSE" ? 502 : 502;
const createCatchUpDigest = async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "You are not a member of this workspace" });
            return;
        }
        if (!process.env.GEMINI_API_KEY?.trim()) {
            res.status(503).json({ error: "Catch me up is not configured yet.", code: "AI_NOT_CONFIGURED" });
            return;
        }
        const { data, error } = await supabase_1.supabase.from("messages")
            .select("id, content, created_at, sender:profiles!messages_sender_id_fkey ( username )")
            .eq("chat_id", chatId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(MAX_MESSAGES);
        if (error)
            throw error;
        const messages = sourceMessages((data ?? []));
        if (messages.length === 0) {
            res.status(422).json({ error: "There are no text messages to summarize.", code: "NO_DIGEST_CONTENT" });
            return;
        }
        const fingerprint = (0, aiDigestGuard_1.digestFingerprint)(userId, chatId, messages);
        const cached = (0, aiDigestGuard_1.readDigestCache)(fingerprint);
        if (cached) {
            res.json({ digest: cached.digest, source: sourceMetadata(messages, cached.model, true, cached.generatedAt) });
            return;
        }
        const quota = (0, aiDigestGuard_1.consumeDigestQuota)(userId, chatId);
        if (!quota.allowed) {
            res.setHeader("Retry-After", String(quota.retryAfter));
            res.status(429).json({ error: "You have generated several digests. Please try again shortly.", code: "AI_RATE_LIMITED", retryAfter: quota.retryAfter });
            return;
        }
        const generated = await (0, geminiDigest_1.generateGeminiDigest)(messages);
        const generatedAt = new Date().toISOString();
        (0, aiDigestGuard_1.writeDigestCache)(fingerprint, generated.digest, generated.model, generatedAt);
        res.json({ digest: generated.digest, source: sourceMetadata(messages, generated.model, false, generatedAt) });
    }
    catch (error) {
        if (error instanceof geminiDigest_1.GeminiDigestError) {
            if (error.retryAfter)
                res.setHeader("Retry-After", String(error.retryAfter));
            res.status(errorStatus(error.code)).json({ error: error.message, code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) });
            return;
        }
        (0, telemetry_1.logError)("ai.digest.failed", error, { chatId, userId });
        res.status(500).json({ error: "Failed to create a catch-up digest.", code: "AI_DIGEST_FAILED" });
    }
};
exports.createCatchUpDigest = createCatchUpDigest;
const sourceMetadata = (messages, model, cached, generatedAt) => ({
    messageCount: messages.length,
    from: messages[0]?.createdAt ?? null,
    to: messages.at(-1)?.createdAt ?? null,
    basis: "recent",
    generatedAt,
    model,
    cached,
});
