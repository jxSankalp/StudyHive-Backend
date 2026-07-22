import { supabase } from "./supabase";

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isChatMember = async (
  chatId: string,
  userId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("chat_members")
    .select("chat_id")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
};

export const isChatAdmin = async (
  chatId: string,
  userId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("chat_members")
    .select("role")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
};

export type ChatRole = "owner" | "admin" | "member";

export const getChatRole = async (chatId: string, userId: string): Promise<ChatRole | null> => {
  const { data, error } = await supabase
    .from("chat_members")
    .select("role")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === "owner" || data?.role === "admin" ? data.role : data ? "member" : null;
};

export const getNoteChatId = async (noteId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("notes")
    .select("chat_id")
    .eq("id", noteId)
    .maybeSingle();

  if (error) throw error;
  return data?.chat_id ?? null;
};

export const getWhiteboardChatId = async (
  whiteboardId: string
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("whiteboards")
    .select("chat_id")
    .eq("id", whiteboardId)
    .maybeSingle();

  if (error) throw error;
  return data?.chat_id ?? null;
};
