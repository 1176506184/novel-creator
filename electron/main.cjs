const path = require("node:path")
const fs = require("node:fs")
const { createHash, randomUUID } = require("node:crypto")
const { spawn } = require("node:child_process")
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  shell,
  Tray,
} = require("electron")

const APP_NAME = "作者管家"
const APP_ID = "com.novelcreator.author-desk"
const SERVICE_PORT = 37891
const SERVICE_URL = `http://127.0.0.1:${SERVICE_PORT}`
const PRELOAD_PATH = path.join(__dirname, "preload.cjs")
const SERVER_PATH = path.join(__dirname, "server.cjs")
const ICON_PNG_PATH = path.join(__dirname, "..", "assets", "app-icon-256.png")
const ICON_TRAY_PATH = path.join(__dirname, "..", "assets", "app-icon-32.png")
const ICON_ICO_PATH = path.join(__dirname, "..", "assets", "app-icon.ico")
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const SHOULD_OPEN_DEVTOOLS = process.env.AUTHOR_DESK_DEVTOOLS === "1"
const DEFAULT_LIBRARY_ROOT = process.env.AUTHOR_DESK_LIBRARY_ROOT || String.raw`G:\小说库`
const DEFAULT_API_CONFIG = {
  baseUrl: "https://ai98pro.xyz/v1",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
}
const REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"])
const CLOSE_BEHAVIORS = new Set(["ask", "tray", "quit"])
const WRITING_RULE_EXTENSIONS = new Set([".md", ".markdown", ".mdc", ".txt"])
const WRITING_RULE_DISCOVERY_PATTERN = /^rules-.*\.md$/i
const WRITING_RULE_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".chat",
  "node_modules",
  "release",
  "dist",
])
const MAX_WRITING_RULE_FILES = 100
const MAX_WRITING_RULE_PROMPT_LENGTH = 60_000
const WRITING_RULE_SETTINGS_FILE = ".author-desk.json"
const PROJECT_REQUIRED_DIRECTORIES = [
  "正文",
  ".chat",
  path.join(".trae", "rules"),
  "角色设置",
  "参考小说",
  "范文库",
]

let mainWindow = null
let tray = null
let serviceProcess = null
let isQuitting = false
let saveBoundsTimer = null
const childWindows = new Set()

app.setName(APP_NAME)
if (process.platform === "win32") app.setAppUserModelId(APP_ID)

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

function settingsPath() {
  return path.join(app.getPath("userData"), "window-state.json")
}

function readDesktopSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"))
  } catch {
    return {}
  }
}

function writeDesktopSettings(patch) {
  const settings = {
    ...readDesktopSettings(),
    ...patch,
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
  return settings
}

function readWindowState() {
  const settings = readDesktopSettings()
  return settings.windowState || (
    settings.bounds
      ? { bounds: settings.bounds, maximized: settings.maximized }
      : {}
  )
}

function getLibraryRoot() {
  return readDesktopSettings().libraryRoot || DEFAULT_LIBRARY_ROOT
}

function getActiveProjectPath() {
  const activeProjectPath = readDesktopSettings().activeProjectPath
  return typeof activeProjectPath === "string" && isPathInsideLibrary(activeProjectPath)
    ? path.resolve(activeProjectPath)
    : null
}

function getCloseBehavior() {
  const closeBehavior = readDesktopSettings().closeBehavior
  return CLOSE_BEHAVIORS.has(closeBehavior) ? closeBehavior : "ask"
}

function setCloseBehavior(closeBehavior) {
  if (!CLOSE_BEHAVIORS.has(closeBehavior)) throw new Error("关闭行为设置无效")
  writeDesktopSettings({ closeBehavior })
  return closeBehavior
}

function getApiConfig() {
  const api = readDesktopSettings().api || {}
  return {
    baseUrl: typeof api.baseUrl === "string" && api.baseUrl ? api.baseUrl : DEFAULT_API_CONFIG.baseUrl,
    model: typeof api.model === "string" && api.model ? api.model : DEFAULT_API_CONFIG.model,
    reasoningEffort: REASONING_EFFORTS.has(api.reasoningEffort)
      ? api.reasoningEffort
      : DEFAULT_API_CONFIG.reasoningEffort,
    hasApiKey: typeof api.apiKeyEncrypted === "string" && Boolean(api.apiKeyEncrypted),
  }
}

function saveApiConfig(input) {
  if (!input || typeof input !== "object") throw new Error("API 设置无效")
  const baseUrl = String(input.baseUrl || "").trim().replace(/\/+$/, "")
  const model = String(input.model || "").trim()
  const reasoningEffort = String(input.reasoningEffort || "")
  const parsedUrl = new URL(baseUrl)
  if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS")
  if (!model || model.length > 120) throw new Error("模型名称无效")
  if (!REASONING_EFFORTS.has(reasoningEffort)) throw new Error("推理强度无效")

  const previousApi = readDesktopSettings().api || {}
  let apiKeyEncrypted = previousApi.apiKeyEncrypted
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : ""
  if (input.clearApiKey === true) {
    apiKeyEncrypted = null
  } else if (apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统暂时无法安全保存 API Key")
    }
    apiKeyEncrypted = safeStorage.encryptString(apiKey).toString("base64")
  }

  writeDesktopSettings({
    api: {
      baseUrl,
      model,
      reasoningEffort,
      apiKeyEncrypted,
    },
  })
  return getApiConfig()
}

function getApiRuntimeConfig() {
  const api = readDesktopSettings().api || {}
  if (!api.apiKeyEncrypted) throw new Error("请先在设置中配置 API Key")
  if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统无法解密 API Key")
  let apiKey = ""
  try {
    apiKey = safeStorage.decryptString(Buffer.from(api.apiKeyEncrypted, "base64"))
  } catch {
    throw new Error("API Key 解密失败，请在设置中重新保存")
  }
  return {
    ...getApiConfig(),
    apiKey,
  }
}

const AI_FILE_EXTENSIONS = new Set([".txt", ".md", ".markdown"])
const AI_CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_chapters",
      description: "列出当前小说“正文”目录中的全部章节文件。分析多个章节前应优先调用此工具。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_chapters",
      description: "一次批量读取多个章节文件。分析连续剧情时应使用此工具，避免逐个调用 read_file。",
      parameters: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            description: "相对于当前小说目录的章节路径，一次最多 12 个",
            items: { type: "string" },
            minItems: 1,
            maxItems: 12,
          },
        },
        required: ["paths"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取当前小说目录内的文本文件。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于当前小说目录的路径，例如 正文/第1章.txt" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "准备在当前小说目录中创建新的文本文件。只生成待确认差异，不会立即写入；禁止覆盖同名文件。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于当前小说目录的路径" },
          content: { type: "string", description: "新文件的完整内容" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stage_file_edit",
      description: "用精确文本替换生成并暂存文件修改，同时返回待确认 diff。不会立即写入文件；用户保存后才真正生效。修改文件时优先使用此工具，避免先后调用 preview_file_diff 和 modify_file。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于当前小说目录的路径" },
          old_text: {
            type: "string",
            description: "文件中必须存在的原文；目标是 0 字节空文件时传空字符串",
          },
          new_text: { type: "string", description: "替换后的新文本" },
          replace_all: { type: "boolean", description: "是否替换全部匹配，默认只替换第一处" },
        },
        required: ["path", "old_text", "new_text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_file_diff",
      description: "比较文件当前内容与拟写入的新内容，返回 diff，但不修改文件。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于当前小说目录的路径" },
          new_content: { type: "string", description: "拟写入的完整内容" },
        },
        required: ["path", "new_content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_file",
      description: "用精确文本替换准备修改当前小说目录中的文件，返回待确认 diff，用户保存后才真正写入。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于当前小说目录的路径" },
          old_text: {
            type: "string",
            description: "文件中必须存在的原文；目标是 0 字节空文件时传空字符串",
          },
          new_text: { type: "string", description: "替换后的新文本" },
          replace_all: { type: "boolean", description: "是否替换全部匹配，默认只替换第一处" },
        },
        required: ["path", "old_text", "new_text"],
        additionalProperties: false,
      },
    },
  },
]

function resolveAiProjectFile(projectPath, relativeFilePath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("当前作品目录无效")
  }
  const normalizedProject = path.resolve(projectPath)
  const relativePath = String(relativeFilePath || "").trim().replace(/\//g, path.sep)
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("文件路径无效")
  const targetPath = path.resolve(normalizedProject, relativePath)
  const insideProject = path.relative(normalizedProject, targetPath)
  if (!insideProject || insideProject.startsWith("..") || path.isAbsolute(insideProject)) {
    throw new Error("工具只能访问当前小说目录中的文件")
  }
  if (!AI_FILE_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
    throw new Error("工具只支持 txt、md 和 markdown 文件")
  }
  return {
    targetPath,
    relativePath: path.relative(normalizedProject, targetPath).replace(/\\/g, "/"),
  }
}

function isPathContained(parentPath, targetPath) {
  const relativePath = path.relative(parentPath, targetPath)
  return Boolean(relativePath)
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
}

async function readAiTextFile(targetPath) {
  const stats = await fs.promises.stat(targetPath)
  if (!stats.isFile()) throw new Error("目标路径不是文件")
  if (stats.size > 1024 * 1024) throw new Error("文件超过 1MB，无法交给 AI 工具处理")
  return fs.promises.readFile(targetPath, "utf8")
}

function createTextDiff(relativePath, beforeContent, afterContent) {
  if (beforeContent === afterContent) return `--- a/${relativePath}\n+++ b/${relativePath}\n（无变化）`
  const before = beforeContent.split(/\r?\n/)
  const after = afterContent.split(/\r?\n/)
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  const contextStart = Math.max(0, prefix - 2)
  const beforeEnd = Math.min(before.length, before.length - suffix + 2)
  const afterEnd = Math.min(after.length, after.length - suffix + 2)
  const lines = [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -${contextStart + 1},${beforeEnd - contextStart} +${contextStart + 1},${afterEnd - contextStart} @@`,
  ]
  for (let index = contextStart; index < prefix; index += 1) lines.push(` ${before[index]}`)
  for (let index = prefix; index < before.length - suffix; index += 1) lines.push(`-${before[index]}`)
  for (let index = prefix; index < after.length - suffix; index += 1) lines.push(`+${after[index]}`)
  for (let index = Math.max(prefix, after.length - suffix); index < afterEnd; index += 1) {
    lines.push(` ${after[index]}`)
  }
  return lines.join("\n").slice(0, 80_000)
}

function getAiPendingChangesDirectory(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return path.join(path.resolve(projectPath), ".chat", "pending-changes")
}

function normalizeAiChangeSetId(changeSetIdInput) {
  const changeSetId = String(changeSetIdInput || "").trim()
  if (!/^[a-f0-9-]{36}$/i.test(changeSetId)) throw new Error("AI 修改记录无效")
  return changeSetId
}

function getAiPendingChangePath(projectPath, changeSetIdInput) {
  const changeSetId = normalizeAiChangeSetId(changeSetIdInput)
  return path.join(getAiPendingChangesDirectory(projectPath), `${changeSetId}.json`)
}

async function findExistingAiTargetParent(targetPath) {
  let currentPath = path.dirname(targetPath)
  while (true) {
    try {
      return await fs.promises.realpath(currentPath)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      const parentPath = path.dirname(currentPath)
      if (parentPath === currentPath) throw new Error("无法确认目标目录")
      currentPath = parentPath
    }
  }
}

async function assertAiTargetParentInsideProject(realProjectPath, targetPath) {
  const realParentPath = await findExistingAiTargetParent(targetPath)
  if (realParentPath !== realProjectPath && !isPathContained(realProjectPath, realParentPath)) {
    throw new Error("目标目录符号链接指向小说目录之外")
  }
}

async function saveAiPendingChangeSet(projectPath, pendingChanges) {
  if (!(pendingChanges instanceof Map) || pendingChanges.size === 0) return ""
  const changeSetId = randomUUID()
  const changeSetPath = getAiPendingChangePath(projectPath, changeSetId)
  const changes = [...pendingChanges.values()].map((change) => ({
    kind: change.kind,
    path: change.path,
    beforeContent: change.beforeContent,
    afterContent: change.afterContent,
  }))
  await fs.promises.mkdir(path.dirname(changeSetPath), { recursive: true })
  await fs.promises.writeFile(changeSetPath, `${JSON.stringify({
    version: 2,
    id: changeSetId,
    status: "pending",
    createdAt: new Date().toISOString(),
    changeCount: changes.length,
    changes,
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  return changeSetId
}

async function writeAiChangeSetState(changeSetPath, state) {
  const temporaryPath = `${changeSetPath}.${process.pid}.tmp`
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  try {
    await fs.promises.rename(temporaryPath, changeSetPath)
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {})
    throw error
  }
}

async function readAiPendingChangeSet(
  projectPath,
  changeSetIdInput,
  { allowMissing = false } = {},
) {
  const changeSetId = normalizeAiChangeSetId(changeSetIdInput)
  const changeSetPath = getAiPendingChangePath(projectPath, changeSetId)
  let data
  try {
    data = JSON.parse(await fs.promises.readFile(changeSetPath, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT" && allowMissing) {
      return {
        changeSetId,
        changeSetPath,
        status: "missing",
        changeCount: 0,
        changes: [],
        toolEvents: [],
      }
    }
    if (error?.code === "ENOENT") throw new Error("这组待确认修改已经不存在，可能已保存或取消")
    throw new Error(`无法读取待确认修改：${error instanceof Error ? error.message : String(error)}`)
  }
  if (data?.id !== changeSetId) {
    throw new Error("待确认修改文件格式无效")
  }
  const status = ["pending", "saved", "canceled"].includes(data?.status)
    ? data.status
    : "pending"
  const changeCount = Number.isFinite(data?.changeCount)
    ? Math.max(0, Math.floor(data.changeCount))
    : Array.isArray(data?.changes)
      ? data.changes.length
      : 0
  const toolEvents = Array.isArray(data?.toolEvents)
    ? data.toolEvents.map(normalizeAiToolEvent).filter(Boolean)
    : []
  if (status !== "pending") {
    return {
      changeSetId,
      changeSetPath,
      status,
      changeCount,
      changes: [],
      toolEvents,
    }
  }
  if (!Array.isArray(data?.changes) || !data.changes.length) {
    throw new Error("待确认修改文件格式无效")
  }
  const changes = data.changes.map((change) => {
    const kind = String(change?.kind || "")
    if (!["created", "modified"].includes(kind)) throw new Error("待确认修改类型无效")
    const { relativePath } = resolveAiProjectFile(projectPath, change?.path)
    return {
      kind,
      path: relativePath,
      beforeContent: String(change?.beforeContent || ""),
      afterContent: String(change?.afterContent || ""),
    }
  })
  return {
    changeSetId,
    changeSetPath,
    status,
    changeCount,
    changes,
    toolEvents,
  }
}

async function applyAiPendingChangeSet(projectPath, changeSetIdInput) {
  const pending = await readAiPendingChangeSet(projectPath, changeSetIdInput)
  if (pending.status === "saved") {
    return {
      ok: true,
      status: "saved",
      alreadyResolved: true,
      appliedCount: pending.changeCount,
      toolEvents: pending.toolEvents,
    }
  }
  if (pending.status === "canceled") {
    throw new Error("这组修改已经取消，无法再次保存")
  }
  const realProjectPath = await fs.promises.realpath(projectPath)
  const validatedChanges = []

  for (const change of pending.changes) {
    const { targetPath, relativePath } = resolveAiProjectFile(projectPath, change.path)
    if (change.kind === "created") {
      await assertAiTargetParentInsideProject(realProjectPath, targetPath)
      try {
        const stats = await fs.promises.lstat(targetPath)
        if (!stats.isFile() || stats.isSymbolicLink()) {
          throw new Error(`“${relativePath}”已经存在且不是普通文件，未执行覆盖`)
        }
        const currentContent = await readAiTextFile(targetPath)
        if (currentContent !== change.afterContent) {
          throw new Error(`“${relativePath}”已经存在且内容不同，未执行覆盖`)
        }
        validatedChanges.push({
          ...change,
          targetPath,
          relativePath,
          needsWrite: false,
        })
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
        validatedChanges.push({
          ...change,
          targetPath,
          relativePath,
          needsWrite: true,
        })
      }
      continue
    }

    const realTargetPath = await fs.promises.realpath(targetPath)
    if (!isPathContained(realProjectPath, realTargetPath)) {
      throw new Error(`“${relativePath}”符号链接指向小说目录之外`)
    }
    const currentContent = await readAiTextFile(realTargetPath)
    if (
      currentContent !== change.beforeContent
      && currentContent !== change.afterContent
    ) {
      throw new Error(`“${relativePath}”在 AI 生成差异后又发生了变化，请取消本次修改后重新生成`)
    }
    validatedChanges.push({
      ...change,
      targetPath: realTargetPath,
      relativePath,
      needsWrite: currentContent !== change.afterContent,
    })
  }

  for (const change of validatedChanges) {
    if (!change.needsWrite) continue
    if (change.kind === "created") {
      await fs.promises.mkdir(path.dirname(change.targetPath), { recursive: true })
      const realParentPath = await fs.promises.realpath(path.dirname(change.targetPath))
      if (realParentPath !== realProjectPath && !isPathContained(realProjectPath, realParentPath)) {
        throw new Error(`“${change.relativePath}”目标目录符号链接指向小说目录之外`)
      }
      await fs.promises.writeFile(change.targetPath, change.afterContent, {
        encoding: "utf8",
        flag: "wx",
      })
    } else {
      await fs.promises.writeFile(change.targetPath, change.afterContent, "utf8")
    }
  }

  const toolEvents = validatedChanges.map((change) => ({
    kind: change.kind,
    path: change.relativePath,
    label: change.kind === "created" ? "已创建文件" : "已修改文件",
    diff: createTextDiff(change.relativePath, change.beforeContent, change.afterContent),
  }))
  await writeAiChangeSetState(pending.changeSetPath, {
    version: 2,
    id: pending.changeSetId,
    status: "saved",
    resolvedAt: new Date().toISOString(),
    changeCount: validatedChanges.length,
    toolEvents,
  })
  return {
    ok: true,
    status: "saved",
    alreadyResolved: validatedChanges.every((change) => !change.needsWrite),
    appliedCount: validatedChanges.length,
    toolEvents,
  }
}

async function discardAiPendingChangeSet(projectPath, changeSetIdInput) {
  const pending = await readAiPendingChangeSet(
    projectPath,
    changeSetIdInput,
    { allowMissing: true },
  )
  if (pending.status === "missing") {
    return {
      ok: true,
      status: "missing",
      alreadyResolved: true,
      discardedCount: 0,
    }
  }
  if (pending.status === "saved") {
    return {
      ok: true,
      status: "saved",
      alreadyResolved: true,
      discardedCount: 0,
      appliedCount: pending.changeCount,
      toolEvents: pending.toolEvents,
    }
  }
  if (pending.status === "canceled") {
    return {
      ok: true,
      status: "canceled",
      alreadyResolved: true,
      discardedCount: pending.changeCount,
    }
  }
  await writeAiChangeSetState(pending.changeSetPath, {
    version: 2,
    id: pending.changeSetId,
    status: "canceled",
    resolvedAt: new Date().toISOString(),
    changeCount: pending.changeCount,
  })
  return {
    ok: true,
    status: "canceled",
    alreadyResolved: false,
    discardedCount: pending.changes.length,
  }
}

async function executeAiFileTool(toolName, args, toolContext) {
  const realProjectPath = await fs.promises.realpath(toolContext.projectPath)

  if (toolName === "list_chapters") {
    const manuscriptPath = path.join(realProjectPath, "正文")
    const realManuscriptPath = await fs.promises.realpath(manuscriptPath)
    if (!isPathContained(realProjectPath, realManuscriptPath)) {
      throw new Error("正文目录符号链接指向小说目录之外")
    }
    const entries = await fs.promises.readdir(realManuscriptPath, { withFileTypes: true })
    const chapterEntries = entries
      .filter((entry) => (
        entry.isFile()
        && AI_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ))
      .sort((left, right) => left.name.localeCompare(
        right.name,
        "zh-CN",
        { numeric: true, sensitivity: "base" },
      ))
      .slice(0, 2000)
    const chapters = await Promise.all(chapterEntries.map(async (entry) => {
      const chapterPath = path.join(realManuscriptPath, entry.name)
      const stats = await fs.promises.stat(chapterPath)
      return {
        name: entry.name,
        path: `正文/${entry.name}`,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      }
    }))
    return {
      result: { ok: true, count: chapters.length, chapters },
      event: {
        kind: "read",
        path: "正文",
        label: `已读取章节目录（${chapters.length} 章）`,
      },
    }
  }

  if (toolName === "read_chapters") {
    const requestedPaths = Array.isArray(args.paths)
      ? [...new Set(args.paths.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 12)
      : []
    if (!requestedPaths.length) throw new Error("请至少提供一个章节路径")

    const files = []
    let totalCharacters = 0
    for (const requestedPath of requestedPaths) {
      const { targetPath, relativePath } = resolveAiProjectFile(
        toolContext.projectPath,
        requestedPath,
      )
      const stagedChange = toolContext.pendingChanges.get(relativePath)
      let content
      if (stagedChange) {
        content = stagedChange.afterContent
      } else {
        const realTargetPath = await fs.promises.realpath(targetPath)
        if (!isPathContained(realProjectPath, realTargetPath)) {
          throw new Error(`章节符号链接指向小说目录之外：${relativePath}`)
        }
        content = await readAiTextFile(realTargetPath)
      }
      const remainingCharacters = Math.max(0, 240_000 - totalCharacters)
      if (!remainingCharacters) break
      const includedContent = content.slice(0, Math.min(60_000, remainingCharacters))
      totalCharacters += includedContent.length
      files.push({
        path: relativePath,
        content: includedContent,
        truncated: includedContent.length < content.length,
      })
    }
    return {
      result: {
        ok: true,
        count: files.length,
        totalCharacters,
        files,
      },
      event: {
        kind: "read",
        path: files.length === 1 ? files[0].path : `正文（${files.length} 章）`,
        label: `已批量读取 ${files.length} 个章节`,
      },
    }
  }

  const { targetPath, relativePath } = resolveAiProjectFile(toolContext.projectPath, args.path)

  if (toolName === "read_file") {
    const stagedChange = toolContext.pendingChanges.get(relativePath)
    let content
    if (stagedChange) {
      content = stagedChange.afterContent
    } else {
      const realTargetPath = await fs.promises.realpath(targetPath)
      if (!isPathContained(realProjectPath, realTargetPath)) throw new Error("文件符号链接指向小说目录之外")
      content = await readAiTextFile(realTargetPath)
    }
    return {
      result: { ok: true, path: relativePath, content: content.slice(0, 120_000) },
      event: { kind: "read", path: relativePath, label: "已读取文件" },
    }
  }

  if (toolName === "preview_file_diff") {
    const stagedChange = toolContext.pendingChanges.get(relativePath)
    let beforeContent
    if (stagedChange) {
      beforeContent = stagedChange.afterContent
    } else {
      const realTargetPath = await fs.promises.realpath(targetPath)
      if (!isPathContained(realProjectPath, realTargetPath)) throw new Error("文件符号链接指向小说目录之外")
      beforeContent = await readAiTextFile(realTargetPath)
    }
    const afterContent = String(args.new_content || "")
    if (afterContent.length > 500_000) throw new Error("拟写入内容超过 500,000 字符")
    const diff = createTextDiff(relativePath, beforeContent, afterContent)
    toolContext.previewedPaths.add(relativePath)
    return {
      result: { ok: true, path: relativePath, diff },
      event: { kind: "diff", path: relativePath, label: "已生成差异", diff },
    }
  }

  if (!toolContext.allowWriteTools) {
    throw new Error("当前正文存在未保存修改，请先保存后再让 AI 修改文件")
  }

  if (toolName === "create_file") {
    const content = String(args.content || "")
    if (content.length > 500_000) throw new Error("新文件内容超过 500,000 字符")
    if (toolContext.pendingChanges.has(relativePath)) throw new Error("同名文件已经在待确认修改中")
    await assertAiTargetParentInsideProject(realProjectPath, targetPath)
    try {
      await fs.promises.lstat(targetPath)
      throw new Error("同名文件已经存在，未执行覆盖")
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
    const diff = createTextDiff(relativePath, "", content)
    toolContext.pendingChanges.set(relativePath, {
      kind: "created",
      path: relativePath,
      beforeContent: "",
      afterContent: content,
    })
    return {
      result: {
        ok: true,
        staged: true,
        requires_confirmation: true,
        path: relativePath,
        diff,
      },
      event: { kind: "created", path: relativePath, label: "等待确认创建", diff },
    }
  }

  if (toolName === "modify_file" || toolName === "stage_file_edit") {
    if (toolName === "modify_file" && !toolContext.previewedPaths.has(relativePath)) {
      throw new Error("修改文件前必须先调用 preview_file_diff 生成差异")
    }
    const oldText = String(args.old_text || "")
    const newText = String(args.new_text || "")
    const existingChange = toolContext.pendingChanges.get(relativePath)
    let beforeContent
    if (existingChange) {
      beforeContent = existingChange.afterContent
    } else {
      const realTargetPath = await fs.promises.realpath(targetPath)
      if (!isPathContained(realProjectPath, realTargetPath)) throw new Error("文件符号链接指向小说目录之外")
      beforeContent = await readAiTextFile(realTargetPath)
    }
    if (!oldText && beforeContent.length > 0) {
      throw new Error("只有 0 字节空文件允许 old_text 为空；非空文件必须提供需要替换的精确原文")
    }
    if (oldText && !beforeContent.includes(oldText)) {
      throw new Error("文件中找不到需要替换的精确原文")
    }
    const afterContent = oldText
      ? args.replace_all === true
        ? beforeContent.split(oldText).join(newText)
        : beforeContent.replace(oldText, newText)
      : newText
    const originalContent = existingChange?.beforeContent ?? beforeContent
    const changeKind = existingChange?.kind ?? "modified"
    const diff = createTextDiff(relativePath, originalContent, afterContent)
    toolContext.pendingChanges.set(relativePath, {
      kind: changeKind,
      path: relativePath,
      beforeContent: originalContent,
      afterContent,
    })
    return {
      result: {
        ok: true,
        staged: true,
        requires_confirmation: true,
        path: relativePath,
        diff,
      },
      event: {
        kind: changeKind,
        path: relativePath,
        label: changeKind === "created" ? "等待确认创建" : "等待确认修改",
        diff,
      },
    }
  }

  throw new Error(`不支持的工具：${toolName}`)
}

function streamContentText(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => (
      typeof part === "string"
        ? part
        : typeof part?.text === "string"
          ? part.text
          : ""
    ))
    .join("")
}

async function readAiCompletionResponse(response, onProgress) {
  if (!response.ok) {
    const rawText = await response.text()
    let data = null
    try {
      data = rawText ? JSON.parse(rawText) : null
    } catch {
      data = null
    }
    const error = new Error(String(data?.error?.message || `AI 请求失败：HTTP ${response.status}`))
    error.httpStatus = response.status
    throw error
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase()
  if (!contentType.includes("text/event-stream")) {
    const rawText = await response.text()
    let data = null
    try {
      data = rawText ? JSON.parse(rawText) : null
    } catch {
      data = null
    }
    const message = data?.choices?.[0]?.message
    const content = streamContentText(message?.content)
    if (content) onProgress({ type: "content-delta", delta: content })
    return {
      content,
      tool_calls: Array.isArray(message?.tool_calls) ? message.tool_calls : [],
    }
  }

  if (!response.body) throw new Error("AI 流式响应为空")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolCalls = []
  let buffer = ""
  let content = ""

  function processSseLine(line) {
    const trimmedLine = line.trim()
    if (!trimmedLine.startsWith("data:")) return false
    const payload = trimmedLine.slice(5).trim()
    if (!payload || payload === "[DONE]") return payload === "[DONE]"
    let data = null
    try {
      data = JSON.parse(payload)
    } catch {
      return false
    }
    if (data?.error) throw new Error(String(data.error.message || "AI 流式请求失败"))
    const delta = data?.choices?.[0]?.delta
    if (!delta) return false
    const textDelta = streamContentText(delta.content)
    if (textDelta) {
      content += textDelta
      onProgress({ type: "content-delta", delta: textDelta })
    } else if (delta.reasoning_content) {
      onProgress({ type: "status", label: "正在深度思考…" })
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const fragment of delta.tool_calls) {
        const index = Number.isInteger(fragment?.index) ? fragment.index : 0
        if (!toolCalls[index]) {
          toolCalls[index] = {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          }
        }
        if (fragment.id) toolCalls[index].id = fragment.id
        if (fragment.type) toolCalls[index].type = fragment.type
        if (fragment.function?.name) {
          toolCalls[index].function.name += fragment.function.name
        }
        if (fragment.function?.arguments) {
          toolCalls[index].function.arguments += fragment.function.arguments
        }
      }
    }
    return false
  }

  let isDone = false
  while (!isDone) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ""
    for (const line of lines) {
      if (processSseLine(line)) {
        isDone = true
        break
      }
    }
  }
  buffer += decoder.decode()
  if (buffer.trim() && !isDone) processSseLine(buffer)

  return {
    content,
    tool_calls: toolCalls.filter(Boolean),
  }
}

const AI_TOOL_PROGRESS_LABELS = {
  list_chapters: "正在读取章节目录…",
  read_chapters: "正在批量读取章节…",
  read_file: "正在读取作品文件…",
  create_file: "正在准备新文件…",
  stage_file_edit: "正在生成并暂存修改差异…",
  preview_file_diff: "正在生成修改差异…",
  modify_file: "正在准备文件修改…",
}

const AI_MAX_RETRIES = 5
const AI_RETRY_DELAYS_MS = [800, 1600, 3200, 5000, 8000]
const AI_RETRYABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const AI_CHAT_HISTORY_LIMIT = 100
const AI_CHAT_COMPACT_MESSAGE_THRESHOLD = 32
const AI_CHAT_COMPACT_CHARACTER_THRESHOLD = 60_000
const AI_CHAT_RECENT_MESSAGE_COUNT = 16
const AI_CHAT_TOOL_ROUND_LIMIT = 12
const AI_CHAT_SOFT_REVIEW_ROUND = 8
const AI_CHAT_DUPLICATE_TOOL_LIMIT = 3
const activeAiChatControllers = new Map()
const activeBookBreakdownControllers = new Map()

function getAiWrapUpReasoningEffort(reasoningEffort) {
  return ["high", "xhigh", "max", "ultra"].includes(reasoningEffort)
    ? "medium"
    : reasoningEffort
}

function createAiRequestCanceledError() {
  const error = new Error("AI 请求已由用户停止")
  error.name = "AiRequestCanceledError"
  error.code = "AI_REQUEST_CANCELED"
  return error
}

function throwIfAiRequestCanceled(signal) {
  if (signal?.aborted) throw createAiRequestCanceledError()
}

function stableAiToolValue(value) {
  if (Array.isArray(value)) return value.map(stableAiToolValue)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableAiToolValue(value[key])]),
  )
}

function createAiToolCallSignature(toolName, args) {
  return `${toolName}:${JSON.stringify(stableAiToolValue(args))}`
}

function isRetryableAiError(error) {
  const httpStatus = Number(error?.httpStatus)
  if (AI_RETRYABLE_HTTP_STATUS.has(httpStatus)) return true
  if (["TimeoutError", "AbortError"].includes(String(error?.name || ""))) return true

  const code = String(error?.code || error?.cause?.code || "").toUpperCase()
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(code)) {
    return true
  }

  const message = String(error?.message || error || "")
  return /fetch failed|timeout|timed out|network|socket|connection|terminated|temporarily unavailable|rate limit|overloaded/i.test(message)
}

function describeAiRetryReason(error) {
  const httpStatus = Number(error?.httpStatus)
  if (httpStatus === 429) return "服务请求过多"
  if (httpStatus >= 500) return "AI 服务暂时不可用"
  if (["TimeoutError", "AbortError"].includes(String(error?.name || ""))) return "连接超时"
  return "网络连接中断"
}

function waitForAiRetry(delayMs, signal) {
  throwIfAiRequestCanceled(signal)
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve()
    }, delayMs)
    function handleAbort() {
      clearTimeout(timer)
      reject(createAiRequestCanceledError())
    }
    signal.addEventListener("abort", handleAbort, { once: true })
  })
}

function getAiChatHistoryPath(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return path.join(path.resolve(projectPath), ".chat", "history.json")
}

function normalizeAiToolEvent(event) {
  if (!event || typeof event !== "object") return null
  const kind = String(event.kind || "")
  if (!["read", "diff", "created", "modified"].includes(kind)) return null
  const normalized = {
    kind,
    path: String(event.path || "").slice(0, 2000),
    label: String(event.label || "").slice(0, 2000),
  }
  if (typeof event.diff === "string") normalized.diff = event.diff.slice(0, 200_000)
  return normalized
}

function normalizeAiHistoryMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .slice(-AI_CHAT_HISTORY_LIMIT)
    .map((message, index) => {
      if (!message || !["user", "assistant"].includes(message.role)) return null
      const content = String(message.content || "").slice(0, 100_000)
      if (!content.trim()) return null
      const normalized = {
        id: String(message.id || `history-${Date.now()}-${index}`).slice(0, 300),
        role: message.role,
        content,
      }
      const toolEvents = Array.isArray(message.toolEvents)
        ? message.toolEvents.map(normalizeAiToolEvent).filter(Boolean).slice(0, 50)
        : []
      if (toolEvents.length) normalized.toolEvents = toolEvents
      const status = typeof message.status === "string"
        ? message.status.trim().slice(0, 100)
        : ""
      if (status) normalized.status = status
      if (message.hasError === true) normalized.hasError = true
      const changeSetId = String(message.changeSetId || "").trim()
      if (/^[a-f0-9-]{36}$/i.test(changeSetId)) normalized.changeSetId = changeSetId
      const changeStatus = String(message.changeStatus || "")
      if (["pending", "saved", "canceled", "expired"].includes(changeStatus)) {
        normalized.changeStatus = changeStatus
      }
      if (message.diagnostics && typeof message.diagnostics === "object") {
        const diagnostics = {
          elapsedMs: Math.max(0, Math.floor(Number(message.diagnostics.elapsedMs) || 0)),
          modelDurationMs: Math.max(0, Math.floor(Number(message.diagnostics.modelDurationMs) || 0)),
          toolDurationMs: Math.max(0, Math.floor(Number(message.diagnostics.toolDurationMs) || 0)),
          modelRequestCount: Math.max(0, Math.floor(Number(message.diagnostics.modelRequestCount) || 0)),
          toolCallCount: Math.max(0, Math.floor(Number(message.diagnostics.toolCallCount) || 0)),
        }
        if (diagnostics.elapsedMs > 0) normalized.diagnostics = diagnostics
      }
      return normalized
    })
    .filter(Boolean)
}

async function reconcileAiPendingMessageStates(projectPath, messages) {
  return Promise.all(messages.map(async (message) => {
    if (message.changeStatus !== "pending" || !message.changeSetId) return message
    let changeSet
    try {
      changeSet = await readAiPendingChangeSet(
        projectPath,
        message.changeSetId,
        { allowMissing: true },
      )
    } catch {
      return {
        ...message,
        changeStatus: "expired",
        status: "待确认修改已损坏，已解除阻塞",
      }
    }
    if (changeSet.status === "pending") return message
    if (changeSet.status === "saved") {
      const savedEvents = new Map(
        changeSet.toolEvents.map((event) => [event.path, event]),
      )
      return {
        ...message,
        changeStatus: "saved",
        status: `已保存 ${changeSet.changeCount} 项修改`,
        toolEvents: message.toolEvents?.map((event) => savedEvents.get(event.path) || event),
      }
    }
    if (changeSet.status === "canceled") {
      return {
        ...message,
        changeStatus: "canceled",
        status: `已取消 ${changeSet.changeCount} 项修改`,
        toolEvents: message.toolEvents?.map((event) => (
          ["created", "modified"].includes(event.kind)
            ? {
                ...event,
                label: event.kind === "created" ? "已取消创建" : "已取消修改",
              }
            : event
        )),
      }
    }
    return {
      ...message,
      changeStatus: "expired",
      status: "待确认修改已失效，已解除阻塞",
      toolEvents: message.toolEvents?.map((event) => (
        ["created", "modified"].includes(event.kind)
          ? { ...event, label: "修改记录已失效" }
          : event
      )),
    }
  }))
}

async function getAiChatHistory(projectPath) {
  const historyPath = getAiChatHistoryPath(projectPath)
  try {
    const rawText = await fs.promises.readFile(historyPath, "utf8")
    const data = JSON.parse(rawText)
    const messages = await reconcileAiPendingMessageStates(
      projectPath,
      normalizeAiHistoryMessages(data?.messages),
    )
    return {
      messages,
      summary: typeof data?.summary === "string" ? data.summary.slice(0, 20_000) : "",
      compactedCount: Number.isFinite(data?.compactedCount)
        ? Math.max(0, Math.floor(data.compactedCount))
        : 0,
      updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        messages: [],
        summary: "",
        compactedCount: 0,
        updatedAt: null,
      }
    }
    throw new Error(`无法读取 AI 对话历史：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function writeAiChatHistory(projectPath, state) {
  const historyPath = getAiChatHistoryPath(projectPath)
  const normalizedState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    messages: normalizeAiHistoryMessages(state?.messages),
    summary: String(state?.summary || "").slice(0, 20_000),
    compactedCount: Number.isFinite(state?.compactedCount)
      ? Math.max(0, Math.floor(state.compactedCount))
      : 0,
  }
  await fs.promises.mkdir(path.dirname(historyPath), { recursive: true })
  await fs.promises.writeFile(historyPath, `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8")
  return {
    messages: normalizedState.messages,
    summary: normalizedState.summary,
    compactedCount: normalizedState.compactedCount,
    updatedAt: normalizedState.updatedAt,
  }
}

async function saveAiChatHistory(projectPath, messages) {
  const current = await getAiChatHistory(projectPath)
  return writeAiChatHistory(projectPath, {
    messages,
    summary: current.summary,
    compactedCount: current.compactedCount,
  })
}

async function clearAiChatHistory(projectPath) {
  return writeAiChatHistory(projectPath, {
    messages: [],
    summary: "",
    compactedCount: 0,
  })
}

async function requestAiCompletionWithRetry({
  endpoint,
  config,
  body,
  onProgress,
  signal,
}) {
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt += 1) {
    throwIfAiRequestCanceled(signal)
    try {
      const timeoutSignal = AbortSignal.timeout(300_000)
      const requestSignal = signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([signal, timeoutSignal])
        : signal || timeoutSignal
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: requestSignal,
      })
      return await readAiCompletionResponse(response, onProgress)
    } catch (error) {
      if (signal?.aborted || error?.code === "AI_REQUEST_CANCELED") {
        throw createAiRequestCanceledError()
      }
      if (!isRetryableAiError(error) || attempt >= AI_MAX_RETRIES) throw error

      const retryNumber = attempt + 1
      const delayMs = AI_RETRY_DELAYS_MS[attempt]
      onProgress({ type: "content-reset" })
      onProgress({
        type: "status",
        label: `${describeAiRetryReason(error)}，${Math.ceil(delayMs / 1000)} 秒后进行第 ${retryNumber}/${AI_MAX_RETRIES} 次重试…`,
      })
      await waitForAiRetry(delayMs, signal)
      onProgress({
        type: "status",
        label: `正在进行第 ${retryNumber}/${AI_MAX_RETRIES} 次重试…`,
      })
    }
  }

  throw new Error("AI 请求重试失败")
}

async function compactAiChatHistory(projectPath) {
  const history = await getAiChatHistory(projectPath)
  const characterCount = history.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  )
  const shouldCompact = (
    history.messages.length > AI_CHAT_COMPACT_MESSAGE_THRESHOLD
    || characterCount > AI_CHAT_COMPACT_CHARACTER_THRESHOLD
  )
  if (!shouldCompact) return { ...history, didCompact: false }

  const recentMessageCount = Math.min(
    AI_CHAT_RECENT_MESSAGE_COUNT,
    Math.max(4, Math.ceil(history.messages.length / 2)),
  )
  const olderMessages = history.messages.slice(0, -recentMessageCount)
  const recentMessages = history.messages.slice(-recentMessageCount)
  if (!olderMessages.length) return { ...history, didCompact: false }

  const config = getApiRuntimeConfig()
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  const conversationText = olderMessages
    .map((message) => `${message.role === "user" ? "用户" : "AI"}：${message.content.slice(0, 8000)}`)
    .join("\n\n")
    .slice(-140_000)
  const assistantMessage = await requestAiCompletionWithRetry({
    endpoint,
    config,
    onProgress: () => {},
    body: JSON.stringify({
      model: config.model,
      reasoning_effort: config.reasoningEffort,
      messages: [
        {
          role: "system",
          content: [
            "你负责压缩小说创作助手的历史对话。",
            "请将历史整理为可供后续 AI 继续工作的长期记忆，使用简洁中文。",
            "必须保留：用户偏好与明确要求、小说设定、人物与关系、剧情决定、已完成或未完成任务、涉及的文件及修改结果。",
            "不要编造信息，不要写寒暄，不要遗漏尚未解决的问题。",
            "使用分段短句，直接输出摘要正文。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            history.summary
              ? `此前已经压缩的长期记忆：\n${history.summary}`
              : "此前没有长期记忆。",
            `本次需要合并的历史对话：\n${conversationText}`,
          ].join("\n\n"),
        },
      ],
      max_tokens: 3000,
      stream: true,
    }),
  })
  const summary = String(assistantMessage?.content || "").trim()
  if (!summary) throw new Error("AI 没有返回有效的对话压缩摘要")

  const compacted = await writeAiChatHistory(projectPath, {
    messages: recentMessages,
    summary,
    compactedCount: history.compactedCount + olderMessages.length,
  })
  return {
    ...compacted,
    didCompact: true,
  }
}

async function requestAiChat(input, onProgress = () => {}, signal) {
  throwIfAiRequestCanceled(signal)
  if (!input || typeof input !== "object") throw new Error("AI 对话参数无效")
  const normalizedMessages = Array.isArray(input.messages)
    ? input.messages
      .filter((message) => (
        message
        && ["user", "assistant"].includes(message.role)
        && typeof message.content === "string"
        && message.content.trim()
      ))
      .slice(-AI_CHAT_RECENT_MESSAGE_COUNT)
      .map((message) => ({
        role: message.role,
        content: message.content.trim().slice(0, 20_000),
      }))
    : []
  let recentMessageBudget = 60_000
  const messages = normalizedMessages
    .slice()
    .reverse()
    .map((message) => {
      if (recentMessageBudget <= 0) return null
      const content = message.content.slice(0, recentMessageBudget)
      recentMessageBudget -= content.length
      return { ...message, content }
    })
    .filter(Boolean)
    .reverse()
  if (!messages.length || messages.at(-1).role !== "user") throw new Error("请输入要发送的内容")

  const context = input.context && typeof input.context === "object" ? input.context : {}
  const projectName = String(context.projectName || "").slice(0, 200)
  const chapterName = String(context.chapterName || "").slice(0, 200)
  const rawChapterContent = String(context.chapterContent || "")
  const chapterContent = rawChapterContent.slice(-40_000)
  const hasCompleteChapterContent = rawChapterContent.length <= 40_000
  const currentChapterPath = chapterName ? `正文/${chapterName}` : ""
  const chatSummary = String(context.chatSummary || "").slice(0, 20_000)
  const projectPath = String(context.projectPath || "")
  if (!isPathInsideLibrary(projectPath)) throw new Error("当前作品目录无效")
  const config = getApiRuntimeConfig()
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  let characterMemory = ""
  let writingRules = ""
  let referenceStyle = ""
  const [characterState, rulesState, referenceStyleState] = await Promise.all([
    getCharacterGraph(projectPath).catch(() => null),
    readWritingRules(projectPath).catch(() => null),
    getReferenceStyle(projectPath).catch(() => null),
  ])
  if (characterState) characterMemory = createCharacterMemoryPrompt(characterState.graph)
  if (rulesState) writingRules = createWritingRulesPrompt(rulesState)
  if (referenceStyleState) referenceStyle = createReferenceStylePrompt(referenceStyleState)
  const apiMessages = [
    {
      role: "system",
      content: [
        "你是作者管家中的小说创作助手，通过直接 API 和本地文件工具工作，不能执行任何命令。",
        "你可以协助续写、润色、剧情分析、人物一致性检查，并可使用工具读取、创建或修改当前小说中的文本文件。",
        "分析多个章节时，先调用 list_chapters 获取准确目录，再使用 read_chapters 一次批量读取相关章节；不要逐章反复调用 read_file。",
        "只有用户明确要求创建或修改文件时，才可调用 create_file 或 stage_file_edit。",
        "修改文件时优先调用 stage_file_edit，一次完成精确替换、差异生成和修改暂存；不要再先调用 preview_file_diff 后调用 modify_file。所有写操作仍必须由用户查看差异并点击保存后才真正写入。",
        "只有在用户明确要求仅预览、不要暂存修改时才调用 preview_file_diff；modify_file 仅用于兼容已有流程。",
        "向 0 字节空文件首次写入内容时，调用 stage_file_edit 并传 old_text=\"\"、new_text=完整内容；非空文件仍必须传入精确存在的 old_text。",
        currentChapterPath && hasCompleteChapterContent
          ? `当前章节 ${currentChapterPath} 的完整正文已附在上下文中。修改这个文件时直接使用附带正文调用 stage_file_edit，不要再调用 list_chapters、read_chapters 或 read_file 重复读取。`
          : "若当前章节正文没有完整附带，修改前应先读取目标文件。",
        "工具返回 staged=true 时，只能称为“已准备修改”或“等待用户确认”，不得声称文件已经保存。",
        "不得删除文件，不得访问当前小说目录之外的路径。",
        "回答和续写正文时直接输出清晰段落，不要把每一行写成 Markdown 引用块，不要反复使用行首符号 >。",
        "默认使用中文回答，除非用户明确要求其他语言。",
      ].join("\n"),
    },
    ...(writingRules ? [{
      role: "system",
      content: writingRules,
    }] : []),
    ...(referenceStyle ? [{
      role: "system",
      content: referenceStyle,
    }] : []),
    ...(chatSummary ? [{
      role: "system",
      content: `以下是较早 AI 对话自动压缩后的长期记忆，请在回答时延续这些信息：\n${chatSummary}`,
    }] : []),
    {
      role: "system",
      content: [
        `当前作品：${projectName || "未命名"}`,
        `当前章节：${chapterName || "未选择"}`,
        "当前章节正文：",
        chapterContent || "（暂无正文）",
      ].join("\n"),
    },
    ...(characterMemory ? [{
      role: "system",
      content: characterMemory,
    }] : []),
    ...messages,
  ]
  const toolEvents = []
  const previewedPaths = new Set()
  const pendingChanges = new Map()
  const executedToolCallSignatures = new Set()
  let duplicateToolCallCount = 0
  let didAddSoftReviewPrompt = false
  const requestStartedAt = Date.now()
  let modelRequestCount = 0
  let modelDurationMs = 0
  let toolCallCount = 0
  let toolDurationMs = 0

  async function requestTrackedCompletion(options) {
    modelRequestCount += 1
    const startedAt = Date.now()
    try {
      return await requestAiCompletionWithRetry(options)
    } finally {
      modelDurationMs += Date.now() - startedAt
    }
  }

  async function createAiChatResult(content, autoReviewed) {
    const pendingPaths = new Set(pendingChanges.keys())
    const finalToolEvents = toolEvents.filter((event) => (
      !pendingPaths.has(event.path) || event.kind === "read"
    ))
    for (const change of pendingChanges.values()) {
      finalToolEvents.push({
        kind: change.kind,
        path: change.path,
        label: change.kind === "created" ? "等待确认创建" : "等待确认修改",
        diff: createTextDiff(change.path, change.beforeContent, change.afterContent),
      })
    }
    const changeSetId = await saveAiPendingChangeSet(projectPath, pendingChanges)
    return {
      content,
      model: config.model,
      toolEvents: finalToolEvents,
      autoReviewed,
      changeSetId,
      pendingChangeCount: pendingChanges.size,
      diagnostics: {
        elapsedMs: Date.now() - requestStartedAt,
        modelDurationMs,
        toolDurationMs,
        modelRequestCount,
        toolCallCount,
      },
    }
  }

  async function finalizeWithAutomaticReview(reason) {
    throwIfAiRequestCanceled(signal)
    onProgress({
      type: "status",
      label: "工具调用已收束，正在自动审核并整理结果…",
    })
    apiMessages.push({
      role: "system",
      content: [
        "现在必须停止调用任何工具，并对本次任务进行最终审核与答复。",
        `收束原因：${reason}`,
        "请依据当前对话和已有工具结果完成以下工作：",
        "1. 核对已经读取、创建或修改的内容，不要把未完成的操作说成已完成。",
        "2. 如果证据足够，直接给出完整结论或可用的写作结果。",
        "3. 如果证据不足，保留已得到的结论，并明确列出仍缺少的章节、文件或信息。",
        "4. 任务范围过大时，给出下一步最合适的拆分建议，请用户确认后继续。",
        "不要再请求调用工具，不要只回复错误提示。",
      ].join("\n"),
    })
    const reviewedMessage = await requestTrackedCompletion({
      endpoint,
      config,
      onProgress,
      signal,
      body: JSON.stringify({
        model: config.model,
        reasoning_effort: pendingChanges.size
          ? getAiWrapUpReasoningEffort(config.reasoningEffort)
          : config.reasoningEffort,
        messages: apiMessages,
        max_tokens: 4096,
        stream: true,
      }),
    })
    const reviewedContent = reviewedMessage?.content
    if (typeof reviewedContent !== "string" || !reviewedContent.trim()) {
      throw new Error("AI 自动审核没有返回有效内容")
    }
    onProgress({ type: "status", label: "已自动审核并收束" })
    return createAiChatResult(reviewedContent.trim(), true)
  }

  for (let round = 0; round < AI_CHAT_TOOL_ROUND_LIMIT; round += 1) {
    throwIfAiRequestCanceled(signal)
    onProgress({
      type: "status",
      label: round === 0 ? "正在理解你的问题…" : "正在整理工具结果…",
    })
    const assistantMessage = await requestTrackedCompletion({
      endpoint,
      config,
      onProgress,
      signal,
      body: JSON.stringify({
        model: config.model,
        reasoning_effort: pendingChanges.size
          ? getAiWrapUpReasoningEffort(config.reasoningEffort)
          : config.reasoningEffort,
        messages: apiMessages,
        tools: AI_CHAT_TOOLS,
        tool_choice: "auto",
        parallel_tool_calls: true,
        max_tokens: 4096,
        stream: true,
      }),
    })
    throwIfAiRequestCanceled(signal)
    const toolCalls = Array.isArray(assistantMessage?.tool_calls)
      ? assistantMessage.tool_calls.slice(0, 8)
      : []
    if (!toolCalls.length) {
      const content = assistantMessage?.content
      if (typeof content !== "string" || !content.trim()) throw new Error("AI 没有返回有效内容")
      onProgress({ type: "status", label: "回复完成" })
      return createAiChatResult(content.trim(), false)
    }

    apiMessages.push({
      role: "assistant",
      content: typeof assistantMessage.content === "string" ? assistantMessage.content : "",
      tool_calls: toolCalls,
    })
    let shouldForceReviewAfterRound = false
    for (const toolCall of toolCalls) {
      throwIfAiRequestCanceled(signal)
      const toolName = String(toolCall?.function?.name || "")
      onProgress({
        type: "status",
        label: AI_TOOL_PROGRESS_LABELS[toolName] || `正在调用工具：${toolName || "未知工具"}…`,
      })
      let args = {}
      try {
        args = JSON.parse(toolCall?.function?.arguments || "{}")
      } catch {
        args = {}
      }
      if (shouldForceReviewAfterRound) {
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            skipped: true,
            reason: "本轮已触发自动审核收束，剩余工具调用不再执行。",
          }),
        })
        continue
      }
      const toolCallSignature = createAiToolCallSignature(toolName, args)
      if (executedToolCallSignatures.has(toolCallSignature)) {
        duplicateToolCallCount += 1
        onProgress({
          type: "status",
          label: `已跳过重复工具调用（${duplicateToolCallCount}/${AI_CHAT_DUPLICATE_TOOL_LIMIT}）…`,
        })
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            skipped: true,
            reason: "相同工具和参数已经执行过，请使用已有结果，不要重复调用。",
          }),
        })
        if (duplicateToolCallCount >= AI_CHAT_DUPLICATE_TOOL_LIMIT) {
          shouldForceReviewAfterRound = true
        }
        continue
      }
      executedToolCallSignatures.add(toolCallSignature)
      try {
        toolCallCount += 1
        const toolStartedAt = Date.now()
        let execution
        try {
          execution = await executeAiFileTool(toolName, args, {
            projectPath,
            allowWriteTools: input.allowWriteTools === true,
            previewedPaths,
            pendingChanges,
          })
        } finally {
          toolDurationMs += Date.now() - toolStartedAt
        }
        toolEvents.push(execution.event)
        onProgress({ type: "tool-event", toolEvent: execution.event })
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(execution.result),
        })
        throwIfAiRequestCanceled(signal)
      } catch (toolError) {
        if (signal?.aborted || toolError?.code === "AI_REQUEST_CANCELED") {
          throw createAiRequestCanceledError()
        }
        onProgress({
          type: "status",
          label: `工具调用失败：${toolError instanceof Error ? toolError.message : String(toolError)}`,
        })
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            error: toolError instanceof Error ? toolError.message : String(toolError),
          }),
        })
      }
    }

    if (shouldForceReviewAfterRound) {
      return finalizeWithAutomaticReview("检测到多次重复工具调用")
    }

    const completedRound = round + 1
    if (
      !didAddSoftReviewPrompt
      && completedRound >= AI_CHAT_SOFT_REVIEW_ROUND
    ) {
      didAddSoftReviewPrompt = true
      const remainingRounds = AI_CHAT_TOOL_ROUND_LIMIT - completedRound
      apiMessages.push({
        role: "system",
        content: [
          `你已经使用了 ${completedRound} 轮工具调用，最多还剩 ${remainingRounds} 轮。`,
          "继续前请先自检：现有信息是否已经足以回答用户。",
          "如果足够，下一轮必须直接给出最终答复，不要再调用工具。",
          "只有明确缺少关键证据时才能继续调用工具，并且不得重复读取已有结果。",
        ].join("\n"),
      })
      onProgress({
        type: "status",
        label: `已使用 ${completedRound}/${AI_CHAT_TOOL_ROUND_LIMIT} 轮工具，正在自检是否可以收束…`,
      })
    }
  }
  return finalizeWithAutomaticReview(
    `已达到 ${AI_CHAT_TOOL_ROUND_LIMIT} 轮工具调用上限`,
  )
}

function characterGraphServicePath(projectPath) {
  const params = new URLSearchParams({
    root: getLibraryRoot(),
    project: path.resolve(projectPath),
  })
  return `/api/project/character-graph?${params}`
}

async function getCharacterGraph(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return requestService(characterGraphServicePath(projectPath))
}

function createCharacterMemoryPrompt(graph) {
  if (
    !graph
    || typeof graph !== "object"
    || !Array.isArray(graph.characters)
    || !graph.characters.length
  ) return ""

  const compactGraph = {
    generatedAt: graph.generatedAt,
    characters: graph.characters.slice(0, 60).map((character) => ({
      id: character.id,
      name: character.name,
      aliases: Array.isArray(character.aliases) ? character.aliases.slice(0, 8) : [],
      role: character.role,
      description: typeof character.description === "string"
        ? character.description.slice(0, 600)
        : "",
      personality: Array.isArray(character.personality)
        ? character.personality.slice(0, 8)
        : [],
      goals: Array.isArray(character.goals) ? character.goals.slice(0, 8) : [],
    })),
    relationships: Array.isArray(graph.relationships)
      ? graph.relationships.slice(0, 120).map((relationship) => ({
          source: relationship.source,
          target: relationship.target,
          type: relationship.type,
          description: typeof relationship.description === "string"
            ? relationship.description.slice(0, 400)
            : "",
          strength: relationship.strength,
          status: relationship.status,
        }))
      : [],
  }

  return [
    "以下是当前作品持久化的人物长期记忆。回答时应与这些人物设定和关系保持一致；若与最新正文冲突，以最新正文为准。",
    JSON.stringify(compactGraph),
  ].join("\n").slice(0, 40_000)
}

function writingRulesRoot(projectPath) {
  return path.join(path.resolve(projectPath), ".trae", "rules")
}

function writingRulesSettingsPath(projectPath) {
  return path.join(writingRulesRoot(projectPath), WRITING_RULE_SETTINGS_FILE)
}

function isManagedWritingRulePath(relativePathInput) {
  const relativePath = String(relativePathInput || "").replace(/\\/g, "/").toLowerCase()
  return relativePath.startsWith(".trae/rules/")
}

function isDiscoverableWritingRulePath(relativePathInput) {
  const relativePath = String(relativePathInput || "").replace(/\\/g, "/")
  return (
    isManagedWritingRulePath(relativePath)
    || WRITING_RULE_DISCOVERY_PATTERN.test(path.posix.basename(relativePath))
  )
}

function normalizeWritingRuleRelativePath(projectPath, relativePathInput) {
  const root = path.resolve(projectPath)
  const relativePath = String(relativePathInput || "").trim().replace(/\//g, path.sep)
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("规则文件路径无效")
  const targetPath = path.resolve(root, relativePath)
  const containedPath = path.relative(root, targetPath)
  if (!containedPath || containedPath.startsWith("..") || path.isAbsolute(containedPath)) {
    throw new Error("规则文件必须位于当前作品目录中")
  }
  if (!WRITING_RULE_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
    throw new Error("规则文件仅支持 md、markdown、mdc 或 txt")
  }
  const normalizedRelativePath = containedPath.replace(/\\/g, "/")
  if (!isDiscoverableWritingRulePath(normalizedRelativePath)) {
    throw new Error("作品目录中的规则文件名必须符合 rules-*.md")
  }
  return {
    root,
    targetPath,
    relativePath: normalizedRelativePath,
  }
}

function normalizeNewWritingRuleName(nameInput) {
  const trimmedName = String(nameInput || "").trim()
  const name = path.extname(trimmedName) ? trimmedName : `${trimmedName}.md`
  if (
    !trimmedName
    || path.basename(name) !== name
    || /[<>:"/\\|?*\u0000-\u001f]/.test(name)
    || /[. ]$/.test(name)
    || !WRITING_RULE_EXTENSIONS.has(path.extname(name).toLowerCase())
  ) {
    throw new Error("规则名称无效，请使用普通文件名")
  }
  return name
}

async function readWritingRuleSettings(projectPath) {
  const settingsPath = writingRulesSettingsPath(projectPath)
  try {
    const data = JSON.parse(await fs.promises.readFile(settingsPath, "utf8"))
    const disabledRules = Array.isArray(data?.disabledRules)
      ? [...new Set(data.disabledRules
        .map((item) => String(item || "").replace(/\\/g, "/"))
        .filter(Boolean)
        .map((item) => (
          Number(data?.version) >= 2 || isManagedWritingRulePath(item)
            ? item
            : `.trae/rules/${item}`
        )))]
      : []
    return { version: 2, disabledRules }
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 2, disabledRules: [] }
    throw new Error(`无法读取写作规则设置：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function writeWritingRuleSettings(projectPath, state) {
  const settingsPath = writingRulesSettingsPath(projectPath)
  const normalized = {
    version: 2,
    disabledRules: [...new Set(
      (Array.isArray(state?.disabledRules) ? state.disabledRules : [])
        .map((item) => String(item || "").replace(/\\/g, "/"))
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true })),
  }
  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true })
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8")
  try {
    await fs.promises.rename(temporaryPath, settingsPath)
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {})
    throw error
  }
  return normalized
}

function createWritingRulesPrompt(state) {
  if (!state || !Array.isArray(state.rules) || !state.rules.length) return ""
  const enabledRules = state.rules.filter((rule) => rule.enabled !== false)
  if (!enabledRules.length) return ""
  const sections = enabledRules.map((rule) => [
    `\n\n===== 写作规则：${rule.relativePath} =====`,
    rule.content,
  ].join("\n"))
  return [
    "以下是从当前小说目录自动识别并启用的写作规则。创作、续写、润色和修改正文时必须遵守；若规则之间冲突，优先遵守更具体、更明确且与当前任务直接相关的规则。",
    ...sections,
  ].join("\n").slice(0, MAX_WRITING_RULE_PROMPT_LENGTH)
}

async function readWritingRules(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProject = path.resolve(projectPath)
  const projectStats = await fs.promises.stat(normalizedProject)
  if (!projectStats.isDirectory()) throw new Error("作品路径不是目录")
  const realProjectPath = await fs.promises.realpath(normalizedProject)
  const ruleSettings = await readWritingRuleSettings(normalizedProject)
  const disabledRules = new Set(ruleSettings.disabledRules)

  const rulePaths = []
  async function collectRules(directoryPath, relativeDirectory = "", depth = 0) {
    if (depth > 6 || rulePaths.length >= MAX_WRITING_RULE_FILES) return
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }))
    for (const entry of entries) {
      if (rulePaths.length >= MAX_WRITING_RULE_FILES) break
      const absolutePath = path.join(directoryPath, entry.name)
      const relativePath = path.join(relativeDirectory, entry.name)
      if (entry.isDirectory()) {
        if (WRITING_RULE_IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue
        await collectRules(absolutePath, relativePath, depth + 1)
        continue
      }
      const normalizedRelativePath = relativePath.replace(/\\/g, "/")
      if (
        entry.isFile()
        && WRITING_RULE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        && isDiscoverableWritingRulePath(normalizedRelativePath)
      ) {
        rulePaths.push({
          absolutePath,
          relativePath: normalizedRelativePath,
        })
      }
    }
  }
  await collectRules(realProjectPath)

  const rules = []
  for (const rulePath of rulePaths) {
    const realRulePath = await fs.promises.realpath(rulePath.absolutePath)
    if (!isPathContained(realProjectPath, realRulePath)) {
      throw new Error(`规则文件指向当前作品之外：${rulePath.relativePath}`)
    }
    const stats = await fs.promises.stat(realRulePath)
    if (!stats.isFile() || stats.size > 512 * 1024) continue
    const content = await fs.promises.readFile(realRulePath, "utf8")
    const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)]
      .map((match) => match[1].trim())
      .filter(Boolean)
      .slice(0, 100)
    rules.push({
      name: path.basename(realRulePath),
      relativePath: rulePath.relativePath,
      path: realRulePath,
      content,
      enabled: !disabledRules.has(rulePath.relativePath),
      characterCount: content.length,
      headings,
      modifiedAt: stats.mtime.toISOString(),
    })
  }

  rules.sort((left, right) => (
    left.relativePath.localeCompare(right.relativePath, "zh-CN", { numeric: true })
  ))
  const state = {
    ok: true,
    exists: rules.length > 0,
    root: realProjectPath,
    rules,
    totalCharacters: rules.reduce((total, rule) => total + rule.characterCount, 0),
    injectedCharacters: 0,
  }
  state.injectedCharacters = createWritingRulesPrompt(state).length
  return state
}

async function createWritingRule(projectPath, input) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProject = path.resolve(projectPath)
  const name = normalizeNewWritingRuleName(input?.name)
  const relativePath = path.join(".trae", "rules", name).replace(/\\/g, "/")
  const content = String(input?.content || "")
  if (content.length > 512 * 1024) throw new Error("单个规则不能超过 512KB")
  const root = writingRulesRoot(normalizedProject)
  await fs.promises.mkdir(root, { recursive: true })
  const realProjectPath = await fs.promises.realpath(normalizedProject)
  const realRulesRoot = await fs.promises.realpath(root)
  if (!isPathContained(realProjectPath, realRulesRoot)) {
    throw new Error("Trae 规则目录指向当前作品之外")
  }
  const targetPath = path.join(realRulesRoot, name)
  try {
    await fs.promises.writeFile(targetPath, content, { encoding: "utf8", flag: "wx" })
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("同名规则已经存在")
    throw error
  }
  const settings = await readWritingRuleSettings(normalizedProject)
  if (settings.disabledRules.includes(relativePath)) {
    await writeWritingRuleSettings(normalizedProject, {
      disabledRules: settings.disabledRules.filter((item) => item !== relativePath),
    })
  }
  return {
    relativePath,
    state: await readWritingRules(normalizedProject),
  }
}

async function saveWritingRule(projectPath, relativePathInput, contentInput) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const content = String(contentInput || "")
  if (content.length > 512 * 1024) throw new Error("单个规则不能超过 512KB")
  const normalizedProject = path.resolve(projectPath)
  const { root, targetPath, relativePath } = normalizeWritingRuleRelativePath(
    normalizedProject,
    relativePathInput,
  )
  const realProjectPath = await fs.promises.realpath(root)
  const realTargetPath = await fs.promises.realpath(targetPath)
  if (!isPathContained(realProjectPath, realTargetPath)) {
    throw new Error("规则文件指向当前作品之外")
  }
  const stats = await fs.promises.stat(realTargetPath)
  if (!stats.isFile()) throw new Error("目标规则不是文件")
  await fs.promises.writeFile(realTargetPath, content, "utf8")
  return {
    relativePath,
    state: await readWritingRules(normalizedProject),
  }
}

async function setWritingRuleEnabled(projectPath, relativePathInput, enabledInput) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProject = path.resolve(projectPath)
  const { root, targetPath, relativePath } = normalizeWritingRuleRelativePath(
    normalizedProject,
    relativePathInput,
  )
  const realProjectPath = await fs.promises.realpath(root)
  const realTargetPath = await fs.promises.realpath(targetPath)
  if (!isPathContained(realProjectPath, realTargetPath)) {
    throw new Error("规则文件指向当前作品之外")
  }
  const stats = await fs.promises.stat(realTargetPath)
  if (!stats.isFile()) throw new Error("目标规则不是文件")
  const settings = await readWritingRuleSettings(normalizedProject)
  const disabledRules = new Set(settings.disabledRules)
  if (enabledInput === true) disabledRules.delete(relativePath)
  else disabledRules.add(relativePath)
  await writeWritingRuleSettings(normalizedProject, {
    disabledRules: [...disabledRules],
  })
  return {
    relativePath,
    state: await readWritingRules(normalizedProject),
  }
}

async function deleteWritingRule(projectPath, relativePathInput) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProject = path.resolve(projectPath)
  const { root, targetPath, relativePath } = normalizeWritingRuleRelativePath(
    normalizedProject,
    relativePathInput,
  )
  const realProjectPath = await fs.promises.realpath(root)
  const realTargetPath = await fs.promises.realpath(targetPath)
  if (!isPathContained(realProjectPath, realTargetPath)) {
    throw new Error("规则文件指向当前作品之外")
  }
  const stats = await fs.promises.stat(realTargetPath)
  if (!stats.isFile()) throw new Error("目标规则不是文件")
  const settings = await readWritingRuleSettings(normalizedProject)
  await fs.promises.unlink(realTargetPath)
  await writeWritingRuleSettings(normalizedProject, {
    disabledRules: settings.disabledRules.filter((item) => item !== relativePath),
  })
  return {
    relativePath,
    state: await readWritingRules(normalizedProject),
  }
}

async function readProjectManuscript(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProject = path.resolve(projectPath)
  const projectStats = await fs.promises.stat(normalizedProject)
  if (!projectStats.isDirectory()) throw new Error("作品路径不是目录")

  const manuscriptPath = path.join(normalizedProject, "正文")
  let entries = []
  try {
    entries = (await fs.promises.readdir(manuscriptPath, { withFileTypes: true }))
      .filter((entry) => (
        entry.isFile()
        && AI_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }))
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("当前作品还没有正文目录")
    throw error
  }
  if (!entries.length) throw new Error("正文目录中还没有可总结的章节")

  const realProjectPath = await fs.promises.realpath(normalizedProject)
  const chapters = []
  let characterCount = 0
  for (const entry of entries) {
    const chapterPath = path.join(manuscriptPath, entry.name)
    const realChapterPath = await fs.promises.realpath(chapterPath)
    if (!isPathContained(realProjectPath, realChapterPath)) {
      throw new Error(`章节文件指向作品目录之外：${entry.name}`)
    }
    const content = await fs.promises.readFile(realChapterPath, "utf8")
    characterCount += content.replace(/\s/g, "").length
    chapters.push({
      name: entry.name,
      content,
    })
  }

  return {
    projectPath: normalizedProject,
    projectName: path.basename(normalizedProject),
    chapterCount: chapters.length,
    characterCount,
    content: chapters.map((chapter) => (
      `\n\n===== ${chapter.name} =====\n${chapter.content}`
    )).join(""),
  }
}

function safeGraphText(value, fallback = "", maxLength = 4_000) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback
}

function safeGraphStringList(value, maxItems = 20) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map((item) => safeGraphText(item, "", 200))
    .filter(Boolean))]
    .slice(0, maxItems)
}

function normalizeCharacterGraph(rawGraph, manuscript) {
  if (!rawGraph || typeof rawGraph !== "object") throw new Error("AI 返回的角色 JSON 无效")
  const rawCharacters = Array.isArray(rawGraph.characters) ? rawGraph.characters : []
  if (!rawCharacters.length) throw new Error("AI 返回的角色 JSON 中没有人物")

  const usedCharacterIds = new Set()
  const referenceMap = new Map()
  const characters = rawCharacters.slice(0, 120).map((rawCharacter, index) => {
    const character = rawCharacter && typeof rawCharacter === "object" ? rawCharacter : {}
    const name = safeGraphText(character.name, `未命名人物${index + 1}`, 100)
    const requestedId = safeGraphText(character.id, "", 100)
      .replace(/[^\w\u3400-\u9fff-]/g, "_")
      .replace(/^_+|_+$/g, "")
    const baseId = requestedId || `character_${index + 1}`
    let id = baseId
    let suffix = 2
    while (usedCharacterIds.has(id)) {
      id = `${baseId}_${suffix}`
      suffix += 1
    }
    usedCharacterIds.add(id)

    const aliases = safeGraphStringList(character.aliases, 12)
    referenceMap.set(id, id)
    referenceMap.set(name, id)
    if (requestedId) referenceMap.set(requestedId, id)
    aliases.forEach((alias) => referenceMap.set(alias, id))

    return {
      id,
      name,
      aliases,
      role: safeGraphText(character.role, "配角", 80),
      description: safeGraphText(character.description, "正文中暂无更多描述"),
      personality: safeGraphStringList(character.personality, 12),
      goals: safeGraphStringList(character.goals, 12),
      firstAppearance: safeGraphText(character.firstAppearance, "未明确", 160),
    }
  })

  const usedRelationshipIds = new Set()
  const rawRelationships = Array.isArray(rawGraph.relationships) ? rawGraph.relationships : []
  const relationships = rawRelationships.slice(0, 400).flatMap((rawRelationship, index) => {
    if (!rawRelationship || typeof rawRelationship !== "object") return []
    const source = referenceMap.get(safeGraphText(rawRelationship.source, "", 100))
    const target = referenceMap.get(safeGraphText(rawRelationship.target, "", 100))
    if (!source || !target || source === target) return []
    const requestedId = safeGraphText(rawRelationship.id, "", 100)
      .replace(/[^\w\u3400-\u9fff-]/g, "_")
      .replace(/^_+|_+$/g, "")
    const baseId = requestedId || `relationship_${index + 1}`
    let id = baseId
    let suffix = 2
    while (usedRelationshipIds.has(id)) {
      id = `${baseId}_${suffix}`
      suffix += 1
    }
    usedRelationshipIds.add(id)
    const parsedStrength = Number(rawRelationship.strength)

    return [{
      id,
      source,
      target,
      type: safeGraphText(rawRelationship.type, "相关", 80),
      description: safeGraphText(rawRelationship.description, "正文中存在关联"),
      strength: Number.isFinite(parsedStrength)
        ? Math.max(1, Math.min(5, Math.round(parsedStrength)))
        : 3,
      status: safeGraphText(rawRelationship.status, "当前", 80),
    }]
  })

  return {
    version: 1,
    projectName: manuscript.projectName,
    generatedAt: new Date().toISOString(),
    source: {
      chapterCount: manuscript.chapterCount,
      characterCount: manuscript.characterCount,
    },
    characters,
    relationships,
  }
}

function parseCharacterGraphResponse(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("AI 没有返回角色数据")
  const trimmed = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  const startIndex = trimmed.indexOf("{")
  const endIndex = trimmed.lastIndexOf("}")
  if (startIndex < 0 || endIndex <= startIndex) throw new Error("AI 没有返回有效的 JSON 对象")
  try {
    return JSON.parse(trimmed.slice(startIndex, endIndex + 1))
  } catch {
    throw new Error("AI 返回的角色 JSON 无法解析，请重新总结")
  }
}

function referenceStylePath(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return path.join(path.resolve(projectPath), ".chat", "reference-style.json")
}

function emptyReferenceStyleState(projectPath) {
  return {
    exists: false,
    path: referenceStylePath(projectPath),
    sourcePath: "",
    sourceName: "",
    fileCount: 0,
    totalBytes: 0,
    sampledFiles: [],
    sampledCharacters: 0,
    generatedAt: null,
    model: "",
    profile: null,
  }
}

function normalizeReferenceStyleProfile(rawProfile) {
  if (!rawProfile || typeof rawProfile !== "object") {
    throw new Error("AI 返回的文风总结无效")
  }
  return {
    overview: safeGraphText(rawProfile.overview, "暂无整体文风总结", 2000),
    narrative: safeGraphText(rawProfile.narrative, "未明确", 2000),
    viewpoint: safeGraphText(rawProfile.viewpoint, "未明确", 1200),
    pacing: safeGraphText(rawProfile.pacing, "未明确", 2000),
    sentence: safeGraphText(rawProfile.sentence, "未明确", 2000),
    dialogue: safeGraphText(rawProfile.dialogue, "未明确", 2000),
    description: safeGraphText(rawProfile.description, "未明确", 2000),
    emotion: safeGraphText(rawProfile.emotion, "未明确", 2000),
    vocabulary: safeGraphText(rawProfile.vocabulary, "未明确", 1600),
    chapterStructure: safeGraphText(rawProfile.chapterStructure, "未明确", 2000),
    techniques: safeGraphStringList(rawProfile.techniques, 16),
    avoid: safeGraphStringList(rawProfile.avoid, 16),
    writingPrompt: safeGraphText(rawProfile.writingPrompt, "", 6000),
  }
}

async function getReferenceStyle(projectPath) {
  const statePath = referenceStylePath(projectPath)
  try {
    const rawText = await fs.promises.readFile(statePath, "utf8")
    const data = JSON.parse(rawText)
    return {
      exists: true,
      path: statePath,
      sourcePath: typeof data?.sourcePath === "string" ? data.sourcePath : "",
      sourceName: typeof data?.sourceName === "string" ? data.sourceName : "",
      fileCount: Number.isFinite(data?.fileCount) ? Math.max(0, Math.floor(data.fileCount)) : 0,
      totalBytes: Number.isFinite(data?.totalBytes) ? Math.max(0, data.totalBytes) : 0,
      sampledFiles: Array.isArray(data?.sampledFiles)
        ? data.sampledFiles.map((item) => String(item || "")).filter(Boolean).slice(0, 100)
        : [],
      sampledCharacters: Number.isFinite(data?.sampledCharacters)
        ? Math.max(0, Math.floor(data.sampledCharacters))
        : 0,
      generatedAt: typeof data?.generatedAt === "string" ? data.generatedAt : null,
      model: typeof data?.model === "string" ? data.model : "",
      profile: data?.profile ? normalizeReferenceStyleProfile(data.profile) : null,
    }
  } catch (error) {
    if (error?.code === "ENOENT") return emptyReferenceStyleState(projectPath)
    throw new Error(`无法读取参考文风设置：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function writeReferenceStyle(projectPath, state) {
  const statePath = referenceStylePath(projectPath)
  const normalized = {
    version: 1,
    sourcePath: String(state?.sourcePath || ""),
    sourceName: String(state?.sourceName || ""),
    fileCount: Number.isFinite(state?.fileCount) ? Math.max(0, Math.floor(state.fileCount)) : 0,
    totalBytes: Number.isFinite(state?.totalBytes) ? Math.max(0, state.totalBytes) : 0,
    sampledFiles: Array.isArray(state?.sampledFiles)
      ? state.sampledFiles.map((item) => String(item || "")).filter(Boolean).slice(0, 100)
      : [],
    sampledCharacters: Number.isFinite(state?.sampledCharacters)
      ? Math.max(0, Math.floor(state.sampledCharacters))
      : 0,
    generatedAt: typeof state?.generatedAt === "string" ? state.generatedAt : null,
    model: String(state?.model || ""),
    profile: state?.profile ? normalizeReferenceStyleProfile(state.profile) : null,
  }
  await fs.promises.mkdir(path.dirname(statePath), { recursive: true })
  await fs.promises.writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8")
  return {
    exists: true,
    path: statePath,
    ...normalized,
  }
}

async function scanReferenceTextFiles(rootPath) {
  const normalizedRoot = path.resolve(rootPath)
  const rootStats = await fs.promises.stat(normalizedRoot)
  if (!rootStats.isDirectory()) throw new Error("参考小说路径不是目录")
  const files = []
  const ignoredDirectories = new Set([".git", ".chat", "node_modules", "$recycle.bin"])

  async function walk(currentPath, depth) {
    if (depth > 12 || files.length >= 2000) return
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(
      right.name,
      "zh-CN",
      { numeric: true, sensitivity: "base" },
    ))
    for (const entry of entries) {
      if (files.length >= 2000) break
      if (entry.isSymbolicLink()) continue
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name.toLowerCase())) {
          await walk(entryPath, depth + 1)
        }
        continue
      }
      if (!entry.isFile() || !AI_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue
      }
      const stats = await fs.promises.stat(entryPath)
      if (stats.size <= 0 || stats.size > 5 * 1024 * 1024) continue
      files.push({
        path: entryPath,
        relativePath: path.relative(normalizedRoot, entryPath).replace(/\\/g, "/"),
        size: stats.size,
      })
    }
  }

  await walk(normalizedRoot, 0)
  return {
    root: normalizedRoot,
    files,
    totalBytes: files.reduce((total, file) => total + file.size, 0),
  }
}

function selectReferenceSamples(files, maximum = 24) {
  if (files.length <= maximum) return files
  const selected = []
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round((index * (files.length - 1)) / (maximum - 1))
    selected.push(files[sourceIndex])
  }
  return [...new Map(selected.map((file) => [file.path, file])).values()]
}

function decodeReferenceText(buffer) {
  const utf8Text = new TextDecoder("utf-8").decode(buffer)
  const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length
  if (replacementCount <= Math.max(2, utf8Text.length * 0.002)) return utf8Text
  try {
    return new TextDecoder("gb18030").decode(buffer)
  } catch {
    return utf8Text
  }
}

async function readReferenceSample(file) {
  const buffer = await fs.promises.readFile(file.path)
  const content = decodeReferenceText(buffer).replace(/\u0000/g, "").trim()
  if (content.length <= 11_000) return content
  const segmentLength = 3600
  const middleStart = Math.max(0, Math.floor(content.length / 2) - Math.floor(segmentLength / 2))
  return [
    content.slice(0, segmentLength),
    content.slice(middleStart, middleStart + segmentLength),
    content.slice(-segmentLength),
  ].join("\n\n（中间取样）\n\n")
}

function parseReferenceStyleResponse(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("AI 没有返回文风总结")
  const trimmed = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  const startIndex = trimmed.indexOf("{")
  const endIndex = trimmed.lastIndexOf("}")
  if (startIndex < 0 || endIndex <= startIndex) throw new Error("AI 没有返回有效的文风 JSON")
  try {
    return JSON.parse(trimmed.slice(startIndex, endIndex + 1))
  } catch {
    throw new Error("AI 返回的文风 JSON 无法解析，请重新总结")
  }
}

async function chooseReferenceDirectory(projectPath) {
  const current = await getReferenceStyle(projectPath)
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择参考小说目录",
    defaultPath: current.sourcePath || getLibraryRoot(),
    properties: ["openDirectory"],
    buttonLabel: "使用此目录",
  })
  if (result.canceled || !result.filePaths[0]) return current
  const scan = await scanReferenceTextFiles(result.filePaths[0])
  return writeReferenceStyle(projectPath, {
    sourcePath: scan.root,
    sourceName: path.basename(scan.root),
    fileCount: scan.files.length,
    totalBytes: scan.totalBytes,
    sampledFiles: [],
    sampledCharacters: 0,
    generatedAt: null,
    model: "",
    profile: null,
  })
}

async function requestReferenceStyleSummary(projectPath) {
  const current = await getReferenceStyle(projectPath)
  if (!current.sourcePath) throw new Error("请先选择参考小说目录")
  const scan = await scanReferenceTextFiles(current.sourcePath)
  if (!scan.files.length) throw new Error("参考目录中没有可读取的 txt、md 或 markdown 文件")
  const selectedFiles = selectReferenceSamples(scan.files)
  const samples = []
  let sampledCharacters = 0
  for (const file of selectedFiles) {
    if (sampledCharacters >= 180_000) break
    const content = await readReferenceSample(file)
    const remaining = Math.max(0, 180_000 - sampledCharacters)
    const included = content.slice(0, remaining)
    if (!included.trim()) continue
    sampledCharacters += included.length
    samples.push({
      relativePath: file.relativePath,
      content: included,
    })
  }
  if (!samples.length) throw new Error("参考小说文件没有可用于分析的正文内容")

  const config = getApiRuntimeConfig()
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  const assistantMessage = await requestAiCompletionWithRetry({
    endpoint,
    config,
    onProgress: () => {},
    body: JSON.stringify({
      model: config.model,
      reasoning_effort: config.reasoningEffort,
      messages: [
        {
          role: "system",
          content: [
            "你是小说文风分析器。根据参考文本提炼可复用的高层写作规律。",
            "只总结叙事、节奏、句式、视角、对话、描写、情绪和章节结构，不复制原文句子，不模仿专有角色、地名或剧情。",
            "必须只返回一个 JSON 对象，不要使用 Markdown，不要解释。",
            "writingPrompt 要写成可直接提供给小说写作 AI 的中文文风指令，具体但不得要求复刻原句。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "请按以下结构返回：",
            JSON.stringify({
              overview: "整体文风概述",
              narrative: "叙事方式和信息释放习惯",
              viewpoint: "人称与视角控制",
              pacing: "节奏、冲突和悬念规律",
              sentence: "句式长短、段落与语言密度",
              dialogue: "对话比例、潜台词和人物区分方式",
              description: "环境、动作、心理和感官描写偏好",
              emotion: "情绪强度与递进方式",
              vocabulary: "用词、语气与修辞倾向",
              chapterStructure: "章节开头、中段、结尾的组织方式",
              techniques: ["可借鉴技巧"],
              avoid: ["使用这套文风时应避免的问题"],
              writingPrompt: "供写作 AI 直接执行的完整文风指令",
            }, null, 2),
            "以下是从参考目录均匀抽取的文本样本：",
            samples.map((sample) => (
              `\n--- 文件：${sample.relativePath} ---\n${sample.content}`
            )).join("\n"),
          ].join("\n"),
        },
      ],
      max_tokens: 6000,
      stream: true,
    }),
  })
  const profile = normalizeReferenceStyleProfile(
    parseReferenceStyleResponse(assistantMessage?.content),
  )
  return writeReferenceStyle(projectPath, {
    sourcePath: scan.root,
    sourceName: path.basename(scan.root),
    fileCount: scan.files.length,
    totalBytes: scan.totalBytes,
    sampledFiles: samples.map((sample) => sample.relativePath),
    sampledCharacters,
    generatedAt: new Date().toISOString(),
    model: config.model,
    profile,
  })
}

function createReferenceStylePrompt(state) {
  if (!state?.profile) return ""
  return [
    "当前作品启用了参考文风。请只遵循以下高层风格规律，不要复制参考小说原句、专有角色、地名或剧情：",
    state.profile.writingPrompt || JSON.stringify(state.profile, null, 2),
  ].join("\n")
}

function bookBreakdownDirectory(projectPath) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return path.join(path.resolve(projectPath), "参考小说", "拆书")
}

function bookBreakdownStatePath(projectPath) {
  return path.join(bookBreakdownDirectory(projectPath), "拆书.json")
}

function bookBreakdownSourcePath(projectPath) {
  return path.join(bookBreakdownDirectory(projectPath), "原文.txt")
}

function bookBreakdownProgressPath(projectPath) {
  return path.join(bookBreakdownDirectory(projectPath), ".拆书进度.json")
}

function emptyBookBreakdownState(projectPath) {
  return {
    exists: false,
    path: bookBreakdownStatePath(projectPath),
    directory: bookBreakdownDirectory(projectPath),
    sourcePath: "",
    sourceName: "",
    sourceBytes: 0,
    characterCount: 0,
    importedAt: null,
    generatedAt: null,
    model: "",
    analyzedChunks: 0,
    report: null,
  }
}

function normalizeBookBreakdownReport(rawReport) {
  if (!rawReport || typeof rawReport !== "object") throw new Error("AI 返回的拆书结果无效")
  const storyPhases = (Array.isArray(rawReport.storyPhases) ? rawReport.storyPhases : [])
    .map((phase) => ({
      name: safeGraphText(phase?.name, "未命名阶段", 120),
      range: safeGraphText(phase?.range, "范围未明确", 160),
      goal: safeGraphText(phase?.goal, "未明确", 800),
      development: safeGraphText(phase?.development, "未明确", 1600),
      result: safeGraphText(phase?.result, "未明确", 800),
    }))
    .slice(0, 16)
  const beats = (Array.isArray(rawReport.beats) ? rawReport.beats : [])
    .map((beat, index) => ({
      order: Number.isFinite(Number(beat?.order))
        ? Math.max(1, Math.floor(Number(beat.order)))
        : index + 1,
      stage: safeGraphText(beat?.stage, `情节点 ${index + 1}`, 120),
      chapterRange: safeGraphText(beat?.chapterRange, "位置未明确", 160),
      event: safeGraphText(beat?.event, "事件未明确", 1600),
      function: safeGraphText(beat?.function, "作用未明确", 1200),
      conflict: safeGraphText(beat?.conflict, "冲突未明确", 1200),
      turn: safeGraphText(beat?.turn, "转折未明确", 1200),
      consequence: safeGraphText(beat?.consequence, "结果未明确", 1200),
      tension: Math.min(5, Math.max(1, Math.round(Number(beat?.tension) || 3))),
    }))
    .slice(0, 36)
    .sort((left, right) => left.order - right.order)
  if (!beats.length) throw new Error("AI 拆书结果中没有识别到有效情节点")

  return {
    overview: safeGraphText(rawReport.overview, "暂无整体概述", 3000),
    premise: safeGraphText(rawReport.premise, "核心前提未明确", 1600),
    themes: safeGraphStringList(rawReport.themes, 16),
    centralConflict: safeGraphText(rawReport.centralConflict, "核心冲突未明确", 2000),
    storyPhases,
    beats,
    characterArcs: (Array.isArray(rawReport.characterArcs) ? rawReport.characterArcs : [])
      .map((arc) => ({
        name: safeGraphText(arc?.name, "未命名人物", 100),
        role: safeGraphText(arc?.role, "人物", 100),
        start: safeGraphText(arc?.start, "未明确", 800),
        desire: safeGraphText(arc?.desire, "未明确", 800),
        obstacle: safeGraphText(arc?.obstacle, "未明确", 800),
        change: safeGraphText(arc?.change, "未明确", 1200),
        end: safeGraphText(arc?.end, "未明确", 800),
      }))
      .slice(0, 16),
    conflictEscalation: safeGraphStringList(rawReport.conflictEscalation, 24),
    setupPayoffs: (Array.isArray(rawReport.setupPayoffs) ? rawReport.setupPayoffs : [])
      .map((item) => ({
        setup: safeGraphText(item?.setup, "伏笔未明确", 800),
        payoff: safeGraphText(item?.payoff, "回收未明确", 800),
        effect: safeGraphText(item?.effect, "作用未明确", 800),
      }))
      .slice(0, 24),
    pacing: safeGraphText(rawReport.pacing, "节奏规律未明确", 2400),
    reusablePatterns: (Array.isArray(rawReport.reusablePatterns) ? rawReport.reusablePatterns : [])
      .map((pattern) => ({
        title: safeGraphText(pattern?.title, "可借鉴机制", 120),
        mechanism: safeGraphText(pattern?.mechanism, "机制未明确", 1200),
        whyItWorks: safeGraphText(pattern?.whyItWorks, "作用未明确", 1200),
        adaptationDirections: safeGraphStringList(pattern?.adaptationDirections, 8),
      }))
      .slice(0, 20),
    originalityWarnings: safeGraphStringList(rawReport.originalityWarnings, 20),
  }
}

function parseBookBreakdownJson(content, label = "拆书结果") {
  if (typeof content !== "string" || !content.trim()) throw new Error(`AI 没有返回${label}`)
  const trimmed = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  const startIndex = trimmed.indexOf("{")
  const endIndex = trimmed.lastIndexOf("}")
  if (startIndex < 0 || endIndex <= startIndex) throw new Error(`AI 没有返回有效的${label} JSON`)
  try {
    return JSON.parse(trimmed.slice(startIndex, endIndex + 1))
  } catch {
    throw new Error(`AI 返回的${label} JSON 无法解析，请重新分析`)
  }
}

async function getBookBreakdown(projectPath) {
  const statePath = bookBreakdownStatePath(projectPath)
  try {
    const data = JSON.parse(await fs.promises.readFile(statePath, "utf8"))
    return {
      exists: true,
      path: statePath,
      directory: bookBreakdownDirectory(projectPath),
      sourcePath: typeof data?.sourcePath === "string" ? data.sourcePath : "",
      sourceName: typeof data?.sourceName === "string" ? data.sourceName : "",
      sourceBytes: Number.isFinite(data?.sourceBytes) ? Math.max(0, data.sourceBytes) : 0,
      characterCount: Number.isFinite(data?.characterCount)
        ? Math.max(0, Math.floor(data.characterCount))
        : 0,
      importedAt: typeof data?.importedAt === "string" ? data.importedAt : null,
      generatedAt: typeof data?.generatedAt === "string" ? data.generatedAt : null,
      model: typeof data?.model === "string" ? data.model : "",
      analyzedChunks: Number.isFinite(data?.analyzedChunks)
        ? Math.max(0, Math.floor(data.analyzedChunks))
        : 0,
      report: data?.report ? normalizeBookBreakdownReport(data.report) : null,
    }
  } catch (error) {
    if (error?.code === "ENOENT") return emptyBookBreakdownState(projectPath)
    throw new Error(`无法读取拆书结果：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function writeBookBreakdown(projectPath, state) {
  const statePath = bookBreakdownStatePath(projectPath)
  const normalized = {
    version: 1,
    sourcePath: String(state?.sourcePath || ""),
    sourceName: String(state?.sourceName || ""),
    sourceBytes: Number.isFinite(state?.sourceBytes) ? Math.max(0, state.sourceBytes) : 0,
    characterCount: Number.isFinite(state?.characterCount)
      ? Math.max(0, Math.floor(state.characterCount))
      : 0,
    importedAt: typeof state?.importedAt === "string" ? state.importedAt : null,
    generatedAt: typeof state?.generatedAt === "string" ? state.generatedAt : null,
    model: String(state?.model || ""),
    analyzedChunks: Number.isFinite(state?.analyzedChunks)
      ? Math.max(0, Math.floor(state.analyzedChunks))
      : 0,
    report: state?.report ? normalizeBookBreakdownReport(state.report) : null,
  }
  await fs.promises.mkdir(path.dirname(statePath), { recursive: true })
  await fs.promises.writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8")
  return {
    exists: true,
    path: statePath,
    directory: bookBreakdownDirectory(projectPath),
    ...normalized,
  }
}

async function chooseBookBreakdownSource(projectPath) {
  const current = await getBookBreakdown(projectPath)
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择要拆解的本地 TXT 小说",
    defaultPath: current.sourcePath ? path.dirname(current.sourcePath) : getLibraryRoot(),
    properties: ["openFile"],
    filters: [{ name: "TXT 小说", extensions: ["txt"] }],
    buttonLabel: "导入并准备拆书",
  })
  if (result.canceled || !result.filePaths[0]) return current

  const selectedPath = path.resolve(result.filePaths[0])
  const stats = await fs.promises.stat(selectedPath)
  if (!stats.isFile() || path.extname(selectedPath).toLowerCase() !== ".txt") {
    throw new Error("请选择有效的 TXT 文件")
  }
  if (stats.size <= 0) throw new Error("选择的 TXT 文件为空")
  if (stats.size > 16 * 1024 * 1024) throw new Error("TXT 文件不能超过 16MB")
  const content = decodeReferenceText(await fs.promises.readFile(selectedPath))
    .replace(/\u0000/g, "")
    .trim()
  if (content.length < 1_000) throw new Error("TXT 正文至少需要 1,000 个字符")
  if (content.length > 3_000_000) throw new Error("TXT 正文超过 300 万字符，请先拆分后再导入")

  const directory = bookBreakdownDirectory(projectPath)
  const sourcePath = bookBreakdownSourcePath(projectPath)
  await fs.promises.mkdir(directory, { recursive: true })
  await fs.promises.writeFile(sourcePath, `${content}\n`, "utf8")
  await fs.promises.unlink(bookBreakdownProgressPath(projectPath)).catch(() => {})
  return writeBookBreakdown(projectPath, {
    sourcePath,
    sourceName: path.basename(selectedPath),
    sourceBytes: Buffer.byteLength(content, "utf8"),
    characterCount: content.length,
    importedAt: new Date().toISOString(),
    generatedAt: null,
    model: "",
    analyzedChunks: 0,
    report: null,
  })
}

function splitBookBreakdownText(content) {
  const maximumChunks = 24
  const targetSize = Math.max(60_000, Math.ceil(content.length / maximumChunks))
  const chunks = []
  let start = 0
  while (start < content.length) {
    let end = Math.min(content.length, start + targetSize)
    if (end < content.length) {
      const nextChapter = content.slice(end, Math.min(content.length, end + 8_000))
        .search(/\n\s*第[^\n]{1,24}[章节卷回][^\n]*\n/)
      if (nextChapter >= 0) {
        end += nextChapter + 1
      } else {
        const lastBreak = content.lastIndexOf("\n", end)
        if (lastBreak > start + Math.floor(targetSize * 0.75)) end = lastBreak + 1
      }
    }
    const text = content.slice(start, end).trim()
    if (text) {
      const firstLine = text.split(/\r?\n/, 1)[0].trim().slice(0, 80)
      chunks.push({
        index: chunks.length,
        start,
        end,
        label: firstLine || `文本片段 ${chunks.length + 1}`,
        text,
      })
    }
    start = end
  }
  return chunks
}

async function analyzeBookBreakdownChunk(chunk, totalChunks, config, endpoint, onProgress, signal) {
  const assistantMessage = await requestAiCompletionWithRetry({
    endpoint,
    config,
    signal,
    onProgress: (progress) => {
      if (progress?.type === "status" && progress.label) {
        onProgress({
          phase: "retrying",
          label: `第 ${chunk.index + 1}/${totalChunks} 段：${progress.label}`,
        })
      }
    },
    body: JSON.stringify({
      model: config.model,
      reasoning_effort: "medium",
      messages: [
        {
          role: "system",
          content: [
            "你是中文小说拆书编辑。请分析给定的连续正文片段在整部故事中的剧情推进作用。",
            "只概括事件、因果、冲突、转折、人物变化、伏笔和阶段结果，不评价文笔，不续写，不大段引用原文。",
            "必须只返回一个 JSON 对象，不使用 Markdown。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `这是全文第 ${chunk.index + 1}/${totalChunks} 个连续片段，字符位置约 ${chunk.start}-${chunk.end}。`,
            `片段起始标识：${chunk.label}`,
            "请返回：",
            JSON.stringify({
              range: "本段覆盖的章节或剧情位置",
              summary: "本段剧情发展摘要",
              events: [{
                stage: "情节点名称",
                event: "发生了什么",
                cause: "为什么发生",
                conflict: "主要阻力",
                turn: "局势变化",
                consequence: "导致什么后果",
                tension: 3,
              }],
              characterChanges: ["人物在本段的目标、关系或状态变化"],
              setups: ["埋下的伏笔或待解决问题"],
              payoffs: ["回收的伏笔或兑现的承诺"],
            }, null, 2),
            "正文片段：",
            chunk.text,
          ].join("\n\n"),
        },
      ],
      max_tokens: 4_000,
      stream: true,
    }),
  })
  try {
    return parseBookBreakdownJson(assistantMessage?.content, "分段摘要")
  } catch {
    return {
      range: chunk.label,
      summary: safeGraphText(assistantMessage?.content, "本段摘要解析失败", 6_000),
      events: [],
      characterChanges: [],
      setups: [],
      payoffs: [],
    }
  }
}

async function requestBookBreakdown(projectPath, onProgress = () => {}, signal) {
  const current = await getBookBreakdown(projectPath)
  if (!current.sourcePath) throw new Error("请先导入本地 TXT 小说")
  onProgress({ phase: "reading", label: "正在读取本地 TXT…" })
  const sourcePath = bookBreakdownSourcePath(projectPath)
  const content = (await fs.promises.readFile(sourcePath, "utf8")).replace(/\u0000/g, "").trim()
  if (content.length < 1_000) throw new Error("本地 TXT 正文内容不足")
  const sourceHash = createHash("sha256").update(content).digest("hex")
  const chunks = splitBookBreakdownText(content)
  if (!chunks.length) throw new Error("无法从 TXT 中读取正文")
  onProgress({
    phase: "splitting",
    label: `已将全文划分为 ${chunks.length} 个连续片段`,
    completed: 0,
    total: chunks.length,
  })

  const config = getApiRuntimeConfig()
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  const progressPath = bookBreakdownProgressPath(projectPath)
  let partials = new Array(chunks.length)
  try {
    const cached = JSON.parse(await fs.promises.readFile(progressPath, "utf8"))
    if (cached?.sourceHash === sourceHash && Array.isArray(cached.partials)) {
      partials = chunks.map((_, index) => cached.partials[index] || null)
    }
  } catch (error) {
    if (error?.code !== "ENOENT") await fs.promises.unlink(progressPath).catch(() => {})
  }
  let completed = partials.filter(Boolean).length
  if (completed) {
    onProgress({
      phase: "analyzing",
      label: `已恢复 ${completed}/${chunks.length} 段分析进度`,
      completed,
      total: chunks.length,
    })
  }

  for (let batchStart = 0; batchStart < chunks.length; batchStart += 2) {
    throwIfAiRequestCanceled(signal)
    const batch = chunks
      .slice(batchStart, batchStart + 2)
      .filter((chunk) => !partials[chunk.index])
    if (!batch.length) continue
    onProgress({
      phase: "analyzing",
      label: `AI 正在拆解第 ${batch[0].index + 1}-${batch.at(-1).index + 1} 段…`,
      completed,
      total: chunks.length,
    })
    const results = await Promise.all(batch.map((chunk) => (
      analyzeBookBreakdownChunk(chunk, chunks.length, config, endpoint, onProgress, signal)
    )))
    results.forEach((result, index) => {
      partials[batch[index].index] = result
    })
    completed = partials.filter(Boolean).length
    await fs.promises.writeFile(progressPath, `${JSON.stringify({
      version: 1,
      sourceHash,
      updatedAt: new Date().toISOString(),
      partials,
    }, null, 2)}\n`, "utf8")
    onProgress({
      phase: "analyzing",
      label: `已完成 ${completed}/${chunks.length} 段`,
      completed,
      total: chunks.length,
    })
  }

  throwIfAiRequestCanceled(signal)
  onProgress({
    phase: "synthesizing",
    label: "正在合并全文情节发展与人物弧线…",
    completed: chunks.length,
    total: chunks.length,
  })
  const finalMessage = await requestAiCompletionWithRetry({
    endpoint,
    config,
    signal,
    onProgress: (progress) => {
      if (progress?.type === "status" && progress.label) {
        onProgress({ phase: "retrying", label: progress.label })
      }
    },
    body: JSON.stringify({
      model: config.model,
      reasoning_effort: config.reasoningEffort,
      messages: [
        {
          role: "system",
          content: [
            "你是专业的中文小说拆书编辑。请根据按原文顺序排列的分段摘要，还原整部小说的故事发展结构。",
            "重点分析因果链、冲突升级、关键转折、人物弧线、伏笔回收、节奏变化和可复用的高层故事机制。",
            "可复用机制必须抽象，不得鼓励复制原作专有角色、名称、设定、原句或完全相同的事件排列。",
            "必须只返回一个 JSON 对象，不使用 Markdown。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `参考小说：${current.sourceName}`,
            `全文约 ${content.length} 字，共 ${chunks.length} 个分析片段。`,
            "请严格按以下结构返回：",
            JSON.stringify({
              overview: "全书故事发展概述",
              premise: "一句话核心故事前提",
              themes: ["主题"],
              centralConflict: "贯穿全书的核心冲突及其演变",
              storyPhases: [{
                name: "故事阶段名称",
                range: "章节或剧情范围",
                goal: "该阶段主角目标",
                development: "主要发展",
                result: "阶段结果及如何进入下一阶段",
              }],
              beats: [{
                order: 1,
                stage: "关键情节点",
                chapterRange: "章节或剧情位置",
                event: "发生的关键事件",
                function: "该事件在结构中的作用",
                conflict: "主要冲突",
                turn: "转折",
                consequence: "后续影响",
                tension: 3,
              }],
              characterArcs: [{
                name: "人物",
                role: "故事作用",
                start: "初始状态",
                desire: "核心欲望",
                obstacle: "主要阻力",
                change: "变化过程",
                end: "最终状态",
              }],
              conflictEscalation: ["冲突如何逐级升级"],
              setupPayoffs: [{
                setup: "伏笔或承诺",
                payoff: "如何回收",
                effect: "产生的剧情效果",
              }],
              pacing: "全书节奏、高潮密度和张弛规律",
              reusablePatterns: [{
                title: "可借鉴的高层机制",
                mechanism: "抽象运作方式",
                whyItWorks: "为什么有效",
                adaptationDirections: ["更换题材、人物关系或矛盾后的原创变体方向"],
              }],
              originalityWarnings: ["借鉴时不能照搬的专有元素或高相似风险"],
            }, null, 2),
            "按顺序排列的分段分析：",
            JSON.stringify(partials),
          ].join("\n\n"),
        },
      ],
      max_tokens: 10_000,
      stream: true,
    }),
  })
  const report = normalizeBookBreakdownReport(
    parseBookBreakdownJson(finalMessage?.content),
  )
  throwIfAiRequestCanceled(signal)
  onProgress({ phase: "saving", label: "正在保存拆书 JSON…" })
  const nextState = await writeBookBreakdown(projectPath, {
    ...current,
    sourcePath,
    sourceBytes: Buffer.byteLength(content, "utf8"),
    characterCount: content.length,
    generatedAt: new Date().toISOString(),
    model: config.model,
    analyzedChunks: chunks.length,
    report,
  })
  await fs.promises.unlink(progressPath).catch(() => {})
  onProgress({ phase: "complete", label: "拆书完成" })
  return nextState
}

const STYLE_COMPARISON_DIMENSIONS = [
  { key: "viewpoint", title: "叙事视角" },
  { key: "pacing", title: "节奏推进" },
  { key: "sentence", title: "句式与段落" },
  { key: "dialogue", title: "对白表现" },
  { key: "description", title: "描写质感" },
  { key: "emotion", title: "情绪感染" },
  { key: "vocabulary", title: "词汇与修辞" },
  { key: "structure", title: "篇章结构" },
  { key: "readability", title: "阅读流畅度" },
  { key: "genreFit", title: "类型适配度" },
]

function sampleStyleComparisonText(content, maximumCharacters = 60_000) {
  const normalized = String(content || "").replace(/\u0000/g, "").trim()
  if (normalized.length <= maximumCharacters) return normalized
  const segmentLength = Math.floor(maximumCharacters / 3)
  const middleStart = Math.max(
    0,
    Math.floor(normalized.length / 2) - Math.floor(segmentLength / 2),
  )
  return [
    normalized.slice(0, segmentLength),
    normalized.slice(middleStart, middleStart + segmentLength),
    normalized.slice(-segmentLength),
  ].join("\n\n（文章中段取样）\n\n")
}

async function readStyleComparisonArticle(filePath) {
  const normalizedPath = path.resolve(String(filePath || ""))
  const extension = path.extname(normalizedPath).toLowerCase()
  if (!AI_FILE_EXTENSIONS.has(extension)) {
    throw new Error("文风对比仅支持 txt、md 或 markdown 文件")
  }
  const stats = await fs.promises.lstat(normalizedPath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("选择的文章不是可读取的普通文件")
  if (stats.size <= 0) throw new Error(`“${path.basename(normalizedPath)}”没有可分析的内容`)
  if (stats.size > 10 * 1024 * 1024) throw new Error("单篇文章不能超过 10MB")

  const buffer = await fs.promises.readFile(normalizedPath)
  const content = decodeReferenceText(buffer).replace(/\u0000/g, "").trim()
  if (!content) throw new Error(`“${path.basename(normalizedPath)}”没有可分析的正文`)
  const sample = sampleStyleComparisonText(content)
  return {
    name: path.basename(normalizedPath),
    path: normalizedPath,
    characterCount: content.replace(/\s/g, "").length,
    sampledCharacters: sample.length,
    preview: content.slice(0, 220).replace(/\s+/g, " "),
    sample,
  }
}

function readStyleComparisonInput(contentInput, nameInput, fallbackName) {
  const content = String(contentInput || "").replace(/\u0000/g, "").trim()
  if (!content) throw new Error(`请粘贴${fallbackName}的正文内容`)
  if (content.length > 500_000) throw new Error(`${fallbackName}输入内容不能超过 50 万字符`)
  const characterCount = content.replace(/\s/g, "").length
  if (characterCount < 100) throw new Error(`${fallbackName}至少需要 100 个正文字符`)
  const sample = sampleStyleComparisonText(content)
  const name = String(nameInput || "").trim().slice(0, 120) || fallbackName
  return {
    name,
    path: "",
    characterCount,
    sampledCharacters: sample.length,
    preview: content.slice(0, 220).replace(/\s+/g, " "),
    sample,
  }
}

async function chooseStyleComparisonArticle(defaultPath) {
  const normalizedDefault = typeof defaultPath === "string" && defaultPath
    ? path.resolve(defaultPath)
    : getLibraryRoot()
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择需要评审的文章",
    defaultPath: normalizedDefault,
    properties: ["openFile"],
    filters: [
      { name: "文章文件", extensions: ["txt", "md", "markdown"] },
      { name: "所有文件", extensions: ["*"] },
    ],
    buttonLabel: "选择文章",
  })
  if (result.canceled || !result.filePaths[0]) return null
  const article = await readStyleComparisonArticle(result.filePaths[0])
  return {
    name: article.name,
    path: article.path,
    characterCount: article.characterCount,
    sampledCharacters: article.sampledCharacters,
    preview: article.preview,
  }
}

function styleComparisonScore(value, fallback = 70) {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : fallback
}

function normalizeStyleComparisonList(value, maximum = 12) {
  return safeGraphStringList(value, maximum)
}

function parseStyleComparisonResponse(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("AI 没有返回文风对比结果")
  const trimmed = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  const startIndex = trimmed.indexOf("{")
  const endIndex = trimmed.lastIndexOf("}")
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error("AI 没有返回有效的文风对比 JSON")
  }
  try {
    return JSON.parse(trimmed.slice(startIndex, endIndex + 1))
  } catch {
    throw new Error("AI 返回的文风对比 JSON 无法解析，请重新评审")
  }
}

function normalizeStyleComparisonReport(rawReport, articleA, articleB, model) {
  if (!rawReport || typeof rawReport !== "object") {
    throw new Error("AI 返回的文风对比结果无效")
  }
  const rawDimensions = Array.isArray(rawReport.dimensions) ? rawReport.dimensions : []
  const dimensionMap = new Map(rawDimensions.map((dimension) => [
    String(dimension?.key || ""),
    dimension,
  ]))
  const dimensions = STYLE_COMPARISON_DIMENSIONS.map((definition, index) => {
    const raw = dimensionMap.get(definition.key) || rawDimensions[index] || {}
    return {
      key: definition.key,
      title: definition.title,
      articleAScore: styleComparisonScore(raw.articleAScore),
      articleBScore: styleComparisonScore(raw.articleBScore),
      articleA: safeGraphText(raw.articleA, "AI 未提供具体分析", 1600),
      articleB: safeGraphText(raw.articleB, "AI 未提供具体分析", 1600),
      comparison: safeGraphText(raw.comparison, "两篇文章在该维度各有特点", 1800),
    }
  })
  const normalizeArticleReview = (value, fallbackName) => ({
    name: fallbackName,
    summary: safeGraphText(value?.summary, "暂无单篇风格概述", 2400),
    strengths: normalizeStyleComparisonList(value?.strengths),
    risks: normalizeStyleComparisonList(value?.risks),
  })

  return {
    generatedAt: new Date().toISOString(),
    model,
    similarityScore: styleComparisonScore(rawReport.similarityScore, 50),
    overview: safeGraphText(rawReport.overview, "两篇文章的文风各有侧重", 3000),
    articleA: normalizeArticleReview(rawReport.articleA, articleA.name),
    articleB: normalizeArticleReview(rawReport.articleB, articleB.name),
    dimensions,
    similarities: normalizeStyleComparisonList(rawReport.similarities),
    differences: normalizeStyleComparisonList(rawReport.differences),
    recommendations: {
      articleA: normalizeStyleComparisonList(rawReport.recommendations?.articleA),
      articleB: normalizeStyleComparisonList(rawReport.recommendations?.articleB),
      fusion: normalizeStyleComparisonList(rawReport.recommendations?.fusion),
    },
    verdict: {
      articleAUseCase: safeGraphText(
        rawReport.verdict?.articleAUseCase,
        "适合延续文章 A 当前风格的创作场景",
        1600,
      ),
      articleBUseCase: safeGraphText(
        rawReport.verdict?.articleBUseCase,
        "适合延续文章 B 当前风格的创作场景",
        1600,
      ),
      conclusion: safeGraphText(
        rawReport.verdict?.conclusion,
        "应根据作品目标选择更合适的表达方式",
        2400,
      ),
    },
    sources: {
      articleA: {
        name: articleA.name,
        path: articleA.path,
        characterCount: articleA.characterCount,
        sampledCharacters: articleA.sampledCharacters,
      },
      articleB: {
        name: articleB.name,
        path: articleB.path,
        characterCount: articleB.characterCount,
        sampledCharacters: articleB.sampledCharacters,
      },
    },
  }
}

async function requestStyleComparison(input, onProgress = () => {}) {
  const articleAPath = String(input?.articleAPath || "")
  const articleBPath = String(input?.articleBPath || "")
  const articleAContent = String(input?.articleAContent || "")
  const articleBContent = String(input?.articleBContent || "")
  if (!articleAPath && !articleAContent.trim()) throw new Error("请选择或输入文章 A")
  if (!articleBPath && !articleBContent.trim()) throw new Error("请选择或输入文章 B")
  if (
    articleAPath
    && articleBPath
    && path.resolve(articleAPath) === path.resolve(articleBPath)
  ) {
    throw new Error("请选择两篇不同的文章")
  }

  onProgress({ phase: "reading", label: "正在整理并均匀取样两篇文章…" })
  const [articleA, articleB] = await Promise.all([
    articleAContent.trim()
      ? readStyleComparisonInput(articleAContent, input?.articleAName, "文章 A")
      : readStyleComparisonArticle(articleAPath),
    articleBContent.trim()
      ? readStyleComparisonInput(articleBContent, input?.articleBName, "文章 B")
      : readStyleComparisonArticle(articleBPath),
  ])
  if (
    articleA.characterCount === articleB.characterCount
    && articleA.sample === articleB.sample
  ) {
    throw new Error("两边的文章内容相同，请更换或修改其中一篇")
  }
  const config = getApiRuntimeConfig()
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  onProgress({ phase: "reviewing", label: "AI 正在进行多维度文风评审…" })

  const assistantMessage = await requestAiCompletionWithRetry({
    endpoint,
    config,
    onProgress: (progress) => {
      if (progress?.type === "status" && progress.label) {
        onProgress({ phase: "retrying", label: progress.label })
      }
    },
    body: JSON.stringify({
      model: config.model,
      reasoning_effort: config.reasoningEffort,
      messages: [
        {
          role: "system",
          content: [
            "你是严谨的中文小说文风评审编辑，需要公平比较两篇文章。",
            "只依据提供的文本评价，不猜测作者身份、平台数据或未提供的背景。",
            "从叙事视角、节奏推进、句式与段落、对白表现、描写质感、情绪感染、词汇与修辞、篇章结构、阅读流畅度、类型适配度十个维度分析。",
            "各维度分别给两篇文章 0-100 分，评分必须有具体文本特征依据，不能只写空泛形容词。",
            "不要强行宣布唯一胜者，要说明各自更适合的创作场景，并给出可执行的修改建议。",
            "必须只返回一个 JSON 对象，不使用 Markdown，不输出原文长段落。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "请严格按下面结构返回：",
            JSON.stringify({
              similarityScore: 50,
              overview: "整体比较结论",
              articleA: {
                summary: "文章 A 的风格画像",
                strengths: ["优势"],
                risks: ["潜在问题"],
              },
              articleB: {
                summary: "文章 B 的风格画像",
                strengths: ["优势"],
                risks: ["潜在问题"],
              },
              dimensions: STYLE_COMPARISON_DIMENSIONS.map((dimension) => ({
                key: dimension.key,
                articleAScore: 80,
                articleBScore: 75,
                articleA: "文章 A 在该维度的具体表现",
                articleB: "文章 B 在该维度的具体表现",
                comparison: "关键差异及其阅读效果",
              })),
              similarities: ["显著共性"],
              differences: ["核心差异"],
              recommendations: {
                articleA: ["给文章 A 的可执行建议"],
                articleB: ["给文章 B 的可执行建议"],
                fusion: ["若融合两种文风时的建议"],
              },
              verdict: {
                articleAUseCase: "文章 A 更适合的题材、场景或目标",
                articleBUseCase: "文章 B 更适合的题材、场景或目标",
                conclusion: "不偏袒任何一方的编辑结论",
              },
            }, null, 2),
            `文章 A：${articleA.name}（原文 ${articleA.characterCount} 字，本次取样 ${articleA.sampledCharacters} 字）`,
            articleA.sample,
            `文章 B：${articleB.name}（原文 ${articleB.characterCount} 字，本次取样 ${articleB.sampledCharacters} 字）`,
            articleB.sample,
          ].join("\n\n"),
        },
      ],
      max_tokens: 9000,
      stream: true,
    }),
  })
  onProgress({ phase: "organizing", label: "正在整理评审结果…" })
  const rawReport = parseStyleComparisonResponse(assistantMessage?.content)
  const report = normalizeStyleComparisonReport(rawReport, articleA, articleB, config.model)
  onProgress({ phase: "complete", label: "文风对比完成" })
  return report
}

async function requestCharacterSummary(projectPath) {
  const manuscript = await readProjectManuscript(projectPath)
  const config = getApiRuntimeConfig()
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      reasoning_effort: config.reasoningEffort,
      messages: [
        {
          role: "system",
          content: [
            "你是小说人物设定分析器。请通读用户提供的全部正文，一次性总结重要人物和人物关系。",
            "必须只返回一个 JSON 对象，不要使用 Markdown，不要解释。",
            "characters 中合并同一人物的别名；relationships 的 source 和 target 必须引用 characters 的 id。",
            "只依据正文，不确定的信息用简短的“未明确”，不要虚构。",
            "strength 使用 1 到 5 的整数，表示正文中关系的紧密或冲突强度。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `作品：${manuscript.projectName}`,
            `章节数：${manuscript.chapterCount}`,
            "请按下面的结构返回：",
            JSON.stringify({
              characters: [{
                id: "character_1",
                name: "人物姓名",
                aliases: ["别名"],
                role: "主角/配角/反派/其他",
                description: "身份、经历和当前处境",
                personality: ["性格关键词"],
                goals: ["人物目标"],
                firstAppearance: "首次出现的章节或场景",
              }],
              relationships: [{
                id: "relationship_1",
                source: "character_1",
                target: "character_2",
                type: "亲属/盟友/敌对/师徒/情感/其他",
                description: "关系依据与变化",
                strength: 3,
                status: "当前关系状态",
              }],
            }, null, 2),
            "以下是全部正文：",
            manuscript.content,
          ].join("\n"),
        },
      ],
      max_tokens: 12_000,
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000),
  })
  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    throw new Error(String(data?.error?.message || `AI 请求失败：HTTP ${response.status}`))
  }
  const content = data?.choices?.[0]?.message?.content
  const graph = normalizeCharacterGraph(parseCharacterGraphResponse(content), manuscript)
  const savedState = await requestService("/api/project/character-graph", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      root: getLibraryRoot(),
      projectPath: manuscript.projectPath,
      graph,
    }),
  })
  return {
    ...savedState,
    model: config.model,
  }
}

function boundsAreVisible(bounds) {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  return screen.getAllDisplays().some(({ workArea }) => (
    center.x >= workArea.x
    && center.x <= workArea.x + workArea.width
    && center.y >= workArea.y
    && center.y <= workArea.y + workArea.height
  ))
}

function saveWindowState(window) {
  if (!window || window.isDestroyed()) return
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
  try {
    writeDesktopSettings({
      windowState: {
        bounds,
        maximized: window.isMaximized(),
      },
    })
  } catch (error) {
    console.error("[desktop] failed to save window state", error)
  }
}

function scheduleSaveWindowState(window) {
  clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => saveWindowState(window), 250)
}

function getWindowIconPath() {
  if (process.platform === "win32" && fs.existsSync(ICON_ICO_PATH)) return ICON_ICO_PATH
  return fs.existsSync(ICON_PNG_PATH) ? ICON_PNG_PATH : undefined
}

function createTrayImage() {
  if (!fs.existsSync(ICON_TRAY_PATH)) return nativeImage.createEmpty()
  return nativeImage.createFromPath(ICON_TRAY_PATH).resize({ width: 18, height: 18 })
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    loadRenderer(mainWindow)
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  saveWindowState(mainWindow)
  mainWindow.hide()
}

function quitApplication() {
  isQuitting = true
  app.quit()
}

function requestMainWindowClose(window = mainWindow) {
  if (!window || window.isDestroyed()) return false
  const closeBehavior = getCloseBehavior()
  if (closeBehavior === "tray") {
    hideMainWindow()
    return true
  }
  if (closeBehavior === "quit") {
    quitApplication()
    return true
  }
  if (!window.webContents.isDestroyed()) {
    window.webContents.send("window:close-requested")
  }
  return true
}

function createTray() {
  tray = new Tray(createTrayImage())
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示作者管家", click: showMainWindow },
    { label: "隐藏到后台", click: hideMainWindow },
    { type: "separator" },
    {
      label: "退出",
      click: quitApplication,
    },
  ]))
  tray.on("click", showMainWindow)
}

function windowState(window) {
  return {
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen(),
  }
}

function emitWindowState(window) {
  if (!window || window.isDestroyed()) return
  window.webContents.send("window:state-changed", windowState(window))
}

function commonWindowOptions() {
  return {
    frame: false,
    thickFrame: process.platform === "win32",
    roundedCorners: true,
    hasShadow: true,
    backgroundColor: "#f8f7f6",
    icon: getWindowIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }
}

function createMainWindow() {
  const saved = readWindowState()
  const validBounds = boundsAreVisible(saved.bounds) ? saved.bounds : {}
  const window = new BrowserWindow({
    ...commonWindowOptions(),
    ...validBounds,
    width: validBounds.width || 1280,
    height: validBounds.height || 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_NAME,
  })

  window.once("ready-to-show", () => {
    if (saved.maximized) window.maximize()
    window.show()
  })
  window.on("maximize", () => emitWindowState(window))
  window.on("unmaximize", () => emitWindowState(window))
  window.on("enter-full-screen", () => emitWindowState(window))
  window.on("leave-full-screen", () => emitWindowState(window))
  window.on("move", () => scheduleSaveWindowState(window))
  window.on("resize", () => scheduleSaveWindowState(window))
  window.on("close", (event) => {
    if (isQuitting) {
      saveWindowState(window)
      return
    }
    event.preventDefault()
    requestMainWindowClose(window)
  })
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null
  })

  secureExternalNavigation(window)
  return window
}

function createChildWindow() {
  const child = new BrowserWindow({
    ...commonWindowOptions(),
    parent: mainWindow || undefined,
    width: 560,
    height: 400,
    minWidth: 460,
    minHeight: 320,
    show: false,
    title: `${APP_NAME} · 子窗口`,
  })

  childWindows.add(child)
  child.once("ready-to-show", () => child.show())
  child.on("closed", () => childWindows.delete(child))
  secureExternalNavigation(child)
  loadRenderer(child, { child: true })
  return child
}

function secureExternalNavigation(window) {
  window.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase()
    const shouldToggleDevTools = input.type === "keyDown"
      && (key === "f12" || (input.control && input.shift && key === "i"))
    if (!shouldToggleDevTools) return
    event.preventDefault()
    window.webContents.toggleDevTools()
  })
  window.webContents.on("did-finish-load", () => {
    if (SHOULD_OPEN_DEVTOOLS && !window.webContents.isDevToolsOpened()) {
      window.webContents.openDevTools({ mode: "detach", activate: true })
    }
  })
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      console.error(
        `[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`,
      )
    },
  )
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
}

function loadRenderer(window, options = {}) {
  const query = options.child ? { window: "child" } : undefined
  if (DEV_SERVER_URL) {
    const url = new URL(DEV_SERVER_URL)
    if (options.child) url.searchParams.set("window", "child")
    return window.loadURL(url.toString())
  }
  return window.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query })
}

function startNodeService() {
  if (serviceProcess) return
  serviceProcess = spawn(process.execPath, [SERVER_PATH], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      AUTHOR_DESK_SERVICE_PORT: String(SERVICE_PORT),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  serviceProcess.stdout.on("data", (chunk) => console.log(String(chunk).trim()))
  serviceProcess.stderr.on("data", (chunk) => console.error(String(chunk).trim()))
  serviceProcess.on("exit", () => {
    serviceProcess = null
  })
}

function stopNodeService() {
  if (!serviceProcess || serviceProcess.killed) return
  serviceProcess.kill()
  serviceProcess = null
}

async function requestService(pathname, options = {}) {
  const response = await fetch(`${SERVICE_URL}${pathname}`, {
    signal: AbortSignal.timeout(2500),
    ...options,
    headers: {
      "Cache-Control": "no-store",
      ...options.headers,
    },
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || `Node service responded with ${response.status}`)
  }
  return data
}

async function getLibraryProjects() {
  const params = new URLSearchParams({ root: getLibraryRoot() })
  try {
    return await requestService(`/api/library/projects?${params}`)
  } catch (error) {
    return {
      ok: false,
      storage: "filesystem",
      root: getLibraryRoot(),
      projects: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function isPathInsideLibrary(targetPath) {
  const relativePath = path.relative(getLibraryRoot(), path.resolve(targetPath))
  return Boolean(relativePath)
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
}

function validateProjectFolderName(input) {
  const name = String(input || "").trim()
  if (!name) throw new Error("作品名称不能为空")
  if (name.length > 120) throw new Error("作品名称不能超过 120 个字符")
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(name)) {
    throw new Error("作品名称不能包含 \\ / : * ? \" < > | 等字符")
  }
  if (/[. ]$/.test(name)) throw new Error("作品名称不能以句点或空格结尾")
  const reservedBaseName = name.split(".")[0].toUpperCase()
  if (
    ["CON", "PRN", "AUX", "NUL"].includes(reservedBaseName)
    || /^COM[1-9]$/.test(reservedBaseName)
    || /^LPT[1-9]$/.test(reservedBaseName)
  ) {
    throw new Error("该名称是 Windows 系统保留名称，请更换")
  }
  return name
}

async function renameLibraryProject(projectPath, nextNameInput) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const sourcePath = path.resolve(projectPath)
  const sourceStats = await fs.promises.lstat(sourcePath)
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new Error("当前作品路径不是可重命名的文件夹")
  }

  const nextName = validateProjectFolderName(nextNameInput)
  const parentPath = path.dirname(sourcePath)
  const targetPath = path.resolve(parentPath, nextName)
  if (!isPathInsideLibrary(targetPath) || path.dirname(targetPath) !== parentPath) {
    throw new Error("重命名后的目录必须保留在当前小说库中")
  }
  if (targetPath === sourcePath) {
    return {
      ok: true,
      oldPath: sourcePath,
      newPath: sourcePath,
      library: await getLibraryProjects(),
    }
  }

  const isCaseOnlyRename = process.platform === "win32"
    && targetPath.toLocaleLowerCase() === sourcePath.toLocaleLowerCase()
  if (fs.existsSync(targetPath) && !isCaseOnlyRename) {
    throw new Error("小说库中已经存在同名作品文件夹")
  }

  if (isCaseOnlyRename) {
    const temporaryPath = path.join(
      parentPath,
      `.author-desk-rename-${process.pid}-${Date.now()}`,
    )
    if (!isPathInsideLibrary(temporaryPath) || fs.existsSync(temporaryPath)) {
      throw new Error("无法创建安全的临时重命名路径")
    }
    await fs.promises.rename(sourcePath, temporaryPath)
    try {
      await fs.promises.rename(temporaryPath, targetPath)
    } catch (error) {
      await fs.promises.rename(temporaryPath, sourcePath).catch(() => {})
      throw error
    }
  } else {
    await fs.promises.rename(sourcePath, targetPath)
  }

  const activeProjectPath = getActiveProjectPath()
  if (
    activeProjectPath
    && activeProjectPath.toLocaleLowerCase() === sourcePath.toLocaleLowerCase()
  ) {
    writeDesktopSettings({ activeProjectPath: targetPath })
  }
  return {
    ok: true,
    oldPath: sourcePath,
    newPath: targetPath,
    library: await getLibraryProjects(),
  }
}

async function chooseAndCreateLibraryProject() {
  const libraryRoot = path.resolve(getLibraryRoot())
  const rootStats = await fs.promises.stat(libraryRoot)
  if (!rootStats.isDirectory()) throw new Error("当前小说库路径不是目录，请先在设置中重新选择")

  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择新作品文件夹",
    defaultPath: libraryRoot,
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: "选择并创建作品",
    message: "请选择小说库中的一级文件夹；缺少的基础目录会自动创建。",
  })
  if (result.canceled || !result.filePaths[0]) return null

  const projectPath = path.resolve(result.filePaths[0])
  const relativePath = path.relative(libraryRoot, projectPath)
  if (
    !relativePath
    || relativePath.startsWith("..")
    || path.isAbsolute(relativePath)
    || relativePath.includes(path.sep)
  ) {
    throw new Error("请选择当前小说库根目录下的一级作品文件夹")
  }
  if (path.basename(projectPath).startsWith(".")) {
    throw new Error("作品文件夹名称不能以句点开头")
  }

  const projectStats = await fs.promises.lstat(projectPath)
  if (!projectStats.isDirectory() || projectStats.isSymbolicLink()) {
    throw new Error("选择的作品路径必须是普通文件夹")
  }

  const directoryStates = []
  for (const relativeDirectory of PROJECT_REQUIRED_DIRECTORIES) {
    const directoryPath = path.join(projectPath, relativeDirectory)
    let stats = null
    try {
      stats = await fs.promises.lstat(directoryPath)
    } catch (error) {
      if (error.code === "ENOTDIR") {
        throw new Error(`“${relativeDirectory.replace(/\\/g, "/")}”的上级路径被文件占用，无法创建目录`)
      }
      if (error.code !== "ENOENT") throw error
    }
    if (stats && (!stats.isDirectory() || stats.isSymbolicLink())) {
      throw new Error(`“${relativeDirectory.replace(/\\/g, "/")}”已存在，但不是可用的文件夹`)
    }
    directoryStates.push({
      path: directoryPath,
      relativePath: relativeDirectory.replace(/\\/g, "/"),
      exists: Boolean(stats),
    })
  }

  const createdDirectories = []
  const existingDirectories = []
  for (const directoryState of directoryStates) {
    if (directoryState.exists) {
      existingDirectories.push(directoryState.relativePath)
      continue
    }
    await fs.promises.mkdir(directoryState.path, { recursive: true })
    createdDirectories.push(directoryState.relativePath)
  }

  writeDesktopSettings({ activeProjectPath: projectPath })
  return {
    ok: true,
    projectPath,
    createdDirectories,
    existingDirectories,
    library: await getLibraryProjects(),
  }
}

function gitCommandErrorMessage(result, fallback) {
  const message = String(result?.stderr || result?.stdout || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-8)
    .join("\n")
  return message || fallback
}

function runGitCommand(projectPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["-c", "core.quotepath=false", ...args],
      {
        cwd: projectPath,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_EDITOR: "true",
          GIT_SEQUENCE_EDITOR: "true",
        },
      },
    )
    let stdout = ""
    let stderr = ""
    let didTimeout = false
    const maximumOutput = 1024 * 1024
    const timeout = setTimeout(() => {
      didTimeout = true
      child.kill()
    }, options.timeoutMs || 180_000)

    child.stdout.on("data", (chunk) => {
      if (stdout.length < maximumOutput) stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk) => {
      if (stderr.length < maximumOutput) stderr += chunk.toString("utf8")
    })
    child.on("error", (error) => {
      clearTimeout(timeout)
      if (error.code === "ENOENT") {
        reject(new Error("没有找到 Git，请先安装 Git 并重新启动作者管家"))
        return
      }
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timeout)
      const result = {
        code: Number.isInteger(code) ? code : -1,
        stdout,
        stderr,
      }
      if (didTimeout) {
        reject(new Error("Git 操作超时，请检查网络连接后重试"))
        return
      }
      if (result.code !== 0 && options.allowFailure !== true) {
        reject(new Error(gitCommandErrorMessage(result, `Git 命令执行失败：${args[0]}`)))
        return
      }
      resolve(result)
    })
  })
}

async function getGitConflictFiles(projectPath) {
  const result = await runGitCommand(
    projectPath,
    ["diff", "--name-only", "--diff-filter=U", "-z"],
    { allowFailure: true },
  )
  return result.stdout.split("\0").map((item) => item.trim()).filter(Boolean)
}

async function getGitOperationState(projectPath) {
  const gitPathResult = await runGitCommand(
    projectPath,
    ["rev-parse", "--absolute-git-dir"],
  )
  const gitDirectory = gitPathResult.stdout.trim()
  if (fs.existsSync(path.join(gitDirectory, "rebase-merge"))) return "rebase"
  if (fs.existsSync(path.join(gitDirectory, "rebase-apply"))) return "rebase"
  if (fs.existsSync(path.join(gitDirectory, "MERGE_HEAD"))) return "merge"
  return ""
}

async function gitConflictResult(projectPath, branch, operation, message) {
  return {
    ok: false,
    status: "conflict",
    branch,
    operation,
    conflictFiles: await getGitConflictFiles(projectPath),
    message,
  }
}

async function syncProjectWithGit(projectPath, onProgress = () => {}) {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProjectPath = path.resolve(projectPath)
  const stats = await fs.promises.stat(normalizedProjectPath)
  if (!stats.isDirectory()) throw new Error("当前作品路径不是文件夹")

  onProgress({ phase: "checking", label: "正在检查 Git 仓库…" })
  await runGitCommand(normalizedProjectPath, ["--version"])
  const repositoryCheck = await runGitCommand(
    normalizedProjectPath,
    ["rev-parse", "--is-inside-work-tree"],
    { allowFailure: true },
  )
  if (repositoryCheck.code !== 0 || repositoryCheck.stdout.trim() !== "true") {
    throw new Error("当前小说目录还不是 Git 仓库，请先完成 Git 初始化和远程仓库配置")
  }
  const topLevelResult = await runGitCommand(
    normalizedProjectPath,
    ["rev-parse", "--show-toplevel"],
  )
  const repositoryRoot = path.resolve(topLevelResult.stdout.trim())
  if (repositoryRoot.toLocaleLowerCase() !== normalizedProjectPath.toLocaleLowerCase()) {
    throw new Error(`当前小说位于上级 Git 仓库中，为避免同步其他文件，请在小说目录单独初始化 Git：${repositoryRoot}`)
  }

  const branchResult = await runGitCommand(
    normalizedProjectPath,
    ["branch", "--show-current"],
  )
  const branch = branchResult.stdout.trim()
  if (!branch) throw new Error("当前 Git 处于 detached HEAD 状态，请先切换到需要同步的分支")

  const existingConflicts = await getGitConflictFiles(normalizedProjectPath)
  const existingOperation = await getGitOperationState(normalizedProjectPath)
  if (existingConflicts.length || existingOperation) {
    return gitConflictResult(
      normalizedProjectPath,
      branch,
      existingOperation || "merge",
      existingConflicts.length
        ? "检测到尚未解决的 Git 冲突，请手动合并后完成当前 Git 操作"
        : `检测到尚未完成的 Git ${existingOperation}，请先手动完成或取消`,
    )
  }

  const remoteResult = await runGitCommand(normalizedProjectPath, ["remote"])
  const remotes = remoteResult.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  if (!remotes.length) throw new Error("当前 Git 仓库没有配置远程地址，请先添加远程仓库")
  const preferredRemote = remotes.includes("origin") ? "origin" : remotes[0]

  let upstreamResult = await runGitCommand(
    normalizedProjectPath,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { allowFailure: true },
  )
  let hasUpstream = upstreamResult.code === 0 && Boolean(upstreamResult.stdout.trim())
  if (!hasUpstream) {
    onProgress({ phase: "fetching", label: "正在检查云端分支…" })
    const remoteBranchResult = await runGitCommand(
      normalizedProjectPath,
      ["ls-remote", "--exit-code", "--heads", preferredRemote, `refs/heads/${branch}`],
      { allowFailure: true, timeoutMs: 120_000 },
    )
    if (remoteBranchResult.code === 0) {
      await runGitCommand(
        normalizedProjectPath,
        ["fetch", preferredRemote, branch],
        { timeoutMs: 300_000 },
      )
      await runGitCommand(
        normalizedProjectPath,
        ["branch", `--set-upstream-to=${preferredRemote}/${branch}`, branch],
      )
      upstreamResult = await runGitCommand(
        normalizedProjectPath,
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      )
      hasUpstream = true
    } else if (remoteBranchResult.code !== 2) {
      throw new Error(gitCommandErrorMessage(remoteBranchResult, "无法连接远程 Git 仓库"))
    }
  }

  if (hasUpstream) {
    onProgress({ phase: "pulling", label: "正在自动拉取云端更新…" })
    const pullResult = await runGitCommand(
      normalizedProjectPath,
      ["pull", "--rebase", "--autostash"],
      { allowFailure: true, timeoutMs: 300_000 },
    )
    const pullConflicts = await getGitConflictFiles(normalizedProjectPath)
    if (pullConflicts.length) {
      return gitConflictResult(
        normalizedProjectPath,
        branch,
        await getGitOperationState(normalizedProjectPath) || "rebase",
        "拉取云端更新时发生冲突，已停止同步，请手动合并冲突文件",
      )
    }
    if (pullResult.code !== 0) {
      throw new Error(gitCommandErrorMessage(pullResult, "拉取云端更新失败"))
    }
  }

  const statusResult = await runGitCommand(
    normalizedProjectPath,
    ["status", "--porcelain=v1", "--untracked-files=all"],
  )
  let committed = false
  if (statusResult.stdout.trim()) {
    onProgress({ phase: "committing", label: "正在提交本地作品变化…" })
    await runGitCommand(normalizedProjectPath, ["add", "-A"])
    const stagedResult = await runGitCommand(
      normalizedProjectPath,
      ["diff", "--cached", "--quiet"],
      { allowFailure: true },
    )
    if (stagedResult.code > 1) {
      throw new Error(gitCommandErrorMessage(stagedResult, "无法检查待提交的本地变化"))
    }
    if (stagedResult.code === 1) {
      const commitTime = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date())
      await runGitCommand(normalizedProjectPath, [
        "-c",
        "user.name=作者管家",
        "-c",
        "user.email=author-desk@local",
        "commit",
        "-m",
        `作者管家自动同步 ${commitTime}`,
      ])
      committed = true
    }
  }

  onProgress({ phase: "pushing", label: "正在推送到云端…" })
  const pushArgs = hasUpstream
    ? ["push"]
    : ["push", "-u", preferredRemote, "HEAD"]
  const pushResult = await runGitCommand(
    normalizedProjectPath,
    pushArgs,
    { allowFailure: true, timeoutMs: 300_000 },
  )
  if (pushResult.code !== 0) {
    throw new Error(gitCommandErrorMessage(pushResult, "推送到云端失败"))
  }

  onProgress({ phase: "complete", label: "作品已同步到云端" })
  return {
    ok: true,
    status: "synced",
    branch,
    remote: hasUpstream ? upstreamResult.stdout.trim() : `${preferredRemote}/${branch}`,
    committed,
    conflictFiles: [],
    operation: "",
    message: "云端更新已拉取，本地变化已提交并推送",
    syncedAt: new Date().toISOString(),
  }
}

app.on("second-instance", showMainWindow)

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  startNodeService()
  createTray()
  mainWindow = createMainWindow()
  loadRenderer(mainWindow)

  app.on("activate", showMainWindow)
})

app.on("before-quit", () => {
  isQuitting = true
  if (mainWindow) saveWindowState(mainWindow)
  stopNodeService()
  if (tray) tray.destroy()
})

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") app.quit()
})

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
  return true
})

ipcMain.handle("window:hide-to-tray", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window === mainWindow) hideMainWindow()
  else window?.hide()
  return true
})

ipcMain.handle("window:toggle-maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { isMaximized: false, isFullScreen: false }
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
  return windowState(window)
})

ipcMain.handle("window:close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return false
  if (window === mainWindow) requestMainWindowClose(window)
  else window.destroy()
  return true
})

ipcMain.handle("window:get-close-behavior", () => getCloseBehavior())

ipcMain.handle("window:set-close-behavior", (_event, closeBehavior) => (
  setCloseBehavior(closeBehavior)
))

ipcMain.handle("window:resolve-close", (_event, action, remember) => {
  if (!["tray", "quit"].includes(action)) throw new Error("关闭操作无效")
  if (remember === true) setCloseBehavior(action)
  if (action === "tray") hideMainWindow()
  else quitApplication()
  return true
})

ipcMain.handle("window:open-child", () => {
  createChildWindow()
  return true
})

ipcMain.handle("window:get-state", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? windowState(window) : { isMaximized: false, isFullScreen: false }
})

ipcMain.handle("service:get-health", async () => {
  try {
    return await requestService("/api/health")
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle("service:say-hello", async () => requestService("/api/hello"))

ipcMain.handle("library:get-projects", async () => getLibraryProjects())

ipcMain.handle("library:get-active-project", () => getActiveProjectPath())

ipcMain.handle("library:set-active-project", (_event, projectPath) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) return false
  const normalizedProject = path.resolve(projectPath)
  if (!fs.existsSync(normalizedProject) || !fs.statSync(normalizedProject).isDirectory()) return false
  writeDesktopSettings({ activeProjectPath: normalizedProject })
  return true
})

ipcMain.handle("library:choose-root", async () => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: "选择小说库目录",
    defaultPath: getLibraryRoot(),
    properties: ["openDirectory"],
    buttonLabel: "设为小说库",
  })
  if (result.canceled || !result.filePaths[0]) return null
  writeDesktopSettings({
    libraryRoot: path.resolve(result.filePaths[0]),
    activeProjectPath: null,
  })
  return getLibraryProjects()
})

ipcMain.handle("library:open-project-folder", async (_event, projectPath) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) return false
  const errorMessage = await shell.openPath(path.resolve(projectPath))
  return !errorMessage
})

ipcMain.handle("library:rename-project", (_event, projectPath, nextName) => (
  renameLibraryProject(projectPath, nextName)
))

ipcMain.handle("library:create-project", () => chooseAndCreateLibraryProject())

ipcMain.handle("git:sync-project", (event, input) => {
  const requestId = String(input?.requestId || "")
  return syncProjectWithGit(String(input?.projectPath || ""), (progress) => {
    if (event.sender.isDestroyed()) return
    event.sender.send("git:sync-progress", {
      requestId,
      ...progress,
    })
  })
})

ipcMain.handle("settings:get-api", () => getApiConfig())

ipcMain.handle("settings:save-api", (_event, input) => saveApiConfig(input))

ipcMain.handle("ai:chat", async (event, input) => {
  const requestId = String(input?.requestId || "")
  if (!requestId) throw new Error("AI 请求 ID 无效")
  const requestKey = `${event.sender.id}:${requestId}`
  const controller = new AbortController()
  activeAiChatControllers.set(requestKey, controller)
  try {
    return await requestAiChat(input, (progress) => {
      if (event.sender.isDestroyed()) return
      event.sender.send("ai:chat-progress", {
        requestId,
        ...progress,
      })
    }, controller.signal)
  } finally {
    if (activeAiChatControllers.get(requestKey) === controller) {
      activeAiChatControllers.delete(requestKey)
    }
  }
})

ipcMain.handle("ai:cancel-chat", (event, requestIdInput) => {
  const requestId = String(requestIdInput || "")
  if (!requestId) return false
  const requestKey = `${event.sender.id}:${requestId}`
  const controller = activeAiChatControllers.get(requestKey)
  if (!controller) return false
  controller.abort(createAiRequestCanceledError())
  return true
})

ipcMain.handle("ai:apply-changes", (_event, projectPath, changeSetId) => (
  applyAiPendingChangeSet(projectPath, changeSetId)
))

ipcMain.handle("ai:discard-changes", (_event, projectPath, changeSetId) => (
  discardAiPendingChangeSet(projectPath, changeSetId)
))

ipcMain.handle("ai:get-history", (_event, projectPath) => getAiChatHistory(projectPath))

ipcMain.handle("ai:save-history", (_event, projectPath, messages) => (
  saveAiChatHistory(projectPath, messages)
))

ipcMain.handle("ai:clear-history", (_event, projectPath) => (
  clearAiChatHistory(projectPath)
))

ipcMain.handle("ai:compact-history", (_event, projectPath) => (
  compactAiChatHistory(projectPath)
))

ipcMain.handle("characters:get", (_event, projectPath) => getCharacterGraph(projectPath))

ipcMain.handle("characters:summarize", (_event, projectPath) => requestCharacterSummary(projectPath))

ipcMain.handle("rules:get", (_event, projectPath) => readWritingRules(projectPath))

ipcMain.handle("rules:create", (_event, projectPath, input) => (
  createWritingRule(projectPath, input)
))

ipcMain.handle("rules:save", (_event, projectPath, relativePath, content) => (
  saveWritingRule(projectPath, relativePath, content)
))

ipcMain.handle("rules:set-enabled", (_event, projectPath, relativePath, enabled) => (
  setWritingRuleEnabled(projectPath, relativePath, enabled)
))

ipcMain.handle("rules:delete", (_event, projectPath, relativePath) => (
  deleteWritingRule(projectPath, relativePath)
))

ipcMain.handle("rules:open-folder", async (_event, projectPath) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) return false
  const root = path.resolve(projectPath)
  const errorMessage = await shell.openPath(root)
  return !errorMessage
})

ipcMain.handle("reference-style:get", (_event, projectPath) => getReferenceStyle(projectPath))

ipcMain.handle("reference-style:choose-directory", (_event, projectPath) => (
  chooseReferenceDirectory(projectPath)
))

ipcMain.handle("reference-style:summarize", (_event, projectPath) => (
  requestReferenceStyleSummary(projectPath)
))

ipcMain.handle("reference-style:open-directory", async (_event, projectPath) => {
  const state = await getReferenceStyle(projectPath)
  if (!state.sourcePath) return false
  const errorMessage = await shell.openPath(state.sourcePath)
  return !errorMessage
})

ipcMain.handle("book-breakdown:get", (_event, projectPath) => (
  getBookBreakdown(projectPath)
))

ipcMain.handle("book-breakdown:choose-source", (_event, projectPath) => (
  chooseBookBreakdownSource(projectPath)
))

ipcMain.handle("book-breakdown:analyze", async (event, input) => {
  const requestId = String(input?.requestId || "")
  const projectPath = String(input?.projectPath || "")
  if (!requestId) throw new Error("拆书请求 ID 无效")
  const requestKey = `${event.sender.id}:${requestId}`
  const controller = new AbortController()
  activeBookBreakdownControllers.set(requestKey, controller)
  try {
    return await requestBookBreakdown(projectPath, (progress) => {
      if (event.sender.isDestroyed()) return
      event.sender.send("book-breakdown:progress", {
        requestId,
        ...progress,
      })
    }, controller.signal)
  } finally {
    if (activeBookBreakdownControllers.get(requestKey) === controller) {
      activeBookBreakdownControllers.delete(requestKey)
    }
  }
})

ipcMain.handle("book-breakdown:cancel", (event, requestIdInput) => {
  const requestId = String(requestIdInput || "")
  if (!requestId) return false
  const requestKey = `${event.sender.id}:${requestId}`
  const controller = activeBookBreakdownControllers.get(requestKey)
  if (!controller) return false
  controller.abort(createAiRequestCanceledError())
  return true
})

ipcMain.handle("book-breakdown:open-directory", async (_event, projectPath) => {
  const directory = bookBreakdownDirectory(projectPath)
  await fs.promises.mkdir(directory, { recursive: true })
  const errorMessage = await shell.openPath(directory)
  return !errorMessage
})

ipcMain.handle("style-comparison:choose-article", (_event, defaultPath) => (
  chooseStyleComparisonArticle(defaultPath)
))

ipcMain.handle("style-comparison:compare", (event, input) => {
  const requestId = String(input?.requestId || "")
  return requestStyleComparison(input, (progress) => {
    if (event.sender.isDestroyed()) return
    event.sender.send("style-comparison:progress", {
      requestId,
      ...progress,
    })
  })
})

ipcMain.handle("project:get-chapters", async (_event, projectPath) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const params = new URLSearchParams({
    root: getLibraryRoot(),
    project: path.resolve(projectPath),
  })
  return requestService(`/api/project/chapters?${params}`)
})

ipcMain.handle("project:get-chapter", async (_event, projectPath, chapterName) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const params = new URLSearchParams({
    root: getLibraryRoot(),
    project: path.resolve(projectPath),
    chapter: String(chapterName || ""),
  })
  return requestService(`/api/project/chapter?${params}`)
})

ipcMain.handle("project:save-chapter", async (_event, projectPath, chapterName, content) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return requestService("/api/project/chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      root: getLibraryRoot(),
      projectPath: path.resolve(projectPath),
      chapterName,
      content,
    }),
  })
})

ipcMain.handle("project:create-chapter", async (_event, projectPath, chapterName) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  return requestService("/api/project/chapter/create", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      root: getLibraryRoot(),
      projectPath: path.resolve(projectPath),
      chapterName,
    }),
  })
})

ipcMain.handle("project:delete-chapter", async (_event, projectPath, chapterName) => {
  if (typeof projectPath !== "string" || !isPathInsideLibrary(projectPath)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const normalizedProject = path.resolve(projectPath)
  const normalizedChapterName = String(chapterName || "").trim()
  if (
    !normalizedChapterName
    || path.basename(normalizedChapterName) !== normalizedChapterName
    || !AI_FILE_EXTENSIONS.has(path.extname(normalizedChapterName).toLowerCase())
  ) {
    throw new Error("章节文件名无效")
  }
  const manuscriptPath = path.join(normalizedProject, "正文")
  const chapterPath = path.resolve(manuscriptPath, normalizedChapterName)
  const relativePath = path.relative(manuscriptPath, chapterPath)
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("章节路径无效")
  }
  const [realProjectPath, realManuscriptPath, realChapterPath] = await Promise.all([
    fs.promises.realpath(normalizedProject),
    fs.promises.realpath(manuscriptPath),
    fs.promises.realpath(chapterPath),
  ])
  if (!isPathContained(realProjectPath, realManuscriptPath)) {
    throw new Error("正文目录指向当前作品之外")
  }
  if (!isPathContained(realManuscriptPath, realChapterPath)) {
    throw new Error("章节文件指向正文目录之外")
  }
  const stats = await fs.promises.stat(realChapterPath)
  if (!stats.isFile()) throw new Error("目标章节不是文件")
  await shell.trashItem(realChapterPath)
  return {
    ok: true,
    name: normalizedChapterName,
  }
})
