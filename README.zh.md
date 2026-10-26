<p align="center">
  <img src="./logo.svg" alt="Mythpen" width="120" />
</p>

<h1 align="center">Mythpen</h1>

<p align="center">
  <em>AI 辅助小说创作桌面软件 —— 角色管理、世界观构建、章节写作、伏笔追踪、时间线，内置 AI 写作助手。</em>
</p>

<p>
  <a href="https://mythpen.looplooptech.com">官网</a> ·
  <a href="https://mythpen.looplooptech.com/#download">下载</a>
</p>

<p align="center">
  <a href="https://github.com/niyongsheng/mythpen/releases"><img src="https://img.shields.io/github/v/release/niyongsheng/mythpen?style=flat-square&label=Release" alt="Release"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://expressjs.com"><img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="Express"></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="Tauri"></a>
</p>

[English](README.md) &nbsp;|&nbsp; **简体中文**

<p align="center">
  <img alt="demo" src="https://github.com/user-attachments/assets/87ba980c-492b-4bd2-af75-e14faa3cec68" width="80%" style="border-radius: 8px;" />
</p>

# 功能特性

- **AI 写作** — 两种模式：*写作*（六步引导流程）与 *共创*（AI 共同创作）。支持 OpenAI 与 Claude。
- **AI 书籍导入** — 导入现有 TXT/EPUB 文件；模型自动识别分卷与章节，并构建角色、世界观、时间线、伏笔与叙事记忆。
- **爽点看板** — 为爽文项目在 kanban 看板上规划打脸、揭晓与逆袭桥段，由 AI 设计爽点节奏。
- **国际化（i18n）** — 8 种语言的完整界面本地化：简体中文、繁体中文、英语、日语、韩语、法语、西班牙语和俄语。
- **小说管理** — 角色、世界观、章节、伏笔、时间线与人物关系，一站式管理。
- **本地优先** — 数据存储在 `~/.mythpen/` 下的 SQLite 中，无需云端，隐私安全。
- **富文本编辑器** — 支持快捷键加粗、斜体、下划线，章节自动保存到本地。
- **跨平台** — 基于 Tauri v2 的原生桌面体验，同时支持浏览器开发模式。

## 环境要求

- **Node.js** >= 20
- **pnpm** >= 9

## 快速开始

```bash
pnpm install        # 安装依赖
pnpm dev:all        # 在浏览器中启动（前端 + 后端 + 种子数据）
pnpm tauri dev      # 桌面开发模式
pnpm tauri build    # 构建桌面安装包（.dmg/.msi/.AppImage）
```

## 技术栈

**前端**：React 19 + TypeScript 5 + Zustand  
**后端**：Express 5 + sql.js  
**桌面**：Tauri v2  
**AI**：OpenAI 兼容接口  

> [!TIP]  
> 更喜欢 Claude Code 的工作流？看看 [clark-typer](https://github.com/niyongsheng/clark-typer)。

## 许可证

[GPLv3](./LICENSE)
