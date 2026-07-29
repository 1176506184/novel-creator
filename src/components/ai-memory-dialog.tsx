import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  BookOpenText,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileText,
  FolderTree,
  MessagesSquare,
  ScrollText,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  ChapterSummary,
  CharacterGraph,
  LibraryProject,
  WritingRulesState,
} from "@/types/library"

type MemoryMessage = {
  role: "user" | "assistant"
  content: string
}

type AiMemoryDialogProps = {
  open: boolean
  project: LibraryProject
  chapters: ChapterSummary[]
  activeChapterName: string
  chapterContent: string
  messages: MemoryMessage[]
  isDirty: boolean
  apiConfig: {
    model: string
    reasoningEffort: string
    hasApiKey: boolean
  }
  onClose: () => void
  onOpenCharacterSettings: () => void
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知时间"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function MemoryMap({
  chapterName,
  chapterLength,
  conversationCount,
  graph,
  rules,
  chapterCount,
}: {
  chapterName: string
  chapterLength: number
  conversationCount: number
  graph: CharacterGraph | null
  rules: WritingRulesState | null
  chapterCount: number
}) {
  const nodes = [
    {
      x: 34,
      y: 42,
      width: 220,
      title: "当前章节",
      detail: chapterName ? `${chapterName} · ${chapterLength.toLocaleString("zh-CN")} 字符` : "尚未选择章节",
      active: Boolean(chapterName),
    },
    {
      x: 546,
      y: 42,
      width: 220,
      title: "最近对话",
      detail: `${conversationCount} 条消息进入上下文`,
      active: conversationCount > 0,
    },
    {
      x: 34,
      y: 290,
      width: 220,
      title: "人物长期记忆",
      detail: graph
        ? `${graph.characters.length} 人 · ${graph.relationships.length} 条关系`
        : "尚未生成角色 JSON",
      active: Boolean(graph),
    },
    {
      x: 546,
      y: 290,
      width: 220,
      title: "正文文件库",
      detail: `${chapterCount} 个章节可按需读取`,
      active: chapterCount > 0,
    },
    {
      x: 290,
      y: 290,
      width: 220,
      title: "Trae 写作规则",
      detail: rules?.rules.length
        ? `${rules.rules.length} 个文件 · ${rules.injectedCharacters.toLocaleString("zh-CN")} 字符`
        : "规则目录为空",
      active: Boolean(rules?.rules.length),
    },
  ]

  return (
    <div className="overflow-auto rounded-xl border border-border bg-[#fffdfc] p-3">
      <svg
        viewBox="0 0 800 410"
        className="min-h-[380px] min-w-[680px] w-full"
        role="img"
        aria-label="AI 当前小说记忆来源图"
      >
        <defs>
          <linearGradient id="memory-core-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff7448" />
            <stop offset="100%" stopColor="#ff3d1f" />
          </linearGradient>
        </defs>

        {nodes.map((node) => {
          const startX = node.x < 400 ? node.x + node.width : node.x
          const startY = node.y + 38
          return (
            <line
              key={`line-${node.title}`}
              x1={startX}
              y1={startY}
              x2="400"
              y2="190"
              stroke={node.active ? "#ffc2aa" : "#e8e8e8"}
              strokeWidth={node.active ? "2.5" : "1.5"}
              strokeDasharray={node.title === "正文文件库" ? "7 6" : undefined}
            />
          )
        })}

        <circle cx="400" cy="190" r="72" fill="#fff2eb" />
        <circle cx="400" cy="190" r="55" fill="url(#memory-core-gradient)" />
        <path
          d="M380 176c0-13 10-23 23-23 10 0 19 7 22 16 9 2 16 10 16 20 0 11-8 20-19 21-4 10-13 17-24 17-13 0-24-10-25-23-8-3-14-11-14-20 0-9 5-16 13-20 2-4 5-6 8-8Z"
          fill="none"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="400" y="270" textAnchor="middle" fontSize="13" fontWeight="700" fill="#e94316">
          每次请求重新组装
        </text>

        {nodes.map((node) => (
          <g key={node.title}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height="76"
              rx="16"
              fill={node.active ? "#ffffff" : "#fafafa"}
              stroke={node.active ? "#ffd2c0" : "#eeeeee"}
              strokeWidth="1.5"
            />
            <circle
              cx={node.x + 24}
              cy={node.y + 24}
              r="6"
              fill={node.active ? "#ff4d1f" : "#cfcfcf"}
            />
            <text
              x={node.x + 40}
              y={node.y + 29}
              fontSize="13"
              fontWeight="700"
              fill="#303030"
            >
              {node.title}
            </text>
            <text
              x={node.x + 20}
              y={node.y + 55}
              fontSize="11"
              fill="#8c8c8c"
            >
              {node.detail.length > 28 ? `${node.detail.slice(0, 28)}…` : node.detail}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export function AiMemoryDialog({
  open,
  project,
  chapters,
  activeChapterName,
  chapterContent,
  messages,
  isDirty,
  apiConfig,
  onClose,
  onOpenCharacterSettings,
}: AiMemoryDialogProps) {
  const [characterGraph, setCharacterGraph] = useState<CharacterGraph | null>(null)
  const [writingRules, setWritingRules] = useState<WritingRulesState | null>(null)
  const [isLoadingGraph, setIsLoadingGraph] = useState(false)
  const [graphError, setGraphError] = useState("")

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    let isCancelled = false
    setIsLoadingGraph(true)
    setGraphError("")
    Promise.allSettled([
      window.authorDesk.characters.get(project.path),
      window.authorDesk.rules.get(project.path),
    ])
      .then(([characterResult, rulesResult]) => {
        if (isCancelled) return
        if (characterResult.status === "fulfilled") {
          setCharacterGraph(characterResult.value.graph)
        } else {
          setCharacterGraph(null)
          setGraphError(
            characterResult.reason instanceof Error
              ? characterResult.reason.message
              : "无法读取人物记忆",
          )
        }
        setWritingRules(
          rulesResult.status === "fulfilled"
            ? rulesResult.value
            : null,
        )
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingGraph(false)
      })
    return () => {
      isCancelled = true
    }
  }, [open, project.path])

  const effectiveMessages = useMemo(
    () => messages.filter((message) => message.content.trim()).slice(-24),
    [messages],
  )
  const recentMessages = effectiveMessages.slice(-4).reverse()
  const chapterPayloadLength = Math.min(chapterContent.length, 40_000)
  const totalChapterCharacters = chapters.reduce(
    (total, chapter) => total + chapter.characterCount,
    0,
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-memory-title"
        className="flex h-[min(820px,calc(100vh-40px))] w-[min(1220px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-border bg-white px-6 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <BrainCircuit className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="ai-memory-title" className="truncate text-lg font-semibold">
              AI 记忆
              <span className="ml-2 font-normal text-muted-foreground">· {project.name}</span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              查看下一次对话中模型实际收到和可以按需访问的小说信息
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              {apiConfig.model} · {apiConfig.reasoningEffort}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭 AI 记忆"
              title="关闭"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-4">
            <div className="space-y-4">
              <MemoryMap
                chapterName={activeChapterName}
                chapterLength={chapterPayloadLength}
                conversationCount={effectiveMessages.length}
                graph={characterGraph}
                rules={writingRules}
                chapterCount={chapters.length}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <BookOpenText className="size-4 text-primary" />
                    工作记忆
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-success">
                      <CheckCircle2 className="size-3.5" />
                      已注入
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    当前章节会直接进入请求；最多保留末尾 40,000 个字符。
                    {isDirty && " 当前未保存内容也会进入对话，但 AI 文件工具暂时不可写。"}
                  </p>
                  <div className="mt-3 rounded-lg bg-muted/55 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {activeChapterName || "未选择章节"} · {chapterPayloadLength.toLocaleString("zh-CN")} 字符
                    </p>
                    <p className="mt-1.5 line-clamp-3 select-text text-xs leading-5 text-foreground/75">
                      {chapterContent.slice(-260) || "暂无正文内容"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FolderTree className="size-4 text-primary" />
                    按需文件记忆
                    <span className="ml-auto text-[11px] font-medium text-amber-600">未预先读取</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    AI 知道可以使用文件工具，但只有主动读取后才能看到其他章节内容。
                  </p>
                  <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/55 p-3 text-xs">
                    <FileText className="size-4 text-primary" />
                    <span>{chapters.length} 个章节</span>
                    <span className="text-border">·</span>
                    <span>{totalChapterCharacters.toLocaleString("zh-CN")} 字</span>
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UsersRound className="size-4 text-primary" />
                  人物长期记忆
                  {characterGraph && (
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-success">
                      <CheckCircle2 className="size-3.5" />
                      已注入
                    </span>
                  )}
                </div>
                {isLoadingGraph ? (
                  <p className="mt-4 text-xs text-muted-foreground">正在读取人物关系 JSON…</p>
                ) : graphError ? (
                  <div className="mt-4 flex items-start gap-2 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    {graphError}
                  </div>
                ) : characterGraph ? (
                  <>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      每次对话自动注入最多 60 个人物、120 条关系，最新正文冲突时以正文为准。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {characterGraph.characters.slice(0, 12).map((character) => (
                        <span
                          key={character.id}
                          className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
                        >
                          {character.name}
                        </span>
                      ))}
                      {characterGraph.characters.length > 12 && (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          +{characterGraph.characters.length - 12}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      更新于 {formatDate(characterGraph.generatedAt)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      还没有人物关系 JSON，因此当前对话没有可注入的人物长期记忆。
                    </p>
                    <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onOpenCharacterSettings}>
                      <Sparkles className="size-3.5" />
                      前往生成角色记忆
                    </Button>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MessagesSquare className="size-4 text-primary" />
                  对话记忆
                  <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                    {effectiveMessages.length}/24
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  只保留本次打开写作台后的最近 24 条消息，切换小说后清空。
                </p>
                <div className="mt-3 space-y-2">
                  {recentMessages.length ? recentMessages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className="rounded-lg bg-muted/55 px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-primary">
                        {message.role === "user" ? "你" : "AI"}
                      </p>
                      <p className="mt-1 line-clamp-2 select-text text-xs leading-5 text-foreground/75">
                        {message.content}
                      </p>
                    </div>
                  )) : (
                    <p className="rounded-lg bg-muted/55 px-3 py-4 text-center text-xs text-muted-foreground">
                      还没有对话记录
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-6 py-3 text-[11px] text-muted-foreground">
          <BrainCircuit className="size-3.5 text-primary" />
          API 不保存会话状态；上面的记忆会在每次发送时由作者管家重新组装。
          {Boolean(writingRules?.rules.length) && (
            <span className="ml-auto flex items-center gap-1.5 text-success">
              <ScrollText className="size-3.5" />
              {writingRules?.rules.length} 个 Trae 规则文件已注入
            </span>
          )}
          {!apiConfig.hasApiKey && (
            <span className={writingRules?.rules.length ? "ml-3 text-amber-600" : "ml-auto text-amber-600"}>
              尚未配置 API Key
            </span>
          )}
        </footer>
      </section>
    </div>
  )
}
