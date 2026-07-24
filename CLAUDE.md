# CLAUDE.md — Mythpen

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
