import { useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpenCheck,
  CircleAlert,
  Clock3,
  FileText,
  FolderOpen,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  UsersRound,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  BookBreakdownProgress,
  BookBreakdownState,
  LibraryProject,
} from "@/types/library"

type BookBreakdownDialogProps = {
  open: boolean
  project: LibraryProject
  onClose: () => void
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string | null) {
  if (!value) return "尚未分析"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知时间"
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return message
    .replace(/^Error invoking remote method ['"]book-breakdown:[^'"]+['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    || "拆书操作失败"
}

export function BookBreakdownDialog({
  open,
  project,
  onClose,
}: BookBreakdownDialogProps) {
  const [state, setState] = useState<BookBreakdownState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isChoosing, setIsChoosing] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [progress, setProgress] = useState<BookBreakdownProgress | null>(null)
  const [error, setError] = useState("")
  const activeRequestIdRef = useRef("")

  useEffect(() => window.authorDesk.bookBreakdown.onProgress((nextProgress) => {
    if (!nextProgress.requestId || nextProgress.requestId !== activeRequestIdRef.current) return
    setProgress(nextProgress)
  }), [])

  useEffect(() => {
    if (!open) return
    let isCurrent = true
    setIsLoading(true)
    setError("")
    window.authorDesk.bookBreakdown.get(project.path)
      .then((nextState) => {
        if (isCurrent) setState(nextState)
      })
      .catch((loadError) => {
        if (isCurrent) setError(formatError(loadError))
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [open, project.path])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  async function chooseSource() {
    if (
      state?.report
      && !window.confirm("重新导入 TXT 会清除当前拆书结果，确定继续吗？")
    ) return
    setIsChoosing(true)
    setError("")
    try {
      const nextState = await window.authorDesk.bookBreakdown.chooseSource(project.path)
      setState(nextState)
      setProgress(null)
    } catch (chooseError) {
      setError(formatError(chooseError))
    } finally {
      setIsChoosing(false)
    }
  }

  async function analyze() {
    if (!state?.sourcePath || isAnalyzing) return
    const requestId = `breakdown-${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeRequestIdRef.current = requestId
    setIsAnalyzing(true)
    setIsStopping(false)
    setError("")
    setProgress({
      requestId,
      phase: "reading",
      label: "正在准备拆书…",
      completed: 0,
      total: 1,
    })
    try {
      const nextState = await window.authorDesk.bookBreakdown.analyze({
        requestId,
        projectPath: project.path,
      })
      setState(nextState)
    } catch (analysisError) {
      const message = formatError(analysisError)
      if (/AI_REQUEST_CANCELED|AI 请求已由用户停止/i.test(message)) {
        setError("")
        setProgress((current) => current
          ? { ...current, label: "已停止，分段进度已保留" }
          : null)
      } else {
        setError(message)
      }
    } finally {
      if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = ""
      setIsAnalyzing(false)
      setIsStopping(false)
    }
  }

  async function stopAnalysis() {
    const requestId = activeRequestIdRef.current
    if (!requestId || isStopping) return
    setIsStopping(true)
    try {
      await window.authorDesk.bookBreakdown.cancel(requestId)
    } catch (stopError) {
      setError(formatError(stopError))
      setIsStopping(false)
    }
  }

  const progressPercent = useMemo(() => {
    if (!progress?.total) return 0
    return Math.min(100, Math.max(0, ((progress.completed || 0) / progress.total) * 100))
  }, [progress])

  if (!open) return null

  const report = state?.report

  return (
    <div
      className="fixed inset-0 z-[109] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-breakdown-title"
        className="flex h-[min(880px,calc(100vh-40px))] w-[min(1280px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-border bg-white px-6 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <BookOpenCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="book-breakdown-title" className="truncate text-base font-semibold">
              拆书研究
              <span className="ml-2 font-normal text-muted-foreground">· {project.name}</span>
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              从本地 TXT 提取故事阶段、情节转折和可借鉴的高层机制
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="outline" disabled={isChoosing || isAnalyzing} onClick={chooseSource}>
              {isChoosing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {state?.sourcePath ? "更换 TXT" : "导入 TXT"}
            </Button>
            {isAnalyzing ? (
              <Button variant="outline" disabled={isStopping} onClick={stopAnalysis}>
                {isStopping
                  ? <LoaderCircle className="size-4 animate-spin" />
                  : <Square className="size-3.5 fill-current" />}
                {isStopping ? "正在停止" : "停止"}
              </Button>
            ) : (
              <Button disabled={!state?.sourcePath || isLoading} onClick={analyze}>
                {report ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
                {report ? "重新拆解" : "开始拆书"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="打开拆书目录"
              title="打开拆书目录"
              onClick={() => window.authorDesk.bookBreakdown.openDirectory(project.path)}
            >
              <FolderOpen className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="关闭拆书研究" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex shrink-0 items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading && !state ? (
            <div className="grid h-full place-items-center rounded-xl border border-border bg-white">
              <div className="text-center text-muted-foreground">
                <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
                <p className="mt-3 text-sm">正在读取拆书资料…</p>
              </div>
            </div>
          ) : !state?.sourcePath ? (
            <div className="grid h-full min-h-[480px] place-items-center rounded-xl border border-dashed border-primary/25 bg-white">
              <div className="max-w-md px-8 text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-secondary text-primary">
                  <FileText className="size-7" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">导入一本本地 TXT 小说</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  文件会复制到当前作品的“参考小说/拆书”目录。AI 只提炼剧情结构，不会自动修改你的正文。
                </p>
                <Button className="mt-6" onClick={chooseSource}>
                  <Upload className="size-4" />
                  选择 TXT 文件
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="flex items-center gap-4 rounded-xl border border-border bg-white px-5 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <FileText className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{state.sourceName}</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatNumber(state.characterCount)} 字
                    {" · "}{formatBytes(state.sourceBytes)}
                    {" · "}导入于 {formatTime(state.importedAt)}
                  </p>
                </div>
                {state.generatedAt && (
                  <div className="text-right text-[10px] text-muted-foreground">
                    <p>{state.model}</p>
                    <p className="mt-1">{state.analyzedChunks} 段 · {formatTime(state.generatedAt)}</p>
                  </div>
                )}
              </section>

              {(isAnalyzing || progress) && (
                <section className="rounded-xl border border-primary/15 bg-secondary/55 px-5 py-4">
                  <div className="flex items-center gap-3">
                    {isAnalyzing
                      ? <LoaderCircle className="size-4 animate-spin text-primary" />
                      : <Clock3 className="size-4 text-primary" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-medium text-primary">{progress?.label}</p>
                        {Boolean(progress?.total) && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {progress?.completed || 0}/{progress?.total}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {!report ? (
                <section className="grid min-h-[420px] place-items-center rounded-xl border border-border bg-white">
                  <div className="max-w-md text-center">
                    <Route className="mx-auto size-9 text-primary" />
                    <h3 className="mt-4 text-base font-semibold">TXT 已准备好</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      拆解过程会覆盖全文，并按批次保存进度。内容较长时可以关闭弹窗，或停止后稍后继续。
                    </p>
                    {!isAnalyzing && (
                      <Button className="mt-5" onClick={analyze}>
                        <Sparkles className="size-4" />
                        开始分析故事发展
                      </Button>
                    )}
                  </div>
                </section>
              ) : (
                <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-4">
                  <main className="space-y-4">
                    <section className="rounded-xl border border-border bg-white p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">故事总览</p>
                      <h3 className="mt-2 text-lg font-semibold leading-7">{report.premise}</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{report.overview}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {report.themes.map((theme) => (
                          <span key={theme} className="rounded-full bg-secondary px-3 py-1 text-[10px] font-medium text-primary">
                            {theme}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 rounded-lg bg-muted/45 px-4 py-3">
                        <p className="text-[10px] font-medium text-muted-foreground">核心冲突</p>
                        <p className="mt-1 text-xs leading-5">{report.centralConflict}</p>
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-5">
                      <div className="flex items-center gap-2">
                        <Route className="size-4 text-primary" />
                        <h3 className="text-sm font-semibold">情节发展时间线</h3>
                        <span className="ml-auto text-[10px] text-muted-foreground">{report.beats.length} 个关键节点</span>
                      </div>
                      <div className="mt-5 space-y-0">
                        {report.beats.map((beat, index) => (
                          <article key={`${beat.order}-${beat.stage}`} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-5">
                            {index < report.beats.length - 1 && (
                              <span className="absolute bottom-0 left-[15px] top-8 w-px bg-primary/15" />
                            )}
                            <span className="relative z-10 grid size-8 place-items-center rounded-full border border-primary/15 bg-secondary text-[10px] font-semibold text-primary">
                              {beat.order}
                            </span>
                            <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-sm font-semibold">{beat.stage}</h4>
                                  <p className="mt-1 text-[10px] text-muted-foreground">{beat.chapterRange}</p>
                                </div>
                                <div className="flex shrink-0 gap-1" title={`张力 ${beat.tension}/5`}>
                                  {[1, 2, 3, 4, 5].map((level) => (
                                    <span
                                      key={level}
                                      className={`h-4 w-1.5 rounded-full ${level <= beat.tension ? "bg-primary" : "bg-border"}`}
                                    />
                                  ))}
                                </div>
                              </div>
                              <p className="mt-3 text-xs leading-5">{beat.event}</p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] leading-4">
                                <p className="rounded-lg bg-white px-3 py-2"><span className="text-muted-foreground">结构作用：</span>{beat.function}</p>
                                <p className="rounded-lg bg-white px-3 py-2"><span className="text-muted-foreground">主要冲突：</span>{beat.conflict}</p>
                                <p className="rounded-lg bg-white px-3 py-2"><span className="text-muted-foreground">关键转折：</span>{beat.turn}</p>
                                <p className="rounded-lg bg-white px-3 py-2"><span className="text-muted-foreground">后续影响：</span>{beat.consequence}</p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-5">
                      <h3 className="text-sm font-semibold">故事阶段</h3>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {report.storyPhases.map((phase, index) => (
                          <article key={`${phase.name}-${index}`} className="rounded-xl border border-border bg-muted/20 p-4">
                            <p className="text-[10px] font-medium text-primary">{phase.range}</p>
                            <h4 className="mt-1 text-sm font-semibold">{phase.name}</h4>
                            <p className="mt-2 text-[10px] leading-4"><span className="text-muted-foreground">阶段目标：</span>{phase.goal}</p>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{phase.development}</p>
                            <p className="mt-2 text-[10px] leading-4"><span className="text-muted-foreground">阶段结果：</span>{phase.result}</p>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border bg-white p-5">
                        <h3 className="text-sm font-semibold">冲突升级链</h3>
                        <ol className="mt-4 space-y-3">
                          {report.conflictEscalation.map((item, index) => (
                            <li key={item} className="flex gap-3 text-xs leading-5">
                              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[9px] font-semibold text-primary">
                                {index + 1}
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="rounded-xl border border-border bg-white p-5">
                        <h3 className="text-sm font-semibold">伏笔与回收</h3>
                        <div className="mt-4 space-y-3">
                          {report.setupPayoffs.map((item, index) => (
                            <article key={`${item.setup}-${index}`} className="rounded-lg bg-muted/30 px-3.5 py-3">
                              <p className="text-[10px] leading-4"><span className="text-muted-foreground">埋设：</span>{item.setup}</p>
                              <p className="mt-1.5 text-[10px] leading-4"><span className="text-muted-foreground">回收：</span>{item.payoff}</p>
                              <p className="mt-1.5 text-[10px] leading-4 text-primary">{item.effect}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    </section>
                  </main>

                  <aside className="space-y-4">
                    <section className="rounded-xl border border-border bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="size-4 text-primary" />
                        <h3 className="text-sm font-semibold">可借鉴机制</h3>
                      </div>
                      <div className="mt-3 space-y-3">
                        {report.reusablePatterns.map((pattern, index) => (
                          <article key={`${pattern.title}-${index}`} className="rounded-xl bg-secondary/45 p-3.5">
                            <h4 className="text-xs font-semibold">{pattern.title}</h4>
                            <p className="mt-2 text-[11px] leading-5">{pattern.mechanism}</p>
                            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{pattern.whyItWorks}</p>
                            {pattern.adaptationDirections.length > 0 && (
                              <ul className="mt-2 space-y-1 text-[10px] leading-4 text-primary">
                                {pattern.adaptationDirections.map((direction) => (
                                  <li key={direction}>· {direction}</li>
                                ))}
                              </ul>
                            )}
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4">
                      <div className="flex items-center gap-2">
                        <UsersRound className="size-4 text-primary" />
                        <h3 className="text-sm font-semibold">人物弧线</h3>
                      </div>
                      <div className="mt-3 space-y-2">
                        {report.characterArcs.map((arc) => (
                          <details key={`${arc.name}-${arc.role}`} className="rounded-lg border border-border px-3 py-2.5">
                            <summary className="cursor-pointer list-none text-xs font-medium">
                              {arc.name}
                              <span className="ml-2 text-[9px] text-muted-foreground">{arc.role}</span>
                            </summary>
                            <div className="mt-2 space-y-1.5 text-[10px] leading-4 text-muted-foreground">
                              <p><span className="text-foreground">起点：</span>{arc.start}</p>
                              <p><span className="text-foreground">欲望：</span>{arc.desire}</p>
                              <p><span className="text-foreground">变化：</span>{arc.change}</p>
                              <p><span className="text-foreground">终点：</span>{arc.end}</p>
                            </div>
                          </details>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-primary" />
                        <h3 className="text-sm font-semibold">原创提醒</h3>
                      </div>
                      <ul className="mt-3 space-y-2 text-[10px] leading-4 text-muted-foreground">
                        {report.originalityWarnings.map((warning) => (
                          <li key={warning} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4">
                      <h3 className="text-sm font-semibold">节奏规律</h3>
                      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{report.pacing}</p>
                    </section>
                  </aside>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
