![logo](./logo.svg)

# Mythpen

AI-assisted novel writing desktop app — manage characters, world-building, chapters, foreshadowing, timelines, with integrated AI writing assistant.

[![爱发电](https://img.shields.io/badge/爱发电-Afdian-946ce6?style=for-the-badge&logo=github&logoColor=white)](https://ifdian.net/a/nico2026)

## Quick Start

```bash
pnpm install        # Install dependencies
pnpm dev:all        # Start in browser (frontend + backend + seed data)
pnpm tauri dev      # Desktop development mode
pnpm tauri build    # Build desktop installer (.dmg/.msi/.AppImage)
```

## Tech Stack

**Frontend**: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + Zustand  
**Desktop**: Tauri v2 (Rust shell, no business logic)  
**Backend**: Express 5 + better-sqlite3  
**AI**: OpenAI-compatible (DeepSeek) + Anthropic Claude via adapter

## License

[MIT](./LICENSE)
