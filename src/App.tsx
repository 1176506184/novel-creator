import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Scale,
  Settings2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { CloseConfirmDialog } from "@/components/close-confirm-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { StyleComparisonDialog } from "@/components/style-comparison-dialog"
import { WindowTitlebar } from "@/components/window-titlebar"
import { WorksPage } from "@/pages/works-page"
import { WriterPage } from "@/pages/writer-page"
import type {
  CreateProjectResult,
  LibraryProject,
  LibraryState,
} from "@/types/library"

type ServiceState = {
  ok: boolean
  message?: string
}

type ActivePage = "writer" | "works"

function MainWindow() {
  const [activePage, setActivePage] = useState<ActivePage>("writer")
  const [activeProjectPath, setActiveProjectPath] = useState("")
  const [service, setService] = useState<ServiceState>({ ok: false })
  const [library, setLibrary] = useState<LibraryState>({
    ok: false,
    storage: "filesystem",
    root: "",
    projects: [],
  })
  const [isChoosingLibrary, setIsChoosingLibrary] = useState(false)
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false)
  const [isWriterDirty, setIsWriterDirty] = useState(false)
  const [isWriterAiRunning, setIsWriterAiRunning] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isStyleComparisonOpen, setIsStyleComparisonOpen] = useState(false)

  const activeProject = useMemo(
    () => library.projects.find((project) => project.path === activeProjectPath) || null,
    [activeProjectPath, library.projects],
  )

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const [serviceState, libraryState, savedProjectPath] = await Promise.all([
        window.authorDesk.service.getHealth(),
        window.authorDesk.library.getProjects(),
        window.authorDesk.library.getActiveProject(),
      ])
      setService(serviceState)
      setLibrary(libraryState)

      const initialProject = libraryState.projects.find(
        (project) => project.path === savedProjectPath,
      ) || libraryState.projects[0]
      if (initialProject) {
        setActiveProjectPath(initialProject.path)
        if (initialProject.path !== savedProjectPath) {
          window.authorDesk.library.setActiveProject(initialProject.path)
        }
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [])

  async function selectProject(projectPath: string, openWriter = true) {
    const project = library.projects.find((item) => item.path === projectPath)
    if (!project) return
    if (project.path !== activeProjectPath && isWriterAiRunning) {
      window.alert("AI 写作助手正在运行，请先回到写作台停止当前任务，再切换小说。")
      return
    }
    if (
      project.path !== activeProjectPath
      && isWriterDirty
      && !window.confirm("当前章节尚未保存，确定放弃修改并切换小说吗？")
    ) return
    const wasSaved = await window.authorDesk.library.setActiveProject(project.path)
    if (!wasSaved) return
    setActiveProjectPath(project.path)
    if (openWriter) setActivePage("writer")
  }

  async function chooseLibraryRoot() {
    if (isWriterAiRunning) {
      window.alert("AI 写作助手正在运行，请先回到写作台停止当前任务，再切换小说库。")
      return
    }
    if (isWriterDirty && !window.confirm("当前章节尚未保存，确定放弃修改并切换小说库吗？")) return
    setIsChoosingLibrary(true)
    try {
      const nextLibrary = await window.authorDesk.library.chooseRoot()
      if (!nextLibrary) return
      setLibrary(nextLibrary)
      const firstProject = nextLibrary.projects[0]
      setActiveProjectPath(firstProject?.path || "")
      if (firstProject) {
        await window.authorDesk.library.setActiveProject(firstProject.path)
      }
    } finally {
      setIsChoosingLibrary(false)
    }
  }

  async function openProjectFolder(project: LibraryProject) {
    await window.authorDesk.library.openProjectFolder(project.path)
  }

  async function renameProject(project: LibraryProject, nextName: string) {
    if (project.path === activeProjectPath && isWriterAiRunning) {
      window.alert("AI 写作助手正在运行，请先停止当前任务，再重命名这部作品。")
      return
    }
    if (
      project.path === activeProjectPath
      && isWriterDirty
      && !window.confirm("当前章节尚未保存，确定放弃修改并重命名作品吗？")
    ) return
    const result = await window.authorDesk.library.renameProject(project.path, nextName)
    setLibrary(result.library)
    if (activeProjectPath === result.oldPath) {
      setActiveProjectPath(result.newPath)
    }
  }

  async function createProject(): Promise<CreateProjectResult | null> {
    if (isWriterAiRunning) {
      window.alert("AI 写作助手正在运行，请先回到写作台停止当前任务，再新建作品。")
      return null
    }
    const result = await window.authorDesk.library.createProject()
    if (!result) return null
    setLibrary(result.library)
    setActiveProjectPath(result.projectPath)
    return result
  }

  async function refreshLibrary() {
    setIsRefreshingLibrary(true)
    try {
      const nextLibrary = await window.authorDesk.library.getProjects()
      setLibrary(nextLibrary)
      if (
        activeProjectPath
        && !nextLibrary.projects.some((project) => project.path === activeProjectPath)
      ) {
        const nextProject = nextLibrary.projects[0]
        setActiveProjectPath(nextProject?.path || "")
        if (nextProject) await window.authorDesk.library.setActiveProject(nextProject.path)
      }
    } finally {
      setIsRefreshingLibrary(false)
    }
  }

  function showWorksPage() {
    if (isWriterDirty && !window.confirm("当前章节尚未保存，确定离开写作台吗？")) return
    setActivePage("works")
  }

  function showSettingsPage() {
    setIsStyleComparisonOpen(false)
    setIsSettingsDialogOpen(true)
  }

  function showStyleComparison() {
    setIsSettingsDialogOpen(false)
    setIsStyleComparisonOpen(true)
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-[14px] border border-border bg-background text-foreground shadow-2xl">
      <WindowTitlebar />

      <div className="flex min-h-0 flex-1">
        <aside className={`flex shrink-0 flex-col border-r border-border bg-sidebar px-3 pb-4 pt-3 transition-[width] duration-200 ${
          isSidebarCollapsed ? "w-[68px]" : "w-60"
        }`}>
          <div className={`mb-3 flex ${isSidebarCollapsed ? "justify-center" : "justify-end"}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isSidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              title={isSidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
          </div>

          {isSidebarCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              className="mx-auto mb-6 bg-secondary text-primary hover:bg-secondary"
              aria-label="选择正在写的小说"
              title={activeProject?.name || "选择小说"}
              onClick={showWorksPage}
            >
              <BookOpenText className="size-4" />
            </Button>
          ) : (
          <div className="mb-6 rounded-xl border border-primary/10 bg-secondary/55 p-3">
            <label htmlFor="active-project" className="mb-2 block text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">
              正在写
            </label>
            <div className="relative">
              <BookOpenText className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
              <select
                id="active-project"
                value={activeProjectPath}
                disabled={!library.projects.length}
                onChange={(event) => selectProject(event.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-transparent bg-white pl-9 pr-8 text-sm font-medium outline-none transition-[border-color,box-shadow] focus:border-primary/40 focus:ring-3 focus:ring-primary/10 disabled:text-muted-foreground"
              >
                {!library.projects.length && <option value="">暂无作品</option>}
                {library.projects.map((project) => (
                  <option key={project.path} value={project.path}>{project.name}</option>
                ))}
              </select>
            </div>
            <p className="mt-2 truncate text-[11px] text-muted-foreground" title={activeProject?.path || library.root}>
              {activeProject ? `${activeProject.chapterCount} 章 · ${activeProject.characterCount.toLocaleString("zh-CN")} 字` : "请先选择小说库"}
            </p>
          </div>
          )}

          <p className={`mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground ${
            isSidebarCollapsed ? "sr-only" : ""
          }`}>
            工作空间
          </p>
          <nav className="space-y-1" aria-label="主要导航">
            <Button
              variant="ghost"
              title="写作台"
              aria-label="写作台"
              className={`relative h-10 w-full ${isSidebarCollapsed ? "justify-center px-0" : "justify-start"} ${
                activePage === "writer" && !isSettingsDialogOpen && !isStyleComparisonOpen
                  ? "bg-secondary text-primary hover:bg-secondary"
                  : "text-muted-foreground"
              }`}
              aria-current={
                activePage === "writer" && !isSettingsDialogOpen && !isStyleComparisonOpen
                  ? "page"
                  : undefined
              }
              onClick={() => setActivePage("writer")}
            >
              <PenLine className="size-4" />
              {!isSidebarCollapsed && "写作台"}
              {isWriterAiRunning && (
                <LoaderCircle
                  className={`size-3.5 animate-spin text-primary ${
                    isSidebarCollapsed ? "absolute right-1.5 top-1.5" : "ml-auto"
                  }`}
                  aria-label="AI 助手运行中"
                />
              )}
            </Button>
            <Button
              variant="ghost"
              title="我的作品"
              aria-label="我的作品"
              className={`h-10 w-full ${isSidebarCollapsed ? "justify-center px-0" : "justify-start"} ${
                activePage === "works" && !isSettingsDialogOpen && !isStyleComparisonOpen
                  ? "bg-secondary text-primary hover:bg-secondary"
                  : "text-muted-foreground"
              }`}
              aria-current={
                activePage === "works" && !isSettingsDialogOpen && !isStyleComparisonOpen
                  ? "page"
                  : undefined
              }
              onClick={showWorksPage}
            >
              <BookOpenText className="size-4" />
              {!isSidebarCollapsed && (
                <>
                  我的作品
                  <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] tabular-nums">
                    {library.projects.length}
                  </span>
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              title="文风对比"
              aria-label="文风对比"
              aria-haspopup="dialog"
              aria-expanded={isStyleComparisonOpen}
              className={`h-10 w-full ${isSidebarCollapsed ? "justify-center px-0" : "justify-start"} ${
                isStyleComparisonOpen
                  ? "bg-secondary text-primary hover:bg-secondary"
                  : "text-muted-foreground"
              }`}
              onClick={showStyleComparison}
            >
              <Scale className="size-4" />
              {!isSidebarCollapsed && "文风对比"}
            </Button>
            <Button
              variant="ghost"
              title="设置"
              aria-label="设置"
              aria-haspopup="dialog"
              aria-expanded={isSettingsDialogOpen}
              className={`h-10 w-full ${isSidebarCollapsed ? "justify-center px-0" : "justify-start"} ${
                isSettingsDialogOpen
                  ? "bg-secondary text-primary hover:bg-secondary"
                  : "text-muted-foreground"
              }`}
              onClick={showSettingsPage}
            >
              <Settings2 className="size-4" />
              {!isSidebarCollapsed && "设置"}
            </Button>
          </nav>

          <div className="mt-auto space-y-3">
            {!isSidebarCollapsed && (
            <div className="rounded-xl border border-border bg-muted/35 p-3.5">
              <div className="flex items-center gap-2 text-xs font-medium">
                {service.ok ? (
                  <CheckCircle2 className="size-3.5 text-success" />
                ) : service.message ? (
                  <AlertCircle className="size-3.5 text-destructive" />
                ) : (
                  <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                )}
                本地文件服务
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {service.ok ? "正文目录已连接" : service.message ? "服务暂时不可用" : "正在连接"}
              </p>
            </div>
            )}
          </div>
        </aside>

        <section className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
          {activePage === "works" && (
            <div className="relative h-full overflow-auto">
              <WorksPage
                library={library}
                activeProjectPath={activeProjectPath}
                isRefreshing={isRefreshingLibrary}
                onOpenSettings={showSettingsPage}
                onOpenProject={openProjectFolder}
                onCreateProject={createProject}
                onRenameProject={renameProject}
                onRefresh={refreshLibrary}
                onSelectProject={(project) => selectProject(project.path)}
              />
            </div>
          )}
          <div
            className={activePage === "writer" ? "h-full" : "hidden"}
            aria-hidden={activePage !== "writer"}
          >
            <WriterPage
              project={activeProject}
              isActive={activePage === "writer"}
              onGoToWorks={showWorksPage}
              onOpenProjectFolder={openProjectFolder}
              onOpenSettings={showSettingsPage}
              onSaved={refreshLibrary}
              onDirtyChange={setIsWriterDirty}
              onAiRunningChange={setIsWriterAiRunning}
            />
          </div>
        </section>
      </div>

      <SettingsDialog
        open={isSettingsDialogOpen}
        library={library}
        isChoosingLibrary={isChoosingLibrary}
        onChooseLibrary={chooseLibraryRoot}
        onClose={() => setIsSettingsDialogOpen(false)}
      />
      <StyleComparisonDialog
        open={isStyleComparisonOpen}
        defaultPath={activeProject?.manuscriptPath || activeProject?.path || library.root}
        onClose={() => setIsStyleComparisonOpen(false)}
      />
      <CloseConfirmDialog hasUnsavedChanges={isWriterDirty} />
    </main>
  )
}

export function App() {
  return <MainWindow />
}
