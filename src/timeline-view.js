(function exposeTimelineView(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TimelineView = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 512;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function getWindow(duration, zoom = MIN_ZOOM, viewStart = 0) {
    const safeDuration = Math.max(0, Number(duration) || 0);
    const safeZoom = clamp(Number(zoom) || MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
    const span = safeDuration ? safeDuration / safeZoom : 0;
    const maxStart = Math.max(0, safeDuration - span);
    const start = clamp(Number(viewStart) || 0, 0, maxStart);
    return { start, end: start + span, span, zoom: safeZoom };
  }

  function zoomAt(duration, zoom, viewStart, anchorRatio, deltaY) {
    const oldWindow = getWindow(duration, zoom, viewStart);
    const ratio = clamp(Number(anchorRatio) || 0, 0, 1);
    const anchorTime = oldWindow.start + ratio * oldWindow.span;
    let nextZoom = clamp(oldWindow.zoom * Math.exp(-Number(deltaY || 0) * 0.0025), MIN_ZOOM, MAX_ZOOM);
    if (nextZoom < 1.01) nextZoom = MIN_ZOOM;
    const nextSpan = oldWindow.span ? Number(duration) / nextZoom : 0;
    return getWindow(duration, nextZoom, anchorTime - ratio * nextSpan);
  }

  function visibleSegment(segment, viewWindow) {
    const start = Math.max(Number(segment.start), viewWindow.start);
    const end = Math.min(Number(segment.end), viewWindow.end);
    if (!viewWindow.span || end <= start) return null;
    return {
      left: ((start - viewWindow.start) / viewWindow.span) * 100,
      width: ((end - start) / viewWindow.span) * 100,
    };
  }

  function snapTime(time, cutTimes, viewWindow, viewportWidth, thresholdPixels = 8) {
    const width = Math.max(0, Number(viewportWidth) || 0);
    if (!viewWindow.span || !width || !Array.isArray(cutTimes)) {
      return { time, snapped: false, cutTime: null, distancePixels: Infinity };
    }
    let nearest = null;
    let nearestDistance = Infinity;
    for (const value of cutTimes) {
      const cutTime = Number(value);
      if (!Number.isFinite(cutTime) || cutTime < viewWindow.start || cutTime > viewWindow.end) continue;
      const distancePixels = Math.abs(cutTime - time) / viewWindow.span * width;
      if (distancePixels < nearestDistance) {
        nearest = cutTime;
        nearestDistance = distancePixels;
      }
    }
    if (nearest !== null && nearestDistance <= Math.max(0, Number(thresholdPixels) || 0)) {
      return { time: nearest, snapped: true, cutTime: nearest, distancePixels: nearestDistance };
    }
    return { time, snapped: false, cutTime: null, distancePixels: nearestDistance };
  }

  return { MIN_ZOOM, MAX_ZOOM, getWindow, zoomAt, visibleSegment, snapTime };
}));
