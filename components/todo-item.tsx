"use client"

import { useMemo, useState } from "react"
import type { Todo } from "@/lib/todo-types"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Bell, BellRing, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  todo: Todo
  truncate: boolean
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onSetReminder: (id: string, reminderAt: number | null) => void
}

/** Format ms timestamp to local "MM-DD HH:mm" */
function formatReminder(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (sameDay) return `今天 ${time}`
  if (isTomorrow) return `明天 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

/** Convert a Date to the value format expected by <input type="datetime-local"> */
function toLocalInputValue(ts: number | null): string {
  if (!ts) return ""
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ReminderEditor({
  todo,
  onSetReminder,
  onClose,
}: {
  todo: Todo
  onSetReminder: (id: string, reminderAt: number | null) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(toLocalInputValue(todo.reminderAt ?? null))

  const minValue = useMemo(() => toLocalInputValue(Date.now()), [])

  const presets = useMemo(() => {
    const now = Date.now()
    return [
      { label: "30 分钟后", ts: now + 30 * 60 * 1000 },
      { label: "1 小时后", ts: now + 60 * 60 * 1000 },
      { label: "今晚 20:00", ts: setHour(20) },
      { label: "明早 09:00", ts: setHour(9, 1) },
    ]
  }, [])

  function setHour(hour: number, addDays = 0) {
    const d = new Date()
    d.setDate(d.getDate() + addDays)
    d.setHours(hour, 0, 0, 0)
    return d.getTime()
  }

  const apply = () => {
    if (!value) {
      onSetReminder(todo.id, null)
    } else {
      const ts = new Date(value).getTime()
      if (Number.isFinite(ts)) onSetReminder(todo.id, ts)
    }
    onClose()
  }

  return (
    <div className="space-y-3 w-64">
      <div>
        <p className="text-xs font-semibold text-foreground mb-1.5">提醒时间</p>
        <input
          type="datetime-local"
          value={value}
          min={minValue}
          onChange={(e) => setValue(e.target.value)}
          className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      <div>
        <p className="text-[11px] text-muted-foreground mb-1.5">快速选择</p>
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setValue(toLocalInputValue(p.ts))}
              className="text-xs h-7 px-2 rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {todo.reminderAt ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onSetReminder(todo.id, null)
              onClose()
            }}
            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            清除提醒
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={apply} className="h-8 text-xs">
          确定
        </Button>
      </div>
    </div>
  )
}

export function TodoItem({ todo, truncate, onToggle, onDelete, onSetReminder }: Props) {
  const [open, setOpen] = useState(false)
  const hasReminder = !!todo.reminderAt
  const isOverdue = hasReminder && !todo.done && (todo.reminderAt as number) < Date.now()

  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
        "hover:bg-foreground/5",
        todo.done && "opacity-60",
      )}
    >
      <Checkbox
        checked={todo.done}
        onCheckedChange={() => onToggle(todo.id)}
        className="mt-0.5 shrink-0"
        aria-label={todo.done ? "标记为未完成" : "标记为完成"}
      />
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "block text-sm leading-relaxed text-foreground select-text",
            truncate ? "truncate" : "break-words whitespace-pre-wrap",
            todo.done && "line-through text-muted-foreground",
          )}
          title={truncate ? todo.text : undefined}
        >
          {todo.text}
        </span>
        {hasReminder && !todo.done && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] mt-0.5",
              isOverdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <Bell className="h-2.5 w-2.5" />
            {formatReminder(todo.reminderAt as number)}
            {isOverdue && <span className="font-medium">· 已过期</span>}
          </span>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 shrink-0 transition-opacity",
              hasReminder
                ? "opacity-100 text-primary"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground",
            )}
            aria-label={hasReminder ? "修改提醒" : "添加提醒"}
            title={hasReminder ? "修改提醒" : "添加提醒"}
          >
            {hasReminder ? (
              <BellRing className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="p-3"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ReminderEditor
            todo={todo}
            onSetReminder={onSetReminder}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(todo.id)}
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        aria-label="删除"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
