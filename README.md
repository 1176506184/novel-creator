# 作者管家

Electron + React + shadcn/ui 的桌面端基础项目，内置一个随桌面应用启动的 Node.js HTTP 服务。

## 开发

```bash
yarn
yarn start
```

`yarn start` 会同时启动 Vite 页面和 Electron。DevTools 默认关闭；排查问题时
按 `F12` 或 `Ctrl+Shift+I` 切换，也可以在启动前设置
`AUTHOR_DESK_DEVTOOLS=1` 让它默认打开。

## Windows 打包

先安装依赖并确认 `electron-builder` 已就绪：

```bash
yarn
```

仅生成未安装的应用目录，用于检查打包内容：

```bash
yarn pack
```

生成可以选择安装目录的 Windows x64 安装包：

```bash
yarn dist:win
```

生成无需安装的便携版：

```bash
yarn dist:portable
```

打包结果统一输出到 `release` 目录：

```text
release\
├─ win-unpacked\
├─ 作者管家-0.1.2-安装包.exe
└─ 作者管家-0.1.2-便携版.exe
```

当前关闭了 ASAR，以保证内置 `electron/server.cjs` Node 服务可以从普通磁盘路径
启动。正式发布前如需启用 ASAR，需要同时调整服务脚本的解包位置和启动路径。

## 已包含

- React 19 + Vite + Tailwind CSS 4
- shadcn/ui 目录与 Button 基础组件
- Electron 无边框圆角窗口和自定义标题栏
- 最大化、还原、最小化、隐藏到系统托盘
- 窗口位置和尺寸持久化
- 独立子窗口示例
- 内置 Node.js 服务及 IPC 安全桥接
- 基于文件目录的小说库，不依赖 SQLite
- 自定义品牌图标，覆盖窗口、任务栏、托盘和应用标题栏

## 小说库目录约定

默认小说库为 `G:\小说库`。每个一级目录是一部作品，例如：

```text
G:\小说库\待起名\
├─ 小说标题+简介.md
├─ 世界观设定.md
├─ 剧情大纲.md
├─ 角色设定.md
├─ 正文\
│  ├─ 第1章.txt
│  └─ 第2章.txt
├─ 参考小说\
└─ 范文库\
```

应用只读取作品目录并统计“正文”中的 `.txt`、`.md` 章节，不会在小说目录中
创建数据库。当前小说库路径保存在 Electron 的 `userData` 设置目录中。
小说库目录统一在“设置”页面中更改。

主窗口关闭时默认询问“退出程序”或“放到后台”，也可以在设置中记住并修改关闭行为。
