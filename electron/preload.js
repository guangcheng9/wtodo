const { contextBridge, ipcRenderer } = require("electron")

// Tag <html> as Electron as early as possible so globals.css can switch the
// document to a transparent, rounded surface BEFORE the first paint. Without
// this the window briefly shows an opaque app background, and Windows DWM
// fills the area outside the rounded corners with that colour — which is the
// "square at the bottom" artefact users were seeing.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("electron")
})

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  // Expose `process.platform` so the renderer can hide / disable features
  // that don't work on a given OS (e.g. the "show on all virtual desktops"
  // toggle is currently only honoured by Electron on macOS / Linux).
  platform: process.platform,
  notify: (title, body) => ipcRenderer.invoke("notify", { title, body }),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hide: () => ipcRenderer.invoke("window:hide"),
  close: () => ipcRenderer.invoke("window:close"),
  setWindowLevel: (level) => ipcRenderer.invoke("window:set-level", level),
  setVisibleOnAllWorkspaces: (value) =>
    ipcRenderer.invoke("window:set-visible-all-workspaces", value),
  setLocked: (value) => ipcRenderer.invoke("window:set-locked", value),
  edgeHide: {
    setEnabled: (value) => ipcRenderer.invoke("edgehide:set-enabled", value),
    setAnimMs: (value) => ipcRenderer.invoke("edgehide:set-anim-ms", value),
  },
  autoLaunch: {
    get: () => ipcRenderer.invoke("autolaunch:get"),
    set: (value) => ipcRenderer.invoke("autolaunch:set", value),
    test: () => ipcRenderer.invoke("autolaunch:test"),
  },
  shortcut: {
    get: () => ipcRenderer.invoke("shortcut:get"),
    set: (accelerator) => ipcRenderer.invoke("shortcut:set", accelerator),
  },
  pickImage: () => ipcRenderer.invoke("dialog:pick-image"),
  pickFolder: () => ipcRenderer.invoke("dialog:pick-folder"),
  openPath: (target) => ipcRenderer.invoke("shell:open-path", target),
  storage: {
    getPath: () => ipcRenderer.invoke("storage:get-path"),
    setPath: (newDir) => ipcRenderer.invoke("storage:set-path", newDir),
    resetPath: () => ipcRenderer.invoke("storage:reset-path"),
    read: (key) => ipcRenderer.invoke("storage:read", key),
    write: (key, value) => ipcRenderer.invoke("storage:write", key, value),
  },
})
