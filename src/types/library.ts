export type LibraryProject = {
  name: string
  path: string
  manuscriptPath: string | null
  chapterCount: number
  characterCount: number
  latestChapter: string | null
  introductionExists: boolean
  shortTitle: string
  synopsis: string
  modifiedAt: string
}

export type LibraryState = {
  ok: boolean
  storage: "filesystem"
  root: string
  projects: LibraryProject[]
  message?: string
}

export type CreateProjectResult = {
  ok: boolean
  projectPath: string
  createdDirectories: string[]
  existingDirectories: string[]
  library: LibraryState
}

export type NovelIntroductionState = {
  ok: boolean
  exists: boolean
  path: string
  shortTitle: string
  synopsis: string
  modifiedAt: string | null
}

export type NovelIntroductionDraft = {
  shortTitle: string
  synopsis: string
  model: string
  sourceChapterCount: number
}

export type ChapterSummary = {
  name: string
  path: string
  characterCount: number
  modifiedAt: string
}

export type ChapterListState = {
  ok: boolean
  projectPath: string
  manuscriptPath: string
  chapters: ChapterSummary[]
}

export type ChapterDocument = ChapterSummary & {
  ok: boolean
  content: string
}

export type ChapterHistoryEntry = {
  id: string
  createdAt: string
  characterCount: number
  byteSize: number
}

export type ChapterHistoryState = {
  ok: boolean
  chapterName: string
  limit: number
  entries: ChapterHistoryEntry[]
}

export type ChapterHistoryDetail = ChapterHistoryEntry & {
  ok: boolean
  diff: string
  sameAsCurrent: boolean
}

export type RestoreChapterHistoryResult = {
  ok: boolean
  restoredFrom: string
  document: ChapterDocument
  history: ChapterHistoryState
}

export type CharacterProfile = {
  id: string
  name: string
  aliases: string[]
  role: string
  description: string
  personality: string[]
  goals: string[]
  firstAppearance: string
}

export type CharacterRelationship = {
  id: string
  source: string
  target: string
  type: string
  description: string
  strength: number
  status: string
}

export type CharacterGraph = {
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

export type CharacterGraphState = {
  ok: boolean
  exists: boolean
  path: string
  graph: CharacterGraph | null
}

export type WritingRuleFile = {
  name: string
  relativePath: string
  path: string
  content: string
  enabled: boolean
  characterCount: number
  headings: string[]
  modifiedAt: string
}

export type WritingRulesState = {
  ok: boolean
  exists: boolean
  root: string
  rules: WritingRuleFile[]
  totalCharacters: number
  injectedCharacters: number
}

export type WritingRuleMutationResult = {
  relativePath: string
  state: WritingRulesState
}

export type ReferenceStyleProfile = {
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

export type ReferenceStyleState = {
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

export type BookBreakdownBeat = {
  order: number
  stage: string
  chapterRange: string
  event: string
  function: string
  conflict: string
  turn: string
  consequence: string
  tension: number
}

export type BookBreakdownReport = {
  overview: string
  premise: string
  themes: string[]
  centralConflict: string
  storyPhases: Array<{
    name: string
    range: string
    goal: string
    development: string
    result: string
  }>
  beats: BookBreakdownBeat[]
  characterArcs: Array<{
    name: string
    role: string
    start: string
    desire: string
    obstacle: string
    change: string
    end: string
  }>
  conflictEscalation: string[]
  setupPayoffs: Array<{
    setup: string
    payoff: string
    effect: string
  }>
  pacing: string
  reusablePatterns: Array<{
    title: string
    mechanism: string
    whyItWorks: string
    adaptationDirections: string[]
  }>
  originalityWarnings: string[]
}

export type BookBreakdownState = {
  exists: boolean
  path: string
  directory: string
  sourcePath: string
  sourceName: string
  sourceBytes: number
  characterCount: number
  detectionMethod: "headings" | "fallback"
  detectedChapterCount: number
  selectedChapterCount: number
  selectedCharacterCount: number
  chapterTitles: string[]
  importedAt: string | null
  generatedAt: string | null
  styleGeneratedAt: string | null
  styleSampledCharacters: number
  styleError: string
  model: string
  analyzedChunks: number
  report: BookBreakdownReport | null
  styleProfile: ReferenceStyleProfile | null
}

export type BookBreakdownProgress = {
  requestId: string
  phase: "reading" | "splitting" | "analyzing" | "synthesizing" | "style" | "saving" | "retrying" | "complete"
  label: string
  completed?: number
  total?: number
}

export type StyleComparisonArticle = {
  name: string
  path: string
  characterCount: number
  sampledCharacters: number
  preview: string
}

export type StyleComparisonDimension = {
  key: string
  title: string
  articleAScore: number
  articleBScore: number
  articleA: string
  articleB: string
  comparison: string
}

export type StyleComparisonReport = {
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

export type StyleComparisonProgress = {
  requestId: string
  phase: "reading" | "reviewing" | "retrying" | "organizing" | "complete"
  label: string
}
