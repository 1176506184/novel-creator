import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  FilePenLine,
  FileText,
  LoaderCircle,
  Save,
  Sparkles,
  Square,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LibraryProject } from "@/types/library"

type NovelIntroductionDialogProps = {
  open: boolean
  project: LibraryProject | null
  onClose: () => void
  onSaved: () => void
}

function formatIntroductionError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  return rawMessage
    .replace(/^Error invoking remote method ['"]introduction:[^'"]+['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    || "作品简介处理失败"
}

function isCanceledError(error: unknown) {
  return /AI_REQUEST_CANCELED|AI 请求已由用户停止/i.test(
    error instanceof Error ? error.message : String(error || ""),
  )
}

export function NovelIntroductionDialog({
  open,
  project,
  onClose,
  onSaved,
}: NovelIntroductionDialogProps) {
  const [shortTitle, setShortTitle] = useState("")
  const [synopsis, setSynopsis] = useState("")
  const [customPrompt, setCustomPrompt] = useState("")
  const [baseline, setBaseline] = useState({ shortTitle: "", synopsis: "" })
  const [exists, setExists] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const requestIdRef = useRef("")

  const isDirty = useMemo(() => (
    shortTitle !== baseline.shortTitle || synopsis !== baseline.synopsis
  ), [baseline, shortTitle, synopsis])

  useEffect(() => {
    if (!open || !project) return
    let isCurrent = true
    setIsLoading(true)
    setError("")
    setNotice("")
    setCustomPrompt("")
    window.authorDesk.introduction.get(project.path)
      .then((state) => {
        if (!isCurrent) return
        setShortTitle(state.shortTitle)
        setSynopsis(state.synopsis)
        setBaseline({ shortTitle: state.shortTitle, synopsis: state.synopsis })
        setExists(state.exists)
      })
      .catch((loadError) => {
        if (isCurrent) setError(formatIntroductionError(loadError))
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [open, project])

  function requestClose() {
    if (isSaving) return
    if (isGenerating) {
      if (!window.confirm("AI 正在生成简介，停止生成并关闭吗？")) return
      void stopGeneration()
      onClose()
      return
    }
    if (isDirty && !window.confirm("作品简介尚未保存，确定放弃修改吗？")) return
    onClose()
  }

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  async function generateIntroduction() {
    if (!project || isGenerating || requestIdRef.current) return
    if (isDirty && !window.confirm("AI 生成会替换当前未保存内容，确定继续吗？")) return
    const requestId = `introduction-${Date.now()}-${Math.random().toString(36).slice(2)}`
    requestIdRef.current = requestId
    setIsGenerating(true)
    setError("")
    setNotice("")
    try {
      const draft = await window.authorDesk.introduction.generate({
        requestId,
        projectPath: project.path,
        customPrompt: customPrompt.trim(),
      })
      if (requestIdRef.current !== requestId) return
      setShortTitle(draft.shortTitle)
      setSynopsis(draft.synopsis)
      setNotice(`已根据开篇 ${draft.sourceChapterCount} 章生成草稿，请确认后保存。`)
    } catch (generateError) {
      if (!isCanceledError(generateError)) setError(formatIntroductionError(generateError))
    } finally {
      if (requestIdRef.current === requestId) {
        requestIdRef.current = ""
      }
      setIsGenerating(false)
    }
  }

  async function stopGeneration() {
    const requestId = requestIdRef.current
    if (!requestId) return
    requestIdRef.current = ""
    setIsGenerating(false)
    await window.authorDesk.introduction.cancel(requestId).catch(() => false)
  }

  async function saveIntroduction() {
    if (!project || isSaving || !synopsis.trim()) return
    setIsSaving(true)
    setError("")
    setNotice("")
    try {
      const state = await window.authorDesk.introduction.save(project.path, {
        shortTitle,
        synopsis,
      })
      setShortTitle(state.shortTitle)
      setSynopsis(state.synopsis)
      setBaseline({ shortTitle: state.shortTitle, synopsis: state.synopsis })
      setExists(true)
      setNotice("简介.md 已保存到作品根目录。")
      onSaved()
    } catch (saveError) {
      setError(formatIntroductionError(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  if (!open || !project) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="novel-introduction-title"
        className="flex max-h-[calc(100vh-40px)] w-[min(760px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <FilePenLine className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="novel-introduction-title" className="text-base font-semibold">作品简介</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              《{project.name}》· 自动读取作品根目录中的 简介.md
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="关闭作品简介"
            onClick={requestClose}
            disabled={isSaving}
          >
            <X className="size-4" />
          </Button>
        </header>

        {isLoading ? (
          <div className="grid min-h-96 place-items-center">
            <div className="text-center text-muted-foreground">
              <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
              <p className="mt-3 text-xs">正在读取 简介.md…</p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <div className="rounded-xl border border-primary/10 bg-secondary/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
              AI 会读取开篇最多 8 章，提炼核心卖点与无剧透简介。生成内容只作为草稿，点击保存后才会写入文件。
            </div>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium">
                <span>生成要求 <span className="font-normal text-muted-foreground">（可选）</span></span>
                <span className="text-xs text-muted-foreground">{customPrompt.length}/500</span>
              </span>
              <textarea
                value={customPrompt}
                maxLength={500}
                disabled={isGenerating || isSaving}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="例如：突出悬疑感，弱化感情线；简介控制在 150 字左右，不透露主角的最终能力。"
                className="mt-2 min-h-24 w-full resize-y rounded-xl border border-input bg-secondary/20 px-3.5 py-3 text-sm leading-6 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:bg-white focus:ring-3 focus:ring-primary/10"
              />
              <span className="mt-1.5 block text-xs text-muted-foreground">仅用于本次生成，不会保存到 简介.md。</span>
            </label>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-destructive" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800" role="status">
                <CheckCircle2 className="size-4 shrink-0" />
                {notice}
              </div>
            )}

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium">
                <span>一句话卖点 <span className="font-normal text-muted-foreground">（可选）</span></span>
                <span className={shortTitle.length > 40 ? "text-destructive" : "text-xs text-muted-foreground"}>
                  {shortTitle.length}/40
                </span>
              </span>
              <input
                value={shortTitle}
                maxLength={40}
                disabled={isGenerating || isSaving}
                onChange={(event) => setShortTitle(event.target.value)}
                placeholder="例如：他能看见每个选择背后的代价"
                className="mt-2 h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
              />
              <span className="mt-1.5 block text-xs text-muted-foreground">用于作品卡片上的简短钩子，不会修改作品文件夹名称。</span>
            </label>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium">
                <span>作品简介</span>
                <span className={synopsis.length > 2_000 ? "text-destructive" : "text-xs text-muted-foreground"}>
                  {synopsis.length}/2000
                </span>
              </span>
              <textarea
                value={synopsis}
                maxLength={2_000}
                disabled={isGenerating || isSaving}
                onChange={(event) => setSynopsis(event.target.value)}
                placeholder="介绍主角、初始处境、核心冲突与悬念……"
                className="mt-2 min-h-48 w-full resize-y rounded-xl border border-input bg-white px-3.5 py-3 text-sm leading-7 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
              />
            </label>
          </div>
        )}

        <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-canvas/70 px-6 py-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{exists ? "已关联 简介.md" : "保存后自动创建 简介.md"}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={isGenerating ? stopGeneration : generateIntroduction}
              disabled={isLoading || isSaving || project.chapterCount === 0}
            >
              {isGenerating ? <Square className="size-3.5 fill-current" /> : <Sparkles className="size-4" />}
              {isGenerating ? "停止生成" : "AI 生成"}
            </Button>
            <Button
              onClick={saveIntroduction}
              disabled={isLoading || isSaving || isGenerating || !synopsis.trim() || shortTitle.length > 40 || !isDirty}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSaving ? "正在保存" : "保存简介"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
