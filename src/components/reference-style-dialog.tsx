import { useEffect, useState } from "react"
import {
  BookMarked,
  CheckCircle2,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  LibraryProject,
  ReferenceStyleProfile,
  ReferenceStyleState,
} from "@/types/library"

type ReferenceStyleDialogProps = {
  open: boolean
  project: LibraryProject
  onClose: () => void
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string | null) {
  if (!value) return "尚未生成"
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

const profileSections: Array<{
  key: keyof ReferenceStyleProfile
  title: string
  description: string
}> = [
  { key: "narrative", title: "叙事方式", description: "信息释放与叙述距离" },
  { key: "viewpoint", title: "视角控制", description: "人称、焦点与切换规律" },
  { key: "pacing", title: "剧情节奏", description: "冲突、悬念与推进速度" },
  { key: "sentence", title: "句式段落", description: "语言密度与长短变化" },
  { key: "dialogue", title: "人物对话", description: "对白比例与潜台词" },
  { key: "description", title: "描写习惯", description: "动作、环境、心理与感官" },
  { key: "emotion", title: "情绪表达", description: "情绪强度与递进方式" },
  { key: "vocabulary", title: "用词语气", description: "词汇、修辞与整体语感" },
  { key: "chapterStructure", title: "章节结构", description: "开头、中段与结尾组织" },
]

export function ReferenceStyleDialog({
  open,
  project,
  onClose,
}: ReferenceStyleDialogProps) {
  const [state, setState] = useState<ReferenceStyleState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isChoosing, setIsChoosing] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isChoosing && !isSummarizing) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isChoosing, isSummarizing, onClose, open])

  useEffect(() => {
    if (!open) return
    let isCurrent = true
    setIsLoading(true)
    setError("")
    window.authorDesk.referenceStyle.get(project.path)
      .then((nextState) => {
        if (isCurrent) setState(nextState)
      })
      .catch((loadError) => {
        if (!isCurrent) return
        setError(loadError instanceof Error ? loadError.message : "无法读取参考文风设置")
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [open, project.path])

  async function chooseDirectory() {
    setIsChoosing(true)
    setError("")
    try {
      setState(await window.authorDesk.referenceStyle.chooseDirectory(project.path))
    } catch (chooseError) {
      setError(chooseError instanceof Error ? chooseError.message : "无法选择参考小说目录")
    } finally {
      setIsChoosing(false)
    }
  }

  async function summarizeStyle() {
    setIsSummarizing(true)
    setError("")
    try {
      setState(await window.authorDesk.referenceStyle.summarize(project.path))
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "AI 文风总结失败")
    } finally {
      setIsSummarizing(false)
    }
  }

  if (!open) return null

  const profile = state?.profile

  return (
    <div
      className="fixed inset-0 z-[108] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isChoosing && !isSummarizing) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-style-title"
        className="flex h-[min(820px,calc(100vh-40px))] w-[min(1180px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-border bg-white px-6 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <BookMarked className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="reference-style-title" className="text-base font-semibold">参考文风</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              为《{project.name}》提炼独立的写作风格记忆
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={chooseDirectory} disabled={isChoosing || isSummarizing}>
              {isChoosing ? <LoaderCircle className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
              {state?.sourcePath ? "更换目录" : "选择目录"}
            </Button>
            <Button
              onClick={summarizeStyle}
              disabled={!state?.sourcePath || !state.fileCount || isChoosing || isSummarizing}
            >
              {isSummarizing ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
              {isSummarizing ? "正在分析文风" : profile ? "重新总结" : "总结文风"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="关闭参考文风"
              onClick={onClose}
              disabled={isChoosing || isSummarizing}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-destructive" role="alert">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid h-full place-items-center">
              <div className="text-center text-muted-foreground">
                <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-3 text-xs">正在读取参考文风设置…</p>
              </div>
            </div>
          ) : !state?.sourcePath ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-md text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-secondary text-primary">
                  <BookMarked className="size-7" />
                </div>
                <h3 className="mt-5 text-base font-semibold">接入你的参考小说</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  选择包含 txt、md 或 markdown 小说文件的目录。系统会均匀取样，只读分析文风，不会修改参考文件。
                </p>
                <Button className="mt-5" onClick={chooseDirectory}>
                  <FolderOpen className="size-4" />
                  选择参考小说目录
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_24px_rgba(35,27,23,0.035)]">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                      <FolderOpen className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{state.sourceName || "参考小说"}</h3>
                      <p className="mt-1 text-[11px] text-muted-foreground">只读参考目录</p>
                    </div>
                  </div>
                  <p className="mt-4 break-all rounded-lg bg-muted/50 px-3 py-2 text-[10px] leading-4 text-muted-foreground">
                    {state.sourcePath}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-secondary/55 p-3 text-center">
                      <p className="text-lg font-semibold text-primary">{state.fileCount}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">文本文件</p>
                    </div>
                    <div className="rounded-xl bg-muted/60 p-3 text-center">
                      <p className="text-lg font-semibold">{formatBytes(state.totalBytes)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">目录体积</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => window.authorDesk.referenceStyle.openDirectory(project.path)}
                  >
                    <FolderOpen className="size-3.5" />
                    打开参考目录
                  </Button>
                </section>

                <section className="rounded-2xl border border-border bg-white p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {profile
                      ? <CheckCircle2 className="size-4 text-success" />
                      : <Sparkles className="size-4 text-primary" />}
                    分析状态
                  </div>
                  <div className="mt-4 space-y-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">取样文件</span>
                      <span>{state.sampledFiles.length || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">取样字数</span>
                      <span>{state.sampledCharacters.toLocaleString("zh-CN") || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">分析模型</span>
                      <span className="max-w-36 truncate" title={state.model}>{state.model || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">更新时间</span>
                      <span>{formatTime(state.generatedAt)}</span>
                    </div>
                  </div>
                  {profile && (
                    <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-[10px] leading-4 text-green-700">
                      这套文风已自动加入当前小说的 AI 上下文。
                    </p>
                  )}
                </section>
              </aside>

              <main className="min-w-0 space-y-4">
                {!profile ? (
                  <section className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-primary/20 bg-white/70 p-8 text-center">
                    <div className="max-w-md">
                      <WandSparkles className="mx-auto size-8 text-primary" />
                      <h3 className="mt-4 text-base font-semibold">目录已接入，可以开始总结</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        AI 会从不同位置均匀选取最多 24 个文件样本，生成结构化文风规则。
                      </p>
                      <Button className="mt-5" onClick={summarizeStyle} disabled={!state.fileCount}>
                        <Sparkles className="size-4" />
                        总结这套文风
                      </Button>
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="rounded-2xl border border-primary/10 bg-gradient-to-br from-secondary/80 to-white p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <Sparkles className="size-4" />
                        整体风格画像
                      </div>
                      <p className="mt-3 text-sm leading-7 text-foreground/80">{profile.overview}</p>
                    </section>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {profileSections.map((section) => (
                        <section key={section.key} className="rounded-xl border border-border bg-white p-4">
                          <h4 className="text-sm font-semibold">{section.title}</h4>
                          <p className="mt-1 text-[10px] text-muted-foreground">{section.description}</p>
                          <p className="mt-3 text-xs leading-5 text-foreground/75">
                            {String(profile[section.key])}
                          </p>
                        </section>
                      ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <section className="rounded-xl border border-border bg-white p-4">
                        <h4 className="text-sm font-semibold">可借鉴技巧</h4>
                        <div className="mt-3 space-y-2">
                          {profile.techniques.map((item) => (
                            <div key={item} className="flex gap-2 text-xs leading-5 text-foreground/75">
                              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                      <section className="rounded-xl border border-border bg-white p-4">
                        <h4 className="text-sm font-semibold">需要避免</h4>
                        <div className="mt-3 space-y-2">
                          {profile.avoid.map((item) => (
                            <div key={item} className="flex gap-2 text-xs leading-5 text-foreground/75">
                              <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>

                    <details className="rounded-xl border border-border bg-white">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
                        <FileText className="size-4 text-primary" />
                        查看注入 AI 的完整文风指令
                        <RefreshCw className="ml-auto size-3.5 text-muted-foreground" />
                      </summary>
                      <p className="whitespace-pre-wrap border-t border-border px-4 py-4 text-xs leading-6 text-foreground/75">
                        {profile.writingPrompt}
                      </p>
                    </details>
                  </>
                )}
              </main>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-6 py-3 text-[11px] text-muted-foreground">
          <BookMarked className="size-3.5 text-primary" />
          <span>配置保存在当前小说的 .chat/reference-style.json</span>
          <span className="ml-auto">支持 UTF-8 与常见 GB18030 文本</span>
        </footer>
      </section>
    </div>
  )
}
