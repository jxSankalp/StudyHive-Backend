/// <reference path="../types/index.d.ts" />
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { isChatMember } from "../lib/access";
import {
  ALLOWED_CHAT_FILE_TYPES,
  CHAT_FILES_BUCKET,
  CHAT_FILE_URL_TTL_SECONDS,
  MAX_CHAT_FILE_SIZE,
  safeFileName,
} from "../lib/chatFiles";
import { supabase } from "../lib/supabase";

const extensionFor = (name: string) => {
  const match = name.toLowerCase().match(/\.[a-z0-9]{1,10}$/);
  return match?.[0] ?? "";
};

export const createChatFileUpload = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const chatId = typeof req.body.chatId === "string" ? req.body.chatId : "";
  const rawFileName = typeof req.body.fileName === "string" ? req.body.fileName.trim() : "";
  const originalName = safeFileName(rawFileName);
  const mimeType = typeof req.body.mimeType === "string" ? req.body.mimeType.toLowerCase().trim() : "";
  const sizeBytes = Number(req.body.sizeBytes);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!chatId || !rawFileName || rawFileName.length > 255 || !ALLOWED_CHAT_FILE_TYPES.has(mimeType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_CHAT_FILE_SIZE) {
    res.status(400).json({ error: "Use an allowed file type up to 10 MB" }); return;
  }

  let fileId: string | null = null;
  try {
    if (!(await isChatMember(chatId, userId))) { res.status(403).json({ error: "Access denied" }); return; }
    const storagePath = `${chatId}/${userId}/${randomUUID()}${extensionFor(originalName)}`;
    const { data: file, error: insertError } = await supabase.from("chat_files").insert({
      chat_id: chatId,
      uploader_id: userId,
      storage_path: storagePath,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      status: "pending",
    }).select("id, storage_path").single();
    if (insertError) throw insertError;
    fileId = file.id;
    const { data: upload, error: uploadError } = await supabase.storage.from(CHAT_FILES_BUCKET).createSignedUploadUrl(storagePath);
    if (uploadError) throw uploadError;
    res.status(201).json({ fileId: file.id, path: file.storage_path, token: upload.token });
  } catch (error) {
    if (fileId) await supabase.from("chat_files").delete().eq("id", fileId);
    console.error("[createChatFileUpload]", error);
    res.status(500).json({ error: "Failed to prepare file upload" });
  }
};

export const completeChatFileUpload = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { data: file, error } = await supabase.from("chat_files")
      .select("id, chat_id, uploader_id, storage_path, original_name, mime_type, size_bytes, status, message_id")
      .eq("id", req.params.fileId).maybeSingle();
    if (error) throw error;
    if (!file) { res.status(404).json({ error: "Upload not found" }); return; }
    if (file.uploader_id !== userId || !(await isChatMember(file.chat_id, userId))) { res.status(403).json({ error: "Access denied" }); return; }
    if (file.message_id) { res.status(409).json({ error: "File is already attached" }); return; }

    const lastSlash = file.storage_path.lastIndexOf("/");
    const folder = file.storage_path.slice(0, lastSlash);
    const objectName = file.storage_path.slice(lastSlash + 1);
    const { data: objects, error: listError } = await supabase.storage.from(CHAT_FILES_BUCKET).list(folder, { search: objectName, limit: 10 });
    if (listError) throw listError;
    const uploadedObject = objects?.find((object) => object.name === objectName);
    if (!uploadedObject) { res.status(409).json({ error: "Upload has not reached storage yet" }); return; }
    const storedSize = Number(uploadedObject.metadata?.size ?? file.size_bytes);
    if (storedSize < 1 || storedSize > Number(file.size_bytes) || storedSize > MAX_CHAT_FILE_SIZE) {
      await supabase.storage.from(CHAT_FILES_BUCKET).remove([file.storage_path]);
      await supabase.from("chat_files").delete().eq("id", file.id);
      res.status(400).json({ error: "Uploaded file size does not match the request" }); return;
    }
    const { error: updateError } = await supabase.from("chat_files").update({ status: "ready", size_bytes: storedSize, updated_at: new Date().toISOString() }).eq("id", file.id);
    if (updateError) throw updateError;
    const { data: signed, error: signedError } = await supabase.storage.from(CHAT_FILES_BUCKET).createSignedUrl(file.storage_path, CHAT_FILE_URL_TTL_SECONDS);
    if (signedError) throw signedError;
    res.json({ attachment: { id: file.id, name: file.original_name, mimeType: file.mime_type, sizeBytes: storedSize, url: signed.signedUrl } });
  } catch (error) {
    console.error("[completeChatFileUpload]", error);
    res.status(500).json({ error: "Failed to complete file upload" });
  }
};

export const deleteChatFileUpload = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { data: file, error } = await supabase.from("chat_files").select("id, uploader_id, storage_path, message_id").eq("id", req.params.fileId).maybeSingle();
    if (error) throw error;
    if (!file) { res.status(204).end(); return; }
    if (file.uploader_id !== userId) { res.status(403).json({ error: "Access denied" }); return; }
    if (file.message_id) { res.status(409).json({ error: "Sent attachments cannot be removed separately" }); return; }
    const { error: storageError } = await supabase.storage.from(CHAT_FILES_BUCKET).remove([file.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await supabase.from("chat_files").delete().eq("id", file.id);
    if (deleteError) throw deleteError;
    res.status(204).end();
  } catch (error) {
    console.error("[deleteChatFileUpload]", error);
    res.status(500).json({ error: "Failed to remove upload" });
  }
};
