export {}

type WindowState = {
  isMaximized: boolean
  isFullScreen: boolean
}

type CloseBehavior = "ask" | "tray" | "quit"

type ServiceHealth = {
  ok: boolean
  message?: string
  service?: string
  storage?: "filesystem"
  pid?: number
  time?: string
}

type LibraryProject = {
  name: string
  path: string
  manuscriptPath: string | null
  chapterCount: number
  characterCount: number
  latestChapter: string | null
  modifiedAt: string
}

type LibraryState = {
  ok: boolean
  storage: "filesystem"
  root: string
  projects: LibraryProject[]
  message?: string
}

type RenameProjectResult = {
  ok: boolean
  oldPath: string
  newPath: string
  library: LibraryState
}

type CreateProjectResult = {
  ok: boolean
  projectPath: string
  createdDirectories: string[]
  existingDirectories: string[]
  library: LibraryState
}

type ChapterSummary = {
  name: string
  path: string
  characterCount: number
  modifiedAt: string
}

type ChapterListState = {
  ok: boolean
  projectPath: string
  manuscriptPath: string
  chapters: ChapterSummary[]
}

type ChapterDocument = ChapterSummary & {
  ok: boolean
  content: string
}

type ApiSettings = {
  baseUrl: string
  model: string
  reasoningEffort: "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
  hasApiKey: boolean
}

type ApiSettingsInput = Omit<ApiSettings, "hasApiKey"> & {
  apiKey?: string
  clearApiKey?: boolean
}

type AiChatMessage = {
  role: "user" | "assistant"
  content: string
}

type AiChatInput = {
  requestId: string
  messages: AiChatMessage[]
  context: {
    projectName: string
    projectPath: string
    chapterName: string
    chapterContent: string
    chatSummary: string
  }
  allowWriteTools: boolean
}

type AiToolEvent = {
  kind: "read" | "diff" | "created" | "modified"
  path: string
  label: string
  diff?: string
}

type AiStoredMessage = AiChatMessage & {
  id: string
  toolEvents?: AiToolEvent[]
  status?: string
  hasError?: boolean
  changeSetId?: string
  changeStatus?: "pending" | "saved" | "canceled" | "expired"
}

type AiChatHistory = {
  messages: AiStoredMessage[]
  summary: string
  compactedCount: number
  updatedAt: string | null
}

type AiChatCompactResult = AiChatHistory & {
  didCompact: boolean
}

type AiChatProgress = {
  requestId: string
  type: "content-delta" | "content-reset" | "status" | "tool-event"
  delta?: string
  label?: string
  toolEvent?: AiToolEvent
}

type CharacterProfile = {
  id: string
  name: string
  aliases: string[]
  role: string
  description: string
  personality: string[]
  goals: string[]
  firstAppearance: string
}

type CharacterRelationship = {
  id: string
  source: string
  target: string
  type: string
  description: string
  strength: number
  status: string
}

type CharacterGraph = {
  version: 1
  projectName: string
  generatedAt: string
  source: {
    chapterCount: number
    characterCount: number
  }
  characters: CharacterProfile[]
  relationships: CharacterRelationship[]
}

type CharacterGraphState = {
  ok: boolean
  exists: boolean
  path: string
  graph: CharacterGraph | null
}

type WritingRuleFile = {
  name: string
  relativePath: string
  path: string
  content: string
  enabled: boolean
  characterCount: number
  headings: string[]
  modifiedAt: string
}

type WritingRulesState = {
  ok: boolean
  exists: boolean
  root: string
  rules: WritingRuleFile[]
  totalCharacters: number
  injectedCharacters: number
}

type WritingRuleMutationResult = {
  relativePath: string
  state: WritingRulesState
}

type ReferenceStyleProfile = {
  overview: string
  narrative: string
  viewpoint: string
  pacing: string
  sentence: string
  dialogue: string
  description: string
  emotion: string
  vocabulary: string
  chapterStructure: string
  techniques: string[]
  avoid: string[]
  writingPrompt: string
}

type ReferenceStyleState = {
  exists: boolean
  path: string
  sourcePath: string
  sourceName: string
  fileCount: number
  totalBytes: number
  sampledFiles: string[]
  sampledCharacters: number
  generatedAt: string | null
  model: string
  profile: ReferenceStyleProfile | null
}

type StyleComparisonArticle = {
  name: string
  path: string
  characterCount: number
  sampledCharacters: number
  preview: string
}

type StyleComparisonDimension = {
  key: string
  title: string
  articleAScore: number
  articleBScore: number
  articleA: string
  articleB: string
  comparison: string
}

type StyleComparisonReport = {
  generatedAt: string
  model: string
  similarityScore: number
  overview: string
  articleA: {
    name: string
    summary: string
    strengths: string[]
    risks: string[]
  }
  articleB: {
    name: string
    summary: string
    strengths: string[]
    risks: string[]
  }
  dimensions: StyleComparisonDimension[]
  similarities: string[]
  differences: string[]
  recommendations: {
    articleA: string[]
    articleB: string[]
    fusion: string[]
  }
  verdict: {
    articleAUseCase: string
    articleBUseCase: string
    conclusion: string
  }
  sources: {
    articleA: Omit<StyleComparisonArticle, "preview">
    articleB: Omit<StyleComparisonArticle, "preview">
  }
}

type StyleComparisonProgress = {
  requestId: string
  phase: "reading" | "reviewing" | "retrying" | "organizing" | "complete"
  label: string
}

type GitSyncProgress = {
  requestId: string
  phase: "checking" | "fetching" | "pulling" | "committing" | "pushing" | "complete"
  label: string
}

type GitSyncResult = {
  ok: boolean
  status: "synced" | "conflict"
  branch: string
  remote?: string
  committed?: boolean
  conflictFiles: string[]
  operation: string
  message: string
  syncedAt?: string
}

declare global {
  interface Window {
    authorDesk: {
      platform: string
      window: {
        minimize(): Promise<boolean>
        hideToTray(): Promise<boolean>
        toggleMaximize(): Promise<WindowState>
        close(): Promise<boolean>
        getCloseBehavior(): Promise<CloseBehavior>
        setCloseBehavior(closeBehavior: CloseBehavior): Promise<CloseBehavior>
        resolveClose(action: Exclude<CloseBehavior, "ask">, remember: boolean): Promise<boolean>
        openChild(): Promise<boolean>
        getState(): Promise<WindowState>
        onStateChange(callback: (state: WindowState) => void): () => void
        onCloseRequested(callback: () => void): () => void
      }
      service: {
        getHealth(): Promise<ServiceHealth>
        sayHello(): Promise<{ message: string }>
      }
      library: {
        getProjects(): Promise<LibraryState>
        getActiveProject(): Promise<string | null>
        setActiveProject(projectPath: string): Promise<boolean>
        chooseRoot(): Promise<LibraryState | null>
        openProjectFolder(projectPath: string): Promise<boolean>
        renameProject(projectPath: string, nextName: string): Promise<RenameProjectResult>
        createProject(): Promise<CreateProjectResult | null>
      }
      project: {
        getChapters(projectPath: string): Promise<ChapterListState>
        createChapter(projectPath: string, chapterName: string): Promise<ChapterDocument>
        getChapter(projectPath: string, chapterName: string): Promise<ChapterDocument>
        saveChapter(projectPath: string, chapterName: string, content: string): Promise<ChapterDocument>
        deleteChapter(projectPath: string, chapterName: string): Promise<{
          ok: boolean
          name: string
        }>
      }
      settings: {
        getApi(): Promise<ApiSettings>
        saveApi(input: ApiSettingsInput): Promise<ApiSettings>
      }
      ai: {
        chat(input: AiChatInput): Promise<{
          content: string
          model: string
          toolEvents: AiToolEvent[]
          autoReviewed: boolean
          changeSetId: string
          pendingChangeCount: number
        }>
        cancelChat(requestId: string): Promise<boolean>
        applyChanges(projectPath: string, changeSetId: string): Promise<{
          ok: boolean
          status: "saved"
          alreadyResolved: boolean
          appliedCount: number
          toolEvents: AiToolEvent[]
        }>
        discardChanges(projectPath: string, changeSetId: string): Promise<{
          ok: boolean
          status: "saved" | "canceled" | "missing"
          alreadyResolved: boolean
          discardedCount: number
          appliedCount?: number
          toolEvents?: AiToolEvent[]
        }>
        getHistory(projectPath: string): Promise<AiChatHistory>
        saveHistory(projectPath: string, messages: AiStoredMessage[]): Promise<AiChatHistory>
        clearHistory(projectPath: string): Promise<AiChatHistory>
        compactHistory(projectPath: string): Promise<AiChatCompactResult>
        onChatProgress(callback: (progress: AiChatProgress) => void): () => void
      }
      characters: {
        get(projectPath: string): Promise<CharacterGraphState>
        summarize(projectPath: string): Promise<CharacterGraphState & {
          model: string
        }>
      }
      rules: {
        get(projectPath: string): Promise<WritingRulesState>
        create(projectPath: string, input: {
          name: string
          content: string
        }): Promise<WritingRuleMutationResult>
        save(
          projectPath: string,
          relativePath: string,
          content: string,
        ): Promise<WritingRuleMutationResult>
        setEnabled(
          projectPath: string,
          relativePath: string,
          enabled: boolean,
        ): Promise<WritingRuleMutationResult>
        delete(
          projectPath: string,
          relativePath: string,
        ): Promise<WritingRuleMutationResult>
        openFolder(projectPath: string): Promise<boolean>
      }
      referenceStyle: {
        get(projectPath: string): Promise<ReferenceStyleState>
        chooseDirectory(projectPath: string): Promise<ReferenceStyleState>
        summarize(projectPath: string): Promise<ReferenceStyleState>
        openDirectory(projectPath: string): Promise<boolean>
      }
      styleComparison: {
        chooseArticle(defaultPath?: string): Promise<StyleComparisonArticle | null>
        compare(input: {
          requestId: string
          articleAPath?: string
          articleBPath?: string
          articleAName?: string
          articleBName?: string
          articleAContent?: string
          articleBContent?: string
        }): Promise<StyleComparisonReport>
        onProgress(callback: (progress: StyleComparisonProgress) => void): () => void
      }
      git: {
        syncProject(input: {
          requestId: string
          projectPath: string
        }): Promise<GitSyncResult>
        onSyncProgress(callback: (progress: GitSyncProgress) => void): () => void
      }
    }
  }
}
