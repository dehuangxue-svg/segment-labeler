const path = require("node:path");

function mediaType(filePath) {
  return ({
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
  })[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function requestedByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header || "");
  if (!match) return null;
  let start;
  let end;
  if (!match[1] && match[2]) {
    const suffixLength = Math.min(size, Number(match[2]));
    start = size - suffixLength;
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

module.exports = { mediaType, requestedByteRange };
