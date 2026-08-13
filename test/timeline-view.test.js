const test = require("node:test");
const assert = require("node:assert/strict");
const timeline = require("../src/timeline-view");

test("Command-wheel zoom keeps the time under the pointer fixed", () => {
  const before = timeline.getWindow(400, 1, 0);
  const after = timeline.zoomAt(400, 1, 0, 0.75, -120);
  assert.ok(after.zoom > 1);
  assert.ok(Math.abs((before.start + before.span * 0.75) - (after.start + after.span * 0.75)) < 1e-9);
});

test("zooming out clamps to the complete timeline", () => {
  const after = timeline.zoomAt(400, 2, 100, 0.5, 10000);
  assert.equal(after.zoom, 1);
  assert.equal(after.start, 0);
  assert.equal(after.end, 400);
});

test("visible segments are clipped to the current window", () => {
  const viewWindow = timeline.getWindow(400, 4, 100);
  assert.deepEqual(timeline.visibleSegment({ start: 50, end: 150 }, viewWindow), { left: 0, width: 50 });
  assert.equal(timeline.visibleSegment({ start: 0, end: 50 }, viewWindow), null);
});

test("playhead snaps to the nearest visible cut within eight pixels", () => {
  const viewWindow = timeline.getWindow(100, 1, 0);
  const snapped = timeline.snapTime(49.4, [20, 50, 80], viewWindow, 1000);
  assert.equal(snapped.snapped, true);
  assert.equal(snapped.time, 50);
  assert.ok(Math.abs(snapped.distancePixels - 6) < 1e-9);
});

test("playhead does not snap to a distant or off-screen cut", () => {
  const viewWindow = timeline.getWindow(100, 2, 50);
  assert.equal(timeline.snapTime(63, [20, 70], viewWindow, 500).snapped, false);
  assert.equal(timeline.snapTime(50.2, [49], viewWindow, 500).snapped, false);
});
