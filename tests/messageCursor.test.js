const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodeMessageCursor,
  encodeMessageCursor,
  parseMessageLimit,
} = require("../dist/lib/messageCursor.js");

test("message page size defaults to 50", () => {
  assert.equal(parseMessageLimit(undefined), 50);
  assert.equal(parseMessageLimit("not-a-number"), 50);
});

test("message page size is bounded from 1 through 100", () => {
  assert.equal(parseMessageLimit("0"), 1);
  assert.equal(parseMessageLimit("25"), 25);
  assert.equal(parseMessageLimit("500"), 100);
});

test("message cursors round-trip timestamp and UUID", () => {
  const input = { createdAt: "2026-07-22T10:30:00.000Z", id: "f47ac10b-58cc-4372-a567-0e02b2c3d479" };
  assert.deepEqual(decodeMessageCursor(encodeMessageCursor(input)), input);
});

test("malformed and oversized message cursors are rejected", () => {
  assert.equal(decodeMessageCursor("not-json"), null);
  assert.equal(decodeMessageCursor("x".repeat(513)), null);
});

test("cursor validation requires a real timestamp and UUID tie-breaker", () => {
  const invalid = Buffer.from(JSON.stringify({ createdAt: "yesterday", id: "123" })).toString("base64url");
  assert.equal(decodeMessageCursor(invalid), null);
});
