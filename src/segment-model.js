(function initSegmentModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SegmentModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  const EPSILON = 0.04;

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `seg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function createInitial(duration) {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    return [{ id: makeId(), start: 0, end: duration, labelId: null, note: "" }];
  }

  function splitAt(segments, time) {
    const index = segments.findIndex(
      (segment) => time > segment.start + EPSILON && time < segment.end - EPSILON,
    );
    if (index < 0) return { segments, selectedId: null, changed: false };

    const current = segments[index];
    const left = { ...current, id: makeId(), end: time };
    const right = { ...current, id: makeId(), start: time };
    const next = [...segments.slice(0, index), left, right, ...segments.slice(index + 1)];
    return { segments: next, selectedId: left.id, changed: true };
  }

  function removeCutBefore(segments, segmentId) {
    const index = segments.findIndex((segment) => segment.id === segmentId);
    if (index <= 0) return { segments, selectedId: segmentId, changed: false };
    const previous = segments[index - 1];
    const current = segments[index];
    const merged = {
      ...previous,
      id: makeId(),
      end: current.end,
      labelId: previous.labelId === current.labelId ? previous.labelId : null,
      note: previous.note === current.note ? previous.note : "",
    };
    const next = [...segments.slice(0, index - 1), merged, ...segments.slice(index + 1)];
    return { segments: next, selectedId: merged.id, changed: true };
  }

  function removeCutsInRange(segments, rangeStart, rangeEnd) {
    const start = Math.min(Number(rangeStart), Number(rangeEnd));
    const end = Math.max(Number(rangeStart), Number(rangeEnd));
    if (!Number.isFinite(start) || !Number.isFinite(end) || segments.length < 2) {
      return { segments, selectedId: null, changed: false, removedCount: 0 };
    }
    const removable = new Set();
    segments.slice(1).forEach((segment, index) => {
      if (segment.start >= start && segment.start <= end) removable.add(index + 1);
    });
    if (!removable.size) {
      return { segments, selectedId: null, changed: false, removedCount: 0 };
    }

    const next = [{ ...segments[0] }];
    let selectedId = null;
    for (let index = 1; index < segments.length; index += 1) {
      const current = segments[index];
      if (!removable.has(index)) {
        next.push({ ...current });
        continue;
      }
      const previous = next[next.length - 1];
      const merged = {
        ...previous,
        id: makeId(),
        end: current.end,
        labelId: previous.labelId === current.labelId ? previous.labelId : null,
        note: previous.note === current.note ? previous.note : "",
      };
      next[next.length - 1] = merged;
      selectedId = merged.id;
    }
    return { segments: next, selectedId, changed: true, removedCount: removable.size };
  }

  function moveCutBefore(segments, segmentId, time, minimumDuration = 0.1) {
    const index = segments.findIndex((segment) => segment.id === segmentId);
    const target = Number(time);
    const minimum = Math.max(EPSILON, Number(minimumDuration) || 0.1);
    if (index <= 0 || !Number.isFinite(target)) {
      return { segments, selectedId: segmentId, changed: false, time: null };
    }
    const previous = segments[index - 1];
    const current = segments[index];
    if (target < previous.start + minimum || target > current.end - minimum) {
      return { segments, selectedId: segmentId, changed: false, time: current.start };
    }
    if (Math.abs(target - current.start) < 1e-9) {
      return { segments, selectedId: segmentId, changed: false, time: current.start };
    }
    const next = segments.map((segment, segmentIndex) => {
      if (segmentIndex === index - 1) return { ...segment, end: target };
      if (segmentIndex === index) return { ...segment, start: target };
      return segment;
    });
    return { segments: next, selectedId: segmentId, changed: true, time: target };
  }

  function assignLabel(segments, segmentId, labelId) {
    let changed = false;
    const next = segments.map((segment) => {
      if (segment.id !== segmentId || segment.labelId === labelId) return segment;
      changed = true;
      return { ...segment, labelId };
    });
    return { segments: next, changed };
  }

  function updateNote(segments, segmentId, note) {
    return segments.map((segment) =>
      segment.id === segmentId ? { ...segment, note: String(note || "") } : segment,
    );
  }

  function segmentAt(segments, time) {
    return segments.find(
      (segment, index) =>
        time >= segment.start &&
        (time < segment.end || (index === segments.length - 1 && time <= segment.end)),
    );
  }

  return {
    EPSILON,
    createInitial,
    splitAt,
    removeCutBefore,
    removeCutsInRange,
    moveCutBefore,
    assignLabel,
    updateNote,
    segmentAt,
  };
});
