/**
 * Resolve a wallpaper URL so it works in BOTH:
 *
 *  - Web / dev (`http://localhost:3000/`, `https://example.com/`):
 *    absolute paths like `/wallpapers/mountain.jpg` are correct, since the
 *    Next.js dev server serves the `public/` folder at the site root.
 *
 *  - Packaged Electron build (`file:///D:/.../resources/app.asar/out/index.html`):
 *    absolute paths get resolved as **disk roots** (`file:///wallpapers/...`)
 *    and silently 404. Everything served from the `out/` directory must use
 *    a path that's relative to that HTML document instead.
 *
 * The check is `window.location.protocol === "file:"` because that's the
 * single signal that distinguishes a packaged Electron renderer from any
 * other context (dev electron uses `http://localhost:3000/` like the web).
 */
export function resolveWallpaperUrl(url: string): string {
  // Pass through anything that isn't a root-relative path: gradients
  // (`linear-gradient(...)`), data URLs from the custom-image picker, and
  // remote http(s) URLs are all already correct as-is.
  if (!url.startsWith("/")) return url

  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    // Strip the leading slash so the browser resolves it against the
    // current document URL (the packaged `out/index.html`).
    return url.replace(/^\/+/, "")
  }

  return url
}
