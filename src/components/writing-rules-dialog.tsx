import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  FileText,
  FolderOpen,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  LibraryProject,
  WritingRuleFile,
  WritingRulesState,
} from "@/types/library"

type WritingRulesDialogProps = {
  open: boolean
  project: LibraryProject
  onClose: () => void
}

function formatModifiedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知时间"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function countMatches(content: string, pattern: RegExp) {
  return content.match(pattern)?.length || 0
}

function ruleStats(rule: WritingRuleFile) {
  return {
    mandatory: countMatches(rule.content, /严禁|禁止|绝不能|必须|不得/g),
    guidance: countMatches(rule.content, /避免|警惕|建议|不要|尽量/g),
    examples: countMatches(rule.content, /正确示范|错误示范|示例|替代方案/g),
    sections: rule.headings.length,
  }
}

function RuleContent({ rule }: { rule: WritingRuleFile }) {
  return (
    <div className="select-text space-y-1 px-7 py-6 text-sm leading-7 text-foreground/80">
      {rule.content.split(/\r?\n/).map((line, index) => {
        const heading = line.match(/^(#{1,6})\s+(.+)$/)
        if (heading) {
          const level = heading[1].length
          return (
            <h3
              key={`${index}-${line}`}
              className={`font-semibold text-foreground ${
                level === 1
                  ? "pb-3 pt-1 text-xl"
                  : level === 2
                    ? "pb-1 pt-5 text-base"
                    : "pt-3 text-sm"
              }`}
            >
              {heading[2].replace(/\*\*/g, "")}
            </h3>
          )
        }
        const bullet = line.match(/^\s*[-*]\s+(.+)$/)
        if (bullet) {
          return (
            <div key={`${index}-${line}`} className="flex gap-2 pl-1">
              <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-primary/65" />
              <p>{bullet[1].replace(/\*\*/g, "")}</p>
            </div>
          )
        }
        if (!line.trim()) return <div key={`space-${index}`} className="h-2" />
        return <p key={`${index}-${line}`}>{line.replace(/\*\*/g, "")}</p>
      })}
    </div>
  )
}

function StatBar({
  label,
  value,
  maximum,
  color,
}: {
  label: string
  value: number
  maximum: number
  color: string
}) {
  const width = value ? Math.max(8, Math.round((value / Math.max(1, maximum)) * 100)) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export function WritingRulesDialog({
  open,
  project,
  onClose,
}: WritingRulesDialogProps) {
  const [state, setState] = useState<WritingRulesState | null>(null)
  const [selectedRulePath, setSelectedRulePath] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [refreshVersion, setRefreshVersion] = useState(0)

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
    setIsLoading(true)
    setError("")
    window.authorDesk.rules.get(project.path)
      .then((nextState) => {
        if (isCancelled) return
        setState(nextState)
        setSelectedRulePath((current) => (
          nextState.rules.some((rule) => rule.relativePath === current)
            ? current
            : nextState.rules[0]?.relativePath || ""
        ))
      })
      .catch((loadError) => {
        if (isCancelled) return
        setState(null)
        setError(loadError instanceof Error ? loadError.message : "无法读取 Trae 规则目录")
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [open, project.path, refreshVersion])

  const selectedRule = useMemo(() => (
    state?.rules.find((rule) => rule.relativePath === selectedRulePath)
    || state?.rules[0]
    || null
  ), [selectedRulePath, state])

  const allStats = useMemo(() => {
    const stats = state?.rules.map(ruleStats) || []
    return {
      mandatory: stats.reduce((total, item) => total + item.mandatory, 0),
      guidance: stats.reduce((total, item) => total + item.guidance, 0),
      examples: stats.reduce((total, item) => total + item.examples, 0),
      sections: stats.reduce((total, item) => total + item.sections, 0),
    }
  }, [state])

  const selectedStats = selectedRule ? ruleStats(selectedRule) : null
  const maxSelectedStat = selectedStats
    ? Math.max(
        selectedStats.mandatory,
        selectedStats.guidance,
        selectedStats.examples,
        selectedStats.sections,
        1,
      )
    : 1
  const injectionRatio = state
    ? Math.min(100, Math.round((state.injectedCharacters / 60_000) * 100))
    : 0

  async function openRulesFolder() {
    await window.authorDesk.rules.openFolder(project.path)
    setRefreshVersion((current) => current + 1)
  }

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
        aria-labelledby="writing-rules-title"
        className="flex h-[min(840px,calc(100vh-40px))] w-[min(1280px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-border bg-white px-6 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <ScrollText className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 id="writing-rules-title" className="truncate text-lg font-semibold">
              写作规则
              <span className="ml-2 font-normal text-muted-foreground">· {project.name}</span>
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              直接读取当前小说的 .trae/rules 目录
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              onClick={() => setRefreshVersion((current) => current + 1)}
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button variant="ghost" size="sm" onClick={openRulesFolder}>
              <FolderOpen className="size-3.5" />
              打开规则目录
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭写作规则"
              title="关闭"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex shrink-0 items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 p-5">
          {isLoading && !state ? (
            <div className="grid h-full place-items-center rounded-xl border border-border bg-white">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">正在读取 Trae 规则…</p>
              </div>
            </div>
          ) : !state?.rules.length ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-primary/25 bg-white">
              <div className="max-w-md px-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
                  <ScrollText className="size-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">规则目录暂时为空</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  在当前小说的 `.trae/rules` 目录中放入 Markdown 或 TXT 文件，刷新后即可可视化并自动注入 AI 对话。
                </p>
                <Button className="mt-5" onClick={openRulesFolder}>
                  <FolderOpen className="size-4" />
                  打开规则目录
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_290px] gap-4">
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white">
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FolderOpen className="size-4 text-primary" />
                    规则目录
                    <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] text-primary">
                      {state.rules.length}
                    </span>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {state.rules.map((rule, index) => {
                    const isSelected = rule.relativePath === selectedRule?.relativePath
                    return (
                      <button
                        key={rule.relativePath}
                        type="button"
                        className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition-colors ${
                          isSelected
                            ? "bg-secondary text-secondary-foreground"
                            : "hover:bg-muted/65"
                        }`}
                        onClick={() => setSelectedRulePath(rule.relativePath)}
                      >
                        <div className="flex items-start gap-2">
                          <FileText className={`mt-0.5 size-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{rule.name}</p>
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">
                              {rule.headings.length} 节 · {rule.characterCount.toLocaleString("zh-CN")} 字符
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold text-success">{index + 1}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="border-t border-border px-4 py-3 text-[10px] leading-4 text-muted-foreground">
                  数字表示稳定的合并顺序；目录内的规则文件默认全部生效。
                </div>
              </aside>

              <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white">
                {selectedRule && (
                  <>
                    <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{selectedRule.name}</h3>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {selectedRule.relativePath} · 更新于 {formatModifiedAt(selectedRule.modifiedAt)}
                        </p>
                      </div>
                      <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-medium text-success">
                        <CheckCircle2 className="size-3" />
                        已注入
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <RuleContent rule={selectedRule} />
                    </div>
                  </>
                )}
              </main>

              <aside className="min-h-0 space-y-4 overflow-y-auto">
                <section className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4 text-primary" />
                    生效链路
                  </div>
                  <div className="mt-4 space-y-2">
                    {[
                      [".trae/rules", `${state.rules.length} 个文件`],
                      ["规则合并", `${state.totalCharacters.toLocaleString("zh-CN")} 字符`],
                      ["系统上下文", `${state.injectedCharacters.toLocaleString("zh-CN")} 字符`],
                      ["AI 创作助手", "每次请求加载"],
                    ].map(([title, detail], index, items) => (
                      <div key={title}>
                        <div className="rounded-lg border border-primary/10 bg-secondary/45 px-3 py-2.5">
                          <p className="text-xs font-semibold">{title}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
                        </div>
                        {index < items.length - 1 && (
                          <ArrowDown className="mx-auto my-1 size-3.5 text-primary/55" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>上下文占用</span>
                      <span>{injectionRatio}% / 60,000</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${injectionRatio}%` }} />
                    </div>
                    {state.totalCharacters > state.injectedCharacters && (
                      <p className="mt-2 text-[10px] leading-4 text-amber-600">
                        规则内容超过注入上限，末尾部分不会进入 AI 上下文。
                      </p>
                    )}
                  </div>
                </section>

                {selectedStats && (
                  <section className="rounded-xl border border-border bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Gauge className="size-4 text-primary" />
                      当前规则结构
                    </div>
                    <div className="mt-4 space-y-3">
                      <StatBar label="强制约束" value={selectedStats.mandatory} maximum={maxSelectedStat} color="bg-red-400" />
                      <StatBar label="风格建议" value={selectedStats.guidance} maximum={maxSelectedStat} color="bg-amber-400" />
                      <StatBar label="正反示例" value={selectedStats.examples} maximum={maxSelectedStat} color="bg-primary" />
                      <StatBar label="规则章节" value={selectedStats.sections} maximum={maxSelectedStat} color="bg-blue-400" />
                    </div>
                  </section>
                )}

                <section className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Scale className="size-4 text-primary" />
                    全部规则概览
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["强制", allStats.mandatory],
                      ["建议", allStats.guidance],
                      ["示例", allStats.examples],
                      ["章节", allStats.sections],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-muted/55 px-3 py-2.5 text-center">
                        <p className="text-base font-semibold">{value}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                    规则作为系统上下文注入，人物记忆与最新正文仍会同时提供给 AI。
                  </p>
                </section>
              </aside>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-6 py-3 text-[11px] text-muted-foreground">
          <FolderOpen className="size-3.5 text-primary" />
          <span className="truncate">{state?.root || `${project.path}\\.trae\\rules`}</span>
          <span className="ml-auto">支持 .md、.markdown、.mdc、.txt</span>
        </footer>
      </section>
    </div>
  )
}
