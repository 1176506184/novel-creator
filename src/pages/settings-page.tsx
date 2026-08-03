import { useEffect, useState } from "react"
import {
  Bot,
  CheckCircle2,
  CircleHelp,
  CloudCog,
  Eye,
  EyeOff,
  FolderOpen,
  GitBranch,
  KeyRound,
  Library,
  LoaderCircle,
  MonitorDown,
  Power,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LibraryState } from "@/types/library"

type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
type CloseBehavior = "ask" | "tray" | "quit"

type SettingsPageProps = {
  library: LibraryState
  isChoosingLibrary: boolean
  onChooseLibrary: () => Promise<void>
}

const defaultApiSettings = {
  baseUrl: "https://ai98pro.xyz/v1",
  model: "gpt-5.6-sol",
  reasoningEffort: "high" as ReasoningEffort,
  hasApiKey: false,
}

const defaultGitSettings = {
  remoteUrl: "",
  branch: "main",
  authorName: "作者管家",
  authorEmail: "author-desk@local",
  username: "",
}

const fieldClassName = "h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"

export function SettingsPage({
  library,
  isChoosingLibrary,
  onChooseLibrary,
}: SettingsPageProps) {
  const [baseUrl, setBaseUrl] = useState(defaultApiSettings.baseUrl)
  const [model, setModel] = useState(defaultApiSettings.model)
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("high")
  const [apiKey, setApiKey] = useState("")
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>("ask")
  const [isLoadingCloseBehavior, setIsLoadingCloseBehavior] = useState(true)
  const [isSavingCloseBehavior, setIsSavingCloseBehavior] = useState(false)
  const [closeBehaviorMessage, setCloseBehaviorMessage] = useState("")
  const [closeBehaviorError, setCloseBehaviorError] = useState("")
  const [gitProjectPath, setGitProjectPath] = useState(library.projects[0]?.path || "")
  const [gitRemoteUrl, setGitRemoteUrl] = useState(defaultGitSettings.remoteUrl)
  const [gitBranch, setGitBranch] = useState(defaultGitSettings.branch)
  const [gitAuthorName, setGitAuthorName] = useState(defaultGitSettings.authorName)
  const [gitAuthorEmail, setGitAuthorEmail] = useState(defaultGitSettings.authorEmail)
  const [gitUsername, setGitUsername] = useState(defaultGitSettings.username)
  const [gitToken, setGitToken] = useState("")
  const [hasGitToken, setHasGitToken] = useState(false)
  const [showGitToken, setShowGitToken] = useState(false)
  const [gitRepositoryExists, setGitRepositoryExists] = useState(false)
  const [isLoadingGit, setIsLoadingGit] = useState(false)
  const [isSavingGit, setIsSavingGit] = useState(false)
  const [gitMessage, setGitMessage] = useState("")
  const [gitError, setGitError] = useState("")

  useEffect(() => {
    window.authorDesk.settings.getApi()
      .then((settings) => {
        setBaseUrl(settings.baseUrl)
        setModel(settings.model)
        setReasoningEffort(settings.reasoningEffort)
        setHasApiKey(settings.hasApiKey)
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "无法读取 API 设置")
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!library.projects.length) {
      setGitProjectPath("")
      return
    }
    if (!library.projects.some((project) => project.path === gitProjectPath)) {
      setGitProjectPath(library.projects[0].path)
    }
  }, [gitProjectPath, library.projects])

  useEffect(() => {
    let canceled = false
    setIsLoadingGit(true)
    setGitMessage("")
    setGitError("")
    window.authorDesk.git.getSettings(gitProjectPath)
      .then((settings) => {
        if (canceled) return
        setGitRemoteUrl(settings.remoteUrl)
        setGitBranch(settings.branch)
        setGitAuthorName(settings.authorName)
        setGitAuthorEmail(settings.authorEmail)
        setGitUsername(settings.username)
        setHasGitToken(settings.hasToken)
        setGitRepositoryExists(settings.repositoryExists)
        setGitToken("")
      })
      .catch((loadError) => {
        if (canceled) return
        setGitError(loadError instanceof Error ? loadError.message : "无法读取内置 Git 设置")
      })
      .finally(() => {
        if (!canceled) setIsLoadingGit(false)
      })
    return () => {
      canceled = true
    }
  }, [gitProjectPath])

  useEffect(() => {
    window.authorDesk.window.getCloseBehavior()
      .then(setCloseBehavior)
      .catch((loadError) => {
        setCloseBehaviorError(
          loadError instanceof Error ? loadError.message : "无法读取关闭行为设置",
        )
      })
      .finally(() => setIsLoadingCloseBehavior(false))
  }, [])

  useEffect(() => {
    function handleCloseBehaviorChanged(event: Event) {
      const nextBehavior = (event as CustomEvent<CloseBehavior>).detail
      if (["ask", "tray", "quit"].includes(nextBehavior)) {
        setCloseBehavior(nextBehavior)
      }
    }
    window.addEventListener("author-desk:close-behavior-changed", handleCloseBehaviorChanged)
    return () => {
      window.removeEventListener("author-desk:close-behavior-changed", handleCloseBehaviorChanged)
    }
  }, [])

  async function saveCloseBehavior(nextBehavior: CloseBehavior) {
    if (isSavingCloseBehavior || nextBehavior === closeBehavior) return
    const previousBehavior = closeBehavior
    setCloseBehavior(nextBehavior)
    setIsSavingCloseBehavior(true)
    setCloseBehaviorMessage("")
    setCloseBehaviorError("")
    try {
      const savedBehavior = await window.authorDesk.window.setCloseBehavior(nextBehavior)
      setCloseBehavior(savedBehavior)
      setCloseBehaviorMessage("关闭行为已保存")
      window.dispatchEvent(new CustomEvent("author-desk:close-behavior-changed", {
        detail: savedBehavior,
      }))
    } catch (saveError) {
      setCloseBehavior(previousBehavior)
      setCloseBehaviorError(
        saveError instanceof Error ? saveError.message : "保存关闭行为失败",
      )
    } finally {
      setIsSavingCloseBehavior(false)
    }
  }

  async function saveSettings(clearApiKey = false) {
    setIsSaving(true)
    setMessage("")
    setError("")
    try {
      const saved = await window.authorDesk.settings.saveApi({
        baseUrl,
        model,
        reasoningEffort,
        apiKey,
        clearApiKey,
      })
      setBaseUrl(saved.baseUrl)
      setModel(saved.model)
      setReasoningEffort(saved.reasoningEffort)
      setHasApiKey(saved.hasApiKey)
      setApiKey("")
      setMessage(clearApiKey ? "API Key 已清除" : "API 设置已保存")
      window.dispatchEvent(new CustomEvent("author-desk:api-settings-changed", {
        detail: saved,
      }))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 API 设置失败")
    } finally {
      setIsSaving(false)
    }
  }

  async function saveGitSettings(clearToken = false) {
    if (!gitProjectPath || isSavingGit) return
    setIsSavingGit(true)
    setGitMessage("")
    setGitError("")
    try {
      const saved = await window.authorDesk.git.saveSettings({
        projectPath: gitProjectPath,
        remoteUrl: gitRemoteUrl,
        branch: gitBranch,
        authorName: gitAuthorName,
        authorEmail: gitAuthorEmail,
        username: gitUsername,
        token: gitToken,
        clearToken,
      })
      setGitRemoteUrl(saved.remoteUrl)
      setGitBranch(saved.branch)
      setGitAuthorName(saved.authorName)
      setGitAuthorEmail(saved.authorEmail)
      setGitUsername(saved.username)
      setHasGitToken(saved.hasToken)
      setGitRepositoryExists(saved.repositoryExists)
      setGitToken("")
      setGitMessage(clearToken ? "Git 访问令牌已清除" : "内置 Git 已启用，可以直接同步")
    } catch (saveError) {
      setGitError(saveError instanceof Error ? saveError.message : "保存内置 Git 设置失败")
    } finally {
      setIsSavingGit(false)
    }
  }

  return (
    <div className="relative mx-auto min-h-full max-w-5xl px-8 py-7 xl:px-10">
      <header>
        <p className="eyebrow">偏好设置</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          管理小说库、窗口关闭行为、内置 Git 同步以及写作助手使用的 AI 接口。
        </p>
      </header>

      <div className="mt-7 space-y-5">
        <section className="rounded-xl border border-border bg-white p-6" aria-labelledby="library-settings-title">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <Library className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="library-settings-title" className="text-base font-semibold">小说库</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                根目录下的每个一级文件夹会被识别为一部作品。
              </p>

              <div className="mt-5 flex items-center gap-3">
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/45 px-4 py-3">
                  <p className="text-[11px] font-medium text-muted-foreground">当前目录</p>
                  <p className="mt-1 truncate text-sm font-medium" title={library.root}>
                    {library.root || "尚未选择小说库"}
                  </p>
                </div>
                <Button disabled={isChoosingLibrary} onClick={onChooseLibrary}>
                  {isChoosingLibrary ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <FolderOpen className="size-4" />
                  )}
                  选择新目录
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                已识别 {library.projects.length} 部作品；只统计各作品“正文”目录中的章节。
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white p-6" aria-labelledby="close-settings-title">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <Power className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="close-settings-title" className="text-base font-semibold">关闭行为</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    设置点击关闭按钮或按 Alt+F4 时，作者管家如何处理。
                  </p>
                </div>
                {isSavingCloseBehavior && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    保存中
                  </span>
                )}
              </div>

              {isLoadingCloseBehavior ? (
                <div className="grid h-24 place-items-center">
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {([
                    {
                      value: "ask",
                      title: "每次询问",
                      description: "关闭时选择退出或放到后台",
                      icon: CircleHelp,
                    },
                    {
                      value: "tray",
                      title: "放到后台",
                      description: "直接隐藏到系统托盘继续运行",
                      icon: MonitorDown,
                    },
                    {
                      value: "quit",
                      title: "退出程序",
                      description: "直接结束程序和本地服务",
                      icon: Power,
                    },
                  ] as const).map((option) => {
                    const Icon = option.icon
                    const checked = closeBehavior === option.value
                    return (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-xl border p-4 transition-[border-color,background-color,box-shadow] ${
                          checked
                            ? "border-primary/35 bg-secondary/45 ring-3 ring-primary/[0.06]"
                            : "border-border hover:border-primary/20 hover:bg-muted/25"
                        }`}
                      >
                        <input
                          type="radio"
                          name="close-behavior"
                          value={option.value}
                          checked={checked}
                          disabled={isSavingCloseBehavior}
                          onChange={() => saveCloseBehavior(option.value)}
                          className="sr-only"
                        />
                        <span className={`grid size-8 place-items-center rounded-lg ${
                          checked ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        }`}>
                          <Icon className="size-4" />
                        </span>
                        <span className="mt-3 block text-sm font-semibold">{option.title}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {option.description}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="mt-3 min-h-4 text-xs" aria-live="polite">
                {closeBehaviorError ? (
                  <span className="text-destructive">{closeBehaviorError}</span>
                ) : closeBehaviorMessage ? (
                  <span className="text-success">{closeBehaviorMessage}</span>
                ) : (
                  <span className="text-muted-foreground">
                    弹窗中的“记住我的选择”也会同步修改这里。
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white p-6" aria-labelledby="git-settings-title">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <CloudCog className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="git-settings-title" className="text-base font-semibold">内置 Git 同步</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    软件直接管理作品仓库，无需在电脑上安装 Git 或配置外部凭据。
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary">
                  <GitBranch className="size-3.5" />
                  内置引擎
                </span>
              </div>

              {!library.projects.length ? (
                <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground">
                  请先在小说库中创建或导入一部作品。
                </div>
              ) : isLoadingGit ? (
                <div className="grid h-48 place-items-center">
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-5">
                  <label className="col-span-2 block">
                    <span className="mb-2 block text-sm font-medium">配置作品</span>
                    <select
                      value={gitProjectPath}
                      onChange={(event) => setGitProjectPath(event.target.value)}
                      className={fieldClassName}
                    >
                      {library.projects.map((project) => (
                        <option key={project.path} value={project.path}>{project.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="col-span-2 block">
                    <span className="mb-2 block text-sm font-medium">HTTPS 仓库地址</span>
                    <input
                      type="url"
                      value={gitRemoteUrl}
                      onChange={(event) => setGitRemoteUrl(event.target.value)}
                      placeholder="https://github.com/用户名/仓库.git"
                      className={fieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">同步分支</span>
                    <input
                      type="text"
                      value={gitBranch}
                      onChange={(event) => setGitBranch(event.target.value)}
                      placeholder="main"
                      className={fieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">远程账号（可选）</span>
                    <input
                      type="text"
                      value={gitUsername}
                      onChange={(event) => setGitUsername(event.target.value)}
                      placeholder="GitHub 用户名"
                      className={fieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">提交者名称</span>
                    <input
                      type="text"
                      value={gitAuthorName}
                      onChange={(event) => setGitAuthorName(event.target.value)}
                      className={fieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">提交者邮箱</span>
                    <input
                      type="email"
                      value={gitAuthorEmail}
                      onChange={(event) => setGitAuthorEmail(event.target.value)}
                      className={fieldClassName}
                    />
                  </label>

                  <label className="col-span-2 block">
                    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium">
                      <span>访问令牌</span>
                      <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-success" />
                        使用系统安全存储加密
                      </span>
                    </span>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showGitToken ? "text" : "password"}
                        value={gitToken}
                        onChange={(event) => setGitToken(event.target.value)}
                        autoComplete="off"
                        placeholder={hasGitToken ? "已安全配置；留空将保留原令牌" : "粘贴仓库访问令牌"}
                        className={`${fieldClassName} pl-10 pr-11`}
                      />
                      <button
                        type="button"
                        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        aria-label={showGitToken ? "隐藏访问令牌" : "显示访问令牌"}
                        onClick={() => setShowGitToken((current) => !current)}
                      >
                        {showGitToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="min-h-5 text-xs" aria-live="polite">
                  {gitError ? (
                    <span className="text-destructive">{gitError}</span>
                  ) : gitMessage ? (
                    <span className="text-success">{gitMessage}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {gitRepositoryExists ? "已识别作品仓库；同步时会先合并云端更新。" : "保存后会在作品目录自动初始化仓库。"}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hasGitToken && (
                    <Button
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={isSavingGit}
                      onClick={() => saveGitSettings(true)}
                    >
                      <Trash2 className="size-4" />
                      清除令牌
                    </Button>
                  )}
                  <Button
                    disabled={!gitProjectPath || isLoadingGit || isSavingGit}
                    onClick={() => saveGitSettings(false)}
                  >
                    {isSavingGit ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {isSavingGit ? "保存中" : "保存并启用"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-white p-6" aria-labelledby="api-settings-title">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="api-settings-title" className="text-base font-semibold">AI 接入</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    使用 OpenAI 兼容接口，为后续续写、润色等功能提供模型能力。
                  </p>
                </div>
                {hasApiKey && (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-success">
                    <CheckCircle2 className="size-3.5" />
                    密钥已配置
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="grid h-48 place-items-center">
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-5">
                  <label className="col-span-2 block">
                    <span className="mb-2 block text-sm font-medium">API 地址</span>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://example.com/v1"
                      className={fieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">模型</span>
                    <input
                      type="text"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="gpt-5.6-sol"
                      className={fieldClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">推理强度</span>
                    <select
                      value={reasoningEffort}
                      onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
                      className={fieldClassName}
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="xhigh">xhigh</option>
                      <option value="max">max</option>
                      <option value="ultra">ultra</option>
                    </select>
                  </label>

                  <label className="col-span-2 block">
                    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium">
                      <span>API Key</span>
                      <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-success" />
                        使用系统安全存储加密
                      </span>
                    </span>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        autoComplete="off"
                        placeholder={hasApiKey ? "已安全配置；留空将保留原密钥" : "粘贴 API Key"}
                        className={`${fieldClassName} pl-10 pr-11`}
                      />
                      <button
                        type="button"
                        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                        onClick={() => setShowApiKey((current) => !current)}
                      >
                        {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
                <div className="min-h-5 text-xs" aria-live="polite">
                  {error ? (
                    <span className="text-destructive">{error}</span>
                  ) : message ? (
                    <span className="text-success">{message}</span>
                  ) : (
                    <span className="text-muted-foreground">密钥不会在页面中再次回显。</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasApiKey && (
                    <Button
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={isSaving}
                      onClick={() => saveSettings(true)}
                    >
                      <Trash2 className="size-4" />
                      清除密钥
                    </Button>
                  )}
                  <Button disabled={isLoading || isSaving} onClick={() => saveSettings(false)}>
                    {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {isSaving ? "保存中" : "保存 API 设置"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
