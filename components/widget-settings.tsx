"use client"

import { useEffect, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Settings,
  Check,
  Monitor,
  Keyboard,
  RotateCcw,
  Upload,
  HardDrive,
  FolderOpen,
  Play,
  Image as ImageIcon,
  Info,
  PanelRightClose,
} from "lucide-react"
import {
  WALLPAPERS,
  DEFAULT_SHORTCUT,
  formatAccelerator,
  type WidgetState,
} from "@/lib/todo-types"
import { useDesktop } from "@/lib/use-desktop"
import { cn } from "@/lib/utils"

type Props = {
  state: WidgetState
  onChange: (patch: Partial<WidgetState>) => void
}

/* -------------------------------------------------------------------------- */
/*                              Shortcut input                                 */
/* -------------------------------------------------------------------------- */

function buildAccelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl")
  if (e.altKey) mods.push("Alt")
  if (e.shiftKey) mods.push("Shift")

  const key = e.key
  if (
    key === "Control" ||
    key === "Meta" ||
    key === "Alt" ||
    key === "Shift" ||
    key === "OS" ||
    key === "AltGraph"
  ) {
    return null
  }

  let main: string
  if (key.length === 1) main = key.toUpperCase()
  else if (/^F\d{1,2}$/.test(key)) main = key
  else if (key === " ") main = "Space"
  else if (key === "ArrowUp") main = "Up"
  else if (key === "ArrowDown") main = "Down"
  else if (key === "ArrowLeft") main = "Left"
  else if (key === "ArrowRight") main = "Right"
  else if (key === "Escape") main = "Esc"
  else main = key

  if (mods.length === 0) return null
  return [...mods, main].join("+")
}

function ShortcutInput({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const desktop = useDesktop()
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async (accelerator: string) => {
    setError(null)
    if (!desktop) {
      onChange(accelerator)
      return
    }
    const result = await desktop.shortcut.set(accelerator)
    if (result.success) {
      onChange(result.shortcut)
      setCapturing(false)
    } else {
      setError(result.error || "无法注册该快捷键")
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!capturing) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === "Escape") {
      setCapturing(false)
      setError(null)
      return
    }
    const accel = buildAccelerator(e)
    if (!accel) return
    void apply(accel)
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => {
          setCapturing((c) => !c)
          setError(null)
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full h-9 px-3 rounded-md border text-sm flex items-center justify-between gap-2 transition-colors",
          capturing
            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
            : "border-input bg-background hover:bg-accent",
        )}
      >
        <span className="text-muted-foreground text-xs">
          {capturing ? "请按下新组合键..." : "快捷键"}
        </span>
        <span className="font-mono text-xs font-medium text-foreground">
          {capturing ? "..." : formatAccelerator(value)}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        {error ? (
          <span className="text-destructive flex-1 truncate" title={error}>
            {error}
          </span>
        ) : (
          <span className="text-muted-foreground">按 Esc 取消捕捉</span>
        )}
        {value !== DEFAULT_SHORTCUT && (
          <button
            type="button"
            onClick={() => void apply(DEFAULT_SHORTCUT)}
            className="text-primary hover:underline flex items-center gap-0.5 shrink-0"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            重置
          </button>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Custom wallpaper uploader                          */
/* -------------------------------------------------------------------------- */

function CustomWallpaperButton({
  active,
  customUrl,
  onPicked,
}: {
  active: boolean
  customUrl: string | null
  onPicked: (url: string) => void
}) {
  const desktop = useDesktop()
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    setError(null)
    if (desktop) {
      const result = await desktop.pickImage()
      if (result.canceled) return
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) onPicked(result.url)
      return
    }
    // Web fallback: read file -> data URL
    const inp = document.createElement("input")
    inp.type = "file"
    inp.accept = "image/*"
    inp.onchange = () => {
      const file = inp.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") onPicked(reader.result)
      }
      reader.readAsDataURL(file)
    }
    inp.click()
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative aspect-video w-full rounded-md overflow-hidden border-2 transition-all flex items-center justify-center",
          active
            ? "border-primary ring-2 ring-primary/20"
            : "border-dashed border-border hover:border-foreground/30",
          customUrl ? "" : "bg-muted/30",
        )}
        style={
          customUrl
            ? {
                backgroundImage: `url("${customUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
        aria-label="上传自定义背景"
        title="从电脑选择图片"
      >
        {active && customUrl && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Check className="h-4 w-4 text-white" strokeWidth={3} />
          </span>
        )}
        {!customUrl && (
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
            <Upload className="h-4 w-4" />
            <span className="text-[10px]">自定义</span>
          </div>
        )}
      </button>
      {error && (
        <p className="text-[10px] text-destructive truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Storage path management                            */
/* -------------------------------------------------------------------------- */

function StorageSection() {
  const desktop = useDesktop()
  const [info, setInfo] = useState<{
    dir: string
    defaultDir: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!desktop) return
    desktop.storage.getPath().then((p) => setInfo({ dir: p.dir, defaultDir: p.defaultDir }))
  }, [desktop])

  if (!desktop || !info) return null

  const isDefault = info.dir === info.defaultDir

  const handleResult = (result: {
    success: boolean
    dir?: string
    error?: string
  }) => {
    if (result.success && result.dir) {
      setInfo((s) => (s ? { ...s, dir: result.dir as string } : s))
    } else if (result.error) {
      setError(result.error)
    }
  }

  const change = async () => {
    setError(null)
    setBusy(true)
    const picked = await desktop.pickFolder()
    if (!picked.canceled && picked.dir) {
      handleResult(await desktop.storage.setPath(picked.dir))
    }
    setBusy(false)
  }

  const reset = async () => {
    setError(null)
    setBusy(true)
    handleResult(await desktop.storage.resetPath())
    setBusy(false)
  }

  const open = () => desktop.openPath(info.dir)

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <HardDrive className="h-3.5 w-3.5 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">数据存储位置</h4>
      </div>
      <div className="space-y-2">
        <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
          <p
            className="text-[11px] font-mono text-foreground/80 break-all leading-snug"
            title={info.dir}
          >
            {info.dir}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={change}
            disabled={busy}
            className="flex-1 h-7 text-xs gap-1 bg-transparent"
          >
            <FolderOpen className="h-3 w-3" />
            更改
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={open}
            disabled={busy}
            className="h-7 text-xs gap-1 bg-transparent"
          >
            打开
          </Button>
          {!isDefault && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={busy}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              重置
            </Button>
          )}
        </div>
        {error && (
          <p className="text-[11px] text-destructive leading-snug">{error}</p>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed flex items-start gap-1">
          <Info className="h-2.5 w-2.5 mt-0.5 shrink-0" />
          <span>
            待办事项保存为 JSON 文件。默认位于用户数据目录，更改位置后历史数据将自动迁移。
          </span>
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Auto-launch with test                              */
/* -------------------------------------------------------------------------- */

function AutoLaunchControl({
  state,
  onChange,
}: {
  state: WidgetState
  onChange: (patch: Partial<WidgetState>) => void
}) {
  const desktop = useDesktop()
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const toggle = async (v: boolean) => {
    if (!desktop) return
    setBusy(true)
    setHint(null)
    try {
      const result = await desktop.autoLaunch.set(v)
      onChange({ autoLaunch: !!result?.enabled })
      if (result?.error) {
        setHint("操作失败：" + result.error)
      }
    } catch {
      try {
        const enabled = await desktop.autoLaunch.get()
        onChange({ autoLaunch: enabled })
      } catch {
        onChange({ autoLaunch: false })
      }
      setHint("操作失败，已恢复实际状态")
    }
    setBusy(false)
  }

  const test = async () => {
    if (!desktop) return
    setBusy(true)
    const result = await desktop.autoLaunch.test()
    setBusy(false)
    if (result.success) {
      setHint("已尝试启动，新窗口应已打开。如未弹出请检查防病毒软件。")
    } else {
      setHint("启动失败：" + (result.error || "未知错误"))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="auto-launch" className="text-sm font-normal cursor-pointer">
          开机自启动
          <span className="block text-xs text-muted-foreground mt-0.5">
            写入注册表 Run 项，无需管理员权限
          </span>
        </Label>
        <Switch
          id="auto-launch"
          checked={state.autoLaunch}
          disabled={busy}
          onCheckedChange={toggle}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={test}
          disabled={busy}
          className="h-7 text-xs gap-1 bg-transparent"
        >
          <Play className="h-3 w-3" />
          测试启动
        </Button>
        {hint && (
          <p className="text-[10px] text-muted-foreground flex-1 truncate" title={hint}>
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Main                                       */
/* -------------------------------------------------------------------------- */

export function WidgetSettings({ state, onChange }: Props) {
  const desktop = useDesktop()
  const isDesktop = !!desktop

  const onPickCustom = (url: string) => {
    onChange({ customWallpaper: url, wallpaper: "custom" })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="设置"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-4 space-y-4 max-h-[75vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ----- Background ----- */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <ImageIcon className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">背景</h4>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPERS.map((wp) => {
              const isImage = wp.url.startsWith("/")
              const active = state.wallpaper === wp.id
              return (
                <button
                  key={wp.id}
                  onClick={() =>
                    // Switching to a built-in wallpaper drops the previously
                    // picked custom image so it doesn't sit around in
                    // storage forever (and can't accidentally be re-applied
                    // by re-selecting the "Custom" tile).
                    onChange({ wallpaper: wp.id, customWallpaper: null })
                  }
                  className={cn(
                    "relative aspect-video rounded-md overflow-hidden border-2 transition-all",
                    active
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-foreground/30",
                  )}
                  style={
                    isImage
                      ? {
                          backgroundImage: `url("${wp.url}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : { background: wp.url }
                  }
                  aria-label={`切换到${wp.name}`}
                  title={wp.name}
                >
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Check className="h-4 w-4 text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
            <CustomWallpaperButton
              active={state.wallpaper === "custom"}
              customUrl={state.customWallpaper}
              onPicked={onPickCustom}
            />
          </div>

          {/* Wallpaper opacity — controls how visible the chosen image /
              gradient is. Independent from the glass tint below. */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal text-muted-foreground">
                背景图透明度
              </Label>
              <span className="text-xs font-mono text-foreground tabular-nums">
                {state.wallpaperOpacity}%
              </span>
            </div>
            <Slider
              value={[state.wallpaperOpacity]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => onChange({ wallpaperOpacity: v[0] ?? 100 })}
              aria-label="背景图透明度"
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              控制壁纸图层本身的可见度
            </p>
          </div>

          {/* Glass tint opacity — controls how readable the surface above
              the wallpaper is. Lower = more wallpaper bleeds through;
              higher = solid card with crisp text. */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal text-muted-foreground">
                内容底色不透明度
              </Label>
              <span className="text-xs font-mono text-foreground tabular-nums">
                {state.widgetOpacity}%
              </span>
            </div>
            <Slider
              value={[state.widgetOpacity]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => onChange({ widgetOpacity: v[0] ?? 65 })}
              aria-label="内容底色不透明度"
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              控制玻璃磨砂层的浓度，越低越透出背景图
            </p>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* ----- Display options ----- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="truncate" className="text-sm font-normal cursor-pointer">
              文本省略
              <span className="block text-xs text-muted-foreground mt-0.5">
                长文本单行省略号显示
              </span>
            </Label>
            <Switch
              id="truncate"
              checked={state.truncate}
              onCheckedChange={(v) => onChange({ truncate: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="pinned" className="text-sm font-normal cursor-pointer">
              固定位置
              <span className="block text-xs text-muted-foreground mt-0.5">
                禁用拖拽和调整大小
              </span>
            </Label>
            <Switch
              id="pinned"
              checked={state.pinned}
              onCheckedChange={(v) => onChange({ pinned: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="theme" className="text-sm font-normal cursor-pointer">
              深色模式
              <span className="block text-xs text-muted-foreground mt-0.5">
                小组件使用深色主题
              </span>
            </Label>
            <Switch
              id="theme"
              checked={state.theme === "dark"}
              onCheckedChange={(v) => onChange({ theme: v ? "dark" : "light" })}
            />
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">
                圆角
                <span className="block text-xs text-muted-foreground mt-0.5">
                  调整窗口外形：从直角到大圆角
                </span>
              </Label>
              <span className="text-xs font-mono text-foreground tabular-nums">
                {state.borderRadius}px
              </span>
            </div>
            <Slider
              value={[state.borderRadius]}
              min={0}
              max={32}
              step={1}
              onValueChange={(v) => onChange({ borderRadius: v[0] ?? 16 })}
              aria-label="圆角"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>直角</span>
              <span>圆润</span>
            </div>
          </div>
        </div>

        {isDesktop && (
          <>
            <div className="h-px bg-border" />

            {/* ----- Window level (radio, mutually exclusive) ----- */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Monitor className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">窗口层级</h4>
              </div>
              <RadioGroup
                value={state.windowLevel}
                onValueChange={async (v) => {
                  const level = v as WidgetState["windowLevel"]
                  onChange({ windowLevel: level })
                  await desktop?.setWindowLevel(level)
                }}
                className="gap-2"
              >
                {(
                  [
                    {
                      v: "top",
                      label: "始终置顶",
                      desc: "浮动在所有窗口之上",
                    },
                    {
                      v: "normal",
                      label: "普通窗口",
                      desc: "正常 Z 序，可被其他窗口遮挡",
                    },
                    {
                      v: "desktop",
                      label: "贴近桌面",
                      desc: "隐藏任务栏图标 · 跨虚拟桌面可见 · 建议搭配下方贴边自动隐藏使用",
                    },
                  ] as const
                ).map((opt) => {
                  const active = state.windowLevel === opt.v
                  return (
                    <label
                      key={opt.v}
                      htmlFor={`lv-${opt.v}`}
                      className={cn(
                        "flex items-start gap-2 rounded-md border px-2.5 py-2 cursor-pointer transition-colors",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      <RadioGroupItem
                        id={`lv-${opt.v}`}
                        value={opt.v}
                        className="mt-0.5"
                      />
                      <span className="text-sm font-normal flex-1">
                        {opt.label}
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {opt.desc}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </RadioGroup>
            </div>

            <div className="h-px bg-border" />

            {/* ----- Edge auto-hide ----- */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="edge-hide"
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  <span className="flex items-center gap-1.5">
                    <PanelRightClose className="h-3.5 w-3.5 text-primary" />
                    贴边自动隐藏
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5 ml-5">
                    把窗口拖到屏幕边缘后，鼠标移开会自动缩成一条线，悬停展开
                  </span>
                </Label>
                <Switch
                  id="edge-hide"
                  checked={state.edgeHide}
                  onCheckedChange={(v) => onChange({ edgeHide: v })}
                />
              </div>

              {state.edgeHide && (
                <div className="ml-5 pt-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <Label className="text-xs text-muted-foreground font-normal">
                      动画速度
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {state.edgeHideAnimMs === 0
                        ? "立即"
                        : `${state.edgeHideAnimMs} ms`}
                    </span>
                  </div>
                  <Slider
                    value={[state.edgeHideAnimMs]}
                    min={0}
                    max={600}
                    step={20}
                    onValueChange={(vals) =>
                      onChange({ edgeHideAnimMs: vals[0] ?? 240 })
                    }
                    aria-label="贴边动画速度"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>立即</span>
                    <span>柔和</span>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* ----- Auto launch ----- */}
            <AutoLaunchControl state={state} onChange={onChange} />

            <div className="h-px bg-border" />

            {/* ----- Shortcut ----- */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Keyboard className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">全局快捷键</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                按下新的组合键即可绑定。如果与其他应用冲突会自动恢复原绑定。
              </p>
              <ShortcutInput
                value={state.shortcut}
                onChange={(next) => onChange({ shortcut: next })}
              />
            </div>

            <div className="h-px bg-border" />

            {/* ----- Storage path ----- */}
            <StorageSection />
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
