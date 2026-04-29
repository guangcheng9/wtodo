"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronRight, Plus, GripVertical, Pin, PinOff, ListTodo } from "lucide-react"
import { TodoItem } from "@/components/todo-item"
import { WidgetSettings } from "@/components/widget-settings"
import { DesktopBackground } from "@/components/desktop-background"
import {
  type Todo,
  type WidgetState,
  DEFAULT_WIDGET_STATE,
  STORAGE_KEYS,
  WALLPAPERS,
} from "@/lib/todo-types"
import {
  useDesktop,
  desktopNotify,
  storageRead,
  storageWrite,
} from "@/lib/use-desktop"
import { resolveWallpaperUrl } from "@/lib/wallpaper-url"
import { cn } from "@/lib/utils"

const MIN_W = 300
const MIN_H = 280
const MAX_W = 800
const MAX_H = 900

export function DesktopTodoWidget() {
  const desktop = useDesktop()
  const isElectron = !!desktop
  const [mounted, setMounted] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [widget, setWidget] = useState<WidgetState>(DEFAULT_WIDGET_STATE)
  const [input, setInput] = useState("")
  const [showDone, setShowDone] = useState(false)

  const widgetRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    type: "move" | "resize" | null
    startX: number
    startY: number
    startW: number
    startH: number
    startLeft: number
    startTop: number
  }>({
    type: null,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    startLeft: 0,
    startTop: 0,
  })

  // Hydrate from storage (Electron file or localStorage fallback)
  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const [todosRaw, widgetRaw] = await Promise.all([
          storageRead("todos"),
          storageRead("widget"),
        ])
        if (canceled) return
        if (todosRaw) {
          try {
            setTodos(JSON.parse(todosRaw))
          } catch {
            // ignore corrupt
          }
        }
        if (widgetRaw) {
          try {
            const parsed = JSON.parse(widgetRaw)
            // Migration: old `alwaysOnTop` / `pinToDesktop` -> `windowLevel`
            if (typeof parsed.windowLevel !== "string") {
              if (parsed.pinToDesktop) parsed.windowLevel = "desktop"
              else if (parsed.alwaysOnTop === false) parsed.windowLevel = "normal"
              else parsed.windowLevel = "top"
            }
            // Drop any legacy wallpaper URL formats that Chromium refuses
            // to load (file:///, custom localfile://, blob: from old web
            // sessions). New picks are stored as base64 data URLs which
            // always render. Falling back to no custom wallpaper makes the
            // built-in wallpaper kick in until the user re-picks an image.
            if (
              typeof parsed.customWallpaper === "string" &&
              !parsed.customWallpaper.startsWith("data:")
            ) {
              parsed.customWallpaper = null
              if (parsed.wallpaper === "custom") {
                parsed.wallpaper = DEFAULT_WIDGET_STATE.wallpaper
              }
            }
            setWidget({ ...DEFAULT_WIDGET_STATE, ...parsed })
          } catch {
            // ignore corrupt
          }
        } else {
          const w = DEFAULT_WIDGET_STATE.width
          const h = DEFAULT_WIDGET_STATE.height
          setWidget((s) => ({
            ...s,
            x: Math.max(20, (window.innerWidth - w) / 2),
            y: Math.max(20, (window.innerHeight - h) / 3),
          }))
        }
      } catch {
        // ignore
      }
      setMounted(true)
    })()
    return () => {
      canceled = true
    }
  }, [])

  // Initial sync with the OS once Electron bridge is available
  useEffect(() => {
    if (!desktop || !mounted) return
    document.documentElement.classList.add("electron")

    desktop.autoLaunch.get().then((enabled) => {
      setWidget((s) => (s.autoLaunch === enabled ? s : { ...s, autoLaunch: enabled }))
    })

    desktop.setWindowLevel(widget.windowLevel)
    desktop.setVisibleOnAllWorkspaces(widget.visibleOnAllWorkspaces)
    desktop.setLocked(widget.pinned)

    if (widget.shortcut) {
      desktop.shortcut.set(widget.shortcut).then((res) => {
        if (!res.success && res.shortcut !== widget.shortcut) {
          setWidget((s) => ({ ...s, shortcut: res.shortcut }))
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, mounted])

  // Sync pinned -> OS lock
  useEffect(() => {
    if (!desktop || !mounted) return
    desktop.setLocked(widget.pinned)
  }, [desktop, mounted, widget.pinned])

  // Sync workspace visibility independently of windowLevel so the user can
  // mix any combination (e.g. always-on-top + only-current-desktop, or
  // desktop-level + show-on-all-workspaces).
  useEffect(() => {
    if (!desktop || !mounted) return
    desktop.setVisibleOnAllWorkspaces(widget.visibleOnAllWorkspaces)
  }, [desktop, mounted, widget.visibleOnAllWorkspaces])

  // Sync edge auto-hide enabled state to main process. The main process
  // handles BOTH hide and restore decisions on its own poll loop using the
  // OS cursor position. We deliberately don't hook into DOM mouseleave
  // here — it fired spuriously on title-bar / border repaints and caused
  // the previous flicker.
  useEffect(() => {
    if (!desktop || !mounted) return
    desktop.edgeHide.setEnabled(widget.edgeHide)
  }, [desktop, mounted, widget.edgeHide])

  // Sync animation duration whenever the user drags the slider.
  useEffect(() => {
    if (!desktop || !mounted) return
    desktop.edgeHide.setAnimMs(widget.edgeHideAnimMs)
  }, [desktop, mounted, widget.edgeHideAnimMs])

  // Push the configured radius into a CSS custom property on <html> so that
  // globals.css can clip html/body to the same shape as the widget. This is
  // what actually removes the square corner artefacts on Windows DWM — see
  // the `html.electron` block in globals.css.
  useEffect(() => {
    if (!mounted) return
    document.documentElement.style.setProperty(
      "--widget-radius",
      `${widget.borderRadius}px`,
    )
  }, [mounted, widget.borderRadius])

  // Persist todos and widget. Persist asynchronously through storage adapter.
  useEffect(() => {
    if (!mounted) return
    void storageWrite("todos", JSON.stringify(todos))
    // also keep a localStorage copy for the web preview
    if (!isElectron) {
      try {
        localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(todos))
      } catch {
        // ignore
      }
    }
  }, [todos, mounted, isElectron])

  useEffect(() => {
    if (!mounted) return
    void storageWrite("widget", JSON.stringify(widget))
    if (!isElectron) {
      try {
        localStorage.setItem(STORAGE_KEYS.widget, JSON.stringify(widget))
      } catch {
        // ignore
      }
    }
  }, [widget, mounted, isElectron])

  const updateWidget = useCallback((patch: Partial<WidgetState>) => {
    setWidget((s) => ({ ...s, ...patch }))
  }, [])

  // Reminder polling
  useEffect(() => {
    if (!mounted) return
    const tick = () => {
      const now = Date.now()
      let changed = false
      const next = todos.map((t) => {
        if (
          !t.done &&
          t.reminderAt &&
          !t.reminderNotified &&
          t.reminderAt <= now
        ) {
          changed = true
          desktopNotify("待办提醒", t.text)
          return { ...t, reminderNotified: true }
        }
        return t
      })
      if (changed) setTodos(next)
    }
    tick()
    const id = window.setInterval(tick, 30 * 1000)
    return () => window.clearInterval(id)
  }, [todos, mounted])

  // Drag & resize (web only)
  const onMoveStart = (e: React.MouseEvent) => {
    if (widget.pinned) return
    const target = e.target as HTMLElement
    if (target.closest("button, input, [role='checkbox'], [data-no-drag]")) return
    dragState.current = {
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      startW: widget.width,
      startH: widget.height,
      startLeft: widget.x,
      startTop: widget.y,
    }
    e.preventDefault()
  }

  const onResizeStart = (e: React.MouseEvent) => {
    if (widget.pinned) return
    dragState.current = {
      type: "resize",
      startX: e.clientX,
      startY: e.clientY,
      startW: widget.width,
      startH: widget.height,
      startLeft: widget.x,
      startTop: widget.y,
    }
    e.preventDefault()
    e.stopPropagation()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ds = dragState.current
      if (!ds.type) return
      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY
      if (ds.type === "move") {
        const maxX = window.innerWidth - widget.width
        const maxY = window.innerHeight - 40
        const nx = Math.min(Math.max(0, ds.startLeft + dx), Math.max(0, maxX))
        const ny = Math.min(Math.max(0, ds.startTop + dy), Math.max(0, maxY))
        setWidget((s) => ({ ...s, x: nx, y: ny }))
      } else if (ds.type === "resize") {
        const nw = Math.min(MAX_W, Math.max(MIN_W, ds.startW + dx))
        const nh = Math.min(MAX_H, Math.max(MIN_H, ds.startH + dy))
        setWidget((s) => ({ ...s, width: nw, height: nh }))
      }
    }
    const onUp = () => {
      dragState.current.type = null
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [widget.width])

  // Todo actions
  const addTodo = () => {
    const text = input.trim()
    if (!text) return
    setTodos((prev) => [
      { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() },
      ...prev,
    ])
    setInput("")
  }

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  const setReminder = (id: string, reminderAt: number | null) => {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, reminderAt, reminderNotified: false } : t,
      ),
    )
  }

  const clearDone = () => {
    setTodos((prev) => prev.filter((t) => !t.done))
  }

  const pending = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)

  if (!mounted) return null

  const isDark = widget.theme === "dark"

  // Wallpaper layer (always rendered inside the widget so it switches in any mode)
  const isCustom = widget.wallpaper === "custom" && widget.customWallpaper
  const builtin = WALLPAPERS.find((w) => w.id === widget.wallpaper) ?? WALLPAPERS[0]
  const rawWallpaperUrl = isCustom ? (widget.customWallpaper as string) : builtin.url
  // file://, http(s)://, data: and "/" all use background-image; CSS gradient
  // strings (linear-gradient...) use background.
  const isImageWp =
    isCustom ||
    builtin.url.startsWith("/") ||
    builtin.url.startsWith("http") ||
    builtin.url.startsWith("data:") ||
    builtin.url.startsWith("file:")
  // Convert root-absolute `public/` paths to the form that works under both
  // dev (`/wallpapers/...`) and packaged Electron (`wallpapers/...`).
  const wallpaperUrl = isImageWp ? resolveWallpaperUrl(rawWallpaperUrl) : rawWallpaperUrl
  const wallpaperStyle: React.CSSProperties = isImageWp
    ? {
        backgroundImage: `url("${wallpaperUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: widget.wallpaperOpacity / 100,
      }
    : { background: wallpaperUrl, opacity: widget.wallpaperOpacity / 100 }

  const headerDragRegion: React.CSSProperties | undefined = isElectron
    ? ({
        WebkitAppRegion: widget.pinned ? "no-drag" : "drag",
      } as React.CSSProperties)
    : undefined

  return (
    <>
      {!isElectron && (
        <DesktopBackground
          wallpaperId={widget.wallpaper}
          customUrl={widget.customWallpaper}
        />
      )}
      <div
        ref={widgetRef}
        className={cn(
          "shadow-2xl border overflow-hidden flex flex-col transition-shadow",
          isElectron ? "fixed inset-0" : "fixed",
          isDark
            ? "border-white/10 text-neutral-50"
            : "border-black/5 text-neutral-900",
        )}
        style={{
          // clip-path is the only reliable way to round the corners on
          // Windows DWM — `overflow:hidden` is bypassed by GPU compositing
          // for any descendant that uses `backdrop-filter`, which is what
          // produced the square at the bottom corners. The matching
          // `borderRadius` keeps the border / shadow stroke aligned.
          borderRadius: widget.borderRadius,
          clipPath: `inset(0 round ${widget.borderRadius}px)`,
          WebkitClipPath: `inset(0 round ${widget.borderRadius}px)`,
          ...(isElectron
            ? null
            : {
                left: widget.x,
                top: widget.y,
                width: widget.width,
                height: widget.height,
              }),
        }}
      >
        {/* Wallpaper layer — its own opacity is independent from the glass
            tint above, so the user can dim the photo without losing the
            readable surface beneath the text. */}
        <div
          className="absolute inset-0 -z-10 transition-all duration-500"
          style={wallpaperStyle}
          aria-hidden="true"
        />
        {/* Glass tint overlay — opacity comes from `widget.widgetOpacity`
            (0..100) and is applied via inline style so it's truly
            user-configurable. The class only sets the colour. */}
        <div
          className={cn(
            "absolute inset-0 -z-10 backdrop-blur-2xl transition-colors",
            isDark ? "bg-neutral-900" : "bg-white",
          )}
          style={{ opacity: widget.widgetOpacity / 100 }}
          aria-hidden="true"
        />

        {/* Header / drag handle */}
        <div
          onMouseDown={isElectron ? undefined : onMoveStart}
          style={headerDragRegion}
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 border-b shrink-0",
            isDark ? "border-white/10" : "border-black/5",
            isElectron
              ? "cursor-default"
              : widget.pinned
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVertical
            className={cn(
              "h-4 w-4 shrink-0",
              widget.pinned ? "opacity-30" : "",
              isDark ? "text-neutral-400" : "text-neutral-400",
            )}
          />
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <ListTodo className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">桌面待办</span>
            {pending.length > 0 && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0",
                  isDark
                    ? "bg-white/10 text-neutral-300"
                    : "bg-black/5 text-neutral-600",
                )}
              >
                {pending.length}
              </span>
            )}
          </div>
          <div
            data-no-drag
            style={
              isElectron
                ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
                : undefined
            }
            className="flex items-center"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => updateWidget({ pinned: !widget.pinned })}
              className={cn(
                "h-7 w-7",
                isDark
                  ? "text-neutral-400 hover:text-neutral-50 hover:bg-white/10"
                  : "text-neutral-500 hover:text-neutral-900 hover:bg-black/5",
                widget.pinned && "text-primary",
              )}
              aria-label={widget.pinned ? "取消固定" : "固定位置"}
              title={widget.pinned ? "取消固定" : "固定位置"}
            >
              {widget.pinned ? (
                <Pin className="h-3.5 w-3.5 fill-current" />
              ) : (
                <PinOff className="h-3.5 w-3.5" />
              )}
            </Button>
            <WidgetSettings state={widget} onChange={updateWidget} />
          </div>
        </div>

        {/* Add todo input */}
        <div
          className={cn(
            "flex gap-1.5 p-3 border-b shrink-0",
            isDark ? "border-white/10" : "border-black/5",
          )}
          data-no-drag
          style={
            isElectron
              ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
              : undefined
          }
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTodo()
            }}
            placeholder="添加新的待办事项..."
            className={cn(
              "h-9 text-sm",
              isDark
                ? "bg-white/5 border-white/10 text-neutral-50 placeholder:text-neutral-500 focus-visible:border-primary/50"
                : "bg-black/5 border-transparent placeholder:text-neutral-500 focus-visible:bg-white",
            )}
          />
          <Button
            onClick={addTodo}
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!input.trim()}
            aria-label="添加"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Todo list */}
        <div
          className="flex-1 overflow-y-auto todo-scroll px-2 py-2"
          data-no-drag
          style={
            isElectron
              ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties)
              : undefined
          }
        >
          {todos.length === 0 && (
            <div
              className={cn(
                "h-full flex flex-col items-center justify-center text-center px-4 py-8",
                isDark ? "text-neutral-500" : "text-neutral-400",
              )}
            >
              <ListTodo className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm font-medium mb-0.5">暂无待办事项</p>
              <p className="text-xs">在上方输入框添加你的第一个任务</p>
            </div>
          )}

          {pending.length > 0 && (
            <div className="space-y-0.5">
              {pending.map((t) => (
                <TodoItem
                  key={t.id}
                  todo={t}
                  truncate={widget.truncate}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  onSetReminder={setReminder}
                />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <Collapsible open={showDone} onOpenChange={setShowDone} className="mt-2">
              <div
                className={cn(
                  "flex items-center gap-1 mt-1 mb-1",
                  pending.length > 0 &&
                    (isDark
                      ? "border-t border-white/10 pt-2"
                      : "border-t border-black/5 pt-2"),
                )}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 px-2 text-xs font-medium gap-1 flex-1 justify-start",
                      isDark
                        ? "text-neutral-400 hover:text-neutral-50 hover:bg-white/10"
                        : "text-neutral-500 hover:text-neutral-900 hover:bg-black/5",
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        showDone && "rotate-90",
                      )}
                    />
                    <span>已完成</span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded-full text-[10px]",
                        isDark ? "bg-white/10" : "bg-black/5",
                      )}
                    >
                      {done.length}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                {showDone && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearDone}
                    className={cn(
                      "h-7 px-2 text-xs",
                      isDark
                        ? "text-neutral-400 hover:text-destructive hover:bg-white/10"
                        : "text-neutral-500 hover:text-destructive hover:bg-black/5",
                    )}
                  >
                    清空
                  </Button>
                )}
              </div>
              <CollapsibleContent className="space-y-0.5 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                {done.map((t) => (
                  <TodoItem
                    key={t.id}
                    todo={t}
                    truncate={widget.truncate}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onSetReminder={setReminder}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* Resize handle (web only) */}
        {!widget.pinned && !isElectron && (
          <div
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5"
            aria-label="调整大小"
            title="拖动以调整大小"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className={isDark ? "text-neutral-500" : "text-neutral-400"}
            >
              <path
                d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
        )}
      </div>
    </>
  )
}
