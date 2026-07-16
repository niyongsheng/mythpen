<p align="center">
  <img src="./logo.svg" alt="Mythpen" width="120" />
</p>

<h1 align="center">Mythpen</h1>

<p align="center">
  <em>AI-assisted novel writing desktop app — characters, world-building, chapters, foreshadowing, timelines, with integrated AI writing assistant.</em>
</p>

<p align="center">
  <a href="https://github.com/niyongsheng/mythpen/releases"><img src="https://img.shields.io/github/v/release/niyongsheng/mythpen?style=flat-square&label=Release" alt="Release"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://expressjs.com"><img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="Express"></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="Tauri"></a>
</p>

<p align="center">
  <img alt="demo" src="https://github.com/user-attachments/assets/87ba980c-492b-4bd2-af75-e14faa3cec68" width="80%" style="border-radius: 8px;" />
</p>

# Feature

- **AI Writing** — Two modes: *Writing* (guided 6-step workflow) and *Collab* (AI co-writer). Supports OpenAI and Claude.
- **Novel Management** — Characters, world-building, chapters, foreshadowing, timeline, and relations — all in one place.
- **Local-First** — Data stored in SQLite under `~/.mythpen/`. No cloud required, full privacy.
- **Rich Editor** — Bold, italic, underline via keyboard shortcuts. Chapters auto-save locally.
- **Cross-Platform** — Tauri v2 for native desktop experience, also runs in browser for development.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9

## Quick Start

```bash
pnpm install        # Install dependencies
pnpm dev:all        # Start in browser (frontend + backend + seed data)
pnpm tauri dev      # Desktop development mode
pnpm tauri build    # Build desktop installer (.dmg/.msi/.AppImage)
```

## Tech Stack

**Frontend**: React 19 + TypeScript 5 + Zustand  
**Backend**: Express 5 + better-sqlite3  
**Desktop**: Tauri v2  
**AI**: OpenAI-compatible  

> [!TIP]  
> Prefer Claude Code's workflow? Check out [clark-typer](https://github.com/niyongsheng/clark-typer).

## License

[GPLv3](./LICENSE)
