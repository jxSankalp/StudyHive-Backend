import { supabase } from "./supabase";

export const CHAT_FILES_BUCKET = "chat-files";
export const MAX_CHAT_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_CHAT_FILES_PER_MESSAGE = 4;
export const CHAT_FILE_URL_TTL_SECONDS = 60 * 60;

export const ALLOWED_CHAT_FILE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

interface ChatFileRow {
  id: string;
  message_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export const safeFileName = (value: string): string => {
  const base = value.split(/[\\/]/).pop()?.trim() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").slice(0, 180);
  return cleaned || "file";
};

export const withSignedChatFiles = async <T extends Record<string, unknown>>(messages: T[]): Promise<Array<T & { attachments: ChatAttachment[] }>> => {
  if (messages.length === 0) return [];
  const messageIds = messages.filter((message) => !message.deleted_at).map((message) => String(message.id)).filter(Boolean);
  if (messageIds.length === 0) return messages.map((message) => ({ ...message, attachments: [] }));
  const { data, error } = await supabase
    .from("chat_files")
    .select("id, message_id, storage_path, original_name, mime_type, size_bytes")
    .in("message_id", messageIds)
    .eq("status", "ready");
  if (error) throw error;

  const rows = (data ?? []) as ChatFileRow[];
  const paths = rows.map((row) => row.storage_path);
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signedError } = await supabase.storage
      .from(CHAT_FILES_BUCKET)
      .createSignedUrls(paths, CHAT_FILE_URL_TTL_SECONDS);
    if (signedError) throw signedError;
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
  }

  const byMessage = new Map<string, ChatAttachment[]>();
  for (const row of rows) {
    const url = signedByPath.get(row.storage_path);
    if (!url) continue;
    const attachments = byMessage.get(row.message_id) ?? [];
    attachments.push({ id: row.id, name: row.original_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), url });
    byMessage.set(row.message_id, attachments);
  }
  return messages.map((message) => ({ ...message, attachments: byMessage.get(String(message.id)) ?? [] }));
};
