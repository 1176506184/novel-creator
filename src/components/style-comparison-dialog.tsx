import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  Scale,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  StyleComparisonArticle,
  StyleComparisonReport,
} from "@/types/library"

type StyleComparisonDialogProps = {
  open: boolean
  defaultPath?: string
  onClose: () => void
}

const comparisonDimensions = [
  "叙事视角",
  "节奏推进",
  "句式与段落",
  "对白表现",
  "描写质感",
  "情绪感染",
  "词汇与修辞",
  "篇章结构",
  "阅读流畅度",
  "类型适配度",
]

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN")
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  } catch {
    return value
  }
}

function cleanIpcError(error: unknown) {
  const raw = error instanceof Error ? error.message : "文风对比失败"
  return raw
    .replace(/^Error invoking remote method ['"]style-comparison:[^'"]+['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

type ArticlePickerProps = {
  label: string
  accent: "tomato" | "blue"
  article: StyleComparisonArticle | null
  mode: "file" | "text"
  inputTitle: string
  inputContent: string
  disabled: boolean
  onChoose: () => void
  onModeChange: (mode: "file" | "text") => void
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
}

function ArticlePicker({
  label,
  accent,
  article,
  mode,
  inputTitle,
  inputContent,
  disabled,
  onChoose,
  onModeChange,
  onTitleChange,
  onContentChange,
}: ArticlePickerProps) {
  const isTomato = accent === "tomato"
  const inputCharacterCount = inputContent.replace(/\s/g, "").length
  const isReady = mode === "file" ? Boolean(article) : inputCharacterCount >= 100
  return (
    <section className={`min-w-0 rounded-xl border bg-white p-4 transition-colors ${
      isReady
        ? isTomato ? "border-primary/30" : "border-blue-200"
        : "border-dashed border-border"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${
          isTomato ? "bg-secondary text-primary" : "bg-blue-50 text-blue-600"
        }`}>
          <span className="text-sm font-bold">{label}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">
            评审文章 {label}
          </p>
          <h3
            className="mt-1 truncate text-sm font-semibold"
            title={mode === "file" ? article?.name : inputTitle}
          >
            {mode === "file"
              ? article?.name || "尚未选择文章"
              : inputTitle.trim() || `输入文章 ${label}`}
          </h3>
        </div>
        {mode === "file" && (
          <Button variant="outline" size="sm" disabled={disabled} onClick={onChoose}>
            <Upload className="size-3.5" />
            {article ? "更换" : "选择"}
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-lg bg-muted/55 p-1">
        <button
          type="button"
          disabled={disabled}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors ${
            mode === "file" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onModeChange("file")}
        >
          <FileText className="size-3.5" />
          本地文件
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors ${
            mode === "text" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onModeChange("text")}
        >
          <ClipboardPaste className="size-3.5" />
          粘贴正文
        </button>
      </div>

      {mode === "file" ? (
        article ? (
          <>
            <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-foreground/65">
              {article.preview || "文章已读取，等待 AI 评审。"}
            </p>
            <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-[10px] text-muted-foreground">
              <span>{formatNumber(article.characterCount)} 字</span>
              <span className="size-1 rounded-full bg-border" />
              <span>取样 {formatNumber(article.sampledCharacters)} 字</span>
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={disabled}
            className="mt-3 grid min-h-24 w-full place-items-center rounded-lg border border-dashed border-border bg-muted/25 text-xs text-muted-foreground transition-colors hover:border-primary/25 hover:bg-secondary/30 hover:text-primary"
            onClick={onChoose}
          >
            <span>
              <Upload className="mx-auto mb-2 size-4" />
              选择 TXT、MD 或 MARKDOWN
            </span>
          </button>
        )
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={inputTitle}
            maxLength={120}
            disabled={disabled}
            placeholder={`文章 ${label} 标题（可选）`}
            className="h-9 w-full rounded-lg border border-input bg-white px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <textarea
            value={inputContent}
            maxLength={500_000}
            disabled={disabled}
            placeholder={`在这里粘贴文章 ${label} 的正文，至少 100 字……`}
            className="h-28 w-full resize-none rounded-lg border border-input bg-white px-3 py-2.5 text-xs leading-5 outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
            onChange={(event) => onContentChange(event.target.value)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{inputCharacterCount < 100 ? `还需 ${100 - inputCharacterCount} 字` : "已满足评审长度"}</span>
            <span className="tabular-nums">{formatNumber(inputCharacterCount)} / 500,000 字</span>
          </div>
        </div>
      )}
    </section>
  )
}

function BulletList({
  items,
  tone = "default",
}: {
  items: string[]
  tone?: "default" | "positive" | "warning"
}) {
  if (!items.length) {
    return <p className="text-xs text-muted-foreground">暂无明确结论</p>
  }
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-foreground/75">
          {tone === "positive" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
          ) : tone === "warning" ? (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          ) : (
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
          )}
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

export function StyleComparisonDialog({
  open,
  defaultPath,
  onClose,
}: StyleComparisonDialogProps) {
  const [articleA, setArticleA] = useState<StyleComparisonArticle | null>(null)
  const [articleB, setArticleB] = useState<StyleComparisonArticle | null>(null)
  const [modeA, setModeA] = useState<"file" | "text">("file")
  const [modeB, setModeB] = useState<"file" | "text">("file")
  const [inputTitleA, setInputTitleA] = useState("")
  const [inputTitleB, setInputTitleB] = useState("")
  const [inputContentA, setInputContentA] = useState("")
  const [inputContentB, setInputContentB] = useState("")
  const [report, setReport] = useState<StyleComparisonReport | null>(null)
  const [choosingSlot, setChoosingSlot] = useState<"A" | "B" | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [progressLabel, setProgressLabel] = useState("")
  const [error, setError] = useState("")
  const requestIdRef = useRef("")
  const isArticleAReady = modeA === "file"
    ? Boolean(articleA)
    : inputContentA.replace(/\s/g, "").length >= 100
  const isArticleBReady = modeB === "file"
    ? Boolean(articleB)
    : inputContentB.replace(/\s/g, "").length >= 100

  useEffect(() => window.authorDesk.styleComparison.onProgress((progress) => {
    if (progress.requestId !== requestIdRef.current) return
    setProgressLabel(progress.label)
  }), [])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isComparing && !choosingSlot) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [choosingSlot, isComparing, onClose, open])

  async function chooseArticle(slot: "A" | "B") {
    if (choosingSlot || isComparing) return
    setChoosingSlot(slot)
    setError("")
    try {
      const current = slot === "A" ? articleA : articleB
      const selected = await window.authorDesk.styleComparison.chooseArticle(
        current?.path || defaultPath,
      )
      if (!selected) return
      const other = slot === "A" ? articleB : articleA
      const otherMode = slot === "A" ? modeB : modeA
      if (otherMode === "file" && other?.path === selected.path) {
        setError("两边不能选择同一篇文章，请更换其中一篇。")
        return
      }
      if (slot === "A") setArticleA(selected)
      else setArticleB(selected)
      setReport(null)
    } catch (chooseError) {
      setError(cleanIpcError(chooseError))
    } finally {
      setChoosingSlot(null)
    }
  }

  function swapArticles() {
    if (isComparing || choosingSlot) return
    setArticleA(articleB)
    setArticleB(articleA)
    setModeA(modeB)
    setModeB(modeA)
    setInputTitleA(inputTitleB)
    setInputTitleB(inputTitleA)
    setInputContentA(inputContentB)
    setInputContentB(inputContentA)
    setReport(null)
    setError("")
  }

  async function compareArticles() {
    if (!isArticleAReady || !isArticleBReady || isComparing) return
    const requestId = `style-compare-${Date.now()}-${Math.random().toString(36).slice(2)}`
    requestIdRef.current = requestId
    setIsComparing(true)
    setProgressLabel("正在准备两篇文章…")
    setError("")
    setReport(null)
    try {
      const nextReport = await window.authorDesk.styleComparison.compare({
        requestId,
        articleAPath: modeA === "file" ? articleA?.path : undefined,
        articleBPath: modeB === "file" ? articleB?.path : undefined,
        articleAName: modeA === "text" ? inputTitleA : undefined,
        articleBName: modeB === "text" ? inputTitleB : undefined,
        articleAContent: modeA === "text" ? inputContentA : undefined,
        articleBContent: modeB === "text" ? inputContentB : undefined,
      })
      setReport(nextReport)
    } catch (compareError) {
      setError(cleanIpcError(compareError))
    } finally {
      setIsComparing(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isComparing && !choosingSlot) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="style-comparison-title"
        className="flex h-[min(900px,calc(100vh-40px))] w-[min(1180px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-white px-6 py-4">
          <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
            <Scale className="size-4.5" />
          </div>
          <div>
            <h2 id="style-comparison-title" className="text-sm font-semibold">AI 文风对比</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              两篇文章 · 十个维度 · 独立评分与编辑建议
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {report && (
              <Button variant="outline" size="sm" disabled={isComparing} onClick={compareArticles}>
                <RefreshCw className="size-3.5" />
                重新评审
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭文风对比"
              disabled={isComparing || Boolean(choosingSlot)}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="shrink-0 border-b border-border bg-white/70 px-6 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-3">
            <ArticlePicker
              label="A"
              accent="tomato"
              article={articleA}
              mode={modeA}
              inputTitle={inputTitleA}
              inputContent={inputContentA}
              disabled={Boolean(choosingSlot) || isComparing}
              onChoose={() => chooseArticle("A")}
              onModeChange={(mode) => {
                setModeA(mode)
                setReport(null)
                setError("")
              }}
              onTitleChange={(value) => {
                setInputTitleA(value)
                setReport(null)
              }}
              onContentChange={(value) => {
                setInputContentA(value)
                setReport(null)
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              title="交换两篇文章"
              aria-label="交换两篇文章"
              disabled={
                !isArticleAReady && !isArticleBReady
                || Boolean(choosingSlot)
                || isComparing
              }
              onClick={swapArticles}
            >
              <ArrowLeftRight className="size-4" />
            </Button>
            <ArticlePicker
              label="B"
              accent="blue"
              article={articleB}
              mode={modeB}
              inputTitle={inputTitleB}
              inputContent={inputContentB}
              disabled={Boolean(choosingSlot) || isComparing}
              onChoose={() => chooseArticle("B")}
              onModeChange={(mode) => {
                setModeB(mode)
                setReport(null)
                setError("")
              }}
              onTitleChange={(value) => {
                setInputTitleB(value)
                setReport(null)
              }}
              onContentChange={(value) => {
                setInputContentB(value)
                setReport(null)
              }}
            />
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {isComparing ? (
            <div className="grid min-h-[420px] place-items-center rounded-2xl border border-primary/15 bg-white">
              <div className="max-w-md text-center">
                <div className="relative mx-auto size-16">
                  <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/10" />
                  <div className="relative grid size-16 place-items-center rounded-2xl bg-secondary text-primary">
                    <Sparkles className="size-6 animate-pulse" />
                  </div>
                </div>
                <h3 className="mt-5 text-base font-semibold">AI 正在评审两篇文章</h3>
                <p className="mt-2 text-sm text-muted-foreground">{progressLabel}</p>
                <div className="mx-auto mt-5 flex max-w-sm flex-wrap justify-center gap-2">
                  {comparisonDimensions.map((dimension) => (
                    <span key={dimension} className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                      {dimension}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : report ? (
            <div className="space-y-5">
              <section className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                <div className="grid place-items-center rounded-2xl border border-primary/15 bg-gradient-to-br from-secondary to-white p-5 text-center">
                  <div className="grid size-20 place-items-center rounded-full border-[7px] border-primary/15 bg-white text-primary">
                    <span className="text-2xl font-semibold tabular-nums">{report.similarityScore}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold">文风相似度</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">满分 100</p>
                </div>
                <div className="rounded-2xl border border-border bg-white p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Sparkles className="size-4" />
                    总体评审
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground/80">{report.overview}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
                    <span>模型：{report.model}</span>
                    <span>生成：{formatTime(report.generatedAt)}</span>
                    <span>A 取样 {formatNumber(report.sources.articleA.sampledCharacters)} 字</span>
                    <span>B 取样 {formatNumber(report.sources.articleB.sampledCharacters)} 字</span>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                {([
                  { label: "A", review: report.articleA, tone: "tomato" },
                  { label: "B", review: report.articleB, tone: "blue" },
                ] as const).map(({ label, review, tone }) => (
                  <section key={label} className="rounded-2xl border border-border bg-white p-5">
                    <div className="flex items-center gap-3">
                      <span className={`grid size-8 place-items-center rounded-lg text-sm font-bold ${
                        tone === "tomato" ? "bg-secondary text-primary" : "bg-blue-50 text-blue-600"
                      }`}>
                        {label}
                      </span>
                      <h3 className="truncate text-sm font-semibold">{review.name}</h3>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-foreground/75">{review.summary}</p>
                    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                      <div>
                        <p className="mb-3 text-xs font-semibold text-success">风格优势</p>
                        <BulletList items={review.strengths} tone="positive" />
                      </div>
                      <div>
                        <p className="mb-3 text-xs font-semibold text-amber-600">潜在问题</p>
                        <BulletList items={review.risks} tone="warning" />
                      </div>
                    </div>
                  </section>
                ))}
              </div>

              <section className="rounded-2xl border border-border bg-white">
                <header className="flex items-center gap-2 border-b border-border px-5 py-4">
                  <BarChart3 className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">十维度评分与对照</h3>
                </header>
                <div className="divide-y divide-border">
                  {report.dimensions.map((dimension) => (
                    <article key={dimension.key} className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <h4 className="text-sm font-semibold">{dimension.title}</h4>
                        <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-primary">
                            A {dimension.articleAScore}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-600">
                            B {dimension.articleBScore}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="w-4 text-[10px] font-bold text-primary">A</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${dimension.articleAScore}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="w-4 text-[10px] font-bold text-blue-600">B</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-50">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${dimension.articleBScore}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <p className="rounded-lg bg-secondary/35 px-3 py-2.5 text-xs leading-5 text-foreground/75">
                          {dimension.articleA}
                        </p>
                        <p className="rounded-lg bg-blue-50/60 px-3 py-2.5 text-xs leading-5 text-foreground/75">
                          {dimension.articleB}
                        </p>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        <span className="font-semibold text-foreground/70">关键差异：</span>
                        {dimension.comparison}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-border bg-white p-5">
                  <h3 className="text-sm font-semibold">共同风格特征</h3>
                  <div className="mt-4">
                    <BulletList items={report.similarities} tone="positive" />
                  </div>
                </section>
                <section className="rounded-2xl border border-border bg-white p-5">
                  <h3 className="text-sm font-semibold">核心风格差异</h3>
                  <div className="mt-4">
                    <BulletList items={report.differences} />
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-border bg-white p-5">
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">编辑改进建议</h3>
                </div>
                <div className="mt-4 grid gap-5 lg:grid-cols-3">
                  <div>
                    <p className="mb-3 text-xs font-semibold text-primary">给文章 A</p>
                    <BulletList items={report.recommendations.articleA} />
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-semibold text-blue-600">给文章 B</p>
                    <BulletList items={report.recommendations.articleB} />
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-semibold text-foreground">融合两种文风</p>
                    <BulletList items={report.recommendations.fusion} tone="positive" />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-secondary/70 to-white p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Scale className="size-4" />
                  适用场景与最终结论
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <p className="rounded-xl bg-white/80 p-4 text-xs leading-6 text-foreground/75">
                    <span className="mb-1 block font-semibold text-primary">文章 A 更适合</span>
                    {report.verdict.articleAUseCase}
                  </p>
                  <p className="rounded-xl bg-white/80 p-4 text-xs leading-6 text-foreground/75">
                    <span className="mb-1 block font-semibold text-blue-600">文章 B 更适合</span>
                    {report.verdict.articleBUseCase}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground/80">{report.verdict.conclusion}</p>
              </section>
            </div>
          ) : (
            <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-primary/20 bg-white/70 p-8 text-center">
              <div className="max-w-xl">
                <FileSearch className="mx-auto size-9 text-primary" />
                <h3 className="mt-4 text-base font-semibold">选择两篇文章，交给 AI 做编辑评审</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  系统会均匀读取文章开头、中段和结尾，并从十个维度独立评分，
                  输出风格画像、关键差异、适用场景与可执行建议。
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {comparisonDimensions.map((dimension) => (
                    <span key={dimension} className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                      {dimension}
                    </span>
                  ))}
                </div>
                <Button
                  className="mt-6"
                  disabled={!isArticleAReady || !isArticleBReady}
                  onClick={compareArticles}
                >
                  <Sparkles className="size-4" />
                  开始 AI 多维评审
                </Button>
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-6 py-3 text-[11px] text-muted-foreground">
          <Scale className="size-3.5 text-primary" />
          <span>评分用于横向编辑参考，不等同于作品质量的绝对排名</span>
          <span className="ml-auto">当前 API 模型将使用设置中的推理强度</span>
        </footer>
      </section>
    </div>
  )
}
