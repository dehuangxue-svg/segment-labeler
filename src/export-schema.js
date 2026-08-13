const path = require("node:path");

function safeStem(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "sample";
}

function frameAt(seconds, fps) {
  return Math.round(seconds * fps);
}

function buildManifest({ sourcePath, metadata, labels, segments, clipPaths, exportedAt }) {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const annotations = segments.map((segment, index) => {
    const label = labelById.get(segment.labelId);
    if (!label) throw new Error(`Segment ${index + 1} is not labeled`);
    return {
      id: `sample_${String(index + 1).padStart(5, "0")}`,
      source_video: path.basename(sourcePath),
      clip_path: clipPaths[index],
      sample_type: label.polarity,
      class_id: label.id,
      class_name: label.name,
      start_sec: Number(segment.start.toFixed(3)),
      end_sec: Number(segment.end.toFixed(3)),
      duration_sec: Number((segment.end - segment.start).toFixed(3)),
      start_frame: frameAt(segment.start, metadata.fps),
      end_frame: frameAt(segment.end, metadata.fps),
      note: segment.note || "",
    };
  });

  return {
    schema_version: "1.1.0",
    dataset_type: "temporal_video_classification",
    task: "video_segment_classification",
    exported_at: exportedAt,
    time_unit: "seconds",
    source: {
      file_name: path.basename(sourcePath),
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      duration_sec: metadata.duration,
      video_codec: metadata.videoCodec,
      audio_codec: metadata.audioCodec,
    },
    label_map: labels.map((label) => ({
      id: label.id,
      name: label.name,
      sample_type: label.polarity,
    })),
    annotations,
  };
}

function clipRelativePath(index, label, sourcePath) {
  const sourceStem = safeStem(path.parse(sourcePath).name);
  const polarity = label.polarity === "positive" ? "positive" : "negative";
  const fileName = `${String(index + 1).padStart(5, "0")}_${sourceStem}_${safeStem(label.name)}.mp4`;
  return path.join("videos", polarity, safeStem(label.name), fileName);
}

module.exports = { buildManifest, clipRelativePath, safeStem };
