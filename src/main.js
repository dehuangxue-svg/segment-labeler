const { app, BrowserWindow, dialog, ipcMain, protocol } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const {
  buildManifest,
  clipRelativePath,
  labelsForSegment,
  sampleTypeForLabels,
} = require("./export-schema");
const { mediaType, requestedByteRange } = require("./media-utils");
require("./locales/en");
require("./locales/zh-CN");
require("./locales/zh-TW");
require("./locales/ja");
require("./locales/ko");
require("./locales/es");
require("./i18n");

let mainWindow;
let currentLocale = "en";

function mainText(key, values = {}) {
  const template = SegmentLabelerLocales[currentLocale]?.[key] ?? SegmentLabelerLocales.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_match, name) => values[name] ?? `{${name}}`);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "segment-labeler-media",
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function executable(name) {
  const candidates = [
    path.join(app.getPath("home"), ".local", "bin", name),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    path.join(path.dirname(process.execPath), name),
    name,
  ];
  return candidates;
}

function runProcess(candidates, args, onLine) {
  const attempt = (candidateIndex) =>
    new Promise((resolve, reject) => {
      const command = candidates[candidateIndex];
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let missing = false;
      child.stdout.on("data", (data) => {
        stdout += data;
        if (onLine) onLine(data.toString());
      });
      child.stderr.on("data", (data) => {
        stderr += data;
        if (onLine) onLine(data.toString());
      });
      child.on("error", (error) => {
        missing = error.code === "ENOENT";
        if (!missing) reject(error);
      });
      child.on("close", (code) => {
        if (missing) {
          if (candidateIndex + 1 < candidates.length) {
            attempt(candidateIndex + 1).then(resolve, reject);
          } else {
            reject(new Error(mainText("main.ffmpegMissing", { name: path.basename(command) })));
          }
          return;
        }
        if (code === 0) resolve({ stdout, stderr, command });
        else reject(new Error(stderr.trim() || mainText("main.processExit", { name: command, code })));
      });
    });
  return attempt(0);
}

async function probeVideo(filePath) {
  const { stdout } = await runProcess(executable("ffprobe"), [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams.find((stream) => stream.codec_type === "video") || {};
  const audio = data.streams.find((stream) => stream.codec_type === "audio") || {};
  const [fpsNumerator, fpsDenominator] = String(video.avg_frame_rate || "0/1")
    .split("/")
    .map(Number);
  const [sarNumerator, sarDenominator] = String(video.sample_aspect_ratio || "1:1")
    .split(":")
    .map(Number);
  const rotation = Number(
    video.side_data_list?.find((item) => Number.isFinite(Number(item.rotation)))?.rotation
      ?? video.tags?.rotate
      ?? 0,
  );
  const sampleAspectRatio = sarDenominator ? sarNumerator / sarDenominator : 1;
  let displayWidth = Number(video.width || 0) * sampleAspectRatio;
  let displayHeight = Number(video.height || 0);
  if (Math.abs(rotation) % 180 === 90) {
    [displayWidth, displayHeight] = [displayHeight, displayWidth];
  }
  return {
    path: filePath,
    url: `segment-labeler-media://local/video?path=${encodeURIComponent(filePath)}`,
    name: path.basename(filePath),
    duration: Number(data.format.duration || video.duration || 0),
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    displayWidth,
    displayHeight,
    rotation,
    fps: fpsDenominator ? fpsNumerator / fpsDenominator : 0,
    videoCodec: video.codec_name || "unknown",
    audioCodec: audio.codec_name || "none",
  };
}

function isVideoPath(filePath) {
  return typeof filePath === "string"
    && path.isAbsolute(filePath)
    && /\.(mp4|mov|mkv|webm|m4v)$/i.test(filePath);
}

function defaultProjectPath(sourcePath) {
  return path.join(path.dirname(sourcePath), `${path.parse(sourcePath).name}.vsl.json`);
}

async function loadVideoWithProgress(filePath) {
  if (!isVideoPath(filePath)) throw new Error(mainText("main.unsupportedVideo"));
  await fs.access(filePath);
  const metadata = await probeVideo(filePath);
  const projectPath = defaultProjectPath(filePath);
  try {
    const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
    if (project.sourcePath === filePath && Array.isArray(project.segments)) {
      return { metadata, project, projectPath, recovered: true };
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("autosave-read-error", error);
  }
  return { metadata, project: null, projectPath, recovered: false };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#151718",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, "index.html"));
  const startupVideoPath = process.argv.slice(1).find((value) =>
    /\.(mp4|mov|mkv|webm|m4v)$/i.test(value) && path.isAbsolute(value),
  );
  if (startupVideoPath) {
    try {
      mainWindow.webContents.send("video:startup", await loadVideoWithProgress(startupVideoPath));
    } catch (error) {
      console.error("startup-video-error", error);
    }
  }
}

app.whenReady().then(() => {
  currentLocale = SegmentLabelerI18n.normalizeLocale(app.getLocale());
  protocol.handle("segment-labeler-media", async (request) => {
    const requestUrl = new URL(request.url);
    const filePath = requestUrl.searchParams.get("path");
    if (!filePath || !path.isAbsolute(filePath)) {
      return new Response("Invalid media path", { status: 400 });
    }
    try {
      const stats = await fs.stat(filePath);
      const range = requestedByteRange(request.headers.get("range"), stats.size);
      const start = range?.start ?? 0;
      const end = range?.end ?? stats.size - 1;
      const headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": mediaType(filePath),
      };
      if (range) headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`;
      const body = request.method === "HEAD"
        ? null
        : Readable.toWeb(fsSync.createReadStream(filePath, { start, end }));
      return new Response(body, { status: range ? 206 : 200, headers });
    } catch (error) {
      console.error("media-read-error", error);
      return new Response("Media file unavailable", { status: 404 });
    }
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("video:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: mainText("main.openVideo"),
    properties: ["openFile"],
    filters: [{ name: mainText("main.videoFiles"), extensions: ["mp4", "mov", "mkv", "webm", "m4v"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return loadVideoWithProgress(result.filePaths[0]);
});

ipcMain.handle("video:open-path", async (_event, filePath) => loadVideoWithProgress(filePath));

ipcMain.handle("project:save", async (_event, { payload, projectPath }) => {
  if (!payload?.sourcePath) throw new Error(mainText("main.noProject"));
  const targetPath = projectPath || defaultProjectPath(payload.sourcePath);
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(temporaryPath, targetPath);
  return targetPath;
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: mainText("main.openProject"),
    properties: ["openFile"],
    filters: [{ name: mainText("main.projectFiles"), extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const project = JSON.parse(await fs.readFile(filePath, "utf8"));
  const metadata = await probeVideo(project.sourcePath);
  return { project, metadata, projectPath: filePath };
});

ipcMain.handle("dataset:export", async (_event, payload) => {
  const labelById = new Map(payload.labels.map((label) => [label.id, label]));
  const labeledSegments = payload.segments.filter((segment) => (
    sampleTypeForLabels(labelsForSegment(segment, labelById))
  ));
  if (!labeledSegments.length) throw new Error(mainText("main.noLabeled"));

  const parentResult = await dialog.showOpenDialog(mainWindow, {
    title: mainText("main.chooseDatasetFolder"),
    defaultPath: path.dirname(payload.sourcePath),
    properties: ["openDirectory", "createDirectory"],
  });
  if (parentResult.canceled || !parentResult.filePaths[0]) return null;

  const sourceStem = path.parse(payload.sourcePath).name;
  const outputRoot = path.join(parentResult.filePaths[0], `${sourceStem}_dataset`);
  const clipPaths = labeledSegments.map((segment, index) =>
    clipRelativePath(index, labelsForSegment(segment, labelById), payload.sourcePath),
  );

  for (let index = 0; index < labeledSegments.length; index += 1) {
    const segment = labeledSegments[index];
    const absoluteClipPath = path.join(outputRoot, clipPaths[index]);
    await fs.mkdir(path.dirname(absoluteClipPath), { recursive: true });
    const duration = Math.max(0.05, segment.end - segment.start);
    const commonArgs = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", segment.start.toFixed(3),
      "-i", payload.sourcePath,
      "-t", duration.toFixed(3),
      "-map", "0:v:0", "-map", "0:a?",
    ];
    const encodingArgs = payload.precise
      ? ["-c:v", "h264_videotoolbox", "-b:v", "8500k", "-maxrate", "10000k", "-bufsize", "17000k", "-c:a", "aac", "-b:a", "192k"]
      : ["-c", "copy", "-avoid_negative_ts", "make_zero"];
    await runProcess(executable("ffmpeg"), [...commonArgs, ...encodingArgs, absoluteClipPath]);
    mainWindow.webContents.send("dataset:progress", {
      current: index + 1,
      total: labeledSegments.length,
      file: path.basename(absoluteClipPath),
    });
  }

  const manifest = buildManifest({
    sourcePath: payload.sourcePath,
    metadata: payload.metadata,
    labels: payload.labels,
    segments: labeledSegments,
    clipPaths: clipPaths.map((clipPath) => clipPath.split(path.sep).join("/")),
    exportedAt: new Date().toISOString(),
  });
  await fs.writeFile(
    path.join(outputRoot, "annotations.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(outputRoot, "label_map.json"),
    JSON.stringify(manifest.label_map, null, 2),
    "utf8",
  );
  return { outputRoot, count: labeledSegments.length };
});

ipcMain.handle("path:show", async (_event, targetPath) => {
  const { shell } = require("electron");
  shell.showItemInFolder(targetPath);
});

ipcMain.handle("app:set-locale", (_event, locale) => {
  currentLocale = SegmentLabelerI18n.normalizeLocale(locale);
  return currentLocale;
});
