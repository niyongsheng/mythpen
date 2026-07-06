# CLAUDE.md

## Mythpen — AI 辅助小说创作

桌面端小说创作应用，集成 AI 辅助写作。基于 Tauri v2 桌面壳 + Express 后端 + React 前端。

## 常用命令

```bash
pnpm install           # 安装依赖
pnpm dev:all           # 前端(5173) + 后端(3001) + 种子数据
pnpm dev               # 仅前端
pnpm dev:server        # 仅后端 (nodemon 热重载)
pnpm seed              # 初始化种子数据
pnpm build             # 构建前端
pnpm typecheck         # TS 类型检查
pnpm lint              # Biome 检查
node server/test-tools.js  # AI 工具集成测试（40项）
pnpm tauri build       # 构建桌面安装包
```

## 后端架构 (server/)

Express 5，`/api` 路由挂载在 `server/routes/api.js`。

| 文件 | 职责 |
|---|---|
| `index.js` | 入口 + AI 路由（chat/stream/continue） |
| `db.js` | SQLite 层（config.db + 项目独立 DB） |
| `routes/api.js` | 全部 REST CRUD |
| `tools.js` | 25+ AI 工具定义 + `executeTool` 引擎 |
| `ai-adapter.js` | OpenAI / Claude 双适配器 |
| `prompts/writing.js` | 写作模式提示词（六步工作流） |
| `prompts/collab.js` | 共创模式提示词（四步工作流） |
| `prompts/context.js` | 项目上下文构建 |

## 前端架构 (src/)

- **React 19** + TypeScript + Vite + Tailwind 4
- **Zustand** 状态管理：7 个 store（`stores/`）
- **页面路由**：`App.tsx` 中 `PAGES` 映射表，`useSidebarStore.activePage` 控制显隐
- **路径别名**：`@/` → `src/`
- **i18n**：自实现 `t(path, params)`，`zh.json` / `en.json`
- **富文本编辑器**：contentEditable + document.execCommand，标记 `**粗体**`、`*斜体*`、`__下划线__`
- **API 客户端**：`src/lib/api.ts`，SSE 事件格式见下方

### SSE 事件格式（AI 流式接口）

```
event: content_chunk\ndata: {"text":"..."}
event: tool_call\ndata: {"id":"...","name":"...","arguments":{}}
event: tool_result\ndata: {"id":"...","name":"...","result":...}
event: task_end\ndata: {"success":true,...}
```

### 设计系统 (`src/index.css`)

暗/亮双主题 CSS 变量。暗色默认，`html[data-theme="light"]` 切换。
关键令牌：`--canvas` / `--ink` / `--accent-gold` / `--hairline` / `--radius-*` / `--font-*`

## 数据库

- **位置**：`~/.mythpen/`
- `config.db`：全局设置（`app_settings`）、最近项目（`recent_projects`）
- `projects/<名>.mythpen.db`：每项目独立库，含 chapters/volumes/characters/world/foreshadows/relations/memories/timeline/chat/tokens 等表

## AI 功能

- **写作模式** (`writing`)：六步工作流（了解→读大纲→创作→润色→审稿→定稿），`server/prompts/writing.js`
- **共创模式** (`collab`)：四步工作流（设定共创→分卷规划→前三章交付→交接写作），`server/prompts/collab.js`
- **双 Provider**：OpenAI-compatible / Claude，`server/ai-adapter.js` 自动检测
- **工具循环**：8 轮上限，每轮 AI 返回 tool_calls → 执行 → 喂回 → 继续
- **续写**：POST `/api/ai/continue`，取最后 1500 字符上下文，流式生成后自动保存

### 工作流阶段

```
选题(idea) → 设定(setting) → 大纲(outline) → 写作(writing) → 审阅(review) → 一致性(consistency) → 导出(export)
```

章节状态：`pending(待办) → writing(写作中) → review(审阅中) → accepted(已完成)`

每章有 5 个叙事维度字段：cognitive_frame / emotional_anchor / world_texture / concrete_mystery / interpersonal_tension

## TypeScript 常见坑点

| 问题 | 症状 | 正确做法 |
|---|---|---|
| `useRef(null)` 缺类型 | `abortRef.current` 一直为 `null`，赋 `AbortController` 报 TS2322 | `useRef<AbortController \| null>(null)` |
| `useRef(null)` 缺类型 | `msgEndRef.current?.scrollIntoView()` 报 TS2339 'never' | `useRef<HTMLDivElement \| null>(null)` |
| `useState(null)` 缺类型 | `selected.name` / `selected.id` 全部 TS2339 on `never` | `useState<Character \| null>(null)` |
| 通用钩子缺泛型 | 下游 `data.xxx` 全部 `never` | `useApiData<T>(fetcher)` + `useStats(): { data: T \| null; ... }` |
| `tsc --noEmit` 用根配置 | 漏掉大量文件层的类型错误 | 用 `tsc --project tsconfig.app.json --noEmit` 全量检查 |

**规则**：见到 `on type 'never'` 的 TS 错误，90% 是 `useState(null)` 或 `useRef(null)` 没加类型参数。

**类型检查命令**：
```bash
pnpm tsc --project tsconfig.app.json --noEmit   # 全量检查（推荐）
pnpm typecheck                                    # 仅根 tsconfig（不完整）
pnpm lint                                         # Biome 代码风格
```

**批量修 Tailwind v4 语法**：
```bash
pnpm biome check --write --unsafe src/
```
