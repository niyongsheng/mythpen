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

## 项目结构

```
mythpen/
├── server/              # Express 后端
│   ├── index.js         # 入口 + AI 路由
│   ├── db.js            # SQLite 层
│   ├── routes/api.js    # 全部 REST CRUD
│   ├── tools.js         # 25+ AI 工具 + executeTool
│   ├── ai-adapter.js    # OpenAI / Claude 适配
│   └── prompts/         # 写作/共创/上下文 提示词
├── src/                 # React 前端
│   ├── components/      # UI 组件
│   ├── pages/           # 各功能页面
│   ├── stores/          # Zustand 状态管理 (7 stores)
│   ├── lib/             # API 客户端 + 数据 hooks
│   ├── hooks/           # 通用 hooks
│   ├── types/index.ts   # 类型定义
│   └── i18n/            # 中英文翻译
├── src-tauri/           # Tauri 桌面壳
├── .github/workflows/   # CI
└── CLAUDE.md
```

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

### SSE 事件（AI 流式）

```json
event: content_chunk   data: {"text":"..."}
event: tool_call       data: {"id":"...","name":"...","arguments":{}}
event: tool_result     data: {"id":"...","name":"...","result":...}
event: task_end        data: {"success":true,...}
```

### 设计系统 (`src/index.css`)

暗/亮双主题 CSS 变量。暗色默认，`html[data-theme="light"]` 切换。
核心令牌：`--canvas` `--ink` `--accent-gold` `--hairline` `--radius-*` `--font-*`

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

```bash
# 1. 更新版本号（三处保持一致）
#    package.json → "version"
#    src-tauri/tauri.conf.json → "version"
#    doc/index.html → const APP_VERSION = 'X.Y.Z'

# 2. 提交并打 tag
git add .
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z        # ← 触发 CI 自动构建+Release

# 3. 等 CI 跑完（~15min），编辑 Release 说明
#    https://github.com/niyongsheng/mythpen/releases
```

**注意：** Tag 必须 `v*` 格式（如 `v0.0.2`）；推送后不要删除重推，会残留空 Release。
产物：macOS → `.dmg` / Windows → `.msi` + `.exe`
