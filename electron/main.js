const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  globalShortcut,
  Notification,
  nativeImage,
  shell,
  screen,
  dialog,
} = require("electron")
const path = require("path")
const fs = require("fs")
const { spawn } = require("child_process")
const AutoLaunch = require("auto-launch")

const isDev = !app.isPackaged
const DEV_URL = "http://localhost:3000"
const DEFAULT_SHORTCUT = "CommandOrControl+Shift+T"

let mainWindow = null
let tray = null
let currentShortcut = DEFAULT_SHORTCUT

const autoLauncher = new AutoLaunch({
  name: "DesktopTodo",
  path: app.getPath("exe"),
})

// ------------------------------------------------------------------
// Storage: a tiny config file (always at userData) tells us where the
// user's todo data lives. Defaults to `<userData>/data`. We deliberately
// store wallpaper images inline as base64 data URLs in widget.json so
// directory moves or any custom-protocol quirks can never break them.
// ------------------------------------------------------------------
const META_PATH = path.join(app.getPath("userData"), "storage.json")
const DATA_FILES = {
  todos: "todos.json",
  widget: "widget.json",
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    return true
  } catch (err) {
    console.error("[v0] mkdir failed:", err)
    return false
  }
}

function getDefaultDataDir() {
  return path.join(app.getPath("userData"), "data")
}

function readMeta() {
  try {
    if (fs.existsSync(META_PATH)) {
      const raw = fs.readFileSync(META_PATH, "utf8")
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.dataDir === "string") return parsed
    }
  } catch (err) {
    console.error("[v0] readMeta failed:", err)
  }
  return { dataDir: getDefaultDataDir() }
}

function writeMeta(meta) {
  try {
    ensureDir(path.dirname(META_PATH))
    fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8")
    return true
  } catch (err) {
    console.error("[v0] writeMeta failed:", err)
    return false
  }
}

function getDataDir() {
  const meta = readMeta()
  ensureDir(meta.dataDir)
  return meta.dataDir
}

function readDataFile(name) {
  try {
    const file = path.join(getDataDir(), name)
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file, "utf8")
  } catch (err) {
    console.error("[v0] readDataFile failed:", name, err)
    return null
  }
}

function writeDataFile(name, content) {
  try {
    const dir = getDataDir()
    ensureDir(dir)
    fs.writeFileSync(path.join(dir, name), content, "utf8")
    return true
  } catch (err) {
    console.error("[v0] writeDataFile failed:", name, err)
    return false
  }
}

// Recursively move every file/folder from `fromDir` into `toDir`.
// Source files are deleted after a successful copy so we truly migrate.
function moveDirContents(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) return
  ensureDir(toDir)
  const entries = fs.readdirSync(fromDir, { withFileTypes: true })
  for (const ent of entries) {
    const src = path.join(fromDir, ent.name)
    const dst = path.join(toDir, ent.name)
    try {
      if (ent.isDirectory()) {
        moveDirContents(src, dst)
        try {
          fs.rmdirSync(src)
        } catch (_) {
          // dir might still have files we couldn't move — leave as-is
        }
      } else {
        fs.copyFileSync(src, dst)
        try {
          fs.unlinkSync(src)
        } catch (err) {
          console.error("[v0] unlink after copy failed:", src, err)
        }
      }
    } catch (err) {
      console.error("[v0] move entry failed:", src, "->", dst, err)
    }
  }
}

// ------------------------------------------------------------------
// Window level: combine alwaysOnTop / pinToDesktop into one switch.
// ------------------------------------------------------------------
function applyWindowLevel(level) {
  if (!mainWindow) return
  try {
    if (level === "top") {
      mainWindow.setAlwaysOnTop(true, "floating")
      mainWindow.setSkipTaskbar(false)
      mainWindow.setVisibleOnAllWorkspaces(false)
    } else if (level === "desktop") {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setSkipTaskbar(true)
      mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      })
    } else {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setSkipTaskbar(false)
      mainWindow.setVisibleOnAllWorkspaces(false)
    }
  } catch (err) {
    console.error("[v0] applyWindowLevel error:", err)
  }
}

// ------------------------------------------------------------------
// Edge auto-hide
//
// The whole detection loop runs on the OS-level cursor position so we
// never have to trust DOM mouseleave events (which fire spuriously on
// repaints/borders and were the root cause of the previous flicker).
//
// Logic each tick (100 ms):
//   - if currently hidden : show again as soon as the cursor enters the
//     visible strip (with EDGE_HOVER_PADDING padding around it).
//   - if currently shown  : start counting consecutive ticks the cursor
//     spends fully outside the window. When that exceeds the debounce
//     threshold AND the window sits against a screen edge, slide it off.
//
// A short grace period right after a restore prevents the immediate
// hide-show oscillation when the cursor crosses the window border.
// ------------------------------------------------------------------
const EDGE_THRESHOLD = 8 // px proximity to count as "at edge"
const EDGE_VISIBLE_STRIP = 6 // px of widget left visible when hidden
const EDGE_HOVER_PADDING = 14 // expand hit zone for restore
const EDGE_POLL_MS = 100
const EDGE_HIDE_DEBOUNCE_TICKS = 4 // ~400ms outside before hide
const EDGE_RESTORE_GRACE_MS = 500
const EDGE_FRAME_MS = 16 // ~60 fps for the slide+fade animation
const EDGE_HIDDEN_OPACITY = 0.0 // fully fade out while parked off-screen
const EDGE_DEFAULT_ANIM_MS = 240
const EDGE_MAX_ANIM_MS = 800

let edgeHideEnabled = false
// edgeHideState carries the *target* state of the latest animation:
//   { edge, original, hidden }   hidden=true means slid off, false means visible.
let edgeHideState = null
let edgeAnimTimer = null
let edgePollTimer = null
let edgeOutsideCount = 0
let edgeLastRestoreAt = 0
let edgeAnimMs = EDGE_DEFAULT_ANIM_MS

function isCursorInside(cursor, bounds, padding) {
  return (
    cursor.x >= bounds.x - padding &&
    cursor.x <= bounds.x + bounds.width + padding &&
    cursor.y >= bounds.y - padding &&
    cursor.y <= bounds.y + bounds.height + padding
  )
}

function detectEdge(bounds, work) {
  if (bounds.x <= work.x + EDGE_THRESHOLD) return "left"
  if (bounds.x + bounds.width >= work.x + work.width - EDGE_THRESHOLD)
    return "right"
  if (bounds.y <= work.y + EDGE_THRESHOLD) return "top"
  if (bounds.y + bounds.height >= work.y + work.height - EDGE_THRESHOLD)
    return "bottom"
  return null
}

// easeOutCubic — gentle decelerating curve, feels natural for slide+fade.
function easeOutCubic(t) {
  const inv = 1 - t
  return 1 - inv * inv * inv
}

function cancelEdgeAnim() {
  if (edgeAnimTimer) {
    clearInterval(edgeAnimTimer)
    edgeAnimTimer = null
  }
}

/**
 * Animate the window between two rects with a synchronous opacity fade.
 * `fromOpacity` -> `toOpacity` is interpolated alongside the bounds, so the
 * widget visibly fades + slides in one continuous motion.
 *
 * If `edgeAnimMs <= 0` we skip the timeline and snap to the destination,
 * which is what users expect from a "0 ms / instant" setting.
 */
function animateEdge(fromBounds, toBounds, fromOpacity, toOpacity, onDone) {
  cancelEdgeAnim()
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (edgeAnimMs <= 0) {
    try {
      mainWindow.setBounds(toBounds)
    } catch (_) {}
    try {
      mainWindow.setOpacity(toOpacity)
    } catch (_) {}
    if (onDone) onDone()
    return
  }

  const startedAt = Date.now()
  const dx = toBounds.x - fromBounds.x
  const dy = toBounds.y - fromBounds.y
  // Apply starting opacity immediately so the very first frame is correct.
  try {
    mainWindow.setOpacity(fromOpacity)
  } catch (_) {}

  edgeAnimTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      cancelEdgeAnim()
      return
    }
    const elapsed = Date.now() - startedAt
    const t = Math.min(1, elapsed / edgeAnimMs)
    const eased = easeOutCubic(t)
    const nextBounds = {
      x: Math.round(fromBounds.x + dx * eased),
      y: Math.round(fromBounds.y + dy * eased),
      width: fromBounds.width,
      height: fromBounds.height,
    }
    const nextOpacity = fromOpacity + (toOpacity - fromOpacity) * eased
    try {
      mainWindow.setBounds(nextBounds)
    } catch (_) {}
    try {
      mainWindow.setOpacity(nextOpacity)
    } catch (_) {}
    if (t >= 1) {
      cancelEdgeAnim()
      if (onDone) onDone()
    }
  }, EDGE_FRAME_MS)
}

function edgeTick() {
  if (!edgeHideEnabled || !mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized() || !mainWindow.isVisible()) return
  // Don't fight an in-flight slide animation.
  if (edgeAnimTimer) return

  let cursor
  try {
    cursor = screen.getCursorScreenPoint()
  } catch {
    return
  }

  const bounds = mainWindow.getBounds()

  if (edgeHideState && edgeHideState.hidden) {
    // Currently hidden — bounds reflect the slid-off rectangle. The visible
    // strip is the part of `bounds` still inside the work area, so checking
    // cursor membership of `bounds + padding` correctly maps to "hovering
    // the edge strip".
    if (isCursorInside(cursor, bounds, EDGE_HOVER_PADDING)) {
      restoreEdgeHide()
    }
    return
  }

  // Currently shown — only consider hiding if cursor is fully outside the
  // window (no padding). This means the title bar / status bar / borders
  // are all part of the "inside" zone, fixing the previous behaviour where
  // the title bar was treated as outside.
  if (isCursorInside(cursor, bounds, 0)) {
    edgeOutsideCount = 0
    return
  }

  if (Date.now() - edgeLastRestoreAt < EDGE_RESTORE_GRACE_MS) return

  edgeOutsideCount++
  if (edgeOutsideCount >= EDGE_HIDE_DEBOUNCE_TICKS) {
    edgeOutsideCount = 0
    checkEdgeHide()
  }
}

function startEdgePoll() {
  if (edgePollTimer) return
  edgePollTimer = setInterval(edgeTick, EDGE_POLL_MS)
}

function stopEdgePoll() {
  if (edgePollTimer) {
    clearInterval(edgePollTimer)
    edgePollTimer = null
  }
}

function checkEdgeHide() {
  if (!edgeHideEnabled || !mainWindow || mainWindow.isDestroyed()) return
  if (edgeHideState && edgeHideState.hidden) return
  const bounds = mainWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const work = display.workArea
  const edge = detectEdge(bounds, work)
  if (!edge) return

  const slid = { ...bounds }
  if (edge === "left") slid.x = work.x - bounds.width + EDGE_VISIBLE_STRIP
  else if (edge === "right")
    slid.x = work.x + work.width - EDGE_VISIBLE_STRIP
  else if (edge === "top") slid.y = work.y - bounds.height + EDGE_VISIBLE_STRIP
  else if (edge === "bottom")
    slid.y = work.y + work.height - EDGE_VISIBLE_STRIP

  edgeHideState = { edge, original: bounds, hidden: true }
  animateEdge(bounds, slid, 1, EDGE_HIDDEN_OPACITY)
}

function restoreEdgeHide() {
  if (!edgeHideState || !mainWindow || mainWindow.isDestroyed()) return
  const original = edgeHideState.original
  const fromBounds = mainWindow.getBounds()
  edgeLastRestoreAt = Date.now()
  edgeOutsideCount = 0
  // Mark as visible up-front so the cursor poll doesn't try to hide again
  // while we're animating back in.
  edgeHideState = { ...edgeHideState, hidden: false }
  animateEdge(fromBounds, original, EDGE_HIDDEN_OPACITY, 1, () => {
    // Once fully restored, drop the saved state so a subsequent move can
    // re-evaluate which edge (if any) the user docks against next.
    edgeHideState = null
    try {
      mainWindow.setOpacity(1)
    } catch (_) {}
  })
}

function setEdgeHideEnabled(value) {
  edgeHideEnabled = !!value
  if (!edgeHideEnabled) {
    cancelEdgeAnim()
    if (edgeHideState) restoreEdgeHide()
    stopEdgePoll()
    try {
      mainWindow && mainWindow.setOpacity(1)
    } catch (_) {}
  } else {
    startEdgePoll()
  }
}

function setEdgeAnimMs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return
  edgeAnimMs = Math.max(0, Math.min(EDGE_MAX_ANIM_MS, Math.round(n)))
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  const winWidth = 380
  const winHeight = 560

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: workArea.x + workArea.width - winWidth - 24,
    y: workArea.y + 24,
    minWidth: 300,
    minHeight: 280,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  applyWindowLevel("top")

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "out", "index.html"))
  }

  mainWindow.once("ready-to-show", () => mainWindow.show())

  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
}

function createTray() {
  const trayIconPath = path.join(__dirname, "..", "build", "tray.png")
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon)

  const buildMenu = (autoLaunchEnabled) =>
    Menu.buildFromTemplate([
      { label: "显示 / 隐藏", click: toggleWindow },
      { type: "separator" },
      {
        label: "始终置顶",
        type: "checkbox",
        checked: mainWindow ? mainWindow.isAlwaysOnTop() : true,
        click: (item) => applyWindowLevel(item.checked ? "top" : "normal"),
      },
      {
        label: "开机自启动",
        type: "checkbox",
        checked: !!autoLaunchEnabled,
        click: async (item) => {
          try {
            if (item.checked) await autoLauncher.enable()
            else await autoLauncher.disable()
          } catch (err) {
            console.error("[v0] auto-launch error:", err)
          }
          rebuildTrayMenu()
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ])

  const rebuildTrayMenu = () => {
    autoLauncher
      .isEnabled()
      .then((enabled) => tray.setContextMenu(buildMenu(enabled)))
      .catch(() => tray.setContextMenu(buildMenu(false)))
  }

  tray.setToolTip("桌面待办 · Desktop Todo")
  rebuildTrayMenu()
  tray.on("click", toggleWindow)
  tray.on("double-click", toggleWindow)
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    if (edgeHideState) restoreEdgeHide()
    mainWindow.show()
    mainWindow.focus()
  }
}

function tryRegisterShortcut(accelerator) {
  try {
    globalShortcut.unregisterAll()
  } catch (_) {
    // ignore
  }
  if (!accelerator) {
    currentShortcut = ""
    return { success: true, shortcut: "" }
  }
  let ok = false
  try {
    ok = globalShortcut.register(accelerator, toggleWindow)
  } catch (err) {
    return {
      success: false,
      shortcut: currentShortcut,
      error: err && err.message ? err.message : "无效的快捷键格式",
    }
  }
  if (!ok) {
    if (currentShortcut && currentShortcut !== accelerator) {
      try {
        globalShortcut.register(currentShortcut, toggleWindow)
      } catch (_) {
        // ignore
      }
    }
    return {
      success: false,
      shortcut: currentShortcut,
      error: "该快捷键已被其他应用占用",
    }
  }
  currentShortcut = accelerator
  return { success: true, shortcut: accelerator }
}

// ---------- IPC handlers ----------

ipcMain.handle("notify", (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || "桌面待办",
      body: body || "",
      icon: path.join(__dirname, "..", "build", "icon.png"),
    }).show()
  }
})

ipcMain.handle("window:minimize", () => mainWindow?.minimize())
ipcMain.handle("window:hide", () => mainWindow?.hide())
ipcMain.handle("window:close", () => mainWindow?.close())

ipcMain.handle("window:set-level", (_e, level) => {
  applyWindowLevel(level || "top")
})

ipcMain.handle("window:set-locked", (_e, locked) => {
  if (!mainWindow) return
  mainWindow.setMovable(!locked)
  mainWindow.setResizable(!locked)
})

// ---- Edge auto-hide ----
ipcMain.handle("edgehide:set-enabled", (_e, value) => {
  setEdgeHideEnabled(!!value)
  return { enabled: edgeHideEnabled }
})

ipcMain.handle("edgehide:set-anim-ms", (_e, value) => {
  setEdgeAnimMs(value)
  return { animMs: edgeAnimMs }
})

// ---- Auto-launch ----
ipcMain.handle("autolaunch:get", async () => {
  try {
    return await autoLauncher.isEnabled()
  } catch {
    return false
  }
})

ipcMain.handle("autolaunch:set", async (_e, value) => {
  let error = null
  try {
    if (value) await autoLauncher.enable()
    else await autoLauncher.disable()
  } catch (err) {
    error = err && err.message ? err.message : String(err)
    console.error("[v0] autolaunch set error:", error)
  }
  let enabled = false
  try {
    enabled = await autoLauncher.isEnabled()
  } catch (_) {
    enabled = false
  }
  return { enabled, error }
})

ipcMain.handle("autolaunch:test", () => {
  try {
    const exe = app.getPath("exe")
    const child = spawn(exe, ["--was-launched-by-test"], {
      detached: true,
      stdio: "ignore",
    })
    child.unref()
    return { success: true, exe }
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    }
  }
})

// ---- Shortcut ----
ipcMain.handle("shortcut:get", () => currentShortcut)

ipcMain.handle("shortcut:set", (_e, accelerator) => {
  return tryRegisterShortcut(accelerator || "")
})

// ---- File dialogs & shell ----
//
// pick-image returns a base64 data URL rather than a `file://` or custom
// `localfile://` URL. Reasons:
//   - data URLs render reliably under both `http://localhost` (dev) and
//     `file:///out/index.html` (packaged) without any CSP / privileged
//     scheme tricks.
//   - the wallpaper survives storage-directory moves automatically (it's
//     embedded in widget.json instead of pointing at a sibling path).
//   - eliminates Windows-specific path encoding bugs (drive letters,
//     spaces, CJK characters).
const IMAGE_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
}

ipcMain.handle("dialog:pick-image", async () => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择背景图片",
    properties: ["openFile"],
    filters: [
      { name: "图片", extensions: Object.keys(IMAGE_MIME) },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }
  const src = result.filePaths[0]
  try {
    const stat = fs.statSync(src)
    const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
    if (stat.size > MAX_BYTES) {
      return {
        canceled: false,
        error: "图片过大（建议 ≤ 8MB），请压缩后再试",
      }
    }
    const buf = fs.readFileSync(src)
    const ext = (path.extname(src) || ".jpg").toLowerCase().slice(1)
    const mime = IMAGE_MIME[ext] || "image/jpeg"
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`
    return { canceled: false, url: dataUrl }
  } catch (err) {
    return {
      canceled: false,
      error: err && err.message ? err.message : String(err),
    }
  }
})

ipcMain.handle("dialog:pick-folder", async () => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择数据保存位置",
    properties: ["openDirectory", "createDirectory"],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }
  return { canceled: false, dir: result.filePaths[0] }
})

ipcMain.handle("shell:open-path", (_e, target) => {
  if (!target) return false
  try {
    shell.openPath(target)
    return true
  } catch {
    return false
  }
})

// ---- Storage ----
ipcMain.handle("storage:get-path", () => {
  return {
    dir: getDataDir(),
    defaultDir: getDefaultDataDir(),
    metaPath: META_PATH,
  }
})

ipcMain.handle("storage:set-path", (_e, newDir) => {
  if (!newDir || typeof newDir !== "string") {
    return { success: false, error: "无效的路径" }
  }
  const meta = readMeta()
  const oldDir = meta.dataDir
  if (path.resolve(oldDir) === path.resolve(newDir)) {
    return { success: true, dir: oldDir, oldDir }
  }
  if (!ensureDir(newDir)) {
    return { success: false, error: "无法创建目标目录（可能权限不足）" }
  }
  try {
    const probe = path.join(newDir, ".write-test")
    fs.writeFileSync(probe, "ok")
    fs.unlinkSync(probe)
  } catch (err) {
    return {
      success: false,
      error: "目标目录不可写入：" + (err.message || String(err)),
    }
  }
  if (oldDir && fs.existsSync(oldDir)) {
    moveDirContents(oldDir, newDir)
    try {
      const remaining = fs.readdirSync(oldDir)
      if (remaining.length === 0) fs.rmdirSync(oldDir)
    } catch (_) {
      // not empty or not removable
    }
  }
  writeMeta({ dataDir: newDir })
  return { success: true, dir: newDir, oldDir }
})

ipcMain.handle("storage:reset-path", () => {
  const def = getDefaultDataDir()
  const meta = readMeta()
  const oldDir = meta.dataDir
  if (path.resolve(oldDir) === path.resolve(def)) {
    return { success: true, dir: def, oldDir }
  }
  ensureDir(def)
  if (oldDir && fs.existsSync(oldDir)) {
    moveDirContents(oldDir, def)
    try {
      const remaining = fs.readdirSync(oldDir)
      if (remaining.length === 0) fs.rmdirSync(oldDir)
    } catch (_) {}
  }
  writeMeta({ dataDir: def })
  return { success: true, dir: def, oldDir }
})

ipcMain.handle("storage:read", (_e, key) => {
  const file = DATA_FILES[key]
  if (!file) return null
  return readDataFile(file)
})

ipcMain.handle("storage:write", (_e, key, value) => {
  const file = DATA_FILES[key]
  if (!file) return false
  return writeDataFile(file, value)
})

// ---- Single instance lock ----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (edgeHideState) restoreEdgeHide()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  tryRegisterShortcut(DEFAULT_SHORTCUT)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", (e) => {
  e.preventDefault?.()
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
  stopEdgePoll()
})
