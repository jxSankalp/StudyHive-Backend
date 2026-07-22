export const DEFAULT_MESSAGE_PAGE_SIZE = 50;
export const MAX_MESSAGE_PAGE_SIZE = 100;

export interface MessageCursor {
  createdAt: string;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseMessageLimit = (value: unknown): number => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return DEFAULT_MESSAGE_PAGE_SIZE;
  const parsed = Number(value);
  return Math.min(Math.max(parsed, 1), MAX_MESSAGE_PAGE_SIZE);
};

export const encodeMessageCursor = (cursor: MessageCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export const decodeMessageCursor = (value: unknown): MessageCursor | null => {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<MessageCursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !UUID_PATTERN.test(parsed.id)
    ) return null;
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch {
    return null;
  }
};
