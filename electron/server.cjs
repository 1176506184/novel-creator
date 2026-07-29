const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")

const HOST = "127.0.0.1"
const PORT = Number(process.env.AUTHOR_DESK_SERVICE_PORT || 37891)
const CHAPTER_EXTENSIONS = new Set([".txt", ".md", ".markdown"])
const CHARACTER_DATA_DIRECTORY = "角色设置"
const CHARACTER_GRAPH_FILE = "人物关系.json"

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  response.end(JSON.stringify(data))
}

function countCharacters(content) {
  return content.replace(/\s/g, "").length
}

function isPathInside(parentPath, targetPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(targetPath))
  return Boolean(relativePath)
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
}

async function resolveProjectPath(rootPath, projectPath) {
  const normalizedRoot = path.resolve(rootPath)
  const normalizedProject = path.resolve(projectPath)
  if (!isPathInside(normalizedRoot, normalizedProject)) {
    throw new Error("作品目录不在当前小说库中")
  }
  const relativePath = path.relative(normalizedRoot, normalizedProject)
  if (relativePath.includes(path.sep)) {
    throw new Error("作品必须是小说库下的一级目录")
  }
  const stats = await fs.promises.stat(normalizedProject)
  if (!stats.isDirectory()) throw new Error("作品路径不是目录")
  return normalizedProject
}

function resolveChapterPath(projectPath, chapterName) {
  if (
    typeof chapterName !== "string"
    || !chapterName.trim()
    || path.basename(chapterName) !== chapterName
    || !CHAPTER_EXTENSIONS.has(path.extname(chapterName).toLowerCase())
  ) {
    throw new Error("章节文件名无效")
  }
  const manuscriptPath = path.join(projectPath, "正文")
  const chapterPath = path.resolve(manuscriptPath, chapterName)
  if (!isPathInside(manuscriptPath, chapterPath)) throw new Error("章节路径无效")
  return chapterPath
}

async function listChapters(rootPath, projectPath) {
  const normalizedProject = await resolveProjectPath(rootPath, projectPath)
  const manuscriptPath = path.join(normalizedProject, "正文")
  let entries = []

  try {
    entries = (await fs.promises.readdir(manuscriptPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && CHAPTER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }))
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }

  const chapters = await Promise.all(entries.map(async (entry) => {
    const chapterPath = path.join(manuscriptPath, entry.name)
    const [content, stats] = await Promise.all([
      fs.promises.readFile(chapterPath, "utf8"),
      fs.promises.stat(chapterPath),
    ])
    return {
      name: entry.name,
      path: chapterPath,
      characterCount: countCharacters(content),
      modifiedAt: stats.mtime.toISOString(),
    }
  }))

  return {
    ok: true,
    projectPath: normalizedProject,
    manuscriptPath,
    chapters,
  }
}

async function readChapter(rootPath, projectPath, chapterName) {
  const normalizedProject = await resolveProjectPath(rootPath, projectPath)
  const chapterPath = resolveChapterPath(normalizedProject, chapterName)
  const [content, stats] = await Promise.all([
    fs.promises.readFile(chapterPath, "utf8"),
    fs.promises.stat(chapterPath),
  ])
  return {
    ok: true,
    name: chapterName,
    path: chapterPath,
    content,
    characterCount: countCharacters(content),
    modifiedAt: stats.mtime.toISOString(),
  }
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 5 * 1024 * 1024) throw new Error("章节内容超过 5MB 限制")
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  return raw ? JSON.parse(raw) : {}
}

async function saveChapter(rootPath, projectPath, chapterName, content) {
  if (typeof content !== "string") throw new Error("章节内容无效")
  const normalizedProject = await resolveProjectPath(rootPath, projectPath)
  const chapterPath = resolveChapterPath(normalizedProject, chapterName)
  await fs.promises.mkdir(path.dirname(chapterPath), { recursive: true })
  await fs.promises.writeFile(chapterPath, content, "utf8")
  return readChapter(rootPath, normalizedProject, chapterName)
}

async function createChapter(rootPath, projectPath, chapterName) {
  const trimmedName = typeof chapterName === "string" ? chapterName.trim() : ""
  const normalizedName = path.extname(trimmedName) ? trimmedName : `${trimmedName}.txt`
  const normalizedProject = await resolveProjectPath(rootPath, projectPath)
  const chapterPath = resolveChapterPath(normalizedProject, normalizedName)
  await fs.promises.mkdir(path.dirname(chapterPath), { recursive: true })
  try {
    await fs.promises.writeFile(chapterPath, "", { encoding: "utf8", flag: "wx" })
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("同名章节已经存在")
    throw error
  }
  return readChapter(rootPath, normalizedProject, normalizedName)
}

function isCharacterGraph(graph) {
  return Boolean(
    graph
    && typeof graph === "object"
    && Array.isArray(graph.characters)
    && graph.characters.every((character) => (
      character
      && typeof character === "object"
      && typeof character.id === "string"
      && typeof character.name === "string"
    ))
    && Array.isArray(graph.relationships)
    && graph.relationships.every((relationship) => (
      relationship
      && typeof relationship === "object"
      && typeof relationship.id === "string"
      && typeof relationship.source === "string"
      && typeof relationship.target === "string"
      && typeof relationship.type === "string"
    ))
  )
}

async function readCharacterGraph(rootPath, projectPath) {
  const normalizedProject = await resolveProjectPath(rootPath, projectPath)
  const graphPath = path.join(
    normalizedProject,
    CHARACTER_DATA_DIRECTORY,
    CHARACTER_GRAPH_FILE,
  )
  try {
    const graph = JSON.parse(await fs.promises.readFile(graphPath, "utf8"))
    if (!isCharacterGraph(graph)) throw new Error("人物关系 JSON 格式无效，请重新总结")
    return {
      ok: true,
      exists: true,
      path: graphPath,
      graph,
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        ok: true,
        exists: false,
        path: graphPath,
        graph: null,
      }
    }
    if (error instanceof SyntaxError) {
      throw new Error("人物关系 JSON 已损坏，请修复或重新总结")
    }
    throw error
  }
}

async function saveCharacterGraph(rootPath, projectPath, graph) {
  if (!isCharacterGraph(graph)) {
    throw new Error("人物关系 JSON 格式无效")
  }
  const normalizedProject = await resolveProjectPath(rootPath, projectPath)
  const graphPath = path.join(
    normalizedProject,
    CHARACTER_DATA_DIRECTORY,
    CHARACTER_GRAPH_FILE,
  )
  await fs.promises.mkdir(path.dirname(graphPath), { recursive: true })
  const temporaryPath = `${graphPath}.${process.pid}.tmp`
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8")
  try {
    await fs.promises.rename(temporaryPath, graphPath)
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {})
    throw error
  }
  return {
    ok: true,
    exists: true,
    path: graphPath,
    graph,
  }
}

async function scanProject(projectPath, directoryEntry) {
  const manuscriptPath = path.join(projectPath, "正文")
  let chapterEntries = []

  try {
    chapterEntries = (await fs.promises.readdir(manuscriptPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && CHAPTER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }))
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }

  const chapterDetails = await Promise.all(chapterEntries.map(async (entry) => {
    const chapterPath = path.join(manuscriptPath, entry.name)
    const [content, stats] = await Promise.all([
      fs.promises.readFile(chapterPath, "utf8"),
      fs.promises.stat(chapterPath),
    ])
    return {
      name: entry.name,
      path: chapterPath,
      characterCount: countCharacters(content),
      modifiedAt: stats.mtime.toISOString(),
      modifiedTime: stats.mtimeMs,
    }
  }))

  const projectStats = await fs.promises.stat(projectPath)
  const latestChapter = [...chapterDetails].sort((left, right) => right.modifiedTime - left.modifiedTime)[0]
  const modifiedTime = Math.max(
    projectStats.mtimeMs,
    ...chapterDetails.map((chapter) => chapter.modifiedTime),
  )

  return {
    name: directoryEntry.name,
    path: projectPath,
    manuscriptPath: fs.existsSync(manuscriptPath) ? manuscriptPath : null,
    chapterCount: chapterDetails.length,
    characterCount: chapterDetails.reduce((sum, chapter) => sum + chapter.characterCount, 0),
    latestChapter: latestChapter?.name || null,
    modifiedAt: new Date(modifiedTime).toISOString(),
  }
}

async function scanLibrary(rootPath) {
  const normalizedRoot = path.resolve(rootPath)
  const rootStats = await fs.promises.stat(normalizedRoot)
  if (!rootStats.isDirectory()) throw new Error("小说库路径不是目录")

  const projectEntries = (await fs.promises.readdir(normalizedRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))

  const projects = await Promise.all(projectEntries.map((entry) => (
    scanProject(path.join(normalizedRoot, entry.name), entry)
  )))
  projects.sort((left, right) => new Date(right.modifiedAt) - new Date(left.modifiedAt))

  return {
    ok: true,
    storage: "filesystem",
    root: normalizedRoot,
    projects,
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`)

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        service: "author-desk-node-service",
        storage: "filesystem",
        pid: process.pid,
        time: new Date().toISOString(),
      })
      return
    }

    if (request.method === "GET" && url.pathname === "/api/hello") {
      sendJson(response, 200, {
        message: "目录式小说库已经连接。",
      })
      return
    }

    if (request.method === "GET" && url.pathname === "/api/library/projects") {
      const root = url.searchParams.get("root")
      if (!root) {
        sendJson(response, 400, { ok: false, message: "缺少小说库路径" })
        return
      }
      sendJson(response, 200, await scanLibrary(root))
      return
    }

    if (request.method === "GET" && url.pathname === "/api/project/chapters") {
      const root = url.searchParams.get("root")
      const project = url.searchParams.get("project")
      if (!root || !project) {
        sendJson(response, 400, { ok: false, message: "缺少小说库或作品路径" })
        return
      }
      sendJson(response, 200, await listChapters(root, project))
      return
    }

    if (request.method === "GET" && url.pathname === "/api/project/chapter") {
      const root = url.searchParams.get("root")
      const project = url.searchParams.get("project")
      const chapter = url.searchParams.get("chapter")
      if (!root || !project || !chapter) {
        sendJson(response, 400, { ok: false, message: "缺少章节读取参数" })
        return
      }
      sendJson(response, 200, await readChapter(root, project, chapter))
      return
    }

    if (request.method === "GET" && url.pathname === "/api/project/character-graph") {
      const root = url.searchParams.get("root")
      const project = url.searchParams.get("project")
      if (!root || !project) {
        sendJson(response, 400, { ok: false, message: "缺少作品角色设置参数" })
        return
      }
      sendJson(response, 200, await readCharacterGraph(root, project))
      return
    }

    if (request.method === "POST" && url.pathname === "/api/project/chapter") {
      const body = await readJsonBody(request)
      if (!body.root || !body.projectPath || !body.chapterName) {
        sendJson(response, 400, { ok: false, message: "缺少章节保存参数" })
        return
      }
      sendJson(
        response,
        200,
        await saveChapter(body.root, body.projectPath, body.chapterName, body.content),
      )
      return
    }

    if (request.method === "POST" && url.pathname === "/api/project/chapter/create") {
      const body = await readJsonBody(request)
      if (!body.root || !body.projectPath || !body.chapterName) {
        sendJson(response, 400, { ok: false, message: "缺少新建章节参数" })
        return
      }
      sendJson(
        response,
        200,
        await createChapter(body.root, body.projectPath, body.chapterName),
      )
      return
    }

    if (request.method === "POST" && url.pathname === "/api/project/character-graph") {
      const body = await readJsonBody(request)
      if (!body.root || !body.projectPath || !body.graph) {
        sendJson(response, 400, { ok: false, message: "缺少人物关系保存参数" })
        return
      }
      sendJson(
        response,
        200,
        await saveCharacterGraph(body.root, body.projectPath, body.graph),
      )
      return
    }

    sendJson(response, 404, { ok: false, message: "Not found" })
  } catch (error) {
    console.error("[node-service]", error)
    sendJson(response, 500, {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[node-service] listening at http://${HOST}:${PORT}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
