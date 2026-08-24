export type SearchCursor = {
  rank: number;
  occurredAt: string;
  resourceType: string;
  id: string;
};
export const encodeSearchCursor = (cursor: SearchCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export const decodeSearchCursor = (value: unknown): SearchCursor | null => {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SearchCursor>;
    if (
      typeof parsed.rank !== "number" || !Number.isFinite(parsed.rank)
      || typeof parsed.occurredAt !== "string" || Number.isNaN(Date.parse(parsed.occurredAt))
      || typeof parsed.resourceType !== "string" || !["message", "note", "task", "meeting"].includes(parsed.resourceType)
      || typeof parsed.id !== "string" || parsed.id.length === 0 || parsed.id.length > 300
    ) return null;
    return parsed as SearchCursor;
  } catch {
    return null;
  }
};

export const parseSearchLimit = (value: unknown): number => {
  if (value === undefined) return 20;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 20;
};
