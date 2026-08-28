import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CalendarClock,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LibraryProject } from "@/types/library"

type ScheduledTasksDialogProps = {
  open: boolean
  project: LibraryProject
  onClose: () => void
}

type TaskForm = {
  id?: string
  name: string
  instruction: string
  scheduleType: "daily" | "weekly"
  time: string
  weekdays: number[]
  enabled: boolean
  autoApplyChanges: boolean
}

const weekdays = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 7, label: "日" },
]

const emptyForm: TaskForm = {
  name: "",
  instruction: "",
  scheduleType: "daily",
  time: "09:00",
  weekdays: [1, 2, 3, 4, 5],
  enabled: true,
  autoApplyChanges: true,
}

function formatDateTime(value: string | null) {
  if (!value) return "尚未执行"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "尚未执行"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function scheduleLabel(task: ScheduledTask) {
  if (task.scheduleType === "daily") return `每天 ${task.time}`
  const labels = task.weekdays
    .map((value) => weekdays.find((item) => item.value === value)?.label)
    .filter(Boolean)
    .join("、")
  return `周${labels} ${task.time}`
}

function statusLabel(task: ScheduledTask) {
  if (task.isRunning || task.status === "running") return "运行中"
  if (!task.enabled) return "已暂停"
  if (task.status === "failed") return "上次失败"
  if (task.status === "pending-confirmation") return "等待确认"
  if (task.status === "success") return "上次成功"
  return "等待执行"
}

function statusClasses(task: ScheduledTask) {
  if (task.isRunning || task.status === "running") return "bg-orange-50 text-primary"
  if (!task.enabled) return "bg-muted text-muted-foreground"
  if (task.status === "failed") return "bg-red-50 text-destructive"
  if (task.status === "pending-confirmation") return "bg-amber-50 text-amber-700"
  if (task.status === "success") return "bg-emerald-50 text-emerald-700"
  return "bg-muted text-muted-foreground"
}

export function ScheduledTasksDialog({ open, project, onClose }: ScheduledTasksDialogProps) {
  const [state, setState] = useState<ScheduledTaskState>({ ok: true, tasks: [], runs: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [presetTime, setPresetTime] = useState("09:00")
  const [busyAction, setBusyAction] = useState("")
  const [error, setError] = useState("")

  const loadState = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true)
    try {
      setState(await window.authorDesk.scheduledTasks.get(project.path))
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取定时任务")
    } finally {
      if (!quiet) setIsLoading(false)
    }
  }, [project.path])

  useEffect(() => {
    if (!open) return
    setIsFormOpen(false)
    setForm(emptyForm)
    loadState()
  }, [loadState, open])

  useEffect(() => window.authorDesk.scheduledTasks.onUpdated((payload) => {
    if (!open || payload.projectPath !== project.path) return
    loadState(true)
  }), [loadState, open, project.path])

  const enabledCount = useMemo(
    () => state.tasks.filter((task) => task.enabled).length,
    [state.tasks],
  )

  if (!open) return null

  function beginCreate() {
    setForm({ ...emptyForm, weekdays: [...emptyForm.weekdays] })
    setIsFormOpen(true)
    setError("")
  }

  function beginEdit(task: ScheduledTask) {
    setForm({
      id: task.id,
      name: task.name,
      instruction: task.instruction,
      scheduleType: task.scheduleType,
      time: task.time,
      weekdays: [...task.weekdays],
      enabled: task.enabled,
      autoApplyChanges: task.autoApplyChanges,
    })
    setIsFormOpen(true)
    setError("")
  }

  async function saveTask() {
    if (!form.name.trim() || !form.instruction.trim()) {
      setError("请填写任务名称和要执行的指令")
      return
    }
    if (form.scheduleType === "weekly" && !form.weekdays.length) {
      setError("请至少选择一个执行星期")
      return
    }
    setBusyAction("save")
    try {
      setState(await window.authorDesk.scheduledTasks.save(project.path, form))
      setIsFormOpen(false)
      setError("")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存定时任务失败")
    } finally {
      setBusyAction("")
    }
  }

  async function applyPreset() {
    setBusyAction("preset")
    try {
      setState(await window.authorDesk.scheduledTasks.createWeeklyWritingPreset(
        project.path,
        presetTime,
      ))
      setError("")
    } catch (presetError) {
      setError(presetError instanceof Error ? presetError.message : "创建预设任务失败")
    } finally {
      setBusyAction("")
    }
  }

  async function toggleTask(task: ScheduledTask) {
    setBusyAction(`toggle:${task.id}`)
    try {
      setState(await window.authorDesk.scheduledTasks.setEnabled(
        project.path,
        task.id,
        !task.enabled,
      ))
      setError("")
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "切换任务状态失败")
    } finally {
      setBusyAction("")
    }
  }

  async function runTaskNow(task: ScheduledTask) {
    setBusyAction(`run:${task.id}`)
    try {
      setState(await window.authorDesk.scheduledTasks.runNow(project.path, task.id))
      setError("")
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "任务执行失败")
      await loadState(true)
    } finally {
      setBusyAction("")
    }
  }

  async function deleteTask(task: ScheduledTask) {
    if (!window.confirm(`确定删除定时任务“${task.name}”吗？执行记录会保留。`)) return
    setBusyAction(`delete:${task.id}`)
    try {
      setState(await window.authorDesk.scheduledTasks.delete(project.path, task.id))
      setError("")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除定时任务失败")
    } finally {
      setBusyAction("")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheduled-tasks-title"
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
            <CalendarClock className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 id="scheduled-tasks-title" className="text-sm font-semibold">定时任务</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {project.name} · {enabledCount} 个任务已启用
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={beginCreate}>
            <Plus className="size-3.5" />
            新建任务
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="关闭定时任务" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_310px] overflow-hidden">
          <div className="min-h-0 overflow-y-auto p-5">
            <section className="mb-5 rounded-xl border border-primary/15 bg-gradient-to-r from-orange-50 to-white p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-primary shadow-sm">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold">阶梯写作预设</h3>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    周一至周四每天自动续写 2 章，周五集中续写 6 章；生成后自动保存到正文目录。
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  执行时间
                  <input
                    type="time"
                    value={presetTime}
                    onChange={(event) => setPresetTime(event.target.value)}
                    className="h-8 rounded-lg border border-border bg-white px-2 text-xs outline-none focus:border-primary/40"
                  />
                </label>
                <Button size="sm" disabled={Boolean(busyAction)} onClick={applyPreset}>
                  {busyAction === "preset"
                    ? <LoaderCircle className="size-3.5 animate-spin" />
                    : <CalendarClock className="size-3.5" />}
                  应用预设
                </Button>
              </div>
            </section>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-xs leading-5 text-destructive" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span className="select-text">{error}</span>
              </div>
            )}

            {isFormOpen && (
              <section className="mb-5 overflow-hidden rounded-xl border border-primary/20 bg-white shadow-sm">
                <header className="flex items-center border-b border-border bg-secondary/30 px-4 py-3">
                  <h3 className="text-xs font-semibold">{form.id ? "编辑任务" : "新建任务"}</h3>
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => setIsFormOpen(false)}
                  >
                    <X className="size-4" />
                  </button>
                </header>
                <div className="grid gap-4 p-4">
                  <label className="grid gap-1.5 text-[11px] font-medium">
                    任务名称
                    <input
                      value={form.name}
                      maxLength={100}
                      placeholder="例如：每天检查剧情连贯性"
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="h-9 rounded-lg border border-border px-3 text-xs font-normal outline-none focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                    />
                  </label>
                  <label className="grid gap-1.5 text-[11px] font-medium">
                    执行指令
                    <textarea
                      value={form.instruction}
                      rows={5}
                      maxLength={20_000}
                      placeholder="告诉 AI 到时间后要读取什么、生成什么，以及要保存到哪里……"
                      onChange={(event) => setForm((current) => ({ ...current, instruction: event.target.value }))}
                      className="resize-y rounded-lg border border-border px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                    />
                  </label>
                  <div className="grid grid-cols-[160px_140px_minmax(0,1fr)] gap-4">
                    <label className="grid gap-1.5 text-[11px] font-medium">
                      重复方式
                      <select
                        value={form.scheduleType}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          scheduleType: event.target.value as "daily" | "weekly",
                        }))}
                        className="h-9 rounded-lg border border-border bg-white px-2 text-xs font-normal outline-none focus:border-primary/40"
                      >
                        <option value="daily">每天</option>
                        <option value="weekly">指定星期</option>
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-[11px] font-medium">
                      执行时间
                      <input
                        type="time"
                        value={form.time}
                        onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
                        className="h-9 rounded-lg border border-border px-2 text-xs font-normal outline-none focus:border-primary/40"
                      />
                    </label>
                    {form.scheduleType === "weekly" && (
                      <fieldset className="grid gap-1.5">
                        <legend className="text-[11px] font-medium">执行星期</legend>
                        <div className="flex gap-1.5">
                          {weekdays.map((day) => {
                            const selected = form.weekdays.includes(day.value)
                            return (
                              <button
                                key={day.value}
                                type="button"
                                aria-pressed={selected}
                                className={`grid size-9 place-items-center rounded-lg border text-[11px] font-medium transition-colors ${
                                  selected
                                    ? "border-primary bg-primary text-white"
                                    : "border-border bg-white text-muted-foreground hover:border-primary/30 hover:text-primary"
                                }`}
                                onClick={() => setForm((current) => ({
                                  ...current,
                                  weekdays: selected
                                    ? current.weekdays.filter((value) => value !== day.value)
                                    : [...current.weekdays, day.value].sort(),
                                }))}
                              >
                                {day.label}
                              </button>
                            )
                          })}
                        </div>
                      </fieldset>
                    )}
                  </div>
                  <div className="flex items-center gap-5 border-t border-border pt-4">
                    <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                        className="size-4 accent-primary"
                      />
                      保存后立即启用
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={form.autoApplyChanges}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          autoApplyChanges: event.target.checked,
                        }))}
                        className="size-4 accent-primary"
                      />
                      自动保存 AI 生成的文件修改
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      关闭后，差异会留在 AI 对话中等待确认。
                    </p>
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsFormOpen(false)}>取消</Button>
                      <Button size="sm" disabled={busyAction === "save"} onClick={saveTask}>
                        {busyAction === "save" && <LoaderCircle className="size-3.5 animate-spin" />}
                        保存任务
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {isLoading ? (
              <div className="grid h-48 place-items-center text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            ) : state.tasks.length ? (
              <div className="space-y-3">
                {state.tasks.map((task) => (
                  <article key={task.id} className="rounded-xl border border-border bg-white p-4 transition-colors hover:border-primary/20">
                    <div className="flex items-start gap-3">
                      <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${task.enabled ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}>
                        {task.isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-xs font-semibold">{task.name}</h3>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-medium ${statusClasses(task)}`}>
                            {statusLabel(task)}
                          </span>
                          {task.autoApplyChanges && (
                            <span className="rounded-full bg-muted px-2 py-1 text-[9px] text-muted-foreground">自动保存</span>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 select-text text-[11px] leading-5 text-muted-foreground">
                          {task.instruction}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarClock className="size-3" />{scheduleLabel(task)}</span>
                          <span>下次：{task.enabled ? formatDateTime(task.nextRunAt) : "已暂停"}</span>
                          <span>上次：{formatDateTime(task.lastRunAt)}</span>
                        </div>
                        {task.lastError && (
                          <p className="mt-2 select-text rounded-lg bg-red-50 px-2.5 py-2 text-[10px] leading-4 text-destructive">
                            {task.lastError}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={task.isRunning || Boolean(busyAction)}
                          title={task.enabled ? "暂停任务" : "启用任务"}
                          aria-label={task.enabled ? "暂停任务" : "启用任务"}
                          onClick={() => toggleTask(task)}
                        >
                          {busyAction === `toggle:${task.id}`
                            ? <LoaderCircle className="size-3.5 animate-spin" />
                            : task.enabled
                              ? <Pause className="size-3.5" />
                              : <Play className="size-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={task.isRunning || Boolean(busyAction)}
                          title="立即执行"
                          aria-label="立即执行"
                          onClick={() => runTaskNow(task)}
                        >
                          {busyAction === `run:${task.id}`
                            ? <LoaderCircle className="size-3.5 animate-spin" />
                            : <RotateCcw className="size-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon-sm" disabled={task.isRunning} aria-label="编辑任务" onClick={() => beginEdit(task)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-red-50 hover:text-destructive"
                          disabled={task.isRunning || Boolean(busyAction)}
                          aria-label="删除任务"
                          onClick={() => deleteTask(task)}
                        >
                          {busyAction === `delete:${task.id}`
                            ? <LoaderCircle className="size-3.5 animate-spin" />
                            : <Trash2 className="size-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid h-52 place-items-center rounded-xl border border-dashed border-border bg-muted/20 text-center">
                <div>
                  <CalendarClock className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-3 text-xs font-medium">还没有定时任务</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">创建自定义指令，或直接应用上方写作预设。</p>
                </div>
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-border bg-muted/20 p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold">
              <Clock3 className="size-3.5 text-primary" />
              最近执行
            </h3>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              记录保存在当前小说的 .chat 目录，最多保留 40 条。
            </p>
            <div className="mt-4 space-y-2.5">
              {state.runs.length ? state.runs.slice(0, 12).map((run) => (
                <article key={run.id} className="rounded-xl border border-border bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                      run.status === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : run.status === "pending-confirmation"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-destructive"
                    }`}>
                      {run.status === "success" ? <Check className="size-3" /> : <CircleAlert className="size-3" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium">{run.taskName}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">{formatDateTime(run.finishedAt)}</p>
                    </div>
                  </div>
                  <p className={`mt-2 line-clamp-3 select-text text-[10px] leading-4 ${run.error ? "text-destructive" : "text-muted-foreground"}`}>
                    {run.error || run.result || "任务已完成"}
                  </p>
                  {run.appliedCount > 0 && (
                    <p className="mt-2 text-[9px] font-medium text-emerald-700">已保存 {run.appliedCount} 项修改</p>
                  )}
                </article>
              )) : (
                <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-[10px] text-muted-foreground">
                  暂无执行记录
                </p>
              )}
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[10px] leading-4 text-amber-800">
              程序最小化到后台时任务仍会执行；完全退出后无法执行，重新打开会补检最近 36 小时内错过的一次任务。
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
