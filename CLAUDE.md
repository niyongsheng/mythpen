# CLAUDE.md — Mythpen

## AI 功能

| 模式 | 工作流 | 文件 |
|---|---|---|
| 写作 `writing` | 了解→读大纲→创作→润色→审稿→定稿 | `prompts/writing.js` |
| 共创 `collab` | 设定共创→分卷规划→前三章交付→交接写作 | `prompts/collab.js` |
| 导入 `import` | 结构识别→元数据→章节档案→全书归档 | `server/import/pipeline.js` |

- **双 Provider**：OpenAI-compatible / Claude，自动检测
- **工具循环**：120 轮上限，tool_calls → 执行 → 喂回
- **续写/润色**：POST `/api/ai/continue`，取最后 1500 字符上下文，流式生成后自动保存；`mode=polish` 替换整章
- **旧书导入**：POST `/api/projects/import-ai`（SSE），失败或取消不留半成品项目
- **爽点**：power-fantasy 项目的 `payoff_points` 看板 + list/create/update/delete_payoff 工具
- **创作约定**：`project_meta.author_notes`（≤2000 字），Memory 页「创作约定」tab 编辑，注入所有提示词；`update_author_notes` 仅在用户明确要求记住/修改偏好时下发
- **章节状态**：`pending → writing → review → accepted`
- **叙事维度**：每章 6 字段 — cognitive_frame / emotional_anchor / world_texture / concrete_mystery / interpersonal_tension + genre_beat（类型推进，UI 按项目 genres 给提示）

---

## 数据统计（Aptabase）

免费额度 **2 万事件/月（所有安装共享）**，统计范围由构建期档位控制，默认 `basic`：

```bash
VITE_ANALYTICS_LEVEL=basic pnpm tauri build   # minimal | basic | standard | full
```

| 档位 | 事件范围 |
|---|---|
| `minimal`（极简） | 仅原生 app_started / app_exited |
| `basic`（基础，默认） | 项目打开/创建/导入、AI 运行完成、里程碑、更新安装结果 |
| `standard`（标准） | + 章节保存/状态、实体创建、导入导出、AI 细分事件、页面浏览（每屏每会话一次） |
| `full`（完整） | + 每次页面切换、前后台切换、更新提示关闭 |

- 变量只影响前端，必须 export 到构建环境；CI 在 `.github/workflows/build.yml` 的 `env:` 中设置。
- 事件分级表在 `analytics.ts` 的 `EVENT_LEVEL`，新增事件默认归入 `standard`。
- 每档另有本地日上限（basic 30 / standard 150 / full 不限），防止单机刷爆额度。
- 运行时开关：设置 → 隐私 → 匿名使用统计（`settings.anonymousStats`，默认开）。关闭后前端 `track()` 直接返回；Rust 通过 `set_anonymous_stats` 命令把开关落成 app config 目录的标记文件，原生 app_started/app_exited 与桌面 Sentry 一并停止；服务端通过 `anonymous_stats` 设置项控制 `beforeSend`。

---

## 错误监控（Sentry）

统一使用 Sentry 项目 **`mythpen-app`**（三端共用同一个 DSN），只采集 Error Monitoring：

| 运行时 | SDK | 入口 | 启用条件 | `component` tag |
|---|---|---|---|---|
| React 前端 | `@sentry/react` | `src/lib/sentry.ts` + `src/main.tsx` | `import.meta.env.PROD` | `frontend` |
| Express sidecar | `@sentry/node` | `server/instrument.js` | Tauri 传入 `MYTHPEN_ENV=production` | `server` |
| Tauri Rust | `sentry` (Rust) | `src-tauri/src/lib.rs` | release（`!cfg!(debug_assertions)`） | `desktop` |

- 在 Sentry 里用 `component:frontend` / `component:server` / `component:desktop` 过滤；release 名区分 `mythpen@…` 与 `mythpen-server@…`。
- Tauri release 通过 sidecar env 传入 `MYTHPEN_ENV` / `MYTHPEN_VERSION`。
- 隐私：不发送 request body / headers / cookies / user，去掉 console breadcrumbs；错误消息本身仍可能包含项目名或 provider 返回文本。
- 设置 → 隐私的“匿名使用统计”开关同时控制三端 Sentry；关闭后前端 `Sentry.close()`，服务端 `beforeSend` 返回 null，Rust 丢弃 `ClientInitGuard`。
- 测试事件 `MYTHPEN-APP-1` 仍在项目里，可 Resolve/删除。

---

## 编辑器落库

- 输入后按 `auto_save_interval`（默认 30s，0 = 关闭）自动保存；失焦、⌘S、章节状态变更、删章前也会 flush。
- 关闭窗口或 Cmd+Q：前端 `registerExitFlush()` 先 `flushEditorSave()`，再调用 Rust `finish_exit`；Rust 最多等 5s，避免卡死退出。
- 空编辑器只有用户实际编辑过（`isDirty`）才写空章节，避免加载竞态在退出时把已有正文清空。
- 服务端 sql.js 写入按 250ms 批量 flush；`/api/shutdown` 时 `closeAllDatabases()` 强制 flush 后退出。

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
