"use client"

import { WALLPAPERS } from "@/lib/todo-types"
import { resolveWallpaperUrl } from "@/lib/wallpaper-url"

type Props = {
  wallpaperId: string
  customUrl?: string | null
}

export function DesktopBackground({ wallpaperId, customUrl }: Props) {
  const isCustom = wallpaperId === "custom" && !!customUrl
  const wallpaper = WALLPAPERS.find((w) => w.id === wallpaperId) ?? WALLPAPERS[0]
  const rawUrl = isCustom ? (customUrl as string) : wallpaper.url
  const isImage =
    isCustom ||
    wallpaper.url.startsWith("/") ||
    wallpaper.url.startsWith("http") ||
    wallpaper.url.startsWith("data:") ||
    wallpaper.url.startsWith("file:")
  // Translate "/wallpapers/..." → "wallpapers/..." when running under
  // file:// (Electron prod). Pass-through everything else.
  const url = isImage ? resolveWallpaperUrl(rawUrl) : rawUrl

  return (
    <div
      className="fixed inset-0 -z-10 transition-all duration-500"
      style={
        isImage
          ? {
              backgroundImage: `url("${url}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { background: url }
      }
      aria-hidden="true"
    />
  )
}
