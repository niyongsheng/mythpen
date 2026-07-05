# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Mythpen 是一个桌面端小说创作应用，帮助作者管理角色、世界观、章节、伏笔、时间线等创作要素，并集成 AI 辅助写作。基于 Tauri v2 + Express 架构，Rust 层仅做桌面壳，业务逻辑由 Express 后端提供，前端 React + Vite。

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm dev:all              # 启动前端(5173) + 后端(3001) + 初始化种子数据
pnpm dev                  # 仅启动前端 Vite dev server
pnpm dev:server           # 仅启动后端 (nodemon 热重载)
pnpm seed                 # 初始化种子数据
pnpm build                # Vite 构建前端产物
pnpm typecheck            # TypeScript 类型检查
pnpm lint                 # Biome 代码检查
pnpm preview              # 预览构建产物
pnpm tauri dev            # Tauri 开发模式（窗口 + 热重载）
pnpm tauri build          # 构建桌面安装包（macOS .dmg, Windows .msi, Linux .AppImage）
node server/test-tools.js # 运行 AI 工具集成测试（40项）
```

`pnpm dev:all` 是日常前端开发最常用的命令。

## 技术架构

### 前端 (src/)

- **React 19** + **TypeScript 6** + **Vite 8**
- **Zustand** 状态管理，store 文件在 `src/stores/`
- **Tailwind CSS 4** — 使用 `@tailwindcss/vite` 插件，无 tailwind.config 文件。设计令牌定义在 `src/index.css` 的 `:root` 和 `@theme` 块中
- **页面路由**：`App.tsx` 中 `PAGES` 映射表，`useSidebarStore.activePage` 控制页面显隐
- **路径别名**：`@/` 映射到 `src/`
- **i18n**：`src/i18n/index.ts` 导出 `t(path, params)`，翻译文件在 `zh.json` / `en.json`
- **富文本编辑器**：contentEditable + `document.execCommand`，标记文本存储（`**粗体**`、`*斜体*`、`__下划线__`）

### 后端架构

**Express 5**（`server/` 目录）是唯一业务后端，运行在 `localhost:3001`：
- `server/index.js` — 入口，AI 路由（chat/stream/continue），系统提示词
- `server/db.js` — SQLite 数据库层（config.db + 项目 DB）
- `server/routes/api.js` — 所有 REST API 路由（CRUD + workflow phase）
- `server/ai-adapter.js` — AI 提供商适配器（OpenAI/Claude）
- `server/tools.js` — AI 工具定义（25+ 工具）和执行器
- `server/seed.js` — 种子数据
- `server/test-tools.js` — 工具集成测试（40项）

### Tauri 桌面集成

- Tauri v2 作为桌面壳（`src-tauri/`），Rust 层不含业务逻辑
- 开发模式：`pnpm dev:all` 启动 Vite + Express
- 生产构建：`pnpm tauri build`（.dmg/.msi/.AppImage）
- 自定义标题栏（`decorations: false`），`Titlebar.tsx`

### 数据库

- **位置**：`~/.mythpen/` 目录下
- `config.db`：全局设置（`app_settings`）、最近项目（`recent_projects`）
- `projects/<项目名>.mythpen.db`：每个项目独立数据库，含 chapters/volumes/characters/world/foreshadows/relations/memories/timeline/chat/tokens 等表

---

## AI 功能

### 双模式提示词

| 模式 | 提示词 | 定位 |
|---|---|---|
| `writing`（创作） | `buildSystemPrompt()` | 六步写作工作流（了解→读大纲→创作→润色→审稿→定稿） |
| `chat`（对话） | `buildChatPrompt()` | 综合助手：创作+管理项目 |

提示词文档见 `docs/system-prompt-writing.md` 和 `docs/system-prompt-chat.md`。

### AI 提供商适配器

`server/ai-adapter.js` 支持两种 Provider：

| Provider | 协议 | 适用场景 |
|---|---|---|
| `OpenAIProvider` | `POST /chat/completions` | DeepSeek、OpenAI、通义千问等 |
| `ClaudeProvider` | `client.messages.create()` (Anthropic SDK) | Claude 模型 |

通过 `app_settings` 中的 `api_type`（openai/claude）和 `api_model` 控制。设置中可自定义 URL / API Key / 模型。

### 工具调用

25+ 个 AI 工具，全部定义在 `server/tools.js`，包含完整 CRUD：

| 分类 | 工具 |
|---|---|
| 章节 | list/get/create/update/delete_chapter |
| 卷 | list/create/update/delete_volume |
| 角色 | list/get/create/update/delete_character |
| 世界观 | list/create/update/delete_world_entry |
| 科幻设定 | list/create/delete_science_entry |
| 伏笔 | list/create/update/delete_foreshadow |
| 关系 | list/create/update/delete_relation |
| 记忆 | list/create/update/delete_memory |
| 时间线 | list/create/update/delete_timeline_event |
| 统计 | get_stats |

工具调用通过多轮循环实现（最多 8 轮），每次 AI 返回 tool_calls → 后端执行 → 结果喂回 → AI 继续。

### 工具测试

```bash
node server/test-tools.js
```

运行 40 项测试，覆盖所有实体的 create → list/get → update → delete 完整生命周期。

---

## 工作流系统

### 项目阶段（7 阶段）

```
选题(idea) → 设定(setting) → 大纲(outline) → 写作(writing) → 审阅(review) → 一致性(consistency) → 导出(export)
```

存储在 `project_meta.workflow_phase`，Dashboard 阶段进度条从后端动态读取。
阶段可通过 Dashboard 的推进按钮手动前进，部分阶段有自动检测条件。

### 章节状态（4 状态）

```
pending(待办) → writing(写作中) → review(审阅中) → accepted(已完成)
```

- 侧边栏 `StatusBadge` 点击循环推进
- 编辑器状态栏可点击 ↻ 切换
- 状态变更即时持久化到数据库

### 五维大纲

每章节除 `outline` 外还有 5 个叙事维度字段：
- `cognitive_frame` — 认知框架
- `emotional_anchor` — 情感锚点
- `world_texture` — 世界质感
- `concrete_mystery` — 具体悬念
- `interpersonal_tension` — 人际张力

---

## 聊天系统

### 数据流

```
用户输入 → handleSend()
  → addMessage() 本地乐观更新
  → saveMsg() POST /:project/chat/messages
  → chatStream() POST /api/ai/chat/stream
  → SSE 解析 (content_chunk / tool_call / tool_result)
  → onEnd() → saveMsg(AI回复)
```

### 历史消息管理

- `useAgentStore.messages` 维护当前会话消息
- 首次加载：`loadSessions` 自动触发 `loadMessages`（修复了时序问题）
- 切换会话：`switchSession` 重新加载对应 session 的消息
- 压缩算法：超长对话自动截断旧消息，保留最近内容
- 通知：AI 回答完成后右下角弹出 toast（src/components/ToastContainer.tsx）

### AI SSE 事件格式

```
event: content_chunk\ndata: {"text":"..."}
event: tool_call\ndata: {"id":"...","name":"list_characters","arguments":{}}
event: tool_result\ndata: {"id":"...","name":"list_characters","result":[...]}
event: task_end\ndata: {"success":true,...}
```

---

## 重要文件

| 路径 | 说明 |
|---|---|
| `server/index.js` | Express 入口，AI 路由，系统提示词 |
| `server/tools.js` | 25+ AI 工具定义 + 执行器 |
| `server/ai-adapter.js` | OpenAI/Claude 适配器 |
| `server/routes/api.js` | 全部 REST API 路由 |
| `server/test-tools.js` | 工具集成测试（40项） |
| `server/db.js` | SQLite 数据库层 |
| `server/seed.js` | 种子数据 |
| `src/components/AIPanel.tsx` | AI 面板（聊天/创作、工具链、通知） |
| `src/components/Sidebar.tsx` | 侧边栏（章节状态 badge 可点击） |
| `src/components/EditorStatusbar.tsx` | 编辑器状态栏（状态切换） |
| `src/components/ToastContainer.tsx` | Toast 通知组件 |
| `src/stores/useAgentStore.ts` | AI 聊天 store |
| `src/stores/useProjectStore.ts` | 项目 store（含 workflowPhase） |
| `src/lib/api.ts` | API 客户端 |
| `docs/system-prompt-writing.md` | 创作模式提示词文档 |
| `docs/system-prompt-chat.md` | 对话模式提示词文档 |
