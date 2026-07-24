# Mythpen — AI 辅助小说创作桌面软件

## 技术规范文档 v1.0

**版本**: 1.0 · **日期**: 2026-07-06 · **状态**: 发布

---

## 1. 文档概述

本文是 **Mythpen** 的技术规范 v1.0 文档，描述系统当前架构、数据模型、前后端契约及功能边界。本文档基于实际代码生成，反映 **当前实现** 而非设计目标，供开发、维护与迭代使用。

### 1.1 一致性语言

关键词 **MUST / MUST NOT / SHOULD / SHOULD NOT / MAY / OPTIONAL** 遵循 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) 规范。

### 1.2 全局约定

- **主键策略**：
  - 创作要素实体（角色、世界观、伏笔、记忆、设定等）MUST 使用 UUID v4 字符串（`npm:uuid` 生成）
  - 树形/层级表（`volumes`、`chapters`、`token_usage` 等）MAY 使用 `INTEGER AUTOINCREMENT`
  - 两种主键类型不可混用外键引用
- **时间戳**: 所有时间戳 MUST 以 ISO-8601 本地时间格式存储和传输，SQLite 默认 `datetime('now')` 生成
- **文本编码**: 所有文件/内容 MUST 使用 UTF-8 编码
- **国际化**: 支持中英文 UI 语言切换，AI 写作语言为项目级配置

---

## 2. 项目概况

### 2.1 项目定位

Mythpen 是一个**本地优先的 AI 辅助小说创作桌面应用**，帮助作者管理角色、世界观、章节、伏笔、时间线等创作要素，并集成 AI 辅助写作和一致性检查。

### 2.2 核心技术栈

| 层次 | 技术 | 版本 |
|---|---|---|
| **前端框架** | React | ^19.2.7 |
| **前端语言** | TypeScript | ~6.0.2 |
| **构建工具** | Vite | ^8.1.1 |
| **CSS** | Tailwind CSS v4 | ^4.3.2 |
| **状态管理** | Zustand | ^5.0.14 |
| **后端框架** | Express 5 | ^5.2.1 |
| **后端语言** | JavaScript (Node.js) | ES modules |
| **数据库** | SQLite (via better-sqlite3) | ^12.11.1 |
| **AI 集成** | OpenAI-compatible + Anthropic SDK | 双适配器 |
| **包管理** | pnpm | ^10.10.0 |
| **图标** | Lucide React | ^1.23.0 |
| **EPUB 导出** | epub-gen | ^0.1.0 |
| **Markdown** | react-markdown | ^10.1.0 |
| **路由** | react-router-dom | ^7.18.1 |

### 2.3 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    Express 后端 (:3001)                │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ db.js    │  │ tools.js │  │ ai-adapter.js    │   │
│  │ SQLite   │  │ 25+ 工具  │  │ OpenAI / Claude  │   │
│  │ 层       │  │ 执行引擎  │  │ 双适配器          │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │             │                  │              │
│       └─────────────┴──────────────────┘              │
│                      │                                │
│  ┌───────────────────┴──────────────────────────┐    │
│  │            routes/api.js                      │    │
│  │  章节 │ 角色 │ 世界观 │ 伏笔 │ 关系 │ 记忆... │    │
│  └───────────────────┬──────────────────────────┘    │
│                      │                                │
└──────────────────────┼──────────────────────────────┘
                       │ HTTP / SSE
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Vite Dev Server (:5173)              │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ 页面组件   │  │ Component│  │ Zustand Store    │   │
│  │ 12 页面   │  │ 15+ 组件  │  │ 7 个 Store       │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                       │
│  API 代理: /api → localhost:3001                      │
└─────────────────────────────────────────────────────┘
```

### 2.4 与旧架构的对比

当前项目已从最初的 Tauri v2 + Rust 架构重构为纯 Express 架构：

| 维度 | 旧架构 (v0.1 spec) | 当前架构 (v1.0) |
|---|---|---|
| **桌面壳** | Tauri v2 (Rust) | Express 直接运行，前端浏览器访问 |
| **数据库层** | Rust rusqlite + sqlite-vec | Node.js better-sqlite3 |
| **AI 运行时** | Node.js Sidecar + Claude Agent SDK | Express 直连，SSE 流式通信 |
| **前端通信** | Tauri IPC + WebSocket | HTTP 请求 + SSE 事件流 |
| **编辑器** | TipTap (ProseMirror) | contentEditable + document.execCommand |
| **语义搜索** | sqlite-vec 向量检索 | 尚未实现 |
| **AI 工具系统** | Claude Agent SDK 自动循环 | 自实现 8 轮工具调用循环 |
| **导出** | Rust 原生 | Express 服务端 |
| **打包** | Tauri build (.dmg/.msi) | pnpm build + 可选 sidecar |

---

## 3. 系统架构

### 3.1 后端架构 (Express 5)

后端是唯一的业务服务端，运行在 `localhost:3001`，提供全部 REST API 和 AI 流式接口。

#### 3.1.1 核心文件职责

| 文件 | 职责 |
|---|---|
| `server/index.js` | Express 入口、中间件、AI 路由（chat/stream/continue）、配置读取 |
| `server/db.js` | SQLite 数据库层：配置库 + 项目库管理、迁移、查询封装 |
| `server/routes/api.js` | 全部 REST API 路由（CRUD + workflow phase + 聊天 + 导出 + 封面） |
| `server/tools.js` | 25+ AI 工具定义（OpenAI function-calling 格式）+ `executeTool` 执行引擎 |
| `server/ai-adapter.js` | AI 提供商适配器：OpenAI / Claude 双协议，消息格式互转 |
| `server/prompts/writing.js` | 写作模式系统提示（六步工作流） |
| `server/prompts/collab.js` | 共创模式系统提示（四步工作流） |
| `server/prompts/context.js` | 项目上下文构建器（从数据库提取项目状态注入提示词） |
| `server/seed.js` | 种子数据初始化 |
| `server/test-tools.js` | AI 工具集成测试（40 项） |

#### 3.1.2 中间件链

```javascript
app.use(cors());                              // 跨域
app.use(express.json({ limit: '10mb' }));     // JSON 解析，10MB 上限
app.use((req, res, next) => {                 // 请求日志（跳过 AI 流式路径）
  // 记录 method/path/statusCode/duration
});
app.use('/api', apiRoutes);                   // 全部 API 路由
```

#### 3.1.3 AI 路由

| 端点 | 方法 | 功能 | 协议 |
|---|---|---|---|
| `/api/ai/chat` | POST | 非流式 AI 对话 | JSON Response |
| `/api/ai/chat/stream` | POST | 流式 AI 对话 + 工具调用 | SSE |
| `/api/ai/continue` | POST | 续写章节 | SSE |
| `/api/health` | GET | 健康检查 | JSON |

### 3.2 前端架构 (React + Vite)

#### 3.2.1 页面路由系统

前端无传统路由库（虽有 react-router-dom 依赖但未使用其路由功能），而是通过 `useSidebarStore.activePage` 控制页面显隐：

```typescript
// App.tsx - PAGES 映射表
const PAGES: Record<string, React.ReactNode> = {
  'page-dashboard': <Dashboard />,
  'page-writing': <Writing />,
  'page-characters': <Characters />,
  'page-world': <World />,
  'page-outline': <Outline />,
  'page-foreshadow': <Foreshadows />,
  'page-relations': <Relations />,
  'page-export': <ExportPage />,
  'page-science': <Science />,
  'page-memory': <Memory />,
  'page-timeline': <Timeline />,
  'page-consistency': <Consistency />,
}

// 通过 activePage 匹配渲染
{Object.entries(PAGES).map(([id, page]) => (
  <div className={activePage === id ? 'flex' : 'hidden'}>
    {page}
  </div>
))}
```

#### 3.2.2 状态管理 (Zustand)

| Store | 职责 | 持久化 |
|---|---|---|
| `useProjectStore` | 当前项目、项目列表、workflow phase | localStorage (project name) |
| `useChapterStore` | 章节列表、当前章节、首章创建 | 无 |
| `useAgentStore` | AI 聊天消息、会话管理、任务状态 | 无 |
| `useSettingsStore` | 全部应用设置 | localStorage + 服务端 config.db |
| `useSidebarStore` | 侧边栏活跃项、折叠状态 | localStorage |
| `useUIStore` | 面板可见性、尺寸 | localStorage (right panel width) |
| `useChapterStore` | 章节数据 | 服务端 SQLite |

#### 3.2.3 布局结构

```
┌──────────────────────────────────────────────────────────────┐
│  Titlebar (38px) — 自定义标题栏（非 Tauri 原生）              │
├──────────┬───────────────────────────────┬───────────────────┤
│ Sidebar  │     页面内容区域                 │ AIPanel (320px)   │
│ (260px)  │                               │ (可折叠/调整宽度)   │
│          │  ┌─────────────────────────┐  │                   │
│ 项目概览  │  │  当前页面               │  │  AI 对话          │
│ 角色     │  │  - Dashboard           │  │  ├ 会话列表        │
│ 世界观    │  │  - Writing（编辑器）    │  │  ├ 消息历史        │
│ 大纲     │  │  - Characters          │  │  ├ 工具调用展示     │
│ 伏笔     │  │  - World/Foreshadows   │  │  └ 输入框          │
│ 关系     │  │  - Relations/Timeline  │  │                   │
│ 记忆     │  │  - Export/Consistency  │  │                   │
│ 导出     │  │                         │  │                   │
│          │  └─────────────────────────┘  │                   │
├──────────┴───────────────────────────────┴───────────────────┤
│  BottomStatusbar (28px) — 项目统计                           │
└──────────────────────────────────────────────────────────────┘
```

#### 3.2.4 组件树

```
src/
├── App.tsx                     # 根组件：布局 + 页面路由
├── main.tsx                    # 入口
├── index.css                   # Tailwind + 设计令牌
├── components/
│   ├── AIPanel.tsx             # AI 聊天面板（流式、工具调用、会话管理）
│   ├── Sidebar.tsx             # 侧边栏（章节状态 Badge、导航）
│   ├── Titlebar.tsx            # 自定义标题栏
│   ├── BottomStatusbar.tsx     # 底部状态栏
│   ├── EditorContent.tsx       # 富文本编辑器（contentEditable）
│   ├── EditorStatusbar.tsx     # 编辑器状态栏
│   ├── NewProjectDialog.tsx    # 新建项目对话框
│   ├── SettingsDrawer.tsx      # 设置抽屉
│   ├── ToastContainer.tsx      # Toast 通知
│   ├── MarkdownContent.tsx     # Markdown 渲染
│   └── ...                     # 各页面专用组件
├── pages/
│   ├── Dashboard.tsx           # 项目概览/统计
│   ├── Writing.tsx             # 写作主页面
│   ├── Characters.tsx          # 角色管理
│   ├── World.tsx               # 世界观设定
│   ├── Outline.tsx             # 大纲编辑器
│   ├── Foreshadows.tsx         # 伏笔看板
│   ├── Relations.tsx           # 人物关系图
│   ├── Memory.tsx              # 叙事记忆
│   ├── Timeline.tsx            # 时间线
│   ├── Science.tsx             # 科学设定
│   ├── Consistency.tsx         # 一致性检查
│   ├── ExportPage.tsx          # 导出页面
│   ├── ProjectList.tsx         # 项目列表
│   └── SettingsPage.tsx        # 设置页面（未使用，由 SettingsDrawer 替代）
├── stores/                     # Zustand stores
├── lib/
│   ├── api.ts                  # HTTP API 客户端 + SSE 读取器
│   └── ...                     # 工具函数
├── hooks/                      # 自定义 hooks
├── i18n/
│   ├── index.ts                # i18n 核心（t() 函数）
│   ├── zh.json                 # 中文翻译
│   └── en.json                 # 英文翻译
└── types/
    └── index.ts                # 全部 TypeScript 类型定义
```

### 3.3 通信契约

全部通信通过 HTTP 进行：

```
前端 → 后端（常规请求）:
  fetch('/api/projects')                 → REST JSON API
  fetch('/api/:project/chapters')        → REST JSON CRUD

前端 → 后端（流式 AI）:
  POST /api/ai/chat/stream              → SSE 事件流（content_chunk / tool_call / tool_result / task_end）
  POST /api/ai/continue                 → SSE 事件流（content_chunk / task_end）

前端 → 后端（设置同步）:
  PUT /api/settings                     → 单键设置更新

Vite Dev Proxy:
  /api/*                                → 代理到 localhost:3001
```

#### 3.3.1 SSE 事件格式

```
event: content_chunk\ndata: {"text":"..."}       # AI 生成文本片段
event: tool_call\ndata: {"id":"...","name":"...","arguments":{}}  # AI 调用工具
event: tool_result\ndata: {"id":"...","name":"...","result":{}}   # 工具执行结果
event: task_end\ndata: {"success":true,"content":"...","inputTokens":0,"outputTokens":0}  # 任务结束
event: error\ndata: {"error":"..."}               # 错误事件
event: task_error\ndata: {"error":"..."}          # 任务异常结束
```

---

## 4. 数据模型

### 4.1 存储架构

```
~/.mythpen/                              # 应用数据根目录
│
├── config.db                            # 全局配置 (SQLite)
│   ├── app_settings     — 键/值配置表
│   ├── recent_projects  — 最近项目列表
│   └── editor_snapshots — 编辑器快照（崩溃恢复）
│
├── projects/                            # 项目数据库目录
│   ├── {project_name}.mythpen.db        # 每个项目独立 SQLite 文件
│   └── ...
│
├── exports/                             # 导出缓存
│   └── {project_name}/                  # 导出文件（TXT/MD/EPUB/HTML）
│
└── backups/                             # 自动备份目录（功能预留）
```

### 4.2 配置数据库 Schema (config.db)

```sql
-- 应用设置（键值对）
CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY,   -- 'api_key', 'api_base_url', 'api_model', 'ui_language', etc.
    value TEXT NOT NULL
);

-- 最近项目列表
CREATE TABLE recent_projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    file_path   TEXT NOT NULL UNIQUE,
    last_opened TEXT NOT NULL DEFAULT (datetime('now')),
    word_count  INTEGER DEFAULT 0
);

-- 编辑器快照（崩溃恢复）
CREATE TABLE editor_snapshots (
    project_path TEXT PRIMARY KEY,
    chapter_num  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    cursor_pos   INTEGER,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**默认设置种子**：

| key | 默认值 |
|---|---|
| `api_key` | `''`（空，由环境变量 DEEPSEEK_KEY 兜底） |
| `api_base_url` | `https://api.deepseek.com/v1` |
| `api_model` | `deepseek-v4-flash` |
| `ui_language` | `zh` |
| `theme` | `dark` |
| `editor_font_size` | `17` |
| `editor_font_family` | `'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, serif` |
| `auto_save_interval` | `30` |
| `backup_enabled` | `true` |
| `accent_color` | `#c9a96e` |

### 4.3 项目数据库 Schema ({project}.mythpen.db)

每个项目独立的 SQLite 数据库，包含以下表：

#### 4.3.1 元数据

```sql
-- 项目级键值元数据
CREATE TABLE project_meta (
    key   TEXT PRIMARY KEY,  -- 'name', 'description', 'mode', 'language', 'workflow_phase', etc.
    value TEXT NOT NULL
);
```

**project_meta 键集合**：

| key | 类型 | 说明 |
|---|---|---|
| `name` | string | 项目名称 |
| `description` | string | 项目简介 |
| `mode` | `'short-story' | 'medium-novel' | 'long-novel'` | 篇幅模式 |
| `language` | `'zh' | 'en'` | 写作语言 |
| `version` | string | 数据库版本 |
| `created_at` | ISO string | 创建时间 |
| `updated_at` | ISO string | 更新时间 |
| `word_count` | string (number) | 总字数 |
| `author_name` | string | 作者名 |
| `workflow_phase` | `'idea' | 'setting' | 'outline' | 'writing' | 'review' | 'consistency' | 'export'` | 当前阶段 |
| `cover_mime` | string | 封面图片 MIME 类型 |
| `cover_ext` | string | 封面图片扩展名 |

#### 4.3.2 项目类型标签

```sql
CREATE TABLE project_genres (
    genre TEXT PRIMARY KEY  -- 'sci-fi', 'fantasy', 'romance', 'history', 'urban', 'power-fantasy', 'biography', 'other'
);
```

#### 4.3.3 创作要素表

**卷 (Volumes)**

```sql
CREATE TABLE volumes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sort_order INTEGER NOT NULL,
    title      TEXT NOT NULL,
    summary    TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**章节 (Chapters)**

```sql
CREATE TABLE chapters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    volume_id   INTEGER REFERENCES volumes(id) ON DELETE CASCADE,
    num         INTEGER NOT NULL,                    -- 章节编号
    title       TEXT NOT NULL,
    outline     TEXT DEFAULT '',
    content     TEXT DEFAULT '',
    summary     TEXT DEFAULT '',
    word_count  INTEGER DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','writing','review','accepted')),
    cognitive_frame   TEXT DEFAULT '',
    emotional_anchor  TEXT DEFAULT '',
    world_texture     TEXT DEFAULT '',
    concrete_mystery  TEXT DEFAULT '',
    interpersonal_tension TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(volume_id, num)
);
```

**章节状态流转**：

```
pending(待办) → writing(写作中) → review(审阅中) → accepted(已完成)
```

**五维叙事维度**（每章独立字段）：

| 字段 | 含义 |
|---|---|
| `cognitive_frame` | 认知框架 — 角色的认知变化 |
| `emotional_anchor` | 情感锚点 — 章节的情感基调 |
| `world_texture` | 世界质感 — 场景氛围与细节 |
| `concrete_mystery` | 具体悬念 — 本章埋下或推进的谜团 |
| `interpersonal_tension` | 人际张力 — 角色间的冲突与张力 |

**角色 (Characters)**

```sql
CREATE TABLE characters (
    id          TEXT PRIMARY KEY,    -- UUID
    name        TEXT NOT NULL UNIQUE,
    age         TEXT DEFAULT '',
    gender      TEXT DEFAULT '',
    appearance  TEXT DEFAULT '',
    personality TEXT DEFAULT '',
    background  TEXT DEFAULT '',
    motivation  TEXT DEFAULT '',
    arc         TEXT DEFAULT '',
    ext_markers TEXT DEFAULT '',
    avatar      TEXT DEFAULT '',
    notes       TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chapter_characters (
    chapter_id   INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
    role         TEXT DEFAULT 'appears'
                     CHECK (role IN ('appears','speaks','pov','mentioned')),
    PRIMARY KEY (chapter_id, character_id)
);
```

**世界观条目 (World Entries)**

```sql
CREATE TABLE world_entries (
    id          TEXT PRIMARY KEY,     -- UUID
    category    TEXT NOT NULL,        -- 'location', 'organization', 'concept', 'event'
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags        TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**伏笔 (Foreshadows)**

```sql
CREATE TABLE foreshadows (
    id               TEXT PRIMARY KEY,    -- UUID
    title            TEXT NOT NULL,
    description      TEXT DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'planted'
                         CHECK (status IN ('planted','progressing','resolved','abandoned')),
    planted_chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    expected_resolve_chapter INTEGER,
    resolved_chapter_id   INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    priority         TEXT DEFAULT 'normal'
                         CHECK (priority IN ('low','normal','high')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**伏笔状态流转**：

```
planted(已埋) → progressing(发展中) → resolved(已揭晓)
                                     → abandoned(已废弃)
```

**角色关系 (Character Relations)**

```sql
CREATE TABLE character_relations (
    id              TEXT PRIMARY KEY,     -- UUID
    character_a_id  TEXT REFERENCES characters(id) ON DELETE CASCADE,
    character_b_id  TEXT REFERENCES characters(id) ON DELETE CASCADE,
    relation_type   TEXT NOT NULL,
    description     TEXT DEFAULT '',
    intensity       INTEGER DEFAULT 3,
    started_at      TEXT DEFAULT '',
    ended_at        TEXT DEFAULT '',
    layout_x        REAL,                  -- 关系图谱手动布局坐标
    layout_y        REAL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**叙事记忆 (Memories)**

```sql
CREATE TABLE memories (
    id          TEXT PRIMARY KEY,     -- UUID
    category    TEXT NOT NULL
                    CHECK (category IN ('character','location','item','event','promise','other')),
    content     TEXT NOT NULL,
    source_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**时间线事件 (Timeline Events)**

```sql
CREATE TABLE timeline_events (
    id          TEXT PRIMARY KEY,     -- UUID
    year        TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    importance  INTEGER DEFAULT 3,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**科幻设定 (Science Entries)**

```sql
CREATE TABLE science_entries (
    id          TEXT PRIMARY KEY,     -- UUID
    label       TEXT NOT NULL
                    CHECK (label IN ('known','extrapolation','hypothesis')),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    "references"  TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**线索板 (Clue Board)**

```sql
CREATE TABLE clue_board (
    id               TEXT PRIMARY KEY,     -- UUID
    title            TEXT NOT NULL,
    description      TEXT DEFAULT '',
    kind             TEXT DEFAULT ''
                         CHECK (kind IN ('clue','red-herring','deduction','question')),
    related_chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    resolved         INTEGER NOT NULL DEFAULT 0,
    resolved_at      TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 4.3.4 侧边栏定义

```sql
CREATE TABLE sidebar_items (
    id         TEXT PRIMARY KEY,
    label_key  TEXT NOT NULL,           -- i18n key
    icon       TEXT NOT NULL,           -- Lucide icon name
    category   TEXT NOT NULL
                   CHECK (category IN ('universal','genre','optional')),
    genres     TEXT DEFAULT '',         -- 逗号分隔的类型列表
    sort_order INTEGER NOT NULL,
    route      TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1
);
```

**默认侧边栏条目**：

| id | label_key | icon | category | genres | 序号 |
|---|---|---|---|---|---|
| dashboard | sidebar.dashboard | LayoutDashboard | universal | — | 1 |
| characters | sidebar.characters | Users | universal | — | 2 |
| world | sidebar.world | Globe | universal | — | 3 |
| science | sidebar.science | FlaskConical | genre | sci-fi | 4 |
| outline_page | sidebar.outline_page | ScrollText | universal | — | 5 |
| foreshadow | sidebar.foreshadow | Link2 | universal | — | 6 |
| memory | sidebar.memory | Brain | universal | — | 7 |
| relations | sidebar.relations | HeartHandshake | universal | — | 8 |
| timeline | sidebar.timeline | CalendarDays | universal | — | 9 |
| consistency | sidebar.consistency | ShieldCheck | universal | — | 10 |
| export | sidebar.export | Download | universal | — | 11 |

#### 4.3.5 日志和统计

```sql
CREATE TABLE token_usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name     TEXT NOT NULL,          -- 'chat', 'stream_chat', 'continue'
    chapter_num   INTEGER,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    context_tokens INTEGER,
    model         TEXT DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_sessions (
    id         TEXT PRIMARY KEY,          -- UUID
    title      TEXT NOT NULL DEFAULT '新对话',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
    id         TEXT PRIMARY KEY,          -- UUID
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'ai', 'system')),
    content    TEXT NOT NULL,
    tool_calls TEXT DEFAULT '[]',         -- JSON 数组
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 4.3.6 索引

```sql
CREATE INDEX idx_chapters_status ON chapters(status);
CREATE INDEX idx_chapters_volume ON chapters(volume_id, num);
CREATE INDEX idx_chapters_order ON chapters(num);
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_foreshadows_status ON foreshadows(status);
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
```

---

## 5. 用户界面

### 5.1 设计系统

#### 5.1.1 色彩系统

设计令牌定义在 `src/index.css` 的 `:root` 中，统一通过 CSS 变量访问。

**暗色主题（默认）**：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--canvas` | `#0e0e10` | 主背景 |
| `--canvas-soft` | `#161618` | 次级背景 |
| `--canvas-card` | `#1a1a1e` | 卡片/面板 |
| `--canvas-elevated` | `#202024` | 凸起表面 |
| `--canvas-mid` | `#2a2a30` | 中灰背景（分隔线/次要区域） |
| `--canvas-pop` | `#323238` | 弹出层/悬停 |
| `--hairline` | `#26262b` | 分割线 |
| `--ink` | `#f0eee6` | 主文字 |
| `--ink-secondary` | `#c8c6be` | 二级文字 |
| `--ink-tertiary` | `#8a8880` | 三级/次要文字 |
| `--ink-mute` | `#5e5c56` | 禁用/占位文字 |
| `--accent-gold` | `#c9a96e` | 主强调色 |
| `--accent-gold-soft` | `#e8d5a3` | 强调色悬停 |
| `--accent-ember` | `#d4743c` | 暖色强调（负面/警告关系） |
| `--accent-mist` | `#7a8ea8` | 冷色强调（配角/中性关系） |
| `--success` | `#4caf7d` | 成功状态 |
| `--warning` | `#d4a040` | 警告状态 |
| `--error` | `#c84a4a` | 错误状态 |
| `--info` | `#6090c0` | 信息状态 |

#### 5.1.2 字体系统

| 令牌 | 字体栈 | 用途 |
|---|---|---|
| `--font-display` | Instrument Serif, Noto Serif SC, Georgia | 大标题/展示文字 |
| `--font-editor` | Noto Serif SC, Source Han Serif SC, STSong, Georgia | 编辑器正文 |
| `--font-sans` | Inter, Noto Sans SC, system-ui | 界面文字 |
| `--font-mono` | JetBrains Mono, SF Mono, Fira Code | 代码/数字 |

#### 5.1.3 间距和尺寸

| 令牌 | 值 | 用途 |
|---|---|---|
| `--sidebar-w` | `260px` | 侧边栏宽度 |
| `--right-panel-w` | `320px` | AI 面板宽度 |
| `--titlebar-h` | `38px` | 标题栏高度 |
| `--statusbar-h` | `28px` | 状态栏高度 |
| `--editor-max-w` | `720px` | 编辑器最大宽度 |

#### 5.1.4 圆角

| 令牌 | 值 |
|---|---|
| `--radius-xs` | `4px` |
| `--radius-sm` | `6px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |
| `--radius-xl` | `16px` |
| `--radius-pill` | `9999px` |

### 5.2 页面功能

| 页面 | 组件 | 说明 |
|---|---|---|
| **项目列表** | `ProjectList` | 初始页：显示所有项目，支持新建/删除 |
| **项目概览** | `Dashboard` | 主仪表盘：统计卡片、写作进度、章节列表、阶段推进 |
| **写作** | `Writing` | 核心编辑页：章节选择、富文本编辑器、大纲编辑、续写功能 |
| **角色管理** | `Characters` | 角色 CRUD、角色卡编辑、角色列表 |
| **世界观** | `World` | 按类别（地点/组织/概念/事件）分组的世界观条目 CRUD |
| **大纲** | `Outline` | 章节概要编辑器，五维维度编辑 |
| **伏笔管理** | `Foreshadows` | 按状态筛选的伏笔看板，CRUD |
| **人物关系** | `Relations` | 力导向关系图谱，节点拖拽，关系 CRUD |
| **叙事记忆** | `Memory` | 按分类的记忆列表，搜索，CRUD |
| **年表** | `Timeline` | 按时间排序的事件列表，CRUD |
| **科学设定** | `Science` | 三色标签（已知/外推/假设）分类的科幻设定 CRUD |
| **一致性检查** | `Consistency` | 冲突/时间线/伏笔/科学设定的一致性扫描 |
| **导出** | `ExportPage` | 导出为 TXT/MD/HTML/EPUB 格式，含封面选项 |

### 5.3 编辑器

编辑器使用 contentEditable + `document.execCommand`，非 TipTap/ProseMirror：

- **标记文本**：`**粗体**`、`*斜体*`、`__下划线__`
- **对话样式**：`.dialogue` 类，左边框 + 斜体
- **代码块**：`<pre><code>` 结构
- **续写功能**：AI 生成内容通过 SSE 流式注入编辑器
- **自动保存**：每 30 秒自动保存内容到服务端
- **状态切换**：编辑器状态栏可点击切换章节状态（pending→writing→review→accepted）

### 5.4 关系图谱

关系图谱使用前端 Canvas 自研实现（非 d3-force 直接依赖）：

- **节点**：圆形，直径反映出场章节数
- **颜色**：金色 = 主角、蓝色 = 配角、灰色 = 客串
- **连线**：粗细反映关系强度，颜色区分正向/负向/中性
- **布局**：力导向模拟，用户可拖拽固定节点
- **交互**：点击节点查看详情、悬停显示关系标签

---

## 6. 写作工作流

### 6.1 项目阶段 (7 阶段)

```
选题(idea) → 设定(setting) → 大纲(outline) → 写作(writing) → 审阅(review) → 一致性(consistency) → 导出(export)
```

- 存储在 `project_meta.workflow_phase` 字段中
- Dashboard 页面有阶段进度条和推进按钮
- 支持手动阶段推进，部分阶段有自动检测条件

### 6.2 AI 写作模式

#### 6.2.1 写作模式 (Writing Mode)

六步工作流，系统提示定义在 `server/prompts/writing.js`：

```
第零步 · 检查未完成章节    → list_chapters 检查状态
第一步 · 了解项目           → list_characters / list_foreshadows / list_volumes
第二步 · 检查并准备大纲     → get_chapter / update_chapter (outline)
第三步 · 创作              → update_chapter (content, status='writing')
第四步 · 润色              → 重新读取并优化语言
第五步 · 审稿              → 对照约束规则检查
第六步 · 定稿              → update_chapter (status='accepted')
```

#### 6.2.2 共创模式 (Collab Mode)

四步工作流，系统提示定义在 `server/prompts/collab.js`：

```
第一步 · 设定共创   → 讨论并写入角色/世界观/伏笔等
第二步 · 分卷规划   → 确定卷结构和名称
第三步 · 前三章交付 → 快速交付第1-3章
第四步 · 交接写作   → 推进阶段到 writing
```

#### 6.2.3 续写功能 (Continue Writing)

POST `/api/ai/continue`：
- 读取最后 ~1500 字符作为上下文
- AI 流式生成续写内容
- 自动追加到数据库章节
- 自动更新字数和状态

### 6.3 项目上下文构建

`server/prompts/context.js` 中的 `buildProjectContext()` 从数据库提取：

```
项目: {name}
模式: {mode}
写作语言: {language}
当前阶段: {workflow_phase}
当前总字数: {word_count}

角色列表:
- {角色名}（{年龄}岁，{性别}）：{性格} {背景}

章节概览:
  [{status}] 第{num}章 {title} - {outline}

活跃伏笔:
  [{priority}] {title}：{description}
```

### 6.4 AI 工具系统

#### 6.4.1 工具定义

25+ 工具以 OpenAI function-calling 格式定义在 `server/tools.js`，通过多轮循环执行（最多 8 轮）：

| 类别 | 工具 | 数量 |
|---|---|---|
| **章节** | list/get/create/update/delete_chapter | 5 |
| **卷** | list/create/update/delete_volume | 4 |
| **角色** | list/get/create/update/delete_character | 5 |
| **世界观** | list/create/update/delete_world_entry | 4 |
| **科幻** | list/create/delete_science_entry | 3 |
| **伏笔** | list/create/update/delete_foreshadow | 4 |
| **关系** | list/create/update/delete_relation | 4 |
| **记忆** | list/create/update/delete_memory | 4 |
| **时间线** | list/create/update/delete_timeline_event | 4 |
| **章节角色** | list/set/remove_chapter_character | 3 |
| **线索板** | list/create/update/delete_clue | 4 |
| **统计** | get_stats | 1 |
| **阶段** | update_project_phase | 1 |

#### 6.4.2 工具执行循环

```
POST /api/ai/chat/stream
  → 发送 system prompt + messages 到 AI provider
  → 解析响应：
     ├── content_chunk → SSE 发送 text
     ├── tool_calls → 执行 executeTool() → tool_result → 继续下一轮
     └── 无 tool_calls + 有 content → 结束
  → 最多 8 轮工具调用
  → 记录 token 用量到 token_usage 表
  → SSE task_end 事件
```

#### 6.4.3 AI 适配器

`server/ai-adapter.js` 支持两种 Provider：

| Provider | 协议 | 适用模型 |
|---|---|---|
| `OpenAIProvider` | POST /chat/completions | DeepSeek、OpenAI、通义千问等 |
| `ClaudeProvider` | Anthropic SDK | Claude 系列 |

**自动检测逻辑**：`apiType` 配置优先 → 模型名前缀 heuristic（`claude` / `anthropic/` → Claude）。

**消息格式转换**：
- OpenAI ↔ Claude tool_calls 格式互转
- tool_result 消息格式适配
- role 映射（system/history/tool）

#### 6.4.4 AI 配置

从 `config.db` 的 `app_settings` 表读取：

| 键 | 类型 | 说明 |
|---|---|---|
| `api_base_url` | string | API 端点地址 |
| `api_key` | string | API 密钥 |
| `api_model` | string | 模型名称 |
| `api_type` | `'openai' | 'claude'` | API 类型 |

前端存储有更丰富的多提供商密钥管理（`apiKeyDeepseek`、`apiKeyAnthropic`、`apiKeyOpenai` 等），但后端仅有一个统一的 `api_key` 槽位。

---

## 7. REST API 参考

### 7.1 项目

| 方法 | 路径 | 功能 | 状态码 |
|---|---|---|---|
| `GET` | `/api/projects` | 列出所有项目 | 200 |
| `POST` | `/api/projects` | 创建项目 | 201 |
| `GET` | `/api/projects/:name` | 获取项目元数据 | 200/404 |
| `DELETE` | `/api/projects/:name` | 删除项目 | 200/404 |

### 7.2 章节和卷

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/:project/chapters` | 列出所有章节 |
| `GET` | `/:project/chapters/:num` | 获取指定章节 |
| `PUT` | `/:project/chapters/:num` | 更新章节 |
| `POST` | `/:project/chapters` | 创建章节 |
| `DELETE` | `/:project/chapters/:num` | 删除章节 |
| `GET` | `/:project/volumes` | 列出所有卷（含章节） |
| `POST` | `/:project/volumes` | 创建卷 |
| `PUT` | `/:project/volumes/:id` | 更新卷 |
| `DELETE` | `/:project/volumes/:id` | 删除卷 |

### 7.3 创作要素

| 实体 | GET (列表) | GET (详情) | POST (创建) | PUT (更新) | DELETE (删除) |
|---|---|---|---|---|---|
| 角色 | `/:project/characters` | `/:project/characters/:id` | `/:project/characters` | `/:project/characters/:id` | `/:project/characters/:id` |
| 世界观 | `/:project/world` | — | `/:project/world` | `/:project/world/:id` | `/:project/world/:id` |
| 科幻 | `/:project/science` | — | `/:project/science` | — | `/:project/science/:id` |
| 伏笔 | `/:project/foreshadows` | — | `/:project/foreshadows` | — | — |
| 关系 | `/:project/relations` | — | `/:project/relations` | `/:project/relations/:id` | `/:project/relations/:id` |
| 记忆 | `/:project/memories` | — | `/:project/memories` | `/:project/memories/:id` | `/:project/memories/:id` |
| 时间线 | `/:project/timeline` | — | `/:project/timeline` | `/:project/timeline/:id` | `/:project/timeline/:id` |

### 7.4 特殊端点

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/:project/sidebar-items` | 获取侧边栏条目（按类型过滤） |
| `GET` | `/:project/meta` | 获取项目元数据 |
| `GET` | `/:project/workflow/phase` | 获取当前工作阶段 |
| `PUT` | `/:project/workflow/phase` | 设置工作阶段 |
| `GET` | `/:project/stats` | 项目统计数据 |
| `GET` | `/:project/tokens` | Token 用量历史 |
| `POST` | `/:project/cover` | 上传封面 |
| `GET` | `/:project/cover` | 获取封面图片 |
| `DELETE` | `/:project/cover` | 删除封面 |
| `GET` | `/:project/export` | 导出项目 |
| `POST` | `/:project/memories/search` | 记忆搜索 |
| `GET` | `/settings` | 获取设置 |
| `PUT` | `/settings` | 更新设置项 |

### 7.5 聊天/消息

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/:project/chat/sessions` | 列出聊天会话 |
| `POST` | `/:project/chat/sessions` | 创建会话 |
| `PUT` | `/:project/chat/sessions/:id` | 更新会话标题 |
| `DELETE` | `/:project/chat/sessions/:id` | 删除会话（含消息） |
| `GET` | `/:project/chat/messages` | 查询消息（按 session_id 过滤） |
| `POST` | `/:project/chat/messages` | 保存消息 |

---

## 8. 国际化 (i18n)

### 8.1 架构

轻量级 i18n 实现，无外部依赖：

```typescript
// src/i18n/index.ts — 导出 t(path, params) 函数
t('editor.wordCount', { count: 42 })  // → "42 字"
```

- 翻译文件：`zh.json`（中文，默认）、`en.json`（英文）
- 语言切换即时生效，写入 localStorage 和服务端
- 所有 UI 文本 MUST 通过 `t()` 函数引用

### 8.2 语言包结构

```
{
  "app": { "name": "Mythpen", "tagline": "..." },
  "titlebar": { "projects": "管理所有项目", "settings": "设置" },
  "sidebar": { "dashboard": "项目概览", ... },
  "editor": { "continue": "续写", ... },
  "status": { "pending": "待办", ... },
  "ai": { "chat": "AI 对话", ... },
  "project": { "list": "我的项目", ... },
  "settings": { "title": "设置", ... },
  "pages": { "characters": "角色管理", ... }
}
```

### 8.3 双维度语言模型

| 维度 | 存储位置 | 描述 |
|---|---|---|
| UI 语言 | localStorage + `config.db` | 界面文字语言 |
| 写作语言 | `project_meta.language` | AI 生成内容语言 |

---

## 9. 导出系统

### 9.1 支持的格式

| 格式 | MIME | 特性 |
|---|---|---|
| TXT | `text/plain; charset=utf-8` | 纯文本，章节分隔线 |
| Markdown | `text/markdown; charset=utf-8` | 含封面 Base64 嵌入 |
| HTML | `text/html; charset=utf-8` | 含封面 + 目录 + 打印样式（可存为PDF） |
| EPUB | `application/epub+zip` | 标准电子书，支持封面和分卷 |

### 9.2 导出流程

```
GET /:project/export?format=epub&download=1
  → 读取数据库 chapters + volumes + meta
  → 查找封面图片
  → 按格式处理
    ├── EPUB: epub-gen 构建，可下载或返回路径
    ├── HTML: 内联封面 CSS 样式，分页支持
    ├── Markdown: Base64 封面 + 章节
    └── TXT: 纯文本拼接
  → 写入 ~/.mythpen/exports/{project}/
  → 记录到 exports 表（任选）
  → 返回 filePath / 直接下载
```

### 9.3 统计端点

`GET /:project/stats` 返回：

| 字段 | 类型 | 说明 |
|---|---|---|
| `totalWords` | number | 总字数 |
| `chapterCount` | number | 章节数 |
| `acceptedCount` | number | 已完成章节数 |
| `characterCount` | number | 角色数 |
| `foreshadowCount` | number | 伏笔总数 |
| `resolvedForeshadow` | number | 已揭晓伏笔数 |
| `overdueForeshadow` | number | 超期伏笔数 |
| `worldCount` | number | 世界观条目数 |
| `sciCount` | number | 科幻设定数 |
| `tokenInput` | number | 输入 Token 总量 |
| `tokenOutput` | number | 输出 Token 总量 |
| `currentChapter` | object/null | 当前写作中的章节 |
| `chapters` | array | 各章节概要 |
| `dailyWords` | number[] | 最近 7 日每日字数 |

---

## 10. TypeScript 类型定义

所有类型定义在 `src/types/index.ts`：

### 10.1 核心类型

```typescript
interface ProjectMeta {
  name: string; description: string; mode: string;
  language: string; version: string; createdAt: string;
  updatedAt: string; wordCount: number; authorName: string;
  autoConfirm: boolean; embeddingEnabled: boolean;
}

interface Chapter {
  id: number; volumeId: number; num: number; title: string;
  outline: string; content: string; summary: string;
  wordCount: number; status: 'pending'|'writing'|'review'|'accepted';
  cognitiveFrame: string; emotionalAnchor: string;
  worldTexture: string; concreteMystery: string;
  interpersonalTension: string;
  createdAt: string; updatedAt: string;
}

interface Character {
  id: string; name: string; age: string; gender: string;
  appearance: string; personality: string; background: string;
  motivation: string; arc: string; extMarkers: string;
  avatar: string; notes: string;
  chapterCount?: number; role?: 'major'|'minor'|'extra';
}
```

### 10.2 设置类型

```typescript
interface AppSettings {
  apiKey: string; apiKeyDeepseek: string; apiKeyAnthropic: string;
  apiKeyOpenai: string; apiBaseUrl: string; apiModel: string;
  apiType: 'openai'|'claude'; uiLanguage: 'zh'|'en';
  theme: 'dark'|'light'; editorFontSize: number;
  editorFontFamily: string; autoSaveInterval: number;
  backupEnabled: boolean; accentColor: string;
  maxOutputTokens: number; contextBudget: string;
  httpTimeout: number; compressionEnabled: boolean;
  compressionThreshold: number; compressionTarget: number;
  contextLengthKb: number;
}

type WorkflowPhase = 'idea'|'setting'|'outline'|'writing'|'review'|'consistency'|'export';
```

---

## 11. 非功能性特性

### 11.1 性能规范

| 指标 | 目标 |
|---|---|
| 服务端启动时间 | < 1s |
| 章节查询响应 | < 50ms |
| 编辑器输入延迟 | < 30ms |
| AI 首 Token 延迟 | < 5s |
| 数据库单项目大小 | 100 万字 ~ 10MB |
| 内存占用（空闲） | < 100MB |

### 11.2 错误处理

所有 API 错误格式：

```json
{
  "error": {
    "code": "ERROR_CODE",     // 可选
    "message": "错误描述",
    "recoverable": true       // 是否可恢复
  }
}
```

**错误码规范**：`INVALID_PARAMS` / `DB_NOT_FOUND` / `PROJECT_ALREADY_EXISTS` / `PROJECT_NOT_FOUND`

### 11.3 测试

| 类型 | 文件 | 范围 |
|---|---|---|
| AI 工具集成测试 | `server/test-tools.js` | 40 项，覆盖所有实体 CRUD 生命周期 |
| 种子数据 | `server/seed.js` | 初始化演示数据 |

### 11.4 开发命令

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
node server/test-tools.js # 运行 AI 工具集成测试（40项）
```

---

## 12. 附录

### A. AI 提示词系统

#### A.1 写作模式系统提示结构

```
[角色定义] — "你是一位经验丰富专业的小说创作助手"
[项目上下文] — 由 buildProjectContext() 注入
[章节写作工作流] — 六步工作流说明
[章节状态说明] — 状态流转规则
[章节编号说明] — 跨卷/分卷编号方式
[约束规则] — 语言、情节、角色行为约束
[写作风格] — 语言质感、节奏、对话规范
[使用提示] — 与用户交互的行为指南
[辅助数据更新] — 角色出场/伏笔/记忆/线索板的同步更新规则
[工具使用] — 25+ 工具说明和用途
```

#### A.2 共创模式系统提示结构

```
[角色定义] — "你是一位富有创意的小说创作伙伴"
[项目上下文] — 由 buildProjectContext() 注入
[四步工作流程] — 设定共创 → 分卷规划 → 前三章交付 → 交接写作
[工具使用] — 设定构建核心工具说明
```

### B. 标注文本格式

编辑器使用 contentEditable，标记文本存储格式：

| 标记 | 渲染 |
|---|---|
| `**粗体**` | `<strong>` |
| `*斜体*` | `<em>` |
| `__下划线__` | `<u>` |

### C. 封面存储

项目封面图片存储在 `~/.mythpen/projects/{project_name}/` 目录下，支持格式：PNG、JPEG、WebP、GIF。MIME 类型和扩展名存储在 `project_meta` 中。

### D. 项目创建流程

```
POST /api/projects
  1. 检查项目名称是否重复（文件级）
  2. 创建新的 .mythpen.db 数据库文件
  3. 运行迁移（建表）
  4. 写入 project_meta（名称、模式、语言、时间等）
  5. 创建默认第一卷
  6. 写入项目类型标签
  7. 记录到 config.db 的 recent_projects
  8. 前端自动创建第一章并导航到写作页
```

---

*本文档基于 Mythpen v1.0 实际代码生成，反映了当前系统架构和实现。*
