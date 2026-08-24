import { createServer } from "node:http";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { fakeSupabase } from "./helpers/fakeSupabase";

vi.mock("../src/lib/supabase", () => ({ supabase: fakeSupabase }));
vi.mock("../src/lib/StreamClient", () => ({
  streamClient: {
    upsertUsers: vi.fn(),
    generateUserToken: vi.fn(() => "stream-token"),
    video: { call: vi.fn(() => ({ end: vi.fn(), create: vi.fn(), delete: vi.fn() })) },
  },
}));

const { createApp } = await import("../src/app");
const { initSocket, getIO } = await import("../src/socket");

const auth = (userId: string) => ({ Authorization: `Bearer ${fakeSupabase.authenticate(userId)}` });

describe("P0 HTTP authorization", () => {
  beforeEach(() => {
    fakeSupabase.reset();
    fakeSupabase.tables.profiles = ["owner", "admin", "member", "outsider"].map((id) => ({ id, username: id, email: `${id}@test.local` }));
    fakeSupabase.tables.chats = [{ id: "workspace", chat_name: "Workspace", group_admin_id: "owner" }];
    fakeSupabase.tables.chat_members = [
      { chat_id: "workspace", user_id: "owner", role: "owner" },
      { chat_id: "workspace", user_id: "admin", role: "admin" },
      { chat_id: "workspace", user_id: "member", role: "member" },
    ];
  });

  it("rejects non-member reads and writes for workspace data", async () => {
    const app = createApp();
    await request(app).get("/api/tasks/workspace").set(auth("outsider")).expect(403);
    await request(app).post("/api/tasks").set(auth("outsider")).send({ chatId: "workspace", title: "Forbidden" }).expect(403);
    expect(fakeSupabase.tables.tasks ?? []).toHaveLength(0);
  });

  it("enforces the owner/admin/member role matrix for role changes", async () => {
    const app = createApp();
    await request(app).put("/api/chat/role").set(auth("member")).send({ chatId: "workspace", userId: "admin", role: "member" }).expect(403);
    await request(app).put("/api/chat/role").set(auth("admin")).send({ chatId: "workspace", userId: "member", role: "admin" }).expect(403);
    await request(app).put("/api/chat/role").set(auth("owner")).send({ chatId: "workspace", userId: "member", role: "admin" }).expect(200);
    expect(fakeSupabase.tables.chat_members.find((row) => row.user_id === "member")?.role).toBe("admin");
  });

  it("treats sender-scoped clientMessageId retries as one persisted message", async () => {
    const app = createApp();
    const clientMessageId = crypto.randomUUID();
    const payload = { chatId: "workspace", content: "Exactly once", clientMessageId, mentionedUserIds: [] };
    const first = await request(app).post("/api/messages").set(auth("member")).send(payload).expect(201);
    const retry = await request(app).post("/api/messages").set(auth("member")).send(payload).expect(200);
    expect(retry.body.id).toBe(first.body.id);
    expect(fakeSupabase.tables.messages).toHaveLength(1);
    expect(fakeSupabase.tables.messages[0].client_message_id).toBe(clientMessageId);
  });

  it.each([
    ["non-participant", "member", "active", true, false, 403],
    ["removed member", "member", "active", false, true, 403],
    ["ended meeting", "member", "ended", true, true, 410],
  ])("meeting token rejects %s", async (_label, userId, status, hasMembership, hasParticipant, expected) => {
    fakeSupabase.tables.meetings = [{ id: "meeting", call_id: "call", chat_id: "workspace", created_by_id: "owner", status, scheduled_at: new Date().toISOString() }];
    if (!hasMembership) fakeSupabase.tables.chat_members = fakeSupabase.tables.chat_members.filter((row) => row.user_id !== userId);
    fakeSupabase.tables.meeting_participants = hasParticipant ? [{ meeting_id: "meeting", user_id: userId }] : [];
    await request(createApp()).post("/api/meet/get-token").set(auth(userId)).send({ callId: "call" }).expect(expected);
  });
});

describe("P0 Socket.IO authorization and revocation", () => {
  const httpServer = createServer(createApp());
  let client: Socket | undefined;

  afterAll(async () => {
    client?.disconnect();
    await new Promise<void>((resolve) => getIO().close(() => resolve()));
    if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("denies non-member room joins and ejects a removed member from every workspace resource room", async () => {
    fakeSupabase.reset();
    fakeSupabase.tables.chat_members = [
      { chat_id: "workspace", user_id: "owner", role: "owner" },
      { chat_id: "workspace", user_id: "member", role: "member" },
    ];
    fakeSupabase.tables.notes = [{ id: "note", chat_id: "workspace" }];
    fakeSupabase.tables.whiteboards = [{ id: "board", chat_id: "workspace" }];
    const token = fakeSupabase.authenticate("member");
    const ownerHeaders = auth("owner");
    initSocket(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    client = createSocketClient(`http://127.0.0.1:${address.port}`, { transports: ["websocket"], auth: { token } });
    await new Promise<void>((resolve, reject) => { client!.once("connect", () => resolve()); client!.once("connect_error", reject); });

    client.emit("join chat", "forbidden");
    await new Promise<void>((resolve) => client!.once("realtime:error", () => resolve()));
    expect(await getIO().in("chat:forbidden").fetchSockets()).toHaveLength(0);

    client.emit("join chat", "workspace"); client.emit("note:join", "note"); client.emit("whiteboard:join", "board");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await getIO().in("chat:workspace").fetchSockets()).toHaveLength(1);
    expect(await getIO().in("note:note").fetchSockets()).toHaveLength(1);
    expect(await getIO().in("whiteboard:board").fetchSockets()).toHaveLength(1);

    const revoked = new Promise<void>((resolve) => client!.once("realtime:access-revoked", () => resolve()));
    await request(httpServer).put("/api/chat/groupremove").set(ownerHeaders).send({ chatId: "workspace", userId: "member" }).expect(200);
    await revoked;
    expect(fakeSupabase.tables.chat_members.some((row) => row.user_id === "member")).toBe(false);
    expect(await getIO().in("chat:workspace").fetchSockets()).toHaveLength(0);
    expect(await getIO().in("note:note").fetchSockets()).toHaveLength(0);
    expect(await getIO().in("whiteboard:board").fetchSockets()).toHaveLength(0);
  });
});
