const test = require("node:test");
const assert = require("node:assert/strict");
const { mediaType, requestedByteRange } = require("../src/media-utils");

test("maps supported video extensions to media types", () => {
  assert.equal(mediaType("recording.MP4"), "video/mp4");
  assert.equal(mediaType("recording.mov"), "video/quicktime");
  assert.equal(mediaType("recording.webm"), "video/webm");
});

test("parses open, closed and suffix byte ranges", () => {
  assert.deepEqual(requestedByteRange("bytes=100-199", 1000), { start: 100, end: 199 });
  assert.deepEqual(requestedByteRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(requestedByteRange("bytes=-100", 1000), { start: 900, end: 999 });
});

test("rejects invalid byte ranges", () => {
  assert.equal(requestedByteRange("bytes=1000-1200", 1000), null);
  assert.equal(requestedByteRange("items=0-10", 1000), null);
});
