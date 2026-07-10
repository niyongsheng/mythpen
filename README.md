![logo](./logo.svg)

# Mythpen

AI-assisted novel writing desktop app — manage characters, world-building, chapters, foreshadowing, timelines, with integrated AI writing assistant.

<img alt="demo" src="https://github.com/user-attachments/assets/87ba980c-492b-4bd2-af75-e14faa3cec68" />

## Quick Start

```bash
pnpm install        # Install dependencies
pnpm dev:all        # Start in browser (frontend + backend + seed data)
pnpm tauri dev      # Desktop development mode
pnpm tauri build    # Build desktop installer (.dmg/.msi/.AppImage)
```

## Tech Stack

**Frontend**: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + Zustand 
**Backend**: Express 5 + better-sqlite3 
**Desktop**: Tauri v2 
**AI**: OpenAI-compatible 

## License

[GPLv3](./LICENSE)
