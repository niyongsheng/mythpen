![logo](./logo.svg)

# Mythpen

**AI 辅助小说创作桌面应用** — 管理角色、世界观、章节、伏笔、时间线等创作要素，集成 AI 辅助写作。

## 快速开始

```bash
pnpm install        # 安装依赖
pnpm dev:all        # 浏览器开发（前端 + 后端）
pnpm tauri dev      # 桌面开发模式
pnpm tauri build    # 构建桌面安装包
```

## 技术栈

前端 React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Zustand
桌面 Tauri v2 (Rust)，数据库 SQLite（rusqlite），AI 兼容 OpenAI/DeepSeek/Anthropic

## 许可证

MIT
