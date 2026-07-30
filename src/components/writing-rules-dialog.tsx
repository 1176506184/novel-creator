import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  EyeOff,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  ShieldCheck,
  Trash2,
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

const NEW_RULE_TEMPLATE = `# 新规则

## 必须遵守

- 在这里填写必须遵守的规则

## 应当避免

- 在这里填写应当避免的写法
`

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

function formatRuleError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "")
  return rawMessage
    .replace(/^Error invoking remote method ['"]rules:[^'"]+['"]:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    || "写作规则操作失败"
}

export function WritingRulesDialog({
  open,
  project,
  onClose,
}: WritingRulesDialogProps) {
  const [state, setState] = useState<WritingRulesState | null>(null)
  const [selectedRulePath, setSelectedRulePath] = useState("")
  const [draftContent, setDraftContent] = useState("")
  const [newRuleName, setNewRuleName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [busyAction, setBusyAction] = useState("")
  const [error, setError] = useState("")
  const [refreshVersion, setRefreshVersion] = useState(0)

  const selectedRule = useMemo(() => (
    state?.rules.find((rule) => rule.relativePath === selectedRulePath)
    || null
  ), [selectedRulePath, state])
  const isDirty = isCreating
    ? Boolean(newRuleName.trim() || draftContent !== NEW_RULE_TEMPLATE)
    : Boolean(selectedRule && draftContent !== selectedRule.content)
  const enabledRules = state?.rules.filter((rule) => rule.enabled).length || 0
  const injectionRatio = state
    ? Math.min(100, Math.round((state.injectedCharacters / 60_000) * 100))
    : 0
  const isBusy = Boolean(busyAction)

  function requestClose() {
    if (isDirty && !window.confirm("当前规则尚未保存，确定放弃修改并关闭吗？")) return
    onClose()
  }

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (isDirty && !window.confirm("当前规则尚未保存，确定放弃修改并关闭吗？")) return
      onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isDirty, onClose, open])

  useEffect(() => {
    if (!open) return
    let isCancelled = false
    setIsLoading(true)
    setError("")
    window.authorDesk.rules.get(project.path)
      .then((nextState) => {
        if (isCancelled) return
        setState(nextState)
        const nextSelectedPath = nextState.rules.some(
          (rule) => rule.relativePath === selectedRulePath,
        )
          ? selectedRulePath
          : nextState.rules[0]?.relativePath || ""
        setSelectedRulePath(nextSelectedPath)
        if (!nextState.rules.length) {
          setIsCreating(true)
          setNewRuleName("")
          setDraftContent(NEW_RULE_TEMPLATE)
        } else {
          setIsCreating(false)
        }
      })
      .catch((loadError) => {
        if (isCancelled) return
        setState(null)
        setError(formatRuleError(loadError))
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [open, project.path, refreshVersion])

  useEffect(() => {
    if (isCreating || !selectedRule) return
    setDraftContent(selectedRule.content)
  }, [isCreating, selectedRule?.content, selectedRule?.relativePath])

  function selectRule(rule: WritingRuleFile) {
    if (
      isDirty
      && !window.confirm("当前规则尚未保存，确定放弃修改并切换吗？")
    ) return
    setIsCreating(false)
    setSelectedRulePath(rule.relativePath)
    setDraftContent(rule.content)
    setError("")
  }

  function startCreating() {
    if (
      isDirty
      && !window.confirm("当前规则尚未保存，确定放弃修改并新建吗？")
    ) return
    setIsCreating(true)
    setSelectedRulePath("")
    setNewRuleName("")
    setDraftContent(NEW_RULE_TEMPLATE)
    setError("")
  }

  async function createRule() {
    if (!newRuleName.trim() || isBusy) return
    setBusyAction("create")
    setError("")
    try {
      const result = await window.authorDesk.rules.create(project.path, {
        name: newRuleName.trim(),
        content: draftContent,
      })
      setState(result.state)
      setSelectedRulePath(result.relativePath)
      setIsCreating(false)
      setNewRuleName("")
      const createdRule = result.state.rules.find(
        (rule) => rule.relativePath === result.relativePath,
      )
      setDraftContent(createdRule?.content || draftContent)
    } catch (createError) {
      setError(formatRuleError(createError))
    } finally {
      setBusyAction("")
    }
  }

  async function saveRule() {
    if (!selectedRule || !isDirty || isBusy) return
    setBusyAction("save")
    setError("")
    try {
      const result = await window.authorDesk.rules.save(
        project.path,
        selectedRule.relativePath,
        draftContent,
      )
      setState(result.state)
      setSelectedRulePath(result.relativePath)
      const savedRule = result.state.rules.find(
        (rule) => rule.relativePath === result.relativePath,
      )
      setDraftContent(savedRule?.content || draftContent)
    } catch (saveError) {
      setError(formatRuleError(saveError))
    } finally {
      setBusyAction("")
    }
  }

  async function toggleRule(rule: WritingRuleFile) {
    if (isBusy) return
    setBusyAction(`toggle:${rule.relativePath}`)
    setError("")
    try {
      const result = await window.authorDesk.rules.setEnabled(
        project.path,
        rule.relativePath,
        !rule.enabled,
      )
      setState(result.state)
    } catch (toggleError) {
      setError(formatRuleError(toggleError))
    } finally {
      setBusyAction("")
    }
  }

  async function deleteRule() {
    if (!selectedRule || isBusy) return
    if (!window.confirm(`确定删除规则“${selectedRule.name}”吗？此操作会删除对应文件。`)) {
      return
    }
    setBusyAction("delete")
    setError("")
    try {
      const result = await window.authorDesk.rules.delete(
        project.path,
        selectedRule.relativePath,
      )
      setState(result.state)
      const nextRule = result.state.rules[0]
      setSelectedRulePath(nextRule?.relativePath || "")
      setDraftContent(nextRule?.content || NEW_RULE_TEMPLATE)
      setIsCreating(!nextRule)
      setNewRuleName("")
    } catch (deleteError) {
      setError(formatRuleError(deleteError))
    } finally {
      setBusyAction("")
    }
  }

  async function openRulesFolder() {
    setError("")
    try {
      await window.authorDesk.rules.openFolder(project.path)
    } catch (openError) {
      setError(formatRuleError(openError))
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="writing-rules-title"
        className="flex h-[min(820px,calc(100vh-40px))] w-[min(1180px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-canvas shadow-[0_28px_90px_rgba(44,25,17,0.18)]"
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
              自动识别作品目录内所有 `rules-*.md`，并兼容 `.trae/rules`
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading || isBusy}
              onClick={() => {
                if (isDirty && !window.confirm("当前规则尚未保存，确定刷新吗？")) return
                setRefreshVersion((current) => current + 1)
              }}
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button variant="ghost" size="sm" onClick={openRulesFolder}>
              <FolderOpen className="size-3.5" />
              打开作品目录
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭写作规则"
              title="关闭"
              onClick={requestClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex shrink-0 items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 p-5">
          {isLoading && !state ? (
            <div className="grid h-full place-items-center rounded-xl border border-border bg-white">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">正在读取写作规则…</p>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_250px] gap-4">
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">规则列表</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {enabledRules}/{state?.rules.length || 0} 条已启用
                    </p>
                  </div>
                  <Button
                    size="icon-sm"
                    className="ml-auto"
                    aria-label="新增规则"
                    title="新增规则"
                    onClick={startCreating}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {state?.rules.map((rule) => {
                    const isSelected = (
                      !isCreating
                      && rule.relativePath === selectedRule?.relativePath
                    )
                    return (
                      <div
                        key={rule.relativePath}
                        className={`mb-1 rounded-lg border transition-colors ${
                          isSelected
                            ? "border-primary/15 bg-secondary"
                            : "border-transparent hover:bg-muted/60"
                        }`}
                      >
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 px-3 pb-2 pt-3 text-left"
                          onClick={() => selectRule(rule)}
                        >
                          <FileText className={`mt-0.5 size-4 shrink-0 ${
                            rule.enabled ? "text-primary" : "text-muted-foreground"
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-semibold ${
                              rule.enabled ? "" : "text-muted-foreground"
                            }`}>
                              {rule.name}
                            </p>
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">
                              {rule.characterCount.toLocaleString("zh-CN")} 字符
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center justify-between px-3 pb-2.5 pl-9">
                          <span className="max-w-28 truncate text-[9px] text-muted-foreground">
                            {rule.relativePath}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={rule.enabled}
                            aria-label={`${rule.enabled ? "停用" : "启用"} ${rule.name}`}
                            className={`relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
                              rule.enabled ? "bg-primary" : "bg-muted-foreground/25"
                            }`}
                            disabled={isBusy}
                            onClick={() => toggleRule(rule)}
                          >
                            <span className={`absolute top-0.5 grid size-4 place-items-center rounded-full bg-white shadow-sm transition-transform ${
                              rule.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                            }`}>
                              {busyAction === `toggle:${rule.relativePath}` && (
                                <LoaderCircle className="size-2.5 animate-spin text-primary" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {!state?.rules.length && !isCreating && (
                    <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                      暂无规则
                    </div>
                  )}
                </div>
              </aside>

              <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white">
                <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
                  {isCreating ? (
                    <div className="min-w-0 flex-1">
                      <label htmlFor="new-rule-name" className="text-[10px] font-medium text-muted-foreground">
                        新规则名称
                      </label>
                      <input
                        id="new-rule-name"
                        autoFocus
                        value={newRuleName}
                        onChange={(event) => setNewRuleName(event.target.value)}
                        placeholder="例如：正文风格.md"
                        className="mt-1 h-9 w-full rounded-lg border border-border bg-muted/25 px-3 text-sm outline-none focus:border-primary/35 focus:ring-3 focus:ring-primary/10"
                      />
                    </div>
                  ) : selectedRule ? (
                    <>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{selectedRule.name}</h3>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                            selectedRule.enabled
                              ? "bg-green-50 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {selectedRule.enabled ? "已启用" : "已停用"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          更新于 {formatModifiedAt(selectedRule.modifiedAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto text-destructive hover:bg-red-50 hover:text-destructive"
                        aria-label="删除当前规则"
                        title="删除规则"
                        disabled={isBusy}
                        onClick={deleteRule}
                      >
                        {busyAction === "delete"
                          ? <LoaderCircle className="size-3.5 animate-spin" />
                          : <Trash2 className="size-3.5" />}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm font-semibold">选择一条规则</p>
                  )}
                </div>

                {(isCreating || selectedRule) ? (
                  <>
                    {!isCreating && selectedRule && !selectedRule.enabled && (
                      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[10px] text-amber-700">
                        <EyeOff className="size-3.5" />
                        此规则已停用，不会注入 AI 对话，但内容仍保留在目录中。
                      </div>
                    )}
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      spellCheck={false}
                      aria-label="规则正文"
                      placeholder="使用 Markdown 编写明确、可执行的写作规则…"
                      className="min-h-0 flex-1 resize-none bg-[#fffdfc] px-6 py-5 font-mono text-[13px] leading-6 outline-none placeholder:text-muted-foreground"
                    />
                    <div className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-3">
                      <span className="text-[10px] text-muted-foreground">
                        {draftContent.length.toLocaleString("zh-CN")} 字符
                        {isDirty ? " · 尚未保存" : " · 已保存"}
                      </span>
                      <Button
                        size="sm"
                        className="ml-auto"
                        disabled={
                          isBusy
                          || (isCreating ? !newRuleName.trim() : !isDirty)
                        }
                        onClick={isCreating ? createRule : saveRule}
                      >
                        {["create", "save"].includes(busyAction)
                          ? <LoaderCircle className="size-3.5 animate-spin" />
                          : isCreating
                            ? <Plus className="size-3.5" />
                            : <Save className="size-3.5" />}
                        {isCreating ? "创建规则" : "保存规则"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="grid min-h-0 flex-1 place-items-center px-8 text-center">
                    <div>
                      <FileText className="mx-auto size-8 text-muted-foreground/45" />
                      <p className="mt-3 text-sm font-medium">请选择或新增一条规则</p>
                    </div>
                  </div>
                )}
              </main>

              <aside className="min-h-0 space-y-4 overflow-y-auto">
                <section className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-primary" />
                    AI 生效状态
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-secondary/60 px-3 py-3 text-center">
                      <p className="text-lg font-semibold text-primary">{enabledRules}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">启用规则</p>
                    </div>
                    <div className="rounded-lg bg-muted/55 px-3 py-3 text-center">
                      <p className="text-lg font-semibold">
                        {state?.rules.length ? state.rules.length - enabledRules : 0}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">停用规则</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>AI 上下文占用</span>
                      <span>{state?.injectedCharacters.toLocaleString("zh-CN") || 0} / 60,000</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${injectionRatio}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-[10px] leading-4 text-muted-foreground">
                    <p className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                      只有已启用规则会在每次 AI 对话时注入。
                    </p>
                    <p className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                      规则按文件路径顺序合并，可用数字前缀调整顺序。
                    </p>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-white p-4">
                  <p className="text-sm font-semibold">建议写法</p>
                  <div className="mt-3 space-y-2 text-[10px] leading-4 text-muted-foreground">
                    <p>1. 一条文件聚焦一类问题，例如人物、叙事视角或禁用表达。</p>
                    <p>2. 使用“必须、禁止、优先”等明确词语，避免模糊描述。</p>
                    <p>3. 规则过长会占用 AI 上下文，优先保留可执行约束。</p>
                  </div>
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
