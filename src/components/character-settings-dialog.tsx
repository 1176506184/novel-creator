import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Braces,
  CalendarClock,
  FileJson2,
  LoaderCircle,
  Network,
  Settings2,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  CharacterGraph,
  CharacterProfile,
  CharacterRelationship,
  LibraryProject,
} from "@/types/library"

type CharacterSettingsDialogProps = {
  open: boolean
  project: LibraryProject | null
  hasUnsavedChanges: boolean
  onClose: () => void
  onOpenSettings: () => void
}

type GraphPosition = {
  x: number
  y: number
}

const graphWidth = 920
const graphHeight = 520

function formatGeneratedAt(value: string) {
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

function truncateNodeName(name: string) {
  return name.length > 7 ? `${name.slice(0, 7)}…` : name
}

function RelationshipGraph({
  graph,
  selectedCharacterId,
  onSelectCharacter,
}: {
  graph: CharacterGraph
  selectedCharacterId: string
  onSelectCharacter: (characterId: string) => void
}) {
  const positions = useMemo(() => {
    const positionMap = new Map<string, GraphPosition>()
    if (graph.characters.length === 1) {
      positionMap.set(graph.characters[0].id, {
        x: graphWidth / 2,
        y: graphHeight / 2,
      })
      return positionMap
    }
    const outerCount = Math.min(graph.characters.length, 14)
    graph.characters.forEach((character, index) => {
      const ringIndex = Math.floor(index / outerCount)
      const indexInRing = index % outerCount
      const countInRing = Math.min(outerCount, graph.characters.length - ringIndex * outerCount)
      const angle = (Math.PI * 2 * indexInRing) / countInRing - Math.PI / 2
      const radiusX = Math.max(150, 370 - ringIndex * 112)
      const radiusY = Math.max(105, 205 - ringIndex * 64)
      positionMap.set(character.id, {
        x: graphWidth / 2 + Math.cos(angle) * radiusX,
        y: graphHeight / 2 + Math.sin(angle) * radiusY,
      })
    })
    return positionMap
  }, [graph.characters])

  const relatedRelationshipIds = useMemo(() => new Set(
    graph.relationships
      .filter((relationship) => (
        relationship.source === selectedCharacterId
        || relationship.target === selectedCharacterId
      ))
      .map((relationship) => relationship.id),
  ), [graph.relationships, selectedCharacterId])

  return (
    <div className="min-h-[420px] overflow-auto rounded-xl border border-border bg-[#fffdfc]">
      <svg
        viewBox={`0 0 ${graphWidth} ${graphHeight}`}
        className="h-full min-h-[500px] min-w-[760px] w-full"
        role="img"
        aria-label={`${graph.projectName}的人物关系图`}
      >
        <defs>
          <marker
            id="character-relation-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#f3a07f" />
          </marker>
        </defs>

        {graph.relationships.map((relationship) => {
          const source = positions.get(relationship.source)
          const target = positions.get(relationship.target)
          if (!source || !target) return null
          const isRelated = relatedRelationshipIds.has(relationship.id)
          const isDimmed = Boolean(selectedCharacterId) && !isRelated
          const midpointX = (source.x + target.x) / 2
          const midpointY = (source.y + target.y) / 2
          return (
            <g
              key={relationship.id}
              opacity={isDimmed ? 0.16 : 0.82}
              className="transition-opacity"
            >
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={isRelated ? "#ff5f32" : "#e8aa92"}
                strokeWidth={Math.max(1.2, relationship.strength * 0.55)}
                markerEnd="url(#character-relation-arrow)"
              />
              <rect
                x={midpointX - 29}
                y={midpointY - 10}
                width="58"
                height="20"
                rx="10"
                fill="#fffaf7"
                stroke={isRelated ? "#ffd3c1" : "#f1e3dd"}
              />
              <text
                x={midpointX}
                y={midpointY + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={isRelated ? "#e94316" : "#8c8c8c"}
              >
                {relationship.type.slice(0, 7)}
              </text>
            </g>
          )
        })}

        {graph.characters.map((character) => {
          const position = positions.get(character.id)
          if (!position) return null
          const isSelected = character.id === selectedCharacterId
          const hasSelection = Boolean(selectedCharacterId)
          const isRelated = graph.relationships.some((relationship) => (
            (relationship.source === selectedCharacterId && relationship.target === character.id)
            || (relationship.target === selectedCharacterId && relationship.source === character.id)
          ))
          return (
            <g
              key={character.id}
              role="button"
              tabIndex={0}
              aria-label={`查看人物：${character.name}`}
              onClick={() => onSelectCharacter(character.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelectCharacter(character.id)
                }
              }}
              opacity={hasSelection && !isSelected && !isRelated ? 0.42 : 1}
              className="cursor-pointer outline-none transition-opacity"
            >
              <circle
                cx={position.x}
                cy={position.y}
                r={isSelected ? 43 : 38}
                fill={isSelected ? "#fff0e8" : "#ffffff"}
                stroke={isSelected ? "#ff4d1f" : "#f0d8ce"}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              <circle
                cx={position.x}
                cy={position.y - 8}
                r="9"
                fill={isSelected ? "#ff4d1f" : "#f7a07e"}
              />
              <path
                d={`M ${position.x - 14} ${position.y + 12} Q ${position.x} ${position.y - 1} ${position.x + 14} ${position.y + 12}`}
                fill={isSelected ? "#ff4d1f" : "#f7a07e"}
              />
              <rect
                x={position.x - 42}
                y={position.y + 29}
                width="84"
                height="22"
                rx="11"
                fill={isSelected ? "#ff4d1f" : "#fff5f0"}
              />
              <text
                x={position.x}
                y={position.y + 44}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill={isSelected ? "#ffffff" : "#8f3516"}
              >
                {truncateNodeName(character.name)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CharacterDetails({
  character,
  relationships,
  graph,
}: {
  character: CharacterProfile | null
  relationships: CharacterRelationship[]
  graph: CharacterGraph
}) {
  if (!character) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">
        选择一个人物查看设定
      </div>
    )
  }

  const characterNameById = new Map(graph.characters.map((item) => [item.id, item.name]))

  return (
    <aside className="min-h-[420px] overflow-y-auto rounded-xl border border-border bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <UserRound className="size-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{character.name}</h3>
          <p className="mt-0.5 text-xs font-medium text-primary">{character.role}</p>
        </div>
      </div>

      {character.aliases.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {character.aliases.map((alias) => (
            <span key={alias} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              {alias}
            </span>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm leading-6 text-foreground/80">{character.description}</p>

      <div className="mt-5 space-y-4 border-t border-border pt-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">性格</p>
          <p className="mt-1.5 text-sm">{character.personality.join(" · ") || "未明确"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">人物目标</p>
          <p className="mt-1.5 text-sm leading-6">{character.goals.join("；") || "未明确"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">首次出现</p>
          <p className="mt-1.5 text-sm">{character.firstAppearance}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">
          关联关系 · {relationships.length}
        </p>
        <div className="mt-3 space-y-2">
          {relationships.length ? relationships.map((relationship) => {
            const counterpartId = relationship.source === character.id
              ? relationship.target
              : relationship.source
            return (
              <div key={relationship.id} className="rounded-lg bg-muted/55 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="text-primary">{relationship.type}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{characterNameById.get(counterpartId) || "未知人物"}</span>
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                    强度 {relationship.strength}/5
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {relationship.description}
                </p>
              </div>
            )
          }) : (
            <p className="text-xs text-muted-foreground">正文中暂未识别到明确关系。</p>
          )}
        </div>
      </div>
    </aside>
  )
}

export function CharacterSettingsDialog({
  open,
  project,
  hasUnsavedChanges,
  onClose,
  onOpenSettings,
}: CharacterSettingsDialogProps) {
  const [graph, setGraph] = useState<CharacterGraph | null>(null)
  const [graphPath, setGraphPath] = useState("")
  const [selectedCharacterId, setSelectedCharacterId] = useState("")
  const [activeView, setActiveView] = useState<"graph" | "json">("graph")
  const [isLoading, setIsLoading] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSummarizing) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isSummarizing, onClose, open])

  useEffect(() => {
    if (!open || !project) return
    let isCancelled = false
    setIsLoading(true)
    setError("")
    setGraph(null)
    setGraphPath("")
    setSelectedCharacterId("")
    window.authorDesk.characters.get(project.path)
      .then((state) => {
        if (isCancelled) return
        setGraph(state.graph)
        setGraphPath(state.path)
        setSelectedCharacterId(state.graph?.characters[0]?.id || "")
      })
      .catch((loadError) => {
        if (isCancelled) return
        setError(loadError instanceof Error ? loadError.message : "读取角色设置失败")
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [open, project])

  const selectedCharacter = useMemo(() => (
    graph?.characters.find((character) => character.id === selectedCharacterId)
    || graph?.characters[0]
    || null
  ), [graph, selectedCharacterId])

  const selectedRelationships = useMemo(() => {
    if (!graph || !selectedCharacter) return []
    return graph.relationships.filter((relationship) => (
      relationship.source === selectedCharacter.id
      || relationship.target === selectedCharacter.id
    ))
  }, [graph, selectedCharacter])

  const serializedGraph = useMemo(
    () => graph ? JSON.stringify(graph, null, 2) : "",
    [graph],
  )

  async function summarizeCharacters() {
    if (!project || hasUnsavedChanges || isSummarizing) return
    if (
      graph
      && !window.confirm("重新总结会覆盖当前作品的“角色设置/人物关系.json”，确定继续吗？")
    ) return
    setIsSummarizing(true)
    setError("")
    try {
      const state = await window.authorDesk.characters.summarize(project.path)
      setGraph(state.graph)
      setGraphPath(state.path)
      setSelectedCharacterId(state.graph?.characters[0]?.id || "")
      setActiveView("graph")
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "AI 总结失败")
    } finally {
      setIsSummarizing(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSummarizing) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-settings-title"
        className="flex h-[min(820px,calc(100vh-40px))] w-[min(1260px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-border bg-white px-6 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <Network className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="character-settings-title" className="truncate text-lg font-semibold">
              角色设置
              {project && <span className="ml-2 font-normal text-muted-foreground">· {project.name}</span>}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              AI 通读正文后生成可持久化的人物与关系数据
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isSummarizing}
              onClick={onOpenSettings}
            >
              <Settings2 className="size-3.5" />
              API 设置
            </Button>
            <Button
              size="sm"
              disabled={!project || hasUnsavedChanges || isLoading || isSummarizing}
              onClick={summarizeCharacters}
            >
              {isSummarizing ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {isSummarizing ? "正在通读正文…" : graph ? "重新总结" : "AI 总结正文"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭角色设置"
              title="关闭"
              disabled={isSummarizing}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {(error || hasUnsavedChanges) && (
          <div className={`mx-6 mt-4 flex shrink-0 items-start gap-2 rounded-xl border px-4 py-3 text-xs ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}>
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {error || "当前章节有未保存修改。请先保存正文，再让 AI 总结，避免角色数据遗漏。"}
            </span>
          </div>
        )}

        {graph && (
          <div className="flex shrink-0 items-center gap-2 px-6 pb-3 pt-4">
            <button
              type="button"
              className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
                activeView === "graph"
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-white"
              }`}
              onClick={() => setActiveView("graph")}
            >
              <Network className="size-4" />
              关系图
            </button>
            <button
              type="button"
              className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
                activeView === "json"
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-white"
              }`}
              onClick={() => setActiveView("json")}
            >
              <Braces className="size-4" />
              JSON 数据
            </button>
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <UsersRound className="size-3.5" />
                {graph.characters.length} 人
              </span>
              <span className="flex items-center gap-1.5">
                <Network className="size-3.5" />
                {graph.relationships.length} 条关系
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                {formatGeneratedAt(graph.generatedAt)}
              </span>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 px-6 pb-5">
          {isLoading ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-border bg-white">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">正在读取角色设置…</p>
              </div>
            </div>
          ) : !graph ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-primary/25 bg-white">
              <div className="max-w-md px-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
                  <UsersRound className="size-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">还没有人物关系数据</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  AI 会一次性读取“正文”目录内的全部章节，归纳人物身份、性格、目标和相互关系。
                </p>
                <Button
                  className="mt-5"
                  disabled={!project || hasUnsavedChanges || isSummarizing}
                  onClick={summarizeCharacters}
                >
                  {isSummarizing ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isSummarizing ? "正在总结…" : "开始 AI 总结"}
                </Button>
              </div>
            </div>
          ) : activeView === "json" ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
                <FileJson2 className="size-4 text-primary" />
                <span className="truncate">{graphPath}</span>
              </div>
              <pre className="min-h-0 flex-1 select-text overflow-auto p-5 font-mono text-xs leading-5 text-foreground/80">
                {serializedGraph}
              </pre>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-4">
              <RelationshipGraph
                graph={graph}
                selectedCharacterId={selectedCharacter?.id || ""}
                onSelectCharacter={setSelectedCharacterId}
              />
              <CharacterDetails
                character={selectedCharacter}
                relationships={selectedRelationships}
                graph={graph}
              />
            </div>
          )}
        </div>

        {graph && (
          <footer className="flex shrink-0 items-center gap-5 border-t border-border bg-white px-6 py-3 text-[11px] text-muted-foreground">
            <span>{graph.source.chapterCount} 章正文</span>
            <span>{graph.source.characterCount.toLocaleString("zh-CN")} 字</span>
            <span className="ml-auto flex min-w-0 items-center gap-1.5">
              <FileJson2 className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{graphPath}</span>
            </span>
          </footer>
        )}
      </section>
    </div>
  )
}
