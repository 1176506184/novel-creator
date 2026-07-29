import { type FormEvent, useEffect, useMemo, useState } from "react"
import {
  ArrowUpDown,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileText,
  FolderCheck,
  FolderOpen,
  FolderPlus,
  Library,
  LoaderCircle,
  PenLine,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Settings2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  CreateProjectResult,
  LibraryProject,
  LibraryState,
} from "@/types/library"

type SortMode = "updated" | "name" | "characters"

type WorksPageProps = {
  library: LibraryState
  activeProjectPath: string
  isRefreshing: boolean
  onOpenSettings: () => void
  onOpenProject: (project: LibraryProject) => void
  onCreateProject: () => Promise<CreateProjectResult | null>
  onRenameProject: (project: LibraryProject, nextName: string) => Promise<void>
  onRefresh: () => void
  onSelectProject: (project: LibraryProject) => void
}

const numberFormatter = new Intl.NumberFormat("zh-CN")
const updatedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

const projectAccents = [
  "from-[#ff7a32] to-[#ff3d1f]",
  "from-[#ff8b38] to-[#ff4d1f]",
  "from-[#ff6940] to-[#f43f2a]",
  "from-[#ff5f2e] to-[#ed351d]",
]

export function WorksPage({
  library,
  activeProjectPath,
  isRefreshing,
  onOpenSettings,
  onOpenProject,
  onCreateProject,
  onRenameProject,
  onRefresh,
  onSelectProject,
}: WorksPageProps) {
  const [query, setQuery] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("updated")
  const [renamingProject, setRenamingProject] = useState<LibraryProject | null>(null)
  const [nextProjectName, setNextProjectName] = useState("")
  const [renameError, setRenameError] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [creationNotice, setCreationNotice] = useState("")

  useEffect(() => {
    if (!renamingProject && !isCreateDialogOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isRenaming) setRenamingProject(null)
      if (event.key === "Escape" && !isCreating) setIsCreateDialogOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isCreateDialogOpen, isCreating, isRenaming, renamingProject])

  function openRenameDialog(project: LibraryProject) {
    setRenamingProject(project)
    setNextProjectName(project.name)
    setRenameError("")
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renamingProject || !nextProjectName.trim() || isRenaming) return
    setIsRenaming(true)
    setRenameError("")
    try {
      await onRenameProject(renamingProject, nextProjectName.trim())
      setRenamingProject(null)
    } catch (renameFailure) {
      const rawMessage = renameFailure instanceof Error
        ? renameFailure.message
        : "作品重命名失败"
      setRenameError(rawMessage
        .replace(/^Error invoking remote method ['"]library:rename-project['"]:\s*/i, "")
        .replace(/^Error:\s*/i, ""))
    } finally {
      setIsRenaming(false)
    }
  }

  function openCreateDialog() {
    setCreateError("")
    setIsCreateDialogOpen(true)
  }

  async function chooseProjectDirectory() {
    if (isCreating) return
    setIsCreating(true)
    setCreateError("")
    try {
      const result = await onCreateProject()
      if (!result) return
      const projectName = result.library.projects.find(
        (project) => project.path === result.projectPath,
      )?.name || "新作品"
      setCreationNotice(
        result.createdDirectories.length
          ? `“${projectName}”已创建，并补齐 ${result.createdDirectories.length} 个基础目录。`
          : `“${projectName}”目录结构完整，已加入我的作品。`,
      )
      setIsCreateDialogOpen(false)
    } catch (createFailure) {
      const rawMessage = createFailure instanceof Error
        ? createFailure.message
        : "新建作品失败"
      setCreateError(rawMessage
        .replace(/^Error invoking remote method ['"]library:create-project['"]:\s*/i, "")
        .replace(/^Error:\s*/i, ""))
    } finally {
      setIsCreating(false)
    }
  }

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
    const filtered = normalizedQuery
      ? library.projects.filter((project) => (
          project.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
          || (project.latestChapter || "").toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        ))
      : [...library.projects]

    return filtered.sort((left, right) => {
      if (sortMode === "name") {
        return left.name.localeCompare(right.name, "zh-CN", { numeric: true })
      }
      if (sortMode === "characters") {
        return right.characterCount - left.characterCount
      }
      return new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime()
    })
  }, [library.projects, query, sortMode])

  const totalChapters = useMemo(
    () => library.projects.reduce((sum, project) => sum + project.chapterCount, 0),
    [library.projects],
  )
  const totalCharacters = useMemo(
    () => library.projects.reduce((sum, project) => sum + project.characterCount, 0),
    [library.projects],
  )

  const isInitialLoading = !library.ok && !library.message
  const hasSearchResults = visibleProjects.length > 0

  return (
    <div className="relative mx-auto min-h-full max-w-6xl px-8 py-7 xl:px-10">
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="eyebrow">作品管理</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">我的作品</h1>
          <div className="mt-2 flex max-w-2xl items-center gap-2 text-sm text-muted-foreground">
            <Library className="size-4 shrink-0" />
            <span className="truncate" title={library.root}>
              {library.root || "正在读取小说库目录"}
            </span>
          </div>
        </div>
        <Button className="shrink-0" onClick={openCreateDialog}>
          <Plus className="size-4" />
          新建作品
        </Button>
      </header>

      {creationNotice && (
        <div
          className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="flex-1">{creationNotice}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
            aria-label="关闭新建成功提示"
            onClick={() => setCreationNotice("")}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <section className="mt-7 grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-r border-border px-6 py-5">
          <p className="text-xs font-medium text-muted-foreground">作品数量</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{library.projects.length}</p>
        </div>
        <div className="border-r border-border px-6 py-5">
          <p className="text-xs font-medium text-muted-foreground">正文总章节</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{numberFormatter.format(totalChapters)}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs font-medium text-muted-foreground">正文总字数</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{numberFormatter.format(totalCharacters)}</p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="works-list-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="works-list-title" className="text-lg font-semibold">全部作品</h2>
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              当前显示 {visibleProjects.length} 部作品
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="relative block">
              <span className="sr-only">搜索作品</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索作品"
                className="h-10 w-56 rounded-lg border border-input bg-white pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
              />
            </label>

            <label className="relative block">
              <span className="sr-only">作品排序方式</span>
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-10 appearance-none rounded-lg border border-input bg-white py-2 pl-9 pr-8 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
              >
                <option value="updated">最近更新</option>
                <option value="name">作品名称</option>
                <option value="characters">正文最多</option>
              </select>
            </label>

            <Button
              variant="outline"
              size="icon"
              aria-label="刷新作品目录"
              title="刷新作品目录"
              disabled={isRefreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="mt-6 grid min-h-72 place-items-center rounded-2xl border border-border bg-white">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">正在扫描小说库目录…</p>
            </div>
          </div>
        ) : library.message ? (
          <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white p-8 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-red-50 text-destructive">
              <Library className="size-5" />
            </div>
            <h3 className="mt-5 text-lg font-semibold">无法读取小说库</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{library.message}</p>
            <Button className="mt-5" onClick={onOpenSettings}>
              <Settings2 className="size-4" />
              前往设置
            </Button>
          </div>
        ) : hasSearchResults ? (
          <div className="mt-6 grid grid-cols-2 gap-4 2xl:grid-cols-3">
            {visibleProjects.map((project, index) => {
              const progress = Math.min(100, Math.round((project.characterCount / 80_000) * 100))
              const accent = projectAccents[index % projectAccents.length]
              const isActive = project.path === activeProjectPath

              return (
                <article
                  key={project.path}
                  className={`group overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[0_10px_28px_rgba(0,0,0,0.045)] ${
                    isActive ? "border-primary/35 ring-3 ring-primary/[0.06]" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-4 p-5">
                    <div className={`grid size-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${accent} text-white shadow-sm`}>
                      <BookOpenText className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold" title={project.name}>{project.name}</h3>
                        {isActive && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            正在写
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {project.latestChapter || "尚未创建正文"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`打开 ${project.name} 目录`}
                      title="打开作品目录"
                      onClick={() => onOpenProject(project)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 border-y border-border/80 bg-secondary/25">
                    <div className="border-r border-border/80 px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="size-3.5" />
                        正文章节
                      </div>
                      <p className="mt-1.5 text-sm font-semibold tabular-nums">{project.chapterCount} 章</p>
                    </div>
                    <div className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BookOpenText className="size-3.5" />
                        正文字数
                      </div>
                      <p className="mt-1.5 text-sm font-semibold tabular-nums">
                        {numberFormatter.format(project.characterCount)}
                      </p>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{updatedAtFormatter.format(new Date(project.modifiedAt))} 更新</span>
                      <span className="tabular-nums">{progress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button className="flex-1" onClick={() => onSelectProject(project)}>
                        <PenLine className="size-4" />
                        {isActive ? "继续写作" : "选择并写作"}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`重命名 ${project.name}`}
                        title="修改作品名称"
                        onClick={() => openRenameDialog(project)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`打开 ${project.name} 目录`}
                        title="打开作品目录"
                        onClick={() => onOpenProject(project)}
                      >
                        <FolderOpen className="size-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white p-8 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-secondary text-primary">
              {query ? <SearchX className="size-5" /> : <Library className="size-5" />}
            </div>
            <h3 className="mt-5 text-lg font-semibold">{query ? "没有匹配的作品" : "小说库还是空的"}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {query
                ? "换一个作品名称或章节名称试试。"
                : "在小说库根目录中新建一个文件夹，它就会被识别为一部作品。"}
            </p>
            {!query && (
              <Button className="mt-5" onClick={openCreateDialog}>
                <FolderPlus className="size-4" />
                新建第一部作品
              </Button>
            )}
          </div>
        )}
      </section>

      {renamingProject && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isRenaming) setRenamingProject(null)
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-project-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(44,25,17,0.18)]"
            onSubmit={submitRename}
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                <Pencil className="size-4.5" />
              </div>
              <div>
                <h2 id="rename-project-title" className="text-sm font-semibold">修改作品名称</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">作品文件夹名称将同步修改</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label="关闭重命名"
                disabled={isRenaming}
                onClick={() => setRenamingProject(null)}
              >
                <X className="size-4" />
              </Button>
            </header>

            <div className="p-5">
              <label htmlFor="project-folder-name" className="text-xs font-medium">
                新作品名称
              </label>
              <input
                id="project-folder-name"
                autoFocus
                maxLength={120}
                value={nextProjectName}
                onChange={(event) => setNextProjectName(event.target.value)}
                placeholder="请输入新的作品名称"
                className="mt-2 h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
              />
              <p className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-primary" />
                不能包含 \ / : * ? &quot; &lt; &gt; |，也不能与小说库中的其他作品重名。
              </p>
              {renameError && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-destructive" role="alert">
                  {renameError}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-border bg-muted/25 px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                disabled={isRenaming}
                onClick={() => setRenamingProject(null)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  !nextProjectName.trim()
                  || nextProjectName.trim() === renamingProject.name
                  || isRenaming
                }
              >
                {isRenaming ? <LoaderCircle className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                {isRenaming ? "正在重命名" : "确认修改"}
              </Button>
            </footer>
          </form>
        </div>
      )}

      {isCreateDialogOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isCreating) setIsCreateDialogOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_70px_rgba(44,25,17,0.18)]"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                <FolderPlus className="size-4.5" />
              </div>
              <div>
                <h2 id="create-project-title" className="text-sm font-semibold">新建作品</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  选择作品文件夹，自动检查并补齐目录结构
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label="关闭新建作品"
                disabled={isCreating}
                onClick={() => setIsCreateDialogOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </header>

            <div className="p-5">
              <div className="rounded-xl border border-primary/15 bg-secondary/45 p-4">
                <div className="flex items-start gap-3">
                  <FolderCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">请选择作品文件夹本身</h3>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                      文件夹需要位于当前小说库根目录下一级。可以选择刚创建的空文件夹，
                      也可以接入已有作品；现有文件不会被覆盖。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium">将校验以下基础目录</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {["正文", ".chat", ".trae/rules", "角色设置", "参考小说", "范文库"].map((directory) => (
                    <div
                      key={directory}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2.5"
                    >
                      <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                      <span className="font-medium">{directory}</span>
                    </div>
                  ))}
                </div>
              </div>

              {createError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-destructive" role="alert">
                  {createError}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-between gap-4 border-t border-border bg-muted/25 px-5 py-3">
              <p className="min-w-0 truncate text-[10px] text-muted-foreground" title={library.root}>
                小说库：{library.root}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isCreating}
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type="button" disabled={isCreating} onClick={chooseProjectDirectory}>
                  {isCreating
                    ? <LoaderCircle className="size-4 animate-spin" />
                    : <FolderOpen className="size-4" />}
                  {isCreating ? "正在检查目录" : "选择作品文件夹"}
                </Button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
