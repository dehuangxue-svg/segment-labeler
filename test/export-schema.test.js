const test = require("node:test");
const assert = require("node:assert/strict");
const { buildManifest, clipRelativePath } = require("../src/export-schema");

const labels = [
  { id: "target_action", name: "Target action", polarity: "positive", groupId: "product" },
  { id: "closeup", name: "Close-up", polarity: "attribute", groupId: "visual_state" },
  { id: "invalid_scene", name: "Invalid scene", polarity: "negative", groupId: "negative_reason" },
];

test("builds temporal classification annotations with seconds and frames", () => {
  const manifest = buildManifest({
    sourcePath: "/tmp/live.mp4",
    metadata: { width: 1080, height: 1920, fps: 30, duration: 120, videoCodec: "h264", audioCodec: "aac" },
    labels,
    segments: [{ id: "x", start: 1.25, end: 4.5, labelIds: ["target_action", "closeup"], note: "example" }],
    clipPaths: ["videos/positive/Target_action/00001.mp4"],
    exportedAt: "2026-08-12T00:00:00.000Z",
  });
  assert.equal(manifest.schema_version, "2.0.0");
  assert.equal(manifest.dataset_type, "temporal_video_multilabel_classification");
  assert.equal(manifest.task, "video_segment_multilabel_classification");
  assert.equal(manifest.annotations[0].sample_type, "positive");
  assert.equal(manifest.annotations[0].class_id, "target_action");
  assert.equal(manifest.annotations[0].class_name, "Target action");
  assert.deepEqual(manifest.annotations[0].label_ids, ["target_action", "closeup"]);
  assert.deepEqual(manifest.annotations[0].labels_by_group, { product: ["target_action"], visual_state: ["closeup"] });
  assert.equal(manifest.annotations[0].start_frame, 38);
  assert.equal(manifest.annotations[0].end_frame, 135);
  assert.equal(manifest.annotations[0].duration_sec, 3.25);
});

test("places clips in polarity and class folders", () => {
  const result = clipRelativePath(2, [labels[2], labels[1]], "/tmp/My Live.mp4");
  assert.match(result, /videos/);
  assert.match(result, /negative/);
  assert.match(result, /Invalid_scene/);
  assert.match(result, /00003_My_Live_Invalid_scene\.mp4$/);
});

test("rejects unlabeled segments", () => {
  assert.throws(() => buildManifest({
    sourcePath: "/tmp/live.mp4",
    metadata: { fps: 30 },
    labels,
    segments: [{ start: 0, end: 1, labelIds: [] }],
    clipPaths: ["x.mp4"],
    exportedAt: "now",
  }), /not labeled/);
});

test("accepts legacy labelId and promotes it to the multi-label manifest", () => {
  const manifest = buildManifest({
    sourcePath: "/tmp/live.mp4", metadata: { fps: 30, duration: 1 }, labels,
    segments: [{ start: 0, end: 1, labelId: "target_action" }], clipPaths: ["x.mp4"], exportedAt: "now",
  });
  assert.deepEqual(manifest.annotations[0].label_ids, ["target_action"]);
});

test("rejects attributes without a positive or negative decision label", () => {
  assert.throws(() => buildManifest({
    sourcePath: "/tmp/live.mp4", metadata: { fps: 30 }, labels,
    segments: [{ start: 0, end: 1, labelIds: ["closeup"] }], clipPaths: ["x.mp4"], exportedAt: "now",
  }), /not labeled/);
});
