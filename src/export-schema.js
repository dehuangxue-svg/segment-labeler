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

function labelIdsOf(segment) {
  const values = Array.isArray(segment?.labelIds)
    ? segment.labelIds
    : segment?.labelId
      ? [segment.labelId]
      : [];
  return [...new Set(values.filter(Boolean))];
}

function labelsForSegment(segment, labelById) {
  return labelIdsOf(segment).map((id) => labelById.get(id)).filter(Boolean);
}

function sampleTypeForLabels(labels) {
  if (labels.some((label) => label.polarity === "negative")) return "negative";
  if (labels.some((label) => label.polarity === "positive")) return "positive";
  return null;
}

function groupIdForLabel(label) {
  return label.groupId || (label.polarity === "negative"
    ? "negative_reason"
    : label.polarity === "attribute"
      ? "attribute"
      : "positive_class");
}

function buildManifest({ sourcePath, metadata, labels, segments, clipPaths, exportedAt }) {
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const annotations = segments.map((segment, index) => {
    const selectedLabels = labelsForSegment(segment, labelById);
    const sampleType = sampleTypeForLabels(selectedLabels);
    if (!selectedLabels.length || !sampleType) throw new Error(`Segment ${index + 1} is not labeled`);
    const primary = selectedLabels.find((label) => label.polarity === sampleType) || selectedLabels[0];
    const labelsByGroup = {};
    selectedLabels.forEach((label) => {
      const groupId = groupIdForLabel(label);
      if (!labelsByGroup[groupId]) labelsByGroup[groupId] = [];
      labelsByGroup[groupId].push(label.id);
    });
    return {
      id: `sample_${String(index + 1).padStart(5, "0")}`,
      source_video: path.basename(sourcePath),
      clip_path: clipPaths[index],
      sample_type: sampleType,
      class_id: primary.id,
      class_name: primary.name,
      label_ids: selectedLabels.map((label) => label.id),
      labels: selectedLabels.map((label) => ({
        id: label.id,
        name: label.name,
        role: label.polarity,
        group_id: groupIdForLabel(label),
      })),
      labels_by_group: labelsByGroup,
      start_sec: Number(segment.start.toFixed(3)),
      end_sec: Number(segment.end.toFixed(3)),
      duration_sec: Number((segment.end - segment.start).toFixed(3)),
      start_frame: frameAt(segment.start, metadata.fps),
      end_frame: frameAt(segment.end, metadata.fps),
      note: segment.note || "",
    };
  });
  return {
    schema_version: "2.0.0",
    dataset_type: "temporal_video_multilabel_classification",
    task: "video_segment_multilabel_classification",
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
      role: label.polarity,
      group_id: groupIdForLabel(label),
    })),
    annotations,
  };
}

function clipRelativePath(index, selectedLabels, sourcePath) {
  const labels = Array.isArray(selectedLabels) ? selectedLabels : [selectedLabels].filter(Boolean);
  const sampleType = sampleTypeForLabels(labels) || "unclassified";
  const primary = labels.find((label) => label.polarity === sampleType) || labels[0] || { name: "sample" };
  const sourceStem = safeStem(path.parse(sourcePath).name);
  const fileName = `${String(index + 1).padStart(5, "0")}_${sourceStem}_${safeStem(primary.name)}.mp4`;
  return path.join("videos", sampleType, safeStem(primary.name), fileName);
}

module.exports = {
  buildManifest,
  clipRelativePath,
  groupIdForLabel,
  labelIdsOf,
  labelsForSegment,
  safeStem,
  sampleTypeForLabels,
};
