import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const { resetAiDigestStateForTests } = await import("../src/lib/aiDigestGuard");

const auth = (userId: string) => ({ Authorization: `Bearer ${fakeSupabase.authenticate(userId)}` });
const geminiResponse = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("Gemini catch-up digest", () => {
  beforeEach(() => {
    fakeSupabase.reset();
    resetAiDigestStateForTests();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    fakeSupabase.tables.chat_members = [{ chat_id: "workspace", user_id: "member", role: "member" }];
    fakeSupabase.tables.messages = [
      { id: "message-1", chat_id: "workspace", content: "We decided to ship on Friday.", created_at: "2026-08-24T10:00:00.000Z", deleted_at: null, sender: { username: "Asha", email: "private@test.local" }, private_file_url: "https://private.invalid/file" },
      { id: "message-2", chat_id: "workspace", content: "Ravi will finish the API tests. Do we need a demo video?", created_at: "2026-08-24T10:01:00.000Z", deleted_at: null, sender: { username: "Ravi" } },
      { id: "deleted", chat_id: "workspace", content: "Do not summarize this", created_at: "2026-08-24T10:02:00.000Z", deleted_at: "2026-08-24T10:03:00.000Z", sender: { username: "Asha" } },
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("checks workspace membership before sending any content to Gemini", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await request(createApp()).post("/api/messages/workspace/catch-up").set(auth("outsider")).expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an explicit unconfigured state without contacting Gemini", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(createApp()).post("/api/messages/workspace/catch-up").set(auth("member")).expect(503);
    expect(response.body.code).toBe("AI_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns grounded structured output, drops invented citations, and reuses an unchanged digest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse({
      summary: "The team picked Friday and assigned API test work.",
      decisions: [{ text: "Ship on Friday", sourceMessageId: "message-1" }],
      actionItems: [{ text: "Finish API tests", owner: "Ravi", sourceMessageId: "message-2" }],
      openQuestions: [
        { text: "Is a demo video needed?", sourceMessageId: "message-2" },
        { text: "Invented question", sourceMessageId: "not-a-real-message" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await request(createApp()).post("/api/messages/workspace/catch-up").set(auth("member")).expect(200);
    const second = await request(createApp()).post("/api/messages/workspace/catch-up").set(auth("member")).expect(200);

    expect(first.body.digest.decisions[0].sourceMessageId).toBe("message-1");
    expect(first.body.digest.openQuestions).toHaveLength(1);
    expect(first.body.source).toMatchObject({ messageCount: 2, cached: false });
    expect(second.body.source.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = String(fetchMock.mock.calls[0][1]?.body);
    expect(requestBody).not.toContain("private@test.local");
    expect(requestBody).not.toContain("private.invalid");
    expect(requestBody).not.toContain("Do not summarize this");
  });

  it("maps Gemini rate limiting to a safe retryable API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429, headers: { "Retry-After": "9" } })));
    const response = await request(createApp()).post("/api/messages/workspace/catch-up").set(auth("member")).expect(429);
    expect(response.headers["retry-after"]).toBe("9");
    expect(response.body).toMatchObject({ code: "AI_RATE_LIMITED", retryAfter: 9 });
  });
});
