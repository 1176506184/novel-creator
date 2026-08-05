import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Clock3,
  FileClock,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  ChapterDocument,
  ChapterHistoryDetail,
  ChapterHistoryEntry,
  ChapterHistoryState,
  ChapterSummary,
  LibraryProject,
} from "@/types/library"

type ChapterHistoryDialogProps = {
  open: boolean
  project: LibraryProject
  chapter: ChapterSummary
  canRestore: boolean
  onClose: () => void
  onRestored: (document: ChapterDocument) => void
}

type DiffLine = {
  kind: "header" | "hunk" | "removed" | "added" | "context" | "meta"
  content: string
  oldLine: number | null
  newLine: number | null
}

function formatHistoryError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  return rawMessage
    .replace(/^Error invoking remote method ['"]project:[^'"]+['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    || "章节历史操作失败"
}

function formatHistoryTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知时间"
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`
}

function parseDiff(diff: string) {
  let oldLine: number | null = null
  let newLine: number | null = null
  let additions = 0
  let removals = 0
  const lines: DiffLine[] = diff.split(/\r?\n/).map((line) => {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      return { kind: "header", content: line, oldLine: null, newLine: null }
    }
    if (line.startsWith("@@")) {
      const range = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldLine = range ? Number(range[1]) : null
      newLine = range ? Number(range[2]) : null
      return { kind: "hunk", content: line, oldLine: null, newLine: null }
    }
    if (line.startsWith("-")) {
      const currentOldLine = oldLine
      if (oldLine !== null) oldLine += 1
      removals += 1
      return { kind: "removed", content: line.slice(1), oldLine: currentOldLine, newLine: null }
    }
    if (line.startsWith("+")) {
      const currentNewLine = newLine
      if (newLine !== null) newLine += 1
      additions += 1
      return { kind: "added", content: line.slice(1), oldLine: null, newLine: currentNewLine }
    }
    if (line.startsWith("\\")) {
      return { kind: "meta", content: line, oldLine: null, newLine: null }
    }
    const currentOldLine = oldLine
    const currentNewLine = newLine
    if (oldLine !== null) oldLine += 1
    if (newLine !== null) newLine += 1
    return {
      kind: "context",
      content: line.startsWith(" ") ? line.slice(1) : line,
      oldLine: currentOldLine,
      newLine: currentNewLine,
    }
  })
  return { lines, additions, removals }
}

function HistoryDiff({ detail }: { detail: ChapterHistoryDetail }) {
  const parsed = useMemo(() => parseDiff(detail.diff), [detail.diff])
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-[#fffdfc]">
      <div className="flex min-h-10 items-center gap-2 border-b border-border bg-white px-3">
        <span className="text-[11px] font-medium text-muted-foreground">历史版本 → 当前版本</span>
        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
          删除 -{parsed.removals}
        </span>
        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          新增 +{parsed.additions}
        </span>
        {detail.sameAsCurrent && (
          <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-primary">
            与当前版本一致
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-5 select-text">
        {parsed.lines.map((line, index) => {
          const rowClass = line.kind === "removed"
            ? "bg-red-50/90 text-red-900"
            : line.kind === "added"
              ? "bg-emerald-50/90 text-emerald-900"
              : line.kind === "hunk"
                ? "bg-blue-50 text-blue-700"
                : line.kind === "header"
                  ? "bg-muted/35 font-semibold text-muted-foreground"
                  : line.kind === "meta"
                    ? "bg-amber-50 text-amber-700"
                    : "text-foreground/80"
          const marker = line.kind === "removed" ? "-" : line.kind === "added" ? "+" : ""
          return (
            <div
              key={`${line.kind}-${index}`}
              className={`grid min-w-max grid-cols-[42px_42px_22px_minmax(360px,1fr)] ${rowClass}`}
            >
              <span className="border-r border-border/50 px-1 py-0.5 text-right text-muted-foreground/75">
                {line.oldLine ?? ""}
              </span>
              <span className="border-r border-border/50 px-1 py-0.5 text-right text-muted-foreground/75">
                {line.newLine ?? ""}
              </span>
              <span
                className={`py-0.5 text-center font-bold ${
                  line.kind === "removed"
                    ? "text-red-600"
                    : line.kind === "added"
                      ? "text-emerald-600"
                      : "text-muted-foreground"
                }`}
              >
                {marker}
              </span>
              <code className="block min-w-max whitespace-pre px-2 py-0.5">{line.content || " "}</code>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HistoryListItem({
  entry,
  active,
  onClick,
}: {
  entry: ChapterHistoryEntry
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
        active
          ? "border-primary/20 bg-secondary text-foreground"
          : "border-transparent hover:border-border hover:bg-muted/45"
      }`}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 text-xs font-semibold">
        <Clock3 className={active ? "size-3.5 text-primary" : "size-3.5 text-muted-foreground"} />
        {formatHistoryTime(entry.createdAt)}
      </span>
      <span className="mt-1.5 flex items-center gap-2 pl-5.5 text-[10px] text-muted-foreground">
        <span>{entry.characterCount.toLocaleString("zh-CN")} 字</span>
        <span className="size-0.5 rounded-full bg-muted-foreground/45" />
        <span>{formatBytes(entry.byteSize)}</span>
      </span>
    </button>
  )
}

export function ChapterHistoryDialog({
  open,
  project,
  chapter,
  canRestore,
  onClose,
  onRestored,
}: ChapterHistoryDialogProps) {
  const [history, setHistory] = useState<ChapterHistoryState | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [detail, setDetail] = useState<ChapterHistoryDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState("")
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isRestoring) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isRestoring, onClose, open])

  useEffect(() => {
    if (!open) return
    let canceled = false
    setIsLoading(true)
    setError("")
    window.authorDesk.project.listChapterHistory(project.path, chapter.name)
      .then((nextHistory) => {
        if (canceled) return
        setHistory(nextHistory)
        setSelectedId((current) => (
          nextHistory.entries.some((entry) => entry.id === current)
            ? current
            : nextHistory.entries[0]?.id || ""
        ))
      })
      .catch((loadError) => {
        if (!canceled) setError(formatHistoryError(loadError))
      })
      .finally(() => {
        if (!canceled) setIsLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [chapter.name, open, project.path, refreshVersion])

  useEffect(() => {
    if (!open || !selectedId) {
      setDetail(null)
      return
    }
    let canceled = false
    setIsLoadingDetail(true)
    setError("")
    window.authorDesk.project.getChapterHistory(project.path, chapter.name, selectedId)
      .then((nextDetail) => {
        if (!canceled) setDetail(nextDetail)
      })
      .catch((loadError) => {
        if (!canceled) setError(formatHistoryError(loadError))
      })
      .finally(() => {
        if (!canceled) setIsLoadingDetail(false)
      })
    return () => {
      canceled = true
    }
  }, [chapter.name, open, project.path, selectedId, refreshVersion])

  if (!open) return null

  async function restoreSelectedHistory() {
    if (!selectedId || !detail || detail.sameAsCurrent || isRestoring || !canRestore) return
    const displayName = chapter.name.replace(/\.(txt|md|markdown)$/i, "")
    if (!window.confirm(
      `确定把“${displayName}”还原到 ${formatHistoryTime(detail.createdAt)} 的版本吗？\n\n当前内容会先自动保存到历史记录，可以再次恢复。`,
    )) return
    setIsRestoring(true)
    setError("")
    try {
      const result = await window.authorDesk.project.restoreChapterHistory(
        project.path,
        chapter.name,
        selectedId,
      )
      onRestored(result.document)
      setHistory(result.history)
      setRefreshVersion((current) => current + 1)
    } catch (restoreError) {
      setError(formatHistoryError(restoreError))
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isRestoring) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-history-title"
        className="flex h-[min(720px,calc(100vh-48px))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(44,25,17,0.18)]"
      >
        <header className="flex h-17 shrink-0 items-center gap-3 border-b border-border px-5">
          <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
            <FileClock className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 id="chapter-history-title" className="truncate text-sm font-semibold">
              章节历史 · {chapter.name.replace(/\.(txt|md|markdown)$/i, "")}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              自动保留最近 {history?.limit || 10} 次实际修改，还原前会备份当前版本
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            disabled={isRestoring}
            aria-label="关闭章节历史"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-4 p-5">
          <aside className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/15">
            <div className="flex h-11 shrink-0 items-center border-b border-border px-3.5">
              <span className="text-xs font-semibold">修改记录</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {history?.entries.length || 0} / {history?.limit || 10}
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="grid h-28 place-items-center text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                </div>
              ) : history?.entries.length ? (
                history.entries.map((entry) => (
                  <HistoryListItem
                    key={entry.id}
                    entry={entry}
                    active={entry.id === selectedId}
                    onClick={() => setSelectedId(entry.id)}
                  />
                ))
              ) : (
                <div className="flex h-full min-h-56 flex-col items-center justify-center px-5 text-center">
                  <div className="grid size-11 place-items-center rounded-xl bg-white text-muted-foreground shadow-sm">
                    <FileClock className="size-4.5" />
                  </div>
                  <p className="mt-3 text-xs font-semibold">还没有历史记录</p>
                  <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                    下次保存实际修改后，这里会自动出现旧版本。
                  </p>
                </div>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex min-h-10 items-center gap-3">
              <div>
                <p className="text-xs font-semibold">
                  {detail ? formatHistoryTime(detail.createdAt) : "选择一个历史版本"}
                </p>
                {detail && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {detail.characterCount.toLocaleString("zh-CN")} 字 · {formatBytes(detail.byteSize)}
                  </p>
                )}
              </div>
              {!canRestore && (
                <span className="ml-auto text-[10px] text-amber-700">
                  差异基于磁盘已保存内容，请先保存后再还原
                </span>
              )}
              <Button
                size="sm"
                className={canRestore ? "ml-auto" : ""}
                disabled={!detail || detail.sameAsCurrent || isRestoring || !canRestore}
                onClick={restoreSelectedHistory}
              >
                {isRestoring ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {detail?.sameAsCurrent ? "当前版本" : isRestoring ? "正在还原" : "还原此版本"}
              </Button>
            </div>

            {isLoadingDetail ? (
              <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-border bg-muted/10 text-muted-foreground">
                <div className="flex items-center gap-2 text-xs">
                  <LoaderCircle className="size-4 animate-spin" />
                  正在生成差异…
                </div>
              </div>
            ) : detail ? (
              <HistoryDiff detail={detail} />
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-dashed border-border bg-muted/10 text-center">
                <div>
                  <FileClock className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-3 text-xs font-semibold">选择左侧记录查看差异</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">红色为历史内容，绿色为当前新增内容</p>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
