"use client"

import { useEffect, useState } from "react"

export type AutoLaunchResult = { enabled: boolean; error: string | null }
export type AutoLaunchTestResult = {
  success: boolean
  exe?: string
  error?: string
}
export type ShortcutResult = {
  success: boolean
  shortcut: string
  error?: string
}
export type PickImageResult = {
  canceled?: boolean
  url?: string
  error?: string
}
export type PickFolderResult = { canceled?: boolean; dir?: string }
export type StoragePathInfo = {
  dir: string
  defaultDir: string
  metaPath: string
}
export type StoragePathResult = {
  success: boolean
  dir?: string
  oldDir?: string
  error?: string
}

type DesktopBridge = {
  isElectron: boolean
  /** Same string as Node's `process.platform` ("win32" / "darwin" / "linux"). */
  platform: NodeJS.Platform
  notify: (title: string, body: string) => Promise<void>
  minimize: () => Promise<void>
  hide: () => Promise<void>
  close: () => Promise<void>
  setWindowLevel: (level: "top" | "normal" | "desktop") => Promise<void>
  /**
   * Toggle whether the widget is visible on every Windows virtual
   * desktop (true) or only on the desktop it currently lives on (false).
   */
  setVisibleOnAllWorkspaces: (value: boolean) => Promise<{ value: boolean }>
  setLocked: (value: boolean) => Promise<void>
  edgeHide: {
    /**
     * Toggle edge auto-hide. The main process owns the entire detection
     * loop (cursor polling, debounce, restore) so the renderer only needs
     * to enable/disable it.
     */
    setEnabled: (value: boolean) => Promise<{ enabled: boolean }>
    /**
     * Configure the slide+fade animation duration in milliseconds.
     * 0 = instant, max 800ms.
     */
    setAnimMs: (value: number) => Promise<{ animMs: number }>
  }
  autoLaunch: {
    get: () => Promise<boolean>
    set: (value: boolean) => Promise<AutoLaunchResult>
    test: () => Promise<AutoLaunchTestResult>
  }
  shortcut: {
    get: () => Promise<string>
    set: (accelerator: string) => Promise<ShortcutResult>
  }
  pickImage: () => Promise<PickImageResult>
  pickFolder: () => Promise<PickFolderResult>
  openPath: (target: string) => Promise<boolean>
  storage: {
    getPath: () => Promise<StoragePathInfo>
    setPath: (newDir: string) => Promise<StoragePathResult>
    resetPath: () => Promise<StoragePathResult>
    read: (key: "todos" | "widget") => Promise<string | null>
    write: (key: "todos" | "widget", value: string) => Promise<boolean>
  }
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

/**
 * Returns the Electron bridge if running inside the desktop app,
 * otherwise null when running in a regular browser.
 */
export function useDesktop() {
  const [bridge, setBridge] = useState<DesktopBridge | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined" && window.desktop?.isElectron) {
      setBridge(window.desktop)
    }
  }, [])

  return bridge
}

/**
 * Fire a system notification when running in Electron, otherwise no-op.
 */
export async function desktopNotify(title: string, body: string) {
  if (typeof window !== "undefined" && window.desktop?.isElectron) {
    try {
      await window.desktop.notify(title, body)
    } catch {
      // ignore
    }
  }
}

/**
 * Storage adapter: prefer Electron file storage when available, otherwise
 * fall back to localStorage. Returns string|null.
 */
export async function storageRead(key: "todos" | "widget"): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (window.desktop?.isElectron) {
    try {
      const v = await window.desktop.storage.read(key)
      return v ?? null
    } catch {
      return null
    }
  }
  try {
    return localStorage.getItem(`desktop-todo:${key}`)
  } catch {
    return null
  }
}

export async function storageWrite(
  key: "todos" | "widget",
  value: string,
): Promise<void> {
  if (typeof window === "undefined") return
  if (window.desktop?.isElectron) {
    try {
      await window.desktop.storage.write(key, value)
    } catch {
      // ignore
    }
    return
  }
  try {
    localStorage.setItem(`desktop-todo:${key}`, value)
  } catch {
    // ignore quota errors
  }
}
