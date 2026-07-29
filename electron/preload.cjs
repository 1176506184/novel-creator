const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("authorDesk", {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    hideToTray: () => ipcRenderer.invoke("window:hide-to-tray"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    getCloseBehavior: () => ipcRenderer.invoke("window:get-close-behavior"),
    setCloseBehavior: (closeBehavior) => (
      ipcRenderer.invoke("window:set-close-behavior", closeBehavior)
    ),
    resolveClose: (action, remember) => (
      ipcRenderer.invoke("window:resolve-close", action, remember)
    ),
    openChild: () => ipcRenderer.invoke("window:open-child"),
    getState: () => ipcRenderer.invoke("window:get-state"),
    onStateChange: (callback) => {
      if (typeof callback !== "function") return () => {}
      const listener = (_event, state) => callback(state)
      ipcRenderer.on("window:state-changed", listener)
      return () => ipcRenderer.removeListener("window:state-changed", listener)
    },
    onCloseRequested: (callback) => {
      if (typeof callback !== "function") return () => {}
      const listener = () => callback()
      ipcRenderer.on("window:close-requested", listener)
      return () => ipcRenderer.removeListener("window:close-requested", listener)
    },
  },
  service: {
    getHealth: () => ipcRenderer.invoke("service:get-health"),
    sayHello: () => ipcRenderer.invoke("service:say-hello"),
  },
  library: {
    getProjects: () => ipcRenderer.invoke("library:get-projects"),
    getActiveProject: () => ipcRenderer.invoke("library:get-active-project"),
    setActiveProject: (projectPath) => ipcRenderer.invoke("library:set-active-project", projectPath),
    chooseRoot: () => ipcRenderer.invoke("library:choose-root"),
    openProjectFolder: (projectPath) => ipcRenderer.invoke("library:open-project-folder", projectPath),
    renameProject: (projectPath, nextName) => (
      ipcRenderer.invoke("library:rename-project", projectPath, nextName)
    ),
    createProject: () => ipcRenderer.invoke("library:create-project"),
  },
  project: {
    getChapters: (projectPath) => ipcRenderer.invoke("project:get-chapters", projectPath),
    createChapter: (projectPath, chapterName) => (
      ipcRenderer.invoke("project:create-chapter", projectPath, chapterName)
    ),
    getChapter: (projectPath, chapterName) => (
      ipcRenderer.invoke("project:get-chapter", projectPath, chapterName)
    ),
    saveChapter: (projectPath, chapterName, content) => (
      ipcRenderer.invoke("project:save-chapter", projectPath, chapterName, content)
    ),
    deleteChapter: (projectPath, chapterName) => (
      ipcRenderer.invoke("project:delete-chapter", projectPath, chapterName)
    ),
  },
  settings: {
    getApi: () => ipcRenderer.invoke("settings:get-api"),
    saveApi: (input) => ipcRenderer.invoke("settings:save-api", input),
  },
  ai: {
    chat: (input) => ipcRenderer.invoke("ai:chat", input),
    cancelChat: (requestId) => ipcRenderer.invoke("ai:cancel-chat", requestId),
    applyChanges: (projectPath, changeSetId) => (
      ipcRenderer.invoke("ai:apply-changes", projectPath, changeSetId)
    ),
    discardChanges: (projectPath, changeSetId) => (
      ipcRenderer.invoke("ai:discard-changes", projectPath, changeSetId)
    ),
    getHistory: (projectPath) => ipcRenderer.invoke("ai:get-history", projectPath),
    saveHistory: (projectPath, messages) => (
      ipcRenderer.invoke("ai:save-history", projectPath, messages)
    ),
    clearHistory: (projectPath) => ipcRenderer.invoke("ai:clear-history", projectPath),
    compactHistory: (projectPath) => ipcRenderer.invoke("ai:compact-history", projectPath),
    onChatProgress: (callback) => {
      if (typeof callback !== "function") return () => {}
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on("ai:chat-progress", listener)
      return () => ipcRenderer.removeListener("ai:chat-progress", listener)
    },
  },
  characters: {
    get: (projectPath) => ipcRenderer.invoke("characters:get", projectPath),
    summarize: (projectPath) => ipcRenderer.invoke("characters:summarize", projectPath),
  },
  rules: {
    get: (projectPath) => ipcRenderer.invoke("rules:get", projectPath),
    create: (projectPath, input) => ipcRenderer.invoke("rules:create", projectPath, input),
    save: (projectPath, relativePath, content) => (
      ipcRenderer.invoke("rules:save", projectPath, relativePath, content)
    ),
    setEnabled: (projectPath, relativePath, enabled) => (
      ipcRenderer.invoke("rules:set-enabled", projectPath, relativePath, enabled)
    ),
    delete: (projectPath, relativePath) => (
      ipcRenderer.invoke("rules:delete", projectPath, relativePath)
    ),
    openFolder: (projectPath) => ipcRenderer.invoke("rules:open-folder", projectPath),
  },
  referenceStyle: {
    get: (projectPath) => ipcRenderer.invoke("reference-style:get", projectPath),
    chooseDirectory: (projectPath) => (
      ipcRenderer.invoke("reference-style:choose-directory", projectPath)
    ),
    summarize: (projectPath) => ipcRenderer.invoke("reference-style:summarize", projectPath),
    openDirectory: (projectPath) => (
      ipcRenderer.invoke("reference-style:open-directory", projectPath)
    ),
  },
  styleComparison: {
    chooseArticle: (defaultPath) => (
      ipcRenderer.invoke("style-comparison:choose-article", defaultPath)
    ),
    compare: (input) => ipcRenderer.invoke("style-comparison:compare", input),
    onProgress: (callback) => {
      if (typeof callback !== "function") return () => {}
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on("style-comparison:progress", listener)
      return () => ipcRenderer.removeListener("style-comparison:progress", listener)
    },
  },
  git: {
    syncProject: (input) => ipcRenderer.invoke("git:sync-project", input),
    onSyncProgress: (callback) => {
      if (typeof callback !== "function") return () => {}
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on("git:sync-progress", listener)
      return () => ipcRenderer.removeListener("git:sync-progress", listener)
    },
  },
})
