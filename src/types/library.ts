export type LibraryProject = {
  name: string
  path: string
  manuscriptPath: string | null
  chapterCount: number
  characterCount: number
  latestChapter: string | null
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
