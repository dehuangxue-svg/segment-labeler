const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform === "win32" ? "win" : process.platform,
  setLocale: (locale) => ipcRenderer.invoke("app:set-locale", locale),
  openVideo: () => ipcRenderer.invoke("video:open"),
  openVideoPath: (filePath) => ipcRenderer.invoke("video:open-path", filePath),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  saveProject: (payload, projectPath) => ipcRenderer.invoke("project:save", { payload, projectPath }),
  openProject: () => ipcRenderer.invoke("project:open"),
  exportDataset: (payload) => ipcRenderer.invoke("dataset:export", payload),
  showInFolder: (targetPath) => ipcRenderer.invoke("path:show", targetPath),
  onExportProgress: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("dataset:progress", listener);
    return () => ipcRenderer.removeListener("dataset:progress", listener);
  },
  onStartupVideo: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("video:startup", listener);
    return () => ipcRenderer.removeListener("video:startup", listener);
  },
});
