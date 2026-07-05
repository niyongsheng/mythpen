# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Mythpen 是一个桌面端小说创作应用，帮助作者管理角色、世界观、章节、伏笔、时间线等创作要素，并集成 AI 辅助写作。基于 Tauri v2 构建，Rust 后端直接操作 SQLite，前端 React + Vite。

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm dev:all              # 启动前端(5173) + 后端(3001) + 初始化种子数据
pnpm dev                  # 仅启动前端 Vite dev server
pnpm dev:server           # 仅启动后端 (nodemon 热重载) — 仅开发模式需要
pnpm seed                 # 初始化种子数据
pnpm build                # Vite 构建前端产物
pnpm typecheck            # TypeScript 类型检查（不阻塞构建）
pnpm lint                 # Oxlint 代码检查
pnpm preview              # 预览构建产物
pnpm tauri dev            # Tauri 开发模式（窗口 + 热重载）
pnpm tauri build          # 构建桌面安装包（macOS .dmg, Windows .msi, Linux .AppImage）
```

`pnpm dev:all` 是日常前端开发最常用的命令，使用 concurrently 同时启动前端和 Express 后端。生产构建使用 `pnpm tauri build`。

## 技术架构

### 前端 (src/)

- **React 19** + **TypeScript 6** + **Vite 8**
- **Zustand** 状态管理，store 文件在 `src/stores/`
- **Tailwind CSS 4** — 使用 `@tailwindcss/vite` 插件，无 tailwind.config 文件。设计令牌（颜色、字体、间距）定义在 `src/index.css` 的 `:root` 和 `@theme` 块中，通过 CSS 变量驱动
- **页面路由**：不使用 React Router 的 URL 路由。`App.tsx` 中有一个 `PAGES` 映射表，根据 `useSidebarStore.activePage` 控制哪个页面 `display: flex` / `display: hidden`。侧边栏点击切换 `activePage` 即切换页面
- **路径别名**：`@/` 映射到 `src/`
- **i18n**：`src/i18n/index.ts` 导出 `t(path, params)` 函数和 `setLanguage()`。翻译文本在 `zh.json` / `en.json` 中，按点号分隔路径访问
- **富文本编辑器**：基于 contentEditable + `document.execCommand`，支持 B/I/U/H1/H2/对话块/代码块/分隔线/清除格式。格式以标记文本（`**粗体**`、`*斜体*`、`__下划线__`）存储在数据库

### 后端架构

项目支持两种运行模式：

#### 生产模式（Tauri 桌面应用）
- **Rust** 通过 `rusqlite` 直接操作 SQLite 数据库
- 40+ 个 Tauri commands 处理所有 CRUD 操作（projects、chapters、characters、world、science、foreshadows、relations、memories、timeline、stats、settings）
- `src-tauri/src/commands.rs` — 所有 Tauri 命令
- `src-tauri/src/db.rs` — SQLite 数据库连接管理、表创建
- `src-tauri/src/lib.rs` — Tauri 应用入口，注册命令

#### 开发模式（浏览器）
- **Express 5** 运行在 `localhost:3001`（server/ 目录）
- **better-sqlite3** 同步 SQLite 数据库
- Vite dev server 将 `/api` 请求代理到后端（见 `vite.config.ts`）
- `pnpm dev:all` 同时启动前端和后端

#### 前端 API 适配器
`src/lib/api.ts` 自动检测运行环境：
- **Tauri 环境**：使用 `@tauri-apps/api/core` 的 `invoke()` 调用 Rust commands
- **浏览器环境**：使用 `fetch()` 通过 Vite 代理访问 Express 后端

### 数据库

- **位置**：`~/.mythpen/` 目录下
- `config.db`：全局设置（`app_settings` 表）、最近项目列表（`recent_projects` 表）
- `projects/<项目名>.mythpen.db`：每个项目独立数据库

### 数据库 Schema

每个项目数据库包含以下核心表：
- `chapters` — 章节（含 content、outline、status、5 个叙事维度字段）
- `volumes` — 卷
- `characters` — 角色（含外貌/性格/背景/动机/弧光）
- `world_entries` — 世界观条目（分类：location/organization/concept/event）
- `science_entries` — 科幻设定（known/extrapolation/hypothesis）
- `foreshadows` — 伏笔（含优先级/状态/揭晓章节）
- `character_relations` — 角色关系
- `memories` — 创作记忆
- `timeline_events` — 时间线事件
- `chat_sessions` / `chat_messages` — AI 对话历史
- `token_usage` — AI token 用量记录

### 前端数据流

1. `src/lib/api.ts` — API 客户端，封装所有后端请求，自动适配 Tauri/浏览器模式
2. `src/lib/useProjectData.ts` — React hooks（`useChapters()`、`useCharacters()` 等），从 `useProjectStore` 获取当前项目名，调用 API 并返回 `{ data, loading, error, reload }`
3. `src/stores/` — Zustand stores。核心 store 包括：
   - `useProjectStore` — 当前项目、项目列表、showProjectList 状态
   - `useChapterStore` — 章节列表和当前章节、保存状态追踪
   - `useSidebarStore` — 侧边栏 activePage、折叠状态
   - `useUIStore` — 右侧 AI 面板可见性和宽度
   - `useSettingsStore` — 应用设置（从服务器加载）
   - `useEditorStore` — 编辑器字体设置（从 localStorage 加载）
   - `useAgentStore` — AI agent 任务状态

### 页面组件

所有页面组件在 `src/pages/` 下，每个页面对应一个侧边栏导航项。页面使用 `page-header` / `page-body` CSS 类进行布局（定义在 `App.tsx` 的内联 `<style>` 中）。

### 样式约定

- 优先使用 Tailwind utility class
- 复用样式使用 `App.tsx` 中定义的全局 CSS class（如 `.btn-primary`、`.btn-secondary`、`.form-input`、`.form-textarea`、`.tool-btn`、`.dash-card-title`）
- 设计令牌通过 CSS 变量定义，在 Tailwind 中可用 `bg-canvas`、`text-ink-secondary`、`border-hairline` 等形式
- 支持深色/浅色主题，通过 `<html data-theme="light">` 切换
- 自定义滚动条使用 `.custom-scrollbar` class

### AI 功能

- 服务器端 `buildSystemPrompt()` 从项目数据库动态构建 system prompt，包含角色、章节概览、活跃伏笔
- 流式对话：`/api/ai/chat/stream`，支持 `mode: 'writing'`（创作模式）和 `mode: 'chat'`（对话模式）两种 system prompt
- 续写/润色：`/api/ai/continue` 自动将生成内容追加到章节末尾
- AI 配置（API key、base URL、model）存储在 `app_settings` 表中，通过 `/api/settings` 管理
- AI 面板在浏览器/Tauri 模式下均通过 HTTP 直连 `localhost:3001/api`（API 适配器自动处理）

### Tauri 桌面集成

- **Tauri v2**，Rust 后端（`src-tauri/`）
- `tauri.conf.json` 配置窗口大小（1280x860）、标题（Mythpen）、图标
- 打包资源：`.app` / `.dmg`（macOS）、`.msi`（Windows）、`.AppImage`（Linux）
- `.github/workflows/build.yml` — 自动构建三平台安装包
- `Titlebar.tsx` 自定义标题栏（`"decorations": false`），替代原生窗口装饰

### 编辑器功能

- **富文本**：H1/H2/B/I/U/对话块/代码块/分隔线/清除格式
- **工具栏激活态**：B/I/U 按钮随光标位置高亮（基于 `document.queryCommandState`）
- **自动保存**：停打 1.5 秒后自动保存（防抖）+ 失焦立即保存
- **保存状态**：底部状态栏显示「已保存/保存中.../未保存」
- **AI 续写/润色**：工具栏右侧按钮，含 loading 状态
- **标题编辑**：点击章节标题直接修改
- **自动聚焦**：进入写作页或切换章节时编辑器自动获取焦点
