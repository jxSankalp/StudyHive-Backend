import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anonKey && serviceKey);

describe.skipIf(!enabled)("Supabase RLS with anon and authenticated tokens", () => {
  const suffix = crypto.randomUUID();
  const password = `Rls-${crypto.randomUUID()}!aA1`;
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let member: SupabaseClient;
  let outsider: SupabaseClient;
  let memberId = "";
  let outsiderId = "";
  let chatId = "";
  let taskId = "";
  let notificationId = "";
  let messageId = "";

  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const memberEmail = `rls-member-${suffix}@example.test`;
    const outsiderEmail = `rls-outsider-${suffix}@example.test`;
    const memberUser = await service.auth.admin.createUser({ email: memberEmail, password, email_confirm: true, user_metadata: { username: "RLS Member" } });
    const outsiderUser = await service.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true, user_metadata: { username: "RLS Outsider" } });
    if (memberUser.error || outsiderUser.error || !memberUser.data.user || !outsiderUser.data.user) throw memberUser.error ?? outsiderUser.error ?? new Error("Failed to create RLS users");
    memberId = memberUser.data.user.id; outsiderId = outsiderUser.data.user.id;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await service.from("profiles").upsert([
      { id: memberId, email: memberEmail, username: "RLS Member" },
      { id: outsiderId, email: outsiderEmail, username: "RLS Outsider" },
    ]);
    const chat = await service.from("chats").insert({ chat_name: `RLS ${suffix}`, group_admin_id: memberId }).select("id").single();
    if (chat.error) throw chat.error;
    chatId = chat.data.id;
    const membership = await service.from("chat_members").insert({ chat_id: chatId, user_id: memberId, role: "owner" });
    if (membership.error) throw membership.error;
    const task = await service.from("tasks").insert({ chat_id: chatId, title: "RLS task", created_by_id: memberId }).select("id").single();
    const notification = await service.from("notifications").insert({ user_id: memberId, chat_id: chatId, type: "system", title: "RLS notification" }).select("id").single();
    const message = await service.from("messages").insert({ chat_id: chatId, sender_id: memberId, content: "RLS reaction target", client_message_id: crypto.randomUUID() }).select("id").single();
    if (task.error || notification.error || message.error) throw task.error ?? notification.error ?? message.error;
    taskId = task.data.id; notificationId = notification.data.id; messageId = message.data.id;
    const reaction = await service.from("message_reactions").insert({ message_id: messageId, user_id: memberId, emoji: "👍" });
    if (reaction.error) throw reaction.error;
    member = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    outsider = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const memberSession = await member.auth.signInWithPassword({ email: memberEmail, password });
    const outsiderSession = await outsider.auth.signInWithPassword({ email: outsiderEmail, password });
    if (memberSession.error || outsiderSession.error) throw memberSession.error ?? outsiderSession.error;
  });

  afterAll(async () => {
    if (service && chatId) await service.from("chats").delete().eq("id", chatId);
    if (service && memberId) await service.auth.admin.deleteUser(memberId);
    if (service && outsiderId) await service.auth.admin.deleteUser(outsiderId);
  });

  it("denies anonymous access to all hardened collaboration tables", async () => {
    for (const table of ["tasks", "notifications", "message_reactions"]) {
      const result = await anon.from(table).select("*");
      expect(result.error, `${table} should reject anon`).toBeTruthy();
    }
  });

  it("scopes authenticated task and reaction reads to workspace membership", async () => {
    const memberTask = await member.from("tasks").select("id").eq("id", taskId);
    const outsiderTask = await outsider.from("tasks").select("id").eq("id", taskId);
    const memberReaction = await member.from("message_reactions").select("message_id").eq("message_id", messageId);
    const outsiderReaction = await outsider.from("message_reactions").select("message_id").eq("message_id", messageId);
    expect(memberTask.error).toBeNull(); expect(memberTask.data).toHaveLength(1);
    expect(outsiderTask.error).toBeNull(); expect(outsiderTask.data).toHaveLength(0);
    expect(memberReaction.error).toBeNull(); expect(memberReaction.data).toHaveLength(1);
    expect(outsiderReaction.error).toBeNull(); expect(outsiderReaction.data).toHaveLength(0);
  });

  it("scopes notifications to their owner and allows only read acknowledgement", async () => {
    const own = await member.from("notifications").select("id").eq("id", notificationId);
    const foreign = await outsider.from("notifications").select("id").eq("id", notificationId);
    expect(own.data).toHaveLength(1); expect(foreign.data).toHaveLength(0);
    const acknowledge = await member.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
    expect(acknowledge.error).toBeNull();
    const rewrite = await member.from("notifications").update({ title: "tampered" }).eq("id", notificationId);
    expect(rewrite.error).toBeTruthy();
  });

  it("denies direct authenticated mutations reserved for the service-role API", async () => {
    const taskWrite = await member.from("tasks").insert({ chat_id: chatId, title: "direct write" });
    const reactionWrite = await member.from("message_reactions").insert({ message_id: messageId, user_id: memberId, emoji: "🚫" });
    expect(taskWrite.error).toBeTruthy();
    expect(reactionWrite.error).toBeTruthy();
  });
});
