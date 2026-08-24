const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodeSearchCursor,
  encodeSearchCursor,
  parseSearchLimit,
} = require("../dist/lib/searchCursor.js");

test("search page size defaults to 20 and accepts values through 50", () => {
  assert.equal(parseSearchLimit(undefined), 20);
  assert.equal(parseSearchLimit("12"), 12);
  assert.equal(parseSearchLimit("51"), 20);
  assert.equal(parseSearchLimit("invalid"), 20);
});

test("search cursors round-trip the complete relevance tie-breaker", () => {
  const input = {
    rank: 0.375,
    occurredAt: "2026-08-03T08:30:00.000Z",
    resourceType: "message",
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  };
  assert.deepEqual(decodeSearchCursor(encodeSearchCursor(input)), input);
});

test("search cursors reject malformed, incomplete, and unknown resource data", () => {
  assert.equal(decodeSearchCursor("not-json"), null);
  assert.equal(decodeSearchCursor("x".repeat(1001)), null);
  assert.equal(decodeSearchCursor(Buffer.from(JSON.stringify({ rank: 1 })).toString("base64url")), null);
  assert.equal(decodeSearchCursor(Buffer.from(JSON.stringify({ rank: 1, occurredAt: new Date().toISOString(), resourceType: "file", id: "1" })).toString("base64url")), null);
});
