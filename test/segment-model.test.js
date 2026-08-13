const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/segment-model");

test("creates one initial segment for the whole video", () => {
  const segments = model.createInitial(100);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].start, 0);
  assert.equal(segments[0].end, 100);
});

test("space cut splits a segment and selects the completed left side", () => {
  const initial = model.createInitial(100);
  const result = model.splitAt(initial, 35.5);
  assert.equal(result.changed, true);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].end, 35.5);
  assert.equal(result.segments[1].start, 35.5);
  assert.equal(result.selectedId, result.segments[0].id);
});

test("split preserves an existing label on both resulting parts", () => {
  const initial = model.createInitial(100).map((segment) => ({ ...segment, labelId: "earring" }));
  const result = model.splitAt(initial, 50);
  assert.deepEqual(result.segments.map((segment) => segment.labelId), ["earring", "earring"]);
});

test("removing a cut clears conflicting labels", () => {
  let segments = model.splitAt(model.createInitial(100), 50).segments;
  segments[0].labelId = "earring";
  segments[1].labelId = "necklace";
  const result = model.removeCutBefore(segments, segments[1].id);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].labelId, null);
});

test("does not create near-zero segments", () => {
  const initial = model.createInitial(100);
  assert.equal(model.splitAt(initial, 0.01).changed, false);
  assert.equal(model.splitAt(initial, 99.98).changed, false);
});

test("removes every cut inside a boxed time range", () => {
  let segments = model.createInitial(100);
  segments = model.splitAt(segments, 20).segments;
  segments = model.splitAt(segments, 40).segments;
  segments = model.splitAt(segments, 60).segments;
  segments = model.splitAt(segments, 80).segments;
  const result = model.removeCutsInRange(segments, 35, 65);
  assert.equal(result.changed, true);
  assert.equal(result.removedCount, 2);
  assert.deepEqual(result.segments.map((segment) => [segment.start, segment.end]), [
    [0, 20], [20, 80], [80, 100],
  ]);
});

test("boxed cut removal clears conflicting labels on the merged segment", () => {
  let segments = model.splitAt(model.createInitial(100), 50).segments;
  segments[0].labelId = "earring";
  segments[1].labelId = "necklace";
  const result = model.removeCutsInRange(segments, 49, 51);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].labelId, null);
});

test("boxed cut removal is unchanged when the range contains no cut", () => {
  const segments = model.splitAt(model.createInitial(100), 50).segments;
  const result = model.removeCutsInRange(segments, 10, 20);
  assert.equal(result.changed, false);
  assert.equal(result.removedCount, 0);
});

test("moves a cut while preserving both segment identities and labels", () => {
  const segments = model.splitAt(model.createInitial(100), 50).segments;
  segments[0].labelId = "earring";
  segments[1].labelId = "necklace";
  const ids = segments.map((segment) => segment.id);
  const result = model.moveCutBefore(segments, segments[1].id, 52.5);
  assert.equal(result.changed, true);
  assert.deepEqual(result.segments.map((segment) => [segment.start, segment.end]), [
    [0, 52.5], [52.5, 100],
  ]);
  assert.deepEqual(result.segments.map((segment) => segment.id), ids);
  assert.deepEqual(result.segments.map((segment) => segment.labelId), ["earring", "necklace"]);
});

test("does not move a cut across a neighboring boundary", () => {
  let segments = model.splitAt(model.createInitial(100), 30).segments;
  segments = model.splitAt(segments, 60).segments;
  assert.equal(model.moveCutBefore(segments, segments[1].id, 0.05).changed, false);
  assert.equal(model.moveCutBefore(segments, segments[1].id, 59.95).changed, false);
});
