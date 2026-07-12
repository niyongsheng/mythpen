# CLAUDE.md — Mythpen

**AI 辅助小说创作桌面端** — Tauri v2 + Express 5 + React 19

---

## 快速命令

| 命令 | 作用 |
|---|---|
| `pnpm dev:all` | 前端(5173) + 后端(3001) + 种子数据 |
| `pnpm dev` | 仅前端 |
| `pnpm dev:server` | 仅后端（nodemon 热重载） |
| `pnpm seed` | 初始化种子数据 |
| `pnpm build` | 构建前端 |
| `pnpm lint` | Biome 检查 |
| `pnpm tauri build` | 构建桌面安装包 |
| `node server/test-tools.js` | AI 工具集成测试（40项） |

> 类型检查见下方 **TypeScript** 章节。

---

## 后端 (server/)

Express 5，`/api` 路由在 `routes/api.js`。

| 文件 | 职责 |
|---|---|
| `index.js` | 入口 + AI 路由（chat/stream/continue） |
| `db.js` | SQLite：全局 config.db + 每项目独立库 |
| `routes/api.js` | 全部 REST CRUD |
| `tools.js` | 25+ AI 工具 + `executeTool` 引擎 |
| `ai-adapter.js` | OpenAI / Claude 双适配器，自动检测 |
| `prompts/writing.js` | 写作模式：六步工作流 |
| `prompts/collab.js` | 共创模式：四步工作流 |
| `prompts/context.js` | 项目上下文构建 |

---

## 前端 (src/)

- **React 19** + TypeScript + Vite + Tailwind 4
- **Zustand** 状态管理（7 stores）
- **页面路由**：`App.tsx` → `PAGES` 映射表 → `useSidebarStore.activePage` 控制显隐
- **路径别名**：`@/` → `src/`
- **i18n**：自实现 `t(path, params)`，`zh.json` / `en.json`
- **富文本编辑器**：contentEditable + document.execCommand，标记 `**粗体**` `*斜体*` `__下划线__`

---

## 数据库

- **位置**：`~/.mythpen/`
- `config.db` → 全局设置、最近项目
- `projects/<名>.mythpen.db` → 每项目独立库（chapters/volumes/characters/world/foreshadows/relations/memories/timeline/chat/tokens 等）

---

## AI 功能

| 模式 | 工作流 | 文件 |
|---|---|---|
| 写作 `writing` | 了解→读大纲→创作→润色→审稿→定稿 | `prompts/writing.js` |
| 共创 `collab` | 设定共创→分卷规划→前三章交付→交接写作 | `prompts/collab.js` |

- **双 Provider**：OpenAI-compatible / Claude，自动检测
- **工具循环**：8 轮上限，tool_calls → 执行 → 喂回
- **续写**：POST `/api/ai/continue`，取最后 1500 字符上下文，流式生成后自动保存
- **章节状态**：`pending → writing → review → accepted`
- **叙事维度**：每章 5 字段 — cognitive_frame / emotional_anchor / world_texture / concrete_mystery / interpersonal_tension

---

## TypeScript

### 全量检查（推荐这样跑）
```bash
pnpm tsc --project tsconfig.app.json --noEmit   # 检查全部 src/ 文件
pnpm lint                                         # Biome 代码风格
```

### 常见坑点

> **黄金规则**：见到 `'xxx' on type 'never'` → 90% 是 `useState(null)` 或 `useRef(null)` 没加泛型。

| 写法 | 问题 | 修正 |
|---|---|---|
| `useRef(null)` | `ref.current` 永为 `null`，赋值报 TS2322 | `useRef<AbortController\|null>(null)` |
| `useRef(null)` | `ref.current?.scrollIntoView()` 报 TS2339 | `useRef<HTMLDivElement\|null>(null)` |
| `useState(null)` | `selected.name` 全部 TS2339 on `never` | `useState<Character\|null>(null)` |
| `useApiData(fetcher)` | 下游 `data.xxx` 全为 `never` | `useApiData<T>(fetcher)` 加泛型 |
| `tsc --noEmit` 根配置 | 漏检大量文件 | 用 `--project tsconfig.app.json` |

批量修 Tailwind v4 语法：
```bash
pnpm biome check --write --unsafe src/
```

---

## 发布新版本

通过 `/mythpen-release` 技能执行发布流程。
