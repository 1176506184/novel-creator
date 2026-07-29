import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowLeft,
  BookMarked,
  BookOpenText,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  CloudUpload,
  Copy,
  FileText,
  FolderOpen,
  LoaderCircle,
  PanelLeft,
  PanelRight,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Square,
  ScrollText,
  Sparkles,
  TriangleAlert,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react"

import { AiMemoryDialog } from "@/components/ai-memory-dialog"
import { CharacterSettingsDialog } from "@/components/character-settings-dialog"
import { ReferenceStyleDialog } from "@/components/reference-style-dialog"
import { Button } from "@/components/ui/button"
import { WritingRulesDialog } from "@/components/writing-rules-dialog"
import type {
  ChapterDocument,
  ChapterSummary,
  LibraryProject,
} from "@/types/library"

type WriterPageProps = {
  project: LibraryProject | null
  isActive: boolean
  onGoToWorks: () => void
  onOpenProjectFolder: (project: LibraryProject) => void
  onSaved: () => void
  onDirtyChange: (isDirty: boolean) => void
  onAiRunningChange: (isRunning: boolean) => void
  onOpenSettings: () => void
}

type AiToolEvent = {
  kind: "read" | "diff" | "created" | "modified"
  path: string
  label: string
  diff?: string
}

type AiMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  toolEvents?: AiToolEvent[]
  isStreaming?: boolean
  status?: string
  hasError?: boolean
  changeSetId?: string
  changeStatus?: "pending" | "saved" | "canceled" | "expired"
}

type ChapterContextMenu = {
  chapter: ChapterSummary
  x: number
  y: number
}

type AiToolSyncEvent = {
  id: number
  event: AiToolEvent
}

const numberFormatter = new Intl.NumberFormat("zh-CN")

function countCharacters(content: string) {
  return content.replace(/\s/g, "").length
}

function formatAiChatError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  const message = rawMessage
    .replace(/^Error invoking remote method ['"]ai:chat['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")

  if (/timeout|timed out|aborted due to timeout/i.test(message)) {
    return "AI 连接连续超时，已自动重试 5 次，请稍后再试。"
  }
  if (/fetch failed|network|socket|connection|terminated/i.test(message)) {
    return "AI 网络连接连续失败，已自动重试 5 次，请检查网络后再试。"
  }
  return message || "AI 请求失败"
}

function isAiChatCanceledError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  return /AI_REQUEST_CANCELED|AiRequestCanceledError|AI 请求已由用户停止/i.test(rawMessage)
}

function formatAiChangeError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  return rawMessage
    .replace(/^Error invoking remote method ['"]ai:(?:apply|discard)-changes['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    || "处理 AI 修改失败"
}

function isUnrecoverableAiChangeError(error: unknown) {
  return /已经不存在|修改记录无效|文件格式无效|无法读取待确认修改|已经取消/i.test(
    formatAiChangeError(error),
  )
}

function formatGitSyncError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  const message = rawMessage
    .replace(/^Error invoking remote method ['"]git:sync-project['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
  if (/authentication failed|could not read username|permission denied.*publickey/i.test(message)) {
    return "Git 身份验证失败，请先在系统 Git 中配置可用的凭据、令牌或 SSH Key。"
  }
  if (/repository not found/i.test(message)) {
    return "远程 Git 仓库不存在，或当前账号没有访问权限。"
  }
  return message || "Git 同步失败"
}

function formatAiDisplayContent(content: string) {
  let insideCodeFence = false
  const cleanedLines = content.split(/\r?\n/).map((line) => {
    if (line.trimStart().startsWith("```")) {
      insideCodeFence = !insideCodeFence
      return line
    }
    if (insideCodeFence) return line
    return line.replace(/^[\t ]*(?:>[\t ]*)+/, "")
  })
  return cleanedLines
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
}

type ParsedAiDiffLine = {
  kind: "header" | "hunk" | "removed" | "added" | "context" | "meta"
  content: string
  oldLine: number | null
  newLine: number | null
}

function parseAiDiff(diff: string) {
  let oldLine: number | null = null
  let newLine: number | null = null
  let additions = 0
  let removals = 0

  const lines: ParsedAiDiffLine[] = diff.split(/\r?\n/).map((line) => {
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
      return {
        kind: "removed",
        content: line.slice(1),
        oldLine: currentOldLine,
        newLine: null,
      }
    }

    if (line.startsWith("+")) {
      const currentNewLine = newLine
      if (newLine !== null) newLine += 1
      additions += 1
      return {
        kind: "added",
        content: line.slice(1),
        oldLine: null,
        newLine: currentNewLine,
      }
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

function getVisibleAiToolEvents(toolEvents: AiToolEvent[] = []) {
  return toolEvents.filter((toolEvent, index) => {
    if (toolEvent.kind !== "diff") return true
    return !toolEvents.slice(index + 1).some((laterEvent) => (
      laterEvent.path === toolEvent.path
      && (laterEvent.kind === "modified" || laterEvent.kind === "created")
    ))
  })
}

function AiDiffView({ diff }: { diff: string }) {
  const parsed = useMemo(() => parseAiDiff(diff), [diff])

  return (
    <div className="border-t border-border bg-white">
      <div className="flex min-h-9 items-center gap-2 border-b border-border bg-muted/20 px-2.5 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">具体差异</span>
        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
          修改前 -{parsed.removals}
        </span>
        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          修改后 +{parsed.additions}
        </span>
        <button
          type="button"
          className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="复制完整 diff"
          title="复制完整 diff"
          onClick={() => navigator.clipboard.writeText(diff)}
        >
          <Copy className="size-3" />
        </button>
      </div>

      <div className="max-h-72 overflow-auto bg-[#fffdfc] font-mono text-[10px] leading-4 select-text">
        <div className="sticky top-0 z-10 grid min-w-max grid-cols-[36px_36px_20px_minmax(220px,1fr)] border-b border-border bg-[#f7f7f6] text-[9px] font-medium text-muted-foreground">
          <span className="border-r border-border/70 px-1 py-1 text-right" title="修改前行号">旧</span>
          <span className="border-r border-border/70 px-1 py-1 text-right" title="修改后行号">新</span>
          <span />
          <span className="px-2 py-1">内容</span>
        </div>
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
          const marker = line.kind === "removed"
            ? "-"
            : line.kind === "added"
              ? "+"
              : line.kind === "context"
                ? " "
                : ""

          return (
            <div
              key={`${index}-${line.kind}`}
              className={`grid min-w-max grid-cols-[36px_36px_20px_minmax(220px,1fr)] ${rowClass}`}
            >
              <span className="border-r border-border/45 px-1 py-0.5 text-right text-muted-foreground/75">
                {line.oldLine ?? ""}
              </span>
              <span className="border-r border-border/45 px-1 py-0.5 text-right text-muted-foreground/75">
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
                aria-hidden="true"
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

export function WriterPage({
  project,
  isActive,
  onGoToWorks,
  onOpenProjectFolder,
  onSaved,
  onDirtyChange,
  onAiRunningChange,
  onOpenSettings,
}: WriterPageProps) {
  const [chapters, setChapters] = useState<ChapterSummary[]>([])
  const [activeChapterName, setActiveChapterName] = useState("")
  const [document, setDocument] = useState<ChapterDocument | null>(null)
  const [content, setContent] = useState("")
  const [query, setQuery] = useState("")
  const [isLoadingChapters, setIsLoadingChapters] = useState(false)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isChapterPanelOpen, setIsChapterPanelOpen] = useState(true)
  const [isNewChapterFormOpen, setIsNewChapterFormOpen] = useState(false)
  const [isCreatingChapter, setIsCreatingChapter] = useState(false)
  const [deletingChapterName, setDeletingChapterName] = useState("")
  const [chapterContextMenu, setChapterContextMenu] = useState<ChapterContextMenu | null>(null)
  const [newChapterName, setNewChapterName] = useState("")
  const [newChapterError, setNewChapterError] = useState("")
  const [isAiMemoryDialogOpen, setIsAiMemoryDialogOpen] = useState(false)
  const [isCharacterDialogOpen, setIsCharacterDialogOpen] = useState(false)
  const [isWritingRulesDialogOpen, setIsWritingRulesDialogOpen] = useState(false)
  const [isReferenceStyleDialogOpen, setIsReferenceStyleDialogOpen] = useState(false)
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true)
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([])
  const [aiChatSummary, setAiChatSummary] = useState("")
  const [aiCompactedCount, setAiCompactedCount] = useState(0)
  const [aiInput, setAiInput] = useState("")
  const [aiError, setAiError] = useState("")
  const [aiNotice, setAiNotice] = useState("")
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [isAiStopping, setIsAiStopping] = useState(false)
  const [activeAiChangeSetId, setActiveAiChangeSetId] = useState("")
  const [activeAiChangeAction, setActiveAiChangeAction] = useState<"save" | "cancel" | "">("")
  const [isAiHistoryLoading, setIsAiHistoryLoading] = useState(false)
  const [isAiCompacting, setIsAiCompacting] = useState(false)
  const [aiToolSyncEvent, setAiToolSyncEvent] = useState<AiToolSyncEvent | null>(null)
  const [isGitSyncing, setIsGitSyncing] = useState(false)
  const [gitSyncLabel, setGitSyncLabel] = useState("同步")
  const [gitSyncResult, setGitSyncResult] = useState<GitSyncResult | null>(null)
  const [gitSyncError, setGitSyncError] = useState("")
  const [isGitSyncDialogOpen, setIsGitSyncDialogOpen] = useState(false)
  const [aiConfig, setAiConfig] = useState({
    model: "AI",
    reasoningEffort: "high",
    hasApiKey: false,
  })
  const [error, setError] = useState("")
  const chapterRequestId = useRef(0)
  const chapterListRef = useRef<HTMLDivElement>(null)
  const aiMessagesEndRef = useRef<HTMLDivElement>(null)
  const shouldInstantAiScrollRef = useRef(true)
  const wasAiPanelOpenRef = useRef(isAiPanelOpen)
  const activeAiRequestIdRef = useRef("")
  const activeAiMessageIdRef = useRef("")
  const aiMessagesRef = useRef<AiMessage[]>([])
  const activeGitSyncRequestIdRef = useRef("")
  const gitSyncResetTimerRef = useRef<number | null>(null)
  const isDirtyRef = useRef(false)

  const isDirty = Boolean(document) && content !== document.content
  isDirtyRef.current = isDirty
  const currentCharacterCount = countCharacters(content)
  const hasPendingAiChanges = aiMessages.some((message) => message.changeStatus === "pending")

  const updateAiMessages = useCallback((
    updater: AiMessage[] | ((current: AiMessage[]) => AiMessage[]),
  ) => {
    const nextMessages = typeof updater === "function"
      ? updater(aiMessagesRef.current)
      : updater
    aiMessagesRef.current = nextMessages
    setAiMessages(nextMessages)
  }, [])

  useEffect(() => {
    onDirtyChange(isDirty)
    return () => onDirtyChange(false)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    onAiRunningChange(isAiThinking)
  }, [isAiThinking, onAiRunningChange])

  useEffect(() => () => {
    onAiRunningChange(false)
  }, [onAiRunningChange])

  useEffect(() => {
    let isCurrent = true
    function applyApiSettings(settings: {
      model: string
      reasoningEffort: string
      hasApiKey: boolean
    }) {
      if (!isCurrent) return
      setAiConfig({
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        hasApiKey: settings.hasApiKey,
      })
    }
    function handleApiSettingsChanged(event: Event) {
      const settings = (event as CustomEvent<{
        model: string
        reasoningEffort: string
        hasApiKey: boolean
      }>).detail
      if (settings) applyApiSettings(settings)
    }
    window.addEventListener("author-desk:api-settings-changed", handleApiSettingsChanged)
    window.authorDesk.settings.getApi()
      .then(applyApiSettings)
      .catch(() => applyApiSettings({
          model: "AI",
          reasoningEffort: "high",
          hasApiKey: false,
        }))
    return () => {
      isCurrent = false
      window.removeEventListener("author-desk:api-settings-changed", handleApiSettingsChanged)
    }
  }, [])

  useEffect(() => {
    const wasPanelOpen = wasAiPanelOpenRef.current
    wasAiPanelOpenRef.current = isAiPanelOpen
    if (!isActive || !isAiPanelOpen || !aiMessages.length) return
    const shouldScrollInstantly = (
      shouldInstantAiScrollRef.current
      || !wasPanelOpen
      || isAiThinking
      || isAiHistoryLoading
    )
    aiMessagesEndRef.current?.scrollIntoView({
      behavior: shouldScrollInstantly ? "auto" : "smooth",
      block: "end",
    })
    if (shouldInstantAiScrollRef.current) shouldInstantAiScrollRef.current = false
  }, [aiMessages, isActive, isAiHistoryLoading, isAiPanelOpen, isAiThinking])

  useEffect(() => window.authorDesk.ai.onChatProgress((progress) => {
    if (!progress.requestId || progress.requestId !== activeAiRequestIdRef.current) return
    const messageId = activeAiMessageIdRef.current
    if (!messageId) return
    if (
      progress.type === "tool-event"
      && progress.toolEvent
      && ["created", "modified"].includes(progress.toolEvent.kind)
    ) {
      setAiToolSyncEvent({
        id: Date.now() + Math.random(),
        event: progress.toolEvent,
      })
    }
    updateAiMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message
      if (progress.type === "content-delta" && progress.delta) {
        return {
          ...message,
          content: `${message.content}${progress.delta}`,
          status: "正在回复…",
        }
      }
      if (progress.type === "content-reset") {
        return {
          ...message,
          content: "",
        }
      }
      if (progress.type === "status" && progress.label) {
        return {
          ...message,
          status: progress.label,
        }
      }
      if (progress.type === "tool-event" && progress.toolEvent) {
        return {
          ...message,
          toolEvents: [...(message.toolEvents || []), progress.toolEvent],
        }
      }
      return message
    }))
  }), [updateAiMessages])

  useEffect(() => window.authorDesk.git.onSyncProgress((progress) => {
    if (
      !progress.requestId
      || progress.requestId !== activeGitSyncRequestIdRef.current
    ) return
    const phaseLabels: Record<GitSyncProgress["phase"], string> = {
      checking: "检查中",
      fetching: "连接中",
      pulling: "拉取中",
      committing: "提交中",
      pushing: "推送中",
      complete: "已同步",
    }
    setGitSyncLabel(phaseLabels[progress.phase])
  }), [])

  useEffect(() => () => {
    if (gitSyncResetTimerRef.current) {
      window.clearTimeout(gitSyncResetTimerRef.current)
    }
  }, [])

  const visibleChapters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
    return normalizedQuery
      ? chapters.filter((chapter) => (
          chapter.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        ))
      : chapters
  }, [chapters, query])

  useEffect(() => {
    if (!isChapterPanelOpen || isLoadingChapters || !chapters.length) return
    const frameId = window.requestAnimationFrame(() => {
      const chapterList = chapterListRef.current
      if (chapterList) chapterList.scrollTop = chapterList.scrollHeight
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [chapters.length, isChapterPanelOpen, isLoadingChapters, project?.path])

  const loadChapter = useCallback(async (chapterName: string, projectPath: string) => {
    const requestId = ++chapterRequestId.current
    setActiveChapterName(chapterName)
    setIsLoadingDocument(true)
    setError("")
    try {
      const nextDocument = await window.authorDesk.project.getChapter(projectPath, chapterName)
      if (requestId !== chapterRequestId.current) return
      setDocument(nextDocument)
      setContent(nextDocument.content)
    } catch (loadError) {
      if (requestId !== chapterRequestId.current) return
      setDocument(null)
      setContent("")
      setError(loadError instanceof Error ? loadError.message : "无法读取章节")
    } finally {
      if (requestId === chapterRequestId.current) setIsLoadingDocument(false)
    }
  }, [])

  useEffect(() => {
    if (!aiToolSyncEvent || !project) return
    let isCurrent = true
    const normalizedToolPath = aiToolSyncEvent.event.path.replace(/\\/g, "/")
    const currentChapterPath = `正文/${activeChapterName}`

    async function syncAiFileChange() {
      try {
        const chapterList = await window.authorDesk.project.getChapters(project.path)
        if (!isCurrent) return
        setChapters(chapterList.chapters)

        if (
          aiToolSyncEvent.event.kind === "modified"
          && activeChapterName
          && normalizedToolPath === currentChapterPath
        ) {
          if (isDirtyRef.current) {
            setError("AI 已修改磁盘中的当前章节，但编辑器存在未保存内容，因此没有自动覆盖。")
          } else {
            const nextDocument = await window.authorDesk.project.getChapter(
              project.path,
              activeChapterName,
            )
            if (!isCurrent || isDirtyRef.current) return
            setDocument(nextDocument)
            setContent(nextDocument.content)
            setError("")
          }
        }
        onSaved()
      } catch (syncError) {
        if (!isCurrent) return
        setError(syncError instanceof Error
          ? `AI 已修改文件，但界面同步失败：${syncError.message}`
          : "AI 已修改文件，但界面同步失败")
      }
    }

    syncAiFileChange()
    return () => {
      isCurrent = false
    }
  }, [aiToolSyncEvent])

  useEffect(() => {
    shouldInstantAiScrollRef.current = true
    setChapters([])
    setActiveChapterName("")
    setDocument(null)
    setContent("")
    setQuery("")
    setError("")
    setIsNewChapterFormOpen(false)
    setNewChapterName("")
    setNewChapterError("")
    setDeletingChapterName("")
    setChapterContextMenu(null)
    setIsAiMemoryDialogOpen(false)
    setIsCharacterDialogOpen(false)
    setIsWritingRulesDialogOpen(false)
    setIsReferenceStyleDialogOpen(false)
    updateAiMessages([])
    setAiChatSummary("")
    setAiCompactedCount(0)
    setAiInput("")
    setAiError("")
    setAiNotice("")
    setIsAiStopping(false)
    setActiveAiChangeSetId("")
    setActiveAiChangeAction("")
    setIsAiCompacting(false)
    setAiToolSyncEvent(null)
    setIsGitSyncing(false)
    setGitSyncLabel("同步")
    setGitSyncResult(null)
    setGitSyncError("")
    setIsGitSyncDialogOpen(false)
    setIsAiHistoryLoading(Boolean(project))
    activeAiRequestIdRef.current = ""
    activeAiMessageIdRef.current = ""
    setIsLoadingDocument(false)
    if (!project) {
      setIsAiHistoryLoading(false)
      return
    }

    let isCurrent = true
    setIsLoadingChapters(true)
    window.authorDesk.ai.getHistory(project.path)
      .then((history) => {
        if (!isCurrent) return
        updateAiMessages(history.messages)
        setAiChatSummary(history.summary)
        setAiCompactedCount(history.compactedCount)
        if (history.messages.some((message) => message.changeStatus === "expired")) {
          setAiNotice("检测到已经丢失的待确认修改，已自动解除阻塞；原 diff 仍保留在对话中。")
        }
      })
      .catch((historyError) => {
        if (!isCurrent) return
        setAiError(historyError instanceof Error
          ? historyError.message
          : "无法读取 AI 对话历史")
      })
      .finally(() => {
        if (isCurrent) setIsAiHistoryLoading(false)
      })

    window.authorDesk.project.getChapters(project.path)
      .then((result) => {
        if (!isCurrent) return
        setChapters(result.chapters)
        const initialChapter = result.chapters.find(
          (chapter) => chapter.name === project.latestChapter,
        ) || result.chapters.at(-1)
        if (initialChapter) loadChapter(initialChapter.name, project.path)
      })
      .catch((loadError) => {
        if (!isCurrent) return
        setError(loadError instanceof Error ? loadError.message : "无法读取正文目录")
      })
      .finally(() => {
        if (isCurrent) setIsLoadingChapters(false)
      })

    return () => {
      isCurrent = false
      chapterRequestId.current += 1
    }
  }, [loadChapter, project?.path, updateAiMessages])

  const saveCurrentChapter = useCallback(async () => {
    if (!project || !activeChapterName || !document || isSaving) return false
    if (!isDirty) return true
    setIsSaving(true)
    setError("")
    try {
      const savedDocument = await window.authorDesk.project.saveChapter(
        project.path,
        activeChapterName,
        content,
      )
      setDocument(savedDocument)
      setContent(savedDocument.content)
      setChapters((current) => current.map((chapter) => (
        chapter.name === savedDocument.name
          ? {
              name: savedDocument.name,
              path: savedDocument.path,
              characterCount: savedDocument.characterCount,
              modifiedAt: savedDocument.modifiedAt,
            }
          : chapter
      )))
      onSaved()
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存章节失败")
      return false
    } finally {
      setIsSaving(false)
    }
  }, [activeChapterName, content, document, isDirty, isSaving, onSaved, project])

  async function refreshAfterGitSync() {
    if (!project) return
    const chapterList = await window.authorDesk.project.getChapters(project.path)
    setChapters(chapterList.chapters)
    const nextChapter = chapterList.chapters.find(
      (chapter) => chapter.name === activeChapterName,
    ) || chapterList.chapters.at(-1)
    if (nextChapter) {
      await loadChapter(nextChapter.name, project.path)
    } else {
      setActiveChapterName("")
      setDocument(null)
      setContent("")
    }
    onSaved()
  }

  async function syncProjectToCloud() {
    if (!project || isGitSyncing || isSaving || isAiThinking) return
    if (gitSyncResetTimerRef.current) {
      window.clearTimeout(gitSyncResetTimerRef.current)
      gitSyncResetTimerRef.current = null
    }
    setGitSyncError("")
    setGitSyncResult(null)
    setIsGitSyncDialogOpen(false)

    if (isDirty) {
      const wasSaved = await saveCurrentChapter()
      if (!wasSaved) {
        setGitSyncError("当前正文保存失败，已停止 Git 同步。")
        setIsGitSyncDialogOpen(true)
        return
      }
    }

    const requestId = `git-${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeGitSyncRequestIdRef.current = requestId
    setIsGitSyncing(true)
    setGitSyncLabel("检查中")
    try {
      const result = await window.authorDesk.git.syncProject({
        requestId,
        projectPath: project.path,
      })
      setGitSyncResult(result)
      if (result.status === "conflict") {
        setGitSyncLabel("有冲突")
        setIsGitSyncDialogOpen(true)
        return
      }
      await refreshAfterGitSync()
      setGitSyncLabel("已同步")
      gitSyncResetTimerRef.current = window.setTimeout(() => {
        setGitSyncLabel("同步")
        gitSyncResetTimerRef.current = null
      }, 3500)
    } catch (syncError) {
      setGitSyncError(formatGitSyncError(syncError))
      setGitSyncLabel("同步失败")
      setIsGitSyncDialogOpen(true)
    } finally {
      if (activeGitSyncRequestIdRef.current === requestId) {
        activeGitSyncRequestIdRef.current = ""
      }
      setIsGitSyncing(false)
    }
  }

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "s") return
      event.preventDefault()
      saveCurrentChapter()
    }
    window.addEventListener("keydown", handleSaveShortcut)
    return () => window.removeEventListener("keydown", handleSaveShortcut)
  }, [saveCurrentChapter])

  function selectChapter(chapter: ChapterSummary) {
    if (!project || isSaving || chapter.name === activeChapterName) return
    if (isDirty && !window.confirm("当前章节尚未保存，确定放弃修改并切换章节吗？")) return
    loadChapter(chapter.name, project.path)
  }

  async function createNewChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!project || !newChapterName.trim() || isCreatingChapter) return
    if (isDirty && !window.confirm("当前章节尚未保存，确定放弃修改并新建章节吗？")) return

    setIsCreatingChapter(true)
    setNewChapterError("")
    try {
      const createdDocument = await window.authorDesk.project.createChapter(
        project.path,
        newChapterName.trim(),
      )
      const createdSummary: ChapterSummary = {
        name: createdDocument.name,
        path: createdDocument.path,
        characterCount: createdDocument.characterCount,
        modifiedAt: createdDocument.modifiedAt,
      }
      setChapters((current) => [...current, createdSummary].sort((left, right) => (
        left.name.localeCompare(right.name, "zh-CN", { numeric: true })
      )))
      setActiveChapterName(createdDocument.name)
      setDocument(createdDocument)
      setContent(createdDocument.content)
      setNewChapterName("")
      setIsNewChapterFormOpen(false)
      onSaved()
    } catch (createError) {
      setNewChapterError(createError instanceof Error ? createError.message : "新建章节失败")
    } finally {
      setIsCreatingChapter(false)
    }
  }

  async function deleteChapter(chapter: ChapterSummary) {
    if (!project || deletingChapterName || isSaving) return
    setChapterContextMenu(null)
    if (chapter.name === activeChapterName && isDirty) {
      setError("当前章节还有未保存内容，请先保存后再删除。")
      return
    }
    const displayName = chapter.name.replace(/\.(txt|md|markdown)$/i, "")
    if (!window.confirm(`确定删除“${displayName}”吗？\n\n章节文件会移到系统回收站，可以恢复。`)) return

    setDeletingChapterName(chapter.name)
    setError("")
    try {
      await window.authorDesk.project.deleteChapter(project.path, chapter.name)
      const deletedIndex = chapters.findIndex((item) => item.name === chapter.name)
      const remainingChapters = chapters.filter((item) => item.name !== chapter.name)
      setChapters(remainingChapters)

      if (chapter.name === activeChapterName) {
        chapterRequestId.current += 1
        setActiveChapterName("")
        setDocument(null)
        setContent("")
        const nextChapter = remainingChapters[
          Math.min(Math.max(deletedIndex, 0), remainingChapters.length - 1)
        ]
        if (nextChapter) await loadChapter(nextChapter.name, project.path)
      }
      onSaved()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除章节失败")
    } finally {
      setDeletingChapterName("")
    }
  }

  async function refreshAfterAiTools(toolEvents: AiToolEvent[]) {
    if (!project || !toolEvents.some((event) => ["created", "modified"].includes(event.kind))) return
    const chapterList = await window.authorDesk.project.getChapters(project.path)
    setChapters(chapterList.chapters)
    const currentChapterWasModified = toolEvents.some((event) => (
      event.kind === "modified"
      && event.path.replace(/\\/g, "/") === `正文/${activeChapterName}`
    ))
    if (currentChapterWasModified && activeChapterName) {
      if (isDirtyRef.current) {
        setError("AI 已修改磁盘中的当前章节，但编辑器存在未保存内容，因此没有自动覆盖。")
      } else {
        await loadChapter(activeChapterName, project.path)
      }
    }
    onSaved()
  }

  async function savePendingAiChanges(message: AiMessage) {
    if (!project || !message.changeSetId || message.changeStatus !== "pending") return
    if (isDirty) {
      setAiError("请先保存当前编辑器中的正文，再保存 AI 修改。")
      return
    }
    setActiveAiChangeSetId(message.changeSetId)
    setActiveAiChangeAction("save")
    setAiError("")
    setAiNotice("")
    let result: Awaited<ReturnType<typeof window.authorDesk.ai.applyChanges>>
    try {
      result = await window.authorDesk.ai.applyChanges(project.path, message.changeSetId)
    } catch (applyError) {
      if (isUnrecoverableAiChangeError(applyError)) {
        const expiredMessages = aiMessagesRef.current.map((currentMessage) => (
          currentMessage.id === message.id
            ? {
                ...currentMessage,
                changeStatus: "expired" as const,
                status: "待确认修改已失效，已解除阻塞",
                toolEvents: currentMessage.toolEvents?.map((event) => (
                  ["created", "modified"].includes(event.kind)
                    ? { ...event, label: "修改记录已失效" }
                    : event
                )),
              }
            : currentMessage
        ))
        updateAiMessages(expiredMessages)
        setAiNotice(`${formatAiChangeError(applyError)}。已自动解除待确认状态，你可以继续使用 AI。`)
        window.authorDesk.ai.saveHistory(project.path, expiredMessages).catch(() => {})
      } else {
        setAiError(formatAiChangeError(applyError))
      }
      setActiveAiChangeSetId("")
      setActiveAiChangeAction("")
      return
    }

    const appliedEvents = new Map(result.toolEvents.map((event) => [event.path, event]))
    const nextMessages = aiMessagesRef.current.map((currentMessage) => {
      if (currentMessage.id !== message.id) return currentMessage
      return {
        ...currentMessage,
        changeStatus: "saved" as const,
        status: `已保存 ${result.appliedCount} 项修改`,
        toolEvents: currentMessage.toolEvents?.map((event) => (
          appliedEvents.get(event.path) || event
        )),
      }
    })
    updateAiMessages(nextMessages)
    try {
      await window.authorDesk.ai.saveHistory(project.path, nextMessages)
    } catch {
      setAiNotice("文件已保存，但对话状态暂时未能写入；下次打开时会自动恢复，不会重复修改文件。")
    }
    try {
      await refreshAfterAiTools(result.toolEvents)
    } catch (refreshError) {
      setAiError(refreshError instanceof Error
        ? `修改已保存，但界面刷新失败：${refreshError.message}`
        : "修改已保存，但作品界面刷新失败")
    } finally {
      setActiveAiChangeSetId("")
      setActiveAiChangeAction("")
    }
  }

  async function cancelPendingAiChanges(message: AiMessage) {
    if (!project || !message.changeSetId || message.changeStatus !== "pending") return
    setActiveAiChangeSetId(message.changeSetId)
    setActiveAiChangeAction("cancel")
    setAiError("")
    setAiNotice("")
    try {
      const result = await window.authorDesk.ai.discardChanges(project.path, message.changeSetId)
      const resolvedAsSaved = result.status === "saved"
      const resolvedAsMissing = result.status === "missing"
      const resolvedEvents = new Map(
        (result.toolEvents || []).map((event) => [event.path, event]),
      )
      const nextMessages = aiMessagesRef.current.map((currentMessage) => {
        if (currentMessage.id !== message.id) return currentMessage
        return {
          ...currentMessage,
          changeStatus: resolvedAsSaved
            ? "saved" as const
            : resolvedAsMissing
              ? "expired" as const
              : "canceled" as const,
          status: resolvedAsSaved
            ? `已保存 ${result.appliedCount || 0} 项修改`
            : resolvedAsMissing
              ? "待确认修改已失效，已解除阻塞"
              : `已取消 ${result.discardedCount} 项修改`,
          toolEvents: currentMessage.toolEvents?.map((event) => (
            resolvedAsSaved
              ? resolvedEvents.get(event.path) || event
              : ["created", "modified"].includes(event.kind)
                ? {
                    ...event,
                    label: resolvedAsMissing
                      ? "修改记录已失效"
                      : event.kind === "created"
                        ? "已取消创建"
                        : "已取消修改",
                  }
                : event
          )),
        }
      })
      updateAiMessages(nextMessages)
      try {
        await window.authorDesk.ai.saveHistory(project.path, nextMessages)
      } catch {
        setAiNotice("操作已经完成，但对话状态暂时未能写入；下次打开时会自动恢复。")
      }
      if (resolvedAsSaved && result.toolEvents?.length) {
        try {
          await refreshAfterAiTools(result.toolEvents)
        } catch {
          setAiError("修改已经保存，但作品界面刷新失败，请重新进入写作台。")
        }
      } else if (resolvedAsMissing) {
        setAiNotice("待确认修改文件已经不存在，已移除失效状态，你可以继续使用 AI。")
      }
    } catch (discardError) {
      if (isUnrecoverableAiChangeError(discardError)) {
        const expiredMessages = aiMessagesRef.current.map((currentMessage) => (
          currentMessage.id === message.id
            ? {
                ...currentMessage,
                changeStatus: "expired" as const,
                status: "待确认修改已失效，已解除阻塞",
              }
            : currentMessage
        ))
        updateAiMessages(expiredMessages)
        setAiNotice(`${formatAiChangeError(discardError)}。已解除待确认状态，你可以继续使用 AI。`)
        window.authorDesk.ai.saveHistory(project.path, expiredMessages).catch(() => {})
      } else {
        setAiError(formatAiChangeError(discardError))
      }
    } finally {
      setActiveAiChangeSetId("")
      setActiveAiChangeAction("")
    }
  }

  async function stopAiMessage() {
    const requestId = activeAiRequestIdRef.current
    const messageId = activeAiMessageIdRef.current
    if (!requestId || !isAiThinking || isAiStopping) return

    setIsAiStopping(true)
    setAiError("")
    if (messageId) {
      updateAiMessages((current) => current.map((message) => (
        message.id === messageId
          ? { ...message, status: "正在停止…" }
          : message
      )))
    }
    try {
      const didCancel = await window.authorDesk.ai.cancelChat(requestId)
      if (!didCancel && activeAiRequestIdRef.current === requestId) {
        setAiError("当前 AI 请求已经结束，无需停止。")
      }
    } catch (cancelError) {
      setAiError(cancelError instanceof Error
        ? `停止 AI 请求失败：${cancelError.message}`
        : "停止 AI 请求失败")
      setIsAiStopping(false)
    }
  }

  async function sendAiMessage(explicitPrompt?: string) {
    const prompt = (explicitPrompt ?? aiInput).trim()
    if (
      !project
      || !prompt
      || isAiThinking
      || isAiHistoryLoading
      || isAiCompacting
      || hasPendingAiChanges
    ) return
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const userMessage: AiMessage = {
      id: `${requestId}-user`,
      role: "user",
      content: prompt,
    }
    const nextMessages = [...aiMessages, userMessage]
    const assistantMessageId = `${requestId}-assistant`
    updateAiMessages([
      ...nextMessages,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        toolEvents: [],
        isStreaming: true,
        status: "正在连接模型…",
      },
    ])
    activeAiRequestIdRef.current = requestId
    activeAiMessageIdRef.current = assistantMessageId
    setAiInput("")
    setAiError("")
    setAiNotice("")
    setIsAiThinking(true)
    setIsAiStopping(false)
    try {
      try {
        await window.authorDesk.ai.saveHistory(project.path, nextMessages)
      } catch (historyError) {
        setAiError(historyError instanceof Error
          ? historyError.message
          : "用户消息暂时无法保存")
      }
      const response = await window.authorDesk.ai.chat({
        requestId,
        messages: nextMessages
          .filter((message) => !message.hasError)
          .map((message) => ({
            role: message.role,
            content: message.content,
          })),
        context: {
          projectName: project.name,
          projectPath: project.path,
          chapterName: activeChapterName,
          chapterContent: content,
          chatSummary: aiChatSummary,
        },
        allowWriteTools: !isDirty,
      })
      const completedMessages: AiMessage[] = [
        ...nextMessages,
        {
          id: assistantMessageId,
          role: "assistant",
          content: response.content,
          toolEvents: response.toolEvents,
          status: response.changeSetId
            ? `等待确认 ${response.pendingChangeCount} 项修改`
            : response.autoReviewed
              ? "已自动审核并收束"
              : undefined,
          changeSetId: response.changeSetId || undefined,
          changeStatus: response.changeSetId ? "pending" : undefined,
        },
      ]
      updateAiMessages(completedMessages)
      if (activeAiRequestIdRef.current === requestId) {
        activeAiRequestIdRef.current = ""
        activeAiMessageIdRef.current = ""
      }
      setIsAiThinking(false)
      setIsAiStopping(false)
      try {
        await window.authorDesk.ai.saveHistory(project.path, completedMessages)
      } catch (historyError) {
        setAiError(historyError instanceof Error
          ? historyError.message
          : "AI 回复已完成，但对话历史保存失败")
      }
      setIsAiCompacting(true)
      try {
        const compacted = await window.authorDesk.ai.compactHistory(project.path)
        setAiChatSummary(compacted.summary)
        setAiCompactedCount(compacted.compactedCount)
        if (compacted.didCompact) updateAiMessages(compacted.messages)
      } catch (compactError) {
        setAiError(compactError instanceof Error
          ? `对话已保存，但自动压缩失败：${compactError.message}`
          : "对话已保存，但自动压缩失败")
      } finally {
        setIsAiCompacting(false)
      }
      if (!response.changeSetId) {
        try {
          await refreshAfterAiTools(response.toolEvents)
        } catch (refreshError) {
          setAiError(refreshError instanceof Error
            ? refreshError.message
            : "AI 已完成操作，但作品界面刷新失败")
        }
      }
    } catch (chatError) {
      if (isAiChatCanceledError(chatError)) {
        const stoppedMessages = aiMessagesRef.current.map((message) => (
          message.id === assistantMessageId
            ? {
                ...message,
                content: message.content.trim() ? message.content : "已停止生成。",
                isStreaming: false,
                status: "已停止",
                hasError: false,
              }
            : message
        ))
        updateAiMessages(stoppedMessages)
        setAiError("")
        window.authorDesk.ai.saveHistory(project.path, stoppedMessages).catch(() => {})
        return
      }
      const formattedError = formatAiChatError(chatError)
      const failedMessages: AiMessage[] = [
        ...nextMessages,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "这次请求没有成功，请查看下方错误提示后重试。",
          status: "请求失败",
          hasError: true,
        },
      ]
      setAiError(formattedError)
      updateAiMessages(failedMessages)
      window.authorDesk.ai.saveHistory(project.path, failedMessages).catch(() => {})
    } finally {
      if (activeAiRequestIdRef.current === requestId) {
        activeAiRequestIdRef.current = ""
        activeAiMessageIdRef.current = ""
      }
      setIsAiThinking(false)
      setIsAiStopping(false)
    }
  }

  if (!project) {
    return (
      <div className="relative grid min-h-full place-items-center px-8 py-12">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <BookOpenText className="size-6" />
          </div>
          <p className="eyebrow mt-6">写作台</p>
          <h1 className="mt-2 text-2xl font-semibold">先选择一部正在写的小说</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            从“我的作品”选择小说后，这里会显示正文目录里的全部章节。
          </p>
          <Button className="mt-6" onClick={onGoToWorks}>
            <BookOpenText className="size-4" />
            前往我的作品
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-canvas">
      <header className="z-20 flex h-[72px] shrink-0 items-center border-b border-border bg-white px-5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="返回我的作品"
          title="返回我的作品"
          className="mr-3 bg-muted"
          onClick={onGoToWorks}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="max-w-[420px] truncate text-sm font-semibold">{project.name}</h1>
            <span className="text-border">/</span>
            <span className="max-w-[280px] truncate text-sm text-muted-foreground">
              {document?.name.replace(/\.(txt|md|markdown)$/i, "") || "选择章节"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground" aria-live="polite">
            <span>{project.chapterCount} 个章节</span>
            <span className="h-3 w-px bg-border" />
            <span className="tabular-nums">正文 {numberFormatter.format(currentCharacterCount)} 字</span>
            <span className="h-3 w-px bg-border" />
            {error ? (
              <span className="flex items-center gap-1 text-destructive">
                <CircleAlert className="size-3" />
                保存失败
              </span>
            ) : isDirty ? (
              <span className="text-amber-600">尚未保存</span>
            ) : (
              <span className="flex items-center gap-1">
                <Check className="size-3 text-success" />
                已保存
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            className={isChapterPanelOpen ? "bg-secondary text-primary hover:bg-secondary" : ""}
            onClick={() => setIsChapterPanelOpen((current) => !current)}
            aria-expanded={isChapterPanelOpen}
          >
            <PanelLeft className="size-4" />
            章节目录
          </Button>
          <Button
            variant="ghost"
            className={isAiPanelOpen ? "bg-secondary text-primary hover:bg-secondary" : ""}
            onClick={() => setIsAiPanelOpen((current) => !current)}
            aria-expanded={isAiPanelOpen}
          >
            <PanelRight className="size-4" />
            AI 助手
          </Button>
          <Button
            variant="ghost"
            className={isAiMemoryDialogOpen ? "bg-secondary text-primary hover:bg-secondary" : ""}
            aria-haspopup="dialog"
            aria-expanded={isAiMemoryDialogOpen}
            onClick={() => setIsAiMemoryDialogOpen(true)}
          >
            <BrainCircuit className="size-4" />
            AI 记忆
          </Button>
          <Button
            variant="ghost"
            className={isCharacterDialogOpen ? "bg-secondary text-primary hover:bg-secondary" : ""}
            aria-haspopup="dialog"
            aria-expanded={isCharacterDialogOpen}
            onClick={() => setIsCharacterDialogOpen(true)}
          >
            <UsersRound className="size-4" />
            角色设置
          </Button>
          <Button
            variant="ghost"
            className={isWritingRulesDialogOpen ? "bg-secondary text-primary hover:bg-secondary" : ""}
            aria-haspopup="dialog"
            aria-expanded={isWritingRulesDialogOpen}
            onClick={() => setIsWritingRulesDialogOpen(true)}
          >
            <ScrollText className="size-4" />
            写作规则
          </Button>
          <Button
            variant="ghost"
            className={isReferenceStyleDialogOpen ? "bg-secondary text-primary hover:bg-secondary" : ""}
            aria-haspopup="dialog"
            aria-expanded={isReferenceStyleDialogOpen}
            onClick={() => setIsReferenceStyleDialogOpen(true)}
          >
            <BookMarked className="size-4" />
            参考文风
          </Button>
          <Button
            variant="ghost"
            className={
              gitSyncLabel === "已同步"
                ? "bg-green-50 text-green-700 hover:bg-green-50"
                : gitSyncLabel === "有冲突" || gitSyncLabel === "同步失败"
                  ? "bg-red-50 text-destructive hover:bg-red-50"
                  : ""
            }
            disabled={isGitSyncing || isSaving || isAiThinking}
            title="先拉取云端更新，再提交并推送当前作品"
            onClick={syncProjectToCloud}
          >
            {isGitSyncing
              ? <LoaderCircle className="size-4 animate-spin" />
              : <CloudUpload className="size-4" />}
            {gitSyncLabel}
          </Button>
          <Button variant="ghost" onClick={() => onOpenProjectFolder(project)}>
            <FolderOpen className="size-4" />
            打开目录
          </Button>
          <Button disabled={!isDirty || isSaving || isLoadingDocument} onClick={saveCurrentChapter}>
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            {isSaving ? "保存中" : "保存正文"}
            <span className="ml-1 text-[10px] opacity-75">Ctrl+S</span>
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
        {isChapterPanelOpen && (
            <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-[0_8px_24px_rgba(0,0,0,0.035)]">
              <div className="border-b border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">正文目录</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">{chapters.length} 个章节</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="新建章节"
                      title="新建章节"
                      onClick={() => {
                        setNewChapterError("")
                        setNewChapterName(`第${chapters.length + 1}章`)
                        setIsNewChapterFormOpen(true)
                      }}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="关闭章节目录"
                      title="收起章节目录"
                      onClick={() => setIsChapterPanelOpen(false)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
                <label className="relative block">
                  <span className="sr-only">搜索章节</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索章节"
                    className="h-9 w-full rounded-lg border border-transparent bg-muted pl-9 pr-3 text-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/35 focus:bg-white focus:ring-3 focus:ring-primary/10"
                  />
                </label>
              </div>

              {isNewChapterFormOpen && (
                <form className="border-b border-border bg-secondary/30 p-3" onSubmit={createNewChapter}>
                  <label htmlFor="new-chapter-name" className="mb-2 block text-xs font-medium">
                    新建章节
                  </label>
                  <input
                    id="new-chapter-name"
                    type="text"
                    autoFocus
                    value={newChapterName}
                    onChange={(event) => setNewChapterName(event.target.value)}
                    placeholder="例如：第26章 初见"
                    className="h-9 w-full rounded-lg border border-input bg-white px-3 text-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    未填写扩展名时自动使用 .txt
                  </p>
                  {newChapterError && (
                    <p className="mt-1.5 text-[11px] text-destructive" role="alert">{newChapterError}</p>
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isCreatingChapter}
                      onClick={() => {
                        setIsNewChapterFormOpen(false)
                        setNewChapterError("")
                      }}
                    >
                      取消
                    </Button>
                    <Button type="submit" size="sm" disabled={!newChapterName.trim() || isCreatingChapter}>
                      {isCreatingChapter ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                      {isCreatingChapter ? "创建中" : "创建"}
                    </Button>
                  </div>
                </form>
              )}

              <div ref={chapterListRef} className="min-h-0 flex-1 overflow-y-auto p-2">
                {isLoadingChapters ? (
                  <div className="grid h-28 place-items-center">
                    <LoaderCircle className="size-5 animate-spin text-primary" />
                  </div>
                ) : visibleChapters.length ? (
                  <div className="space-y-1">
                    {visibleChapters.map((chapter) => {
                      const isActive = chapter.name === activeChapterName
                      return (
                        <button
                          key={chapter.path}
                          type="button"
                          disabled={isSaving || Boolean(deletingChapterName)}
                          onClick={() => selectChapter(chapter)}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setChapterContextMenu({
                              chapter,
                              x: Math.min(event.clientX, window.innerWidth - 196),
                              y: Math.min(event.clientY, window.innerHeight - 116),
                            })
                          }}
                          onKeyDown={(event) => {
                            if (!(event.shiftKey && event.key === "F10")) return
                            event.preventDefault()
                            const bounds = event.currentTarget.getBoundingClientRect()
                            setChapterContextMenu({
                              chapter,
                              x: Math.min(bounds.left + 32, window.innerWidth - 196),
                              y: Math.min(bounds.top + 28, window.innerHeight - 116),
                            })
                          }}
                          aria-haspopup="menu"
                          className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-wait ${
                            isActive ? "bg-secondary text-primary" : "hover:bg-muted"
                          }`}
                        >
                          <span className="block truncate text-sm font-medium" title={chapter.name}>
                            {chapter.name.replace(/\.(txt|md|markdown)$/i, "")}
                          </span>
                          <span className={`mt-1 block text-[11px] tabular-nums ${
                            isActive ? "text-primary/65" : "text-muted-foreground"
                          }`}>
                            {numberFormatter.format(chapter.characterCount)} 字
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-8 text-center">
                    <FileText className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {query ? "没有匹配章节" : "正文目录里还没有章节文件"}
                    </p>
                  </div>
                )}
              </div>
            </aside>
        )}

        <section className="flex h-full min-h-[520px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/70 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.025)]">
          {isLoadingDocument ? (
            <div className="grid flex-1 place-items-center">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">正在打开章节…</p>
              </div>
            </div>
          ) : document ? (
            <>
              <div className="shrink-0 px-[clamp(3rem,10vw,9rem)] pb-3 pt-12">
                <p className="text-xs font-medium text-muted-foreground">当前章节</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
                  {document.name.replace(/\.(txt|md|markdown)$/i, "")}
                </h2>
              </div>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={false}
                aria-label={`${document.name} 正文编辑器`}
                className="min-h-0 flex-1 resize-none bg-transparent px-[clamp(3rem,10vw,9rem)] pb-16 pt-5 font-serif text-[17px] leading-9 text-foreground outline-none selection:bg-primary/15 placeholder:text-muted-foreground"
                placeholder="请输入正文……"
              />
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-8">
              <div className="max-w-sm text-center">
                <FileText className="mx-auto size-7 text-primary/60" />
                <h2 className="mt-4 text-lg font-semibold">选择一个章节开始写作</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  点击右上角“章节目录”，选择“{project.name}\正文”中的章节。
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="shrink-0 border-t border-red-100 bg-red-50 px-5 py-2 text-xs text-destructive" role="alert">
              {error}
            </div>
          )}
        </section>

        {isAiPanelOpen && (
          <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
            <div className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-4">
              <div className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
                <Bot className="size-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">AI 写作助手</h2>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={aiConfig.model}>
                  {aiConfig.model} · 已附带当前章节
                </p>
              </div>
              <div className="ml-auto flex items-center gap-0.5">
                {isAiThinking && (
                  <span
                    className="mr-1 inline-flex h-7 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[10px] font-medium text-primary"
                    role="status"
                    aria-live="polite"
                  >
                    <LoaderCircle className="size-3 animate-spin" />
                    {isAiStopping ? "停止中" : "运行中"}
                  </span>
                )}
                {aiMessages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="清空对话"
                    title={hasPendingAiChanges ? "请先保存或取消待确认修改" : "清空对话"}
                    disabled={
                      isAiThinking
                      || isAiHistoryLoading
                      || isAiCompacting
                      || hasPendingAiChanges
                    }
                    onClick={async () => {
                      updateAiMessages([])
                      setAiChatSummary("")
                      setAiCompactedCount(0)
                      setAiError("")
                      setAiNotice("")
                      try {
                        await window.authorDesk.ai.clearHistory(project.path)
                      } catch (historyError) {
                        setAiError(historyError instanceof Error
                          ? historyError.message
                          : "无法清空 AI 对话历史")
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="关闭 AI 助手"
                  title="关闭 AI 助手"
                  onClick={() => setIsAiPanelOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              {!aiConfig.hasApiKey ? (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                  <div className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                    <Settings2 className="size-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">先配置 API Key</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    AI 请求会由 Electron 主进程直接发送。
                  </p>
                  <Button size="sm" className="mt-4" onClick={onOpenSettings}>
                    <Settings2 className="size-3.5" />
                    前往设置
                  </Button>
                </div>
              ) : isAiHistoryLoading ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                  <p className="mt-3 text-xs">正在恢复这部作品的对话…</p>
                </div>
              ) : aiMessages.length === 0 && !isAiThinking ? (
                <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                  <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                    <Sparkles className="size-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">和 AI 一起打磨这一章</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    可以讨论剧情，也可以明确要求它读取、创建或修改作品文件。
                  </p>
                  <div className="mt-5 grid w-full grid-cols-1 gap-2">
                    {["续写下一段", "检查人物是否前后一致", "润色当前章节的开头"].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="rounded-lg border border-border bg-muted/35 px-3 py-2.5 text-left text-xs transition-colors hover:border-primary/20 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        onClick={() => sendAiMessage(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {aiChatSummary && (
                    <details className="rounded-xl border border-primary/10 bg-secondary/45 px-3 py-2.5 text-[11px]">
                      <summary className="cursor-pointer select-none font-medium text-primary">
                        已自动压缩 {aiCompactedCount} 条早期消息
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap leading-5 text-muted-foreground">
                        {aiChatSummary}
                      </p>
                    </details>
                  )}
                  {isAiCompacting && (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">
                      <LoaderCircle className="size-3.5 animate-spin text-primary" />
                      正在压缩较早的对话记忆…
                    </div>
                  )}
                  {aiMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`ai-message-enter flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`group max-w-[92%] ${
                        message.role === "user"
                          ? "rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-foreground shadow-[0_6px_18px_rgba(255,77,31,0.06)]"
                          : `min-w-0 rounded-2xl rounded-tl-md border bg-white px-3.5 py-3 shadow-[0_8px_24px_rgba(35,27,23,0.045)] ${
                              message.hasError ? "border-red-200 bg-red-50/35" : "border-border"
                            }`
                      }`}>
                        {message.role === "assistant" && (
                          <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-primary">
                            <span className={`grid size-5 shrink-0 place-items-center rounded-full bg-secondary ${
                              message.isStreaming ? "ai-assistant-breathe" : ""
                            }`}>
                              <Bot className="size-3" />
                            </span>
                            AI 助手
                            {message.status && (
                              <span className={`ml-auto max-w-36 truncate rounded-full px-2 py-0.5 text-[9px] ${
                                message.hasError
                                  ? "bg-red-100 text-destructive"
                                  : message.isStreaming
                                    ? "ai-status-shimmer bg-secondary text-primary"
                                    : message.changeStatus === "pending"
                                      ? "bg-amber-50 text-amber-700"
                                    : message.changeStatus === "expired"
                                      ? "bg-amber-50 text-amber-700"
                                    : message.status === "已自动审核并收束"
                                      ? "bg-emerald-50 text-success"
                                      : "bg-muted text-muted-foreground"
                              }`}>
                                {message.status}
                              </span>
                            )}
                          </div>
                        )}
                        {message.role === "assistant" && message.isStreaming && !message.content ? (
                          <div className="flex items-center gap-3 py-2" aria-live="polite">
                            <span className="ai-thinking-orbit relative grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                              <Sparkles className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="ai-loading-line h-2 w-full rounded-full bg-muted" />
                              <div className="ai-loading-line h-2 w-2/3 rounded-full bg-muted [animation-delay:180ms]" />
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-xs leading-5">
                            {message.role === "assistant"
                              ? formatAiDisplayContent(message.content)
                              : message.content}
                            {message.isStreaming && <span className="ai-stream-cursor ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 rounded-full bg-primary" />}
                          </p>
                        )}

                        {getVisibleAiToolEvents(message.toolEvents).map((toolEvent, index) => (
                          <details
                            key={`${message.id}-${toolEvent.path}-${index}`}
                            className="group/diff ai-tool-enter mt-2 overflow-hidden rounded-lg border border-border bg-muted/35"
                            defaultOpen={Boolean(toolEvent.diff)}
                          >
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-medium">
                              <Wrench className="size-3.5 text-primary" />
                              <span>{toolEvent.label}</span>
                              <span className="ml-auto max-w-32 truncate text-muted-foreground" title={toolEvent.path}>
                                {toolEvent.path}
                              </span>
                              {toolEvent.diff && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] text-muted-foreground">
                                  <span className="group-open/diff:hidden">展开</span>
                                  <span className="hidden group-open/diff:inline">收起</span>
                                  <ChevronDown className="size-3 transition-transform group-open/diff:rotate-180" />
                                </span>
                              )}
                            </summary>
                            {toolEvent.diff && (
                              <AiDiffView diff={toolEvent.diff} />
                            )}
                          </details>
                        ))}

                        {message.changeStatus === "pending" && message.changeSetId && (
                          <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50/55 p-2.5">
                            <div className="flex items-start gap-2">
                              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                              <p className="text-[10px] leading-4 text-amber-800">
                                文件尚未写入。请检查上方差异，然后保存或取消整组修改。
                              </p>
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 border-amber-200 bg-white px-2.5 text-[10px] hover:bg-amber-50"
                                disabled={Boolean(activeAiChangeSetId)}
                                onClick={() => cancelPendingAiChanges(message)}
                              >
                                {activeAiChangeSetId === message.changeSetId
                                  && activeAiChangeAction === "cancel" && (
                                  <LoaderCircle className="size-3 animate-spin" />
                                )}
                                取消修改
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-[10px]"
                                disabled={Boolean(activeAiChangeSetId) || isDirty}
                                title={isDirty ? "请先保存当前正文" : "将整组修改写入作品文件"}
                                onClick={() => savePendingAiChanges(message)}
                              >
                                {activeAiChangeSetId === message.changeSetId
                                  && activeAiChangeAction === "save" && (
                                  <LoaderCircle className="size-3 animate-spin" />
                                )}
                                保存修改
                              </Button>
                            </div>
                          </div>
                        )}

                        {message.role === "assistant" && !message.isStreaming && Boolean(message.content) && (
                          <button
                            type="button"
                            className="mt-1.5 grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                            aria-label="复制回答"
                            title="复制回答"
                            onClick={() => navigator.clipboard.writeText(
                              formatAiDisplayContent(message.content),
                            )}
                          >
                            <Copy className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  <div ref={aiMessagesEndRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border p-3">
              {aiNotice && (
                <div
                  className="mb-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-4 text-emerald-700"
                  role="status"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                  <span>{aiNotice}</span>
                </div>
              )}
              {aiError && (
                <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] leading-4 text-destructive" role="alert">
                  {aiError}
                </div>
              )}
              <div className="rounded-xl border border-border bg-white p-2 shadow-[0_8px_22px_rgba(0,0,0,0.035)] focus-within:border-primary/30 focus-within:ring-3 focus-within:ring-primary/10">
                <textarea
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) return
                    event.preventDefault()
                    sendAiMessage()
                  }}
                  rows={3}
                  disabled={
                    !aiConfig.hasApiKey
                    || isAiThinking
                    || isAiHistoryLoading
                    || isAiCompacting
                    || hasPendingAiChanges
                  }
                  aria-label="AI 对话内容"
                  placeholder={isAiHistoryLoading
                    ? "正在恢复历史对话…"
                    : isAiCompacting
                      ? "正在压缩较早的对话记忆…"
                    : isAiThinking
                      ? "AI 正在回复…"
                      : hasPendingAiChanges
                        ? "请先保存或取消上方待确认修改…"
                      : "向 AI 提问，或让它修改作品文件…"}
                  className="w-full resize-none bg-transparent px-1.5 py-1 text-xs leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="pl-1 text-[10px] text-muted-foreground">
                    {isAiThinking
                      ? isAiStopping
                        ? "正在安全停止当前任务…"
                        : "AI 正在运行，可随时手动停止"
                      : hasPendingAiChanges
                        ? "请先保存或取消待确认修改"
                      : isDirty
                        ? "请先保存正文，AI 才能修改文件"
                        : "Enter 发送 · Shift+Enter 换行"}
                  </span>
                  {isAiThinking ? (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="border-primary/20 bg-secondary text-primary hover:border-primary/35 hover:bg-primary/10"
                      aria-label={isAiStopping ? "正在停止 AI" : "停止 AI"}
                      title={isAiStopping ? "正在停止" : "停止生成"}
                      disabled={isAiStopping}
                      onClick={stopAiMessage}
                    >
                      {isAiStopping
                        ? <LoaderCircle className="size-3.5 animate-spin" />
                        : <Square className="size-3 fill-current" />}
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      aria-label="发送消息"
                      title="发送"
                      disabled={
                        !aiConfig.hasApiKey
                        || !aiInput.trim()
                        || isAiHistoryLoading
                        || isAiCompacting
                        || hasPendingAiChanges
                      }
                      onClick={() => sendAiMessage()}
                    >
                      <Send className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {chapterContextMenu && (
        <>
          <div
            className="fixed inset-0 z-[70]"
            aria-hidden="true"
            onMouseDown={() => setChapterContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault()
              setChapterContextMenu(null)
            }}
          />
          <div
            role="menu"
            aria-label={`${chapterContextMenu.chapter.name}的操作`}
            className="fixed z-[71] w-48 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-[0_16px_45px_rgba(34,24,20,0.16)]"
            style={{
              left: chapterContextMenu.x,
              top: chapterContextMenu.y,
            }}
          >
            <div className="border-b border-border px-2.5 py-2">
              <p className="truncate text-[11px] font-medium text-muted-foreground">
                {chapterContextMenu.chapter.name.replace(/\.(txt|md|markdown)$/i, "")}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              disabled={Boolean(deletingChapterName)}
              className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-destructive transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
              onClick={() => deleteChapter(chapterContextMenu.chapter)}
            >
              {deletingChapterName === chapterContextMenu.chapter.name ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              移到回收站
            </button>
            <p className="px-2.5 pb-1.5 pt-1 text-[10px] text-muted-foreground">
              删除后仍可从系统回收站恢复
            </p>
          </div>
        </>
      )}

      {isGitSyncDialogOpen && (
        <div
          className="fixed inset-0 z-[118] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsGitSyncDialogOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="git-sync-result-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(44,25,17,0.18)]"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-red-50 text-destructive">
                <TriangleAlert className="size-4.5" />
              </div>
              <div className="min-w-0">
                <h2 id="git-sync-result-title" className="text-sm font-semibold">
                  {gitSyncResult?.status === "conflict" ? "Git 同步发现冲突" : "Git 同步未完成"}
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  已停止自动操作，没有覆盖或丢弃任何文件
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label="关闭 Git 同步提示"
                onClick={() => setIsGitSyncDialogOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </header>

            <div className="space-y-4 p-5">
              <p className="rounded-xl bg-red-50 px-4 py-3 text-xs leading-5 text-destructive">
                {gitSyncError || gitSyncResult?.message || "Git 同步失败"}
              </p>

              {Boolean(gitSyncResult?.conflictFiles.length) && (
                <section>
                  <h3 className="text-xs font-semibold">需要手动合并的文件</h3>
                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/35 p-2">
                    {gitSyncResult?.conflictFiles.map((filePath) => (
                      <div
                        key={filePath}
                        className="rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-foreground/80"
                      >
                        {filePath}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {gitSyncResult?.status === "conflict" && (
                <section className="rounded-xl border border-border p-4">
                  <h3 className="text-xs font-semibold">手动处理步骤</h3>
                  <ol className="mt-3 list-decimal space-y-2 pl-4 text-[11px] leading-5 text-muted-foreground">
                    <li>打开作品目录，合并上面列出的冲突文件并保存。</li>
                    <li>
                      在该目录执行 <code className="rounded bg-muted px-1 py-0.5">git add -A</code>。
                    </li>
                    <li>
                      {gitSyncResult.operation === "merge"
                        ? "完成合并提交后，再点击同步按钮。"
                        : (
                          <>
                            执行 <code className="rounded bg-muted px-1 py-0.5">git rebase --continue</code>，
                            完成后再点击同步。
                          </>
                        )}
                    </li>
                  </ol>
                </section>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-border bg-muted/25 px-5 py-3">
              <Button variant="outline" onClick={() => onOpenProjectFolder(project)}>
                <FolderOpen className="size-4" />
                打开作品目录
              </Button>
              <Button onClick={() => setIsGitSyncDialogOpen(false)}>知道了</Button>
            </footer>
          </section>
        </div>
      )}

      <AiMemoryDialog
        open={isAiMemoryDialogOpen}
        project={project}
        chapters={chapters}
        activeChapterName={activeChapterName}
        chapterContent={content}
        messages={aiMessages}
        isDirty={isDirty}
        apiConfig={aiConfig}
        onClose={() => setIsAiMemoryDialogOpen(false)}
        onOpenCharacterSettings={() => {
          setIsAiMemoryDialogOpen(false)
          setIsCharacterDialogOpen(true)
        }}
      />

      <CharacterSettingsDialog
        open={isCharacterDialogOpen}
        project={project}
        hasUnsavedChanges={isDirty}
        onClose={() => setIsCharacterDialogOpen(false)}
        onOpenSettings={() => {
          setIsCharacterDialogOpen(false)
          onOpenSettings()
        }}
      />

      <WritingRulesDialog
        open={isWritingRulesDialogOpen}
        project={project}
        onClose={() => setIsWritingRulesDialogOpen(false)}
      />

      <ReferenceStyleDialog
        open={isReferenceStyleDialogOpen}
        project={project}
        onClose={() => setIsReferenceStyleDialogOpen(false)}
      />
    </div>
  )
}
