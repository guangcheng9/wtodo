export type Todo = {
  id: string
  text: string
  done: boolean
  createdAt: number
  /** Reminder timestamp in ms. Optional - default no reminder. */
  reminderAt?: number | null
  /** Set to true once a reminder notification has been fired. */
  reminderNotified?: boolean
}

/** Single 3-way layering choice (replaces conflicting alwaysOnTop / pinToDesktop). */
export type WindowLevel = "top" | "normal" | "desktop"

export type WidgetState = {
  x: number
  y: number
  width: number
  height: number
  pinned: boolean
  truncate: boolean
  collapsedDone: boolean
  /** Built-in wallpaper id, OR "custom" to use customWallpaper. */
  wallpaper: string
  /** A data URL (web) or file:// path (Electron) for a user-picked image. */
  customWallpaper: string | null
  /** 0..100 — opacity of the wallpaper layer behind the glass tint. */
  wallpaperOpacity: number
  /**
   * 0..100 — opacity of the glass tint overlay (the layer that sits over
   * the wallpaper and tints toward white in light mode / near-black in dark
   * mode). Lower values = more wallpaper bleeds through; higher values =
   * more readable solid background.
   */
  widgetOpacity: number
  theme: "light" | "dark"
  windowLevel: WindowLevel
  autoLaunch: boolean
  /** Electron accelerator string, e.g. "CommandOrControl+Shift+T". Empty disables. */
  shortcut: string
  /** When true and widget is near a screen edge, slide off-screen on mouse leave. */
  edgeHide: boolean
  /**
   * Edge auto-hide animation duration in milliseconds.
   * 0 = instant, common range is 120 (snappy) to 500 (relaxed).
   */
  edgeHideAnimMs: number
  /** Outer corner radius in px. 0 = sharp corners, 32 = very round. */
  borderRadius: number
}

export const WALLPAPERS = [
  { id: "mountain", name: "山景", url: "/wallpapers/mountain.jpg" },
  { id: "ocean", name: "海洋", url: "/wallpapers/ocean.jpg" },
  { id: "forest", name: "森林", url: "/wallpapers/forest.jpg" },
  { id: "abstract", name: "抽象", url: "/wallpapers/abstract.jpg" },
  {
    id: "gradient-blue",
    name: "蓝色渐变",
    url: "linear-gradient(135deg, #6dd5ed 0%, #2193b0 100%)",
  },
  {
    id: "gradient-warm",
    name: "暖色渐变",
    url: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  },
] as const

export const DEFAULT_SHORTCUT = "CommandOrControl+Shift+T"

export const DEFAULT_WIDGET_STATE: WidgetState = {
  x: 80,
  y: 80,
  width: 380,
  height: 520,
  pinned: false,
  truncate: true,
  collapsedDone: true,
  wallpaper: "mountain",
  customWallpaper: null,
  wallpaperOpacity: 100,
  widgetOpacity: 65,
  theme: "light",
  windowLevel: "top",
  autoLaunch: false,
  shortcut: DEFAULT_SHORTCUT,
  edgeHide: false,
  edgeHideAnimMs: 240,
  borderRadius: 16,
}

export const STORAGE_KEYS = {
  todos: "desktop-todo:todos",
  widget: "desktop-todo:widget",
} as const

/**
 * Convert an Electron accelerator string ("CommandOrControl+Shift+T")
 * into a human-readable label ("Ctrl + Shift + T").
 */
export function formatAccelerator(accelerator: string): string {
  if (!accelerator) return "未设置"
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
  return accelerator
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl" || part === "CmdOrCtrl") return isMac ? "⌘" : "Ctrl"
      if (part === "Command" || part === "Cmd") return "⌘"
      if (part === "Control") return "Ctrl"
      if (part === "Alt") return isMac ? "⌥" : "Alt"
      if (part === "Shift") return isMac ? "⇧" : "Shift"
      if (part === "Super" || part === "Meta") return isMac ? "⌘" : "Win"
      return part
    })
    .join(" + ")
}
