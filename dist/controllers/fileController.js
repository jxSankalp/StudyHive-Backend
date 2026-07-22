"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChatFileUpload = exports.completeChatFileUpload = exports.createChatFileUpload = void 0;
const crypto_1 = require("crypto");
const access_1 = require("../lib/access");
const chatFiles_1 = require("../lib/chatFiles");
const supabase_1 = require("../lib/supabase");
const extensionFor = (name) => {
    const match = name.toLowerCase().match(/\.[a-z0-9]{1,10}$/);
    return match?.[0] ?? "";
};
const createChatFileUpload = async (req, res) => {
    const userId = req.user?.userId;
    const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
    const rawFileName = typeof req.body.fileName === "string" ? req.body.fileName.trim() : "";
    const originalName = (0, chatFiles_1.safeFileName)(rawFileName);
    const mimeType = typeof req.body.mimeType === "string" ? req.body.mimeType.toLowerCase().trim() : "";
    const sizeBytes = Number(req.body.sizeBytes);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!chatId || !rawFileName || rawFileName.length > 255 || !chatFiles_1.ALLOWED_CHAT_FILE_TYPES.has(mimeType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > chatFiles_1.MAX_CHAT_FILE_SIZE) {
        res.status(400).json({ error: "Use an allowed file type up to 10 MB" });
        return;
    }
    let fileId = null;
    try {
        if (!(await (0, access_1.isChatMember)(chatId, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        const storagePath = `${chatId}/${userId}/${(0, crypto_1.randomUUID)()}${extensionFor(originalName)}`;
        const { data: file, error: insertError } = await supabase_1.supabase.from("chat_files").insert({
            chat_id: chatId,
            uploader_id: userId,
            storage_path: storagePath,
            original_name: originalName,
            mime_type: mimeType,
            size_bytes: sizeBytes,
            status: "pending",
        }).select("id, storage_path").single();
        if (insertError)
            throw insertError;
        fileId = file.id;
        const { data: upload, error: uploadError } = await supabase_1.supabase.storage.from(chatFiles_1.CHAT_FILES_BUCKET).createSignedUploadUrl(storagePath);
        if (uploadError)
            throw uploadError;
        res.status(201).json({ fileId: file.id, path: file.storage_path, token: upload.token });
    }
    catch (error) {
        if (fileId)
            await supabase_1.supabase.from("chat_files").delete().eq("id", fileId);
        console.error("[createChatFileUpload]", error);
        res.status(500).json({ error: "Failed to prepare file upload" });
    }
};
exports.createChatFileUpload = createChatFileUpload;
const completeChatFileUpload = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: file, error } = await supabase_1.supabase.from("chat_files")
            .select("id, chat_id, uploader_id, storage_path, original_name, mime_type, size_bytes, status, message_id")
            .eq("id", req.params.fileId).maybeSingle();
        if (error)
            throw error;
        if (!file) {
            res.status(404).json({ error: "Upload not found" });
            return;
        }
        if (file.uploader_id !== userId || !(await (0, access_1.isChatMember)(file.chat_id, userId))) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        if (file.message_id) {
            res.status(409).json({ error: "File is already attached" });
            return;
        }
        const lastSlash = file.storage_path.lastIndexOf("/");
        const folder = file.storage_path.slice(0, lastSlash);
        const objectName = file.storage_path.slice(lastSlash + 1);
        const { data: objects, error: listError } = await supabase_1.supabase.storage.from(chatFiles_1.CHAT_FILES_BUCKET).list(folder, { search: objectName, limit: 10 });
        if (listError)
            throw listError;
        const uploadedObject = objects?.find((object) => object.name === objectName);
        if (!uploadedObject) {
            res.status(409).json({ error: "Upload has not reached storage yet" });
            return;
        }
        const storedSize = Number(uploadedObject.metadata?.size ?? file.size_bytes);
        if (storedSize < 1 || storedSize > Number(file.size_bytes) || storedSize > chatFiles_1.MAX_CHAT_FILE_SIZE) {
            await supabase_1.supabase.storage.from(chatFiles_1.CHAT_FILES_BUCKET).remove([file.storage_path]);
            await supabase_1.supabase.from("chat_files").delete().eq("id", file.id);
            res.status(400).json({ error: "Uploaded file size does not match the request" });
            return;
        }
        const { error: updateError } = await supabase_1.supabase.from("chat_files").update({ status: "ready", size_bytes: storedSize, updated_at: new Date().toISOString() }).eq("id", file.id);
        if (updateError)
            throw updateError;
        const { data: signed, error: signedError } = await supabase_1.supabase.storage.from(chatFiles_1.CHAT_FILES_BUCKET).createSignedUrl(file.storage_path, chatFiles_1.CHAT_FILE_URL_TTL_SECONDS);
        if (signedError)
            throw signedError;
        res.json({ attachment: { id: file.id, name: file.original_name, mimeType: file.mime_type, sizeBytes: storedSize, url: signed.signedUrl } });
    }
    catch (error) {
        console.error("[completeChatFileUpload]", error);
        res.status(500).json({ error: "Failed to complete file upload" });
    }
};
exports.completeChatFileUpload = completeChatFileUpload;
const deleteChatFileUpload = async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const { data: file, error } = await supabase_1.supabase.from("chat_files").select("id, uploader_id, storage_path, message_id").eq("id", req.params.fileId).maybeSingle();
        if (error)
            throw error;
        if (!file) {
            res.status(204).end();
            return;
        }
        if (file.uploader_id !== userId) {
            res.status(403).json({ error: "Access denied" });
            return;
        }
        if (file.message_id) {
            res.status(409).json({ error: "Sent attachments cannot be removed separately" });
            return;
        }
        const { error: storageError } = await supabase_1.supabase.storage.from(chatFiles_1.CHAT_FILES_BUCKET).remove([file.storage_path]);
        if (storageError)
            throw storageError;
        const { error: deleteError } = await supabase_1.supabase.from("chat_files").delete().eq("id", file.id);
        if (deleteError)
            throw deleteError;
        res.status(204).end();
    }
    catch (error) {
        console.error("[deleteChatFileUpload]", error);
        res.status(500).json({ error: "Failed to remove upload" });
    }
};
exports.deleteChatFileUpload = deleteChatFileUpload;
